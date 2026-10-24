import Dexie, { type EntityTable } from 'dexie'
import type { Assignment, Doctor, Leave, Level, Month, Settings } from '../domain/types'

/**
 * Local-first persistence (IndexedDB via Dexie). Nothing leaves this browser
 * unless she exports a backup or shares a schedule.
 */
export class RotaDB extends Dexie {
  levels!: EntityTable<Level, 'id'>
  doctors!: EntityTable<Doctor, 'id'>
  leaves!: EntityTable<Leave, 'id'>
  months!: EntityTable<Month, 'id'>
  assignments!: EntityTable<Assignment, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'rota') {
    super(name)
    this.version(1).stores({
      levels: 'id',
      doctors: 'id, levelId',
      leaves: 'id, doctorId, startDate',
      months: 'id',
      assignments: 'id, monthId',
      settings: 'id',
    })
    // Starter levels she can rename or change; nothing else is invented for her.
    this.on('populate', (tx) => {
      void tx.table('levels').bulkAdd([
        { id: 'level-consultant', name: 'Consultant', defaultTarget: 8 },
        { id: 'level-specialist', name: 'Specialist', defaultTarget: 10 },
        { id: 'level-resident', name: 'Resident', defaultTarget: 14 },
      ])
    })
  }
}

export const db = new RotaDB()

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
