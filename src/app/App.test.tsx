import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../services/db'
import { saveDoctor } from '../services/repos'
import { App, defaultMonth } from './App'

beforeEach(async () => {
  await db.delete()
  await db.open()
  window.location.hash = ''
})

describe('App', () => {
  it('opens on next month', async () => {
    render(<App />)
    await waitFor(() => expect(window.location.hash).toBe(`#/month/${defaultMonth()}`))
    expect(await screen.findByText(/^0 of \d+ seats filled$/)).toBeInTheDocument()
  })

  it('adds a doctor from the Doctors page', async () => {
    window.location.hash = '#/doctors'
    render(<App />)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Name'), 'Dr. Mona')
    await user.click(screen.getByRole('button', { name: 'Add doctor' }))
    await waitFor(async () => expect(await db.doctors.count()).toBe(1))
    expect(await screen.findByText('Dr. Mona')).toBeInTheDocument()
  })

  it('records leave with a doctor’s note label', async () => {
    await saveDoctor({ id: 'd1', name: 'Dr. Omar', levelId: 'level-resident', archived: false })
    window.location.hash = '#/leave'
    render(<App />)
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByLabelText('Doctor'), 'd1')
    const days = screen.getByLabelText('Number of days')
    await user.clear(days)
    await user.type(days, '3')
    await user.click(screen.getByLabelText(/note required/))
    await user.click(screen.getByRole('button', { name: 'Add leave' }))
    await waitFor(async () => expect(await db.leaves.count()).toBe(1))
    expect(await db.leaves.toCollection().first()).toMatchObject({ doctorId: 'd1', days: 3, noteRequired: true })
  })

  it('starts with an empty schedule and fills seats one after another', async () => {
    for (let i = 0; i < 3; i++) await saveDoctor({ id: `d${i}`, name: `Dr. ${i}`, levelId: 'level-specialist', archived: false })
    window.location.hash = '#/month/2026-11'
    render(<App />)
    const user = userEvent.setup()
    const grid = await screen.findByRole('table', { name: 'Schedule' })
    expect(within(grid).getAllByRole('row')).toHaveLength(31) // header + 30 days
    expect(within(grid).getAllByText('＋ Add')).toHaveLength(120)
    expect(screen.queryByText(/Generate/)).not.toBeInTheDocument()

    // "Fill next empty" opens the first seat; each pick moves on to the next empty seat.
    await user.click(screen.getAllByText('＋ Fill next empty')[0]!)
    let panel = await screen.findByRole('dialog', { name: /Sun 1 Nov · Day/ })
    expect(panel).toHaveTextContent('seat 1')
    await user.click(within(panel).getByText('Dr. 0'))
    await waitFor(async () => expect((await db.assignments.get('2026-11|2026-11-01|D|0'))?.doctorId).toBe('d0'))

    panel = await screen.findByRole('dialog', { name: /Sun 1 Nov · Day/ })
    await waitFor(() => expect(panel).toHaveTextContent('seat 2'))
    await user.click(within(panel).getByText('Dr. 1'))
    await waitFor(async () => expect((await db.assignments.get('2026-11|2026-11-01|D|1'))?.doctorId).toBe('d1'))

    expect(await screen.findByRole('dialog', { name: /Sun 1 Nov · Night/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('2 of 120 seats filled')).toBeInTheDocument()
    expect(screen.getByText('118')).toBeInTheDocument() // "118 seats still empty"
  })

  it('adds a 3rd doctor to one shift and removes it again', async () => {
    for (let i = 0; i < 3; i++) await saveDoctor({ id: `d${i}`, name: `Dr. ${i}`, levelId: 'level-specialist', archived: false })
    const seed = (seat: number, doctorId: string) =>
      db.assignments.put({ id: `2026-11|2026-11-06|D|${seat}`, monthId: '2026-11', date: '2026-11-06', shift: 'D', seat, doctorId, locked: false })
    await seed(0, 'd0')
    await seed(1, 'd1')
    window.location.hash = '#/month/2026-11'
    render(<App />)
    const user = userEvent.setup()

    await user.click(await screen.findByLabelText('Add another doctor to Fri 6 Nov Day'))
    const panel = await screen.findByRole('dialog')
    expect(panel).toHaveTextContent('extra doctor (3 in this shift)')
    await user.click(within(panel).getByText('Dr. 2'))
    await waitFor(async () => expect((await db.assignments.get('2026-11|2026-11-06|D|2'))?.doctorId).toBe('d2'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // no jump: it was an extra seat
    expect(await screen.findByLabelText(/^Fri 6 Nov Day seat 3: Dr\. 2/)).toBeInTheDocument()
    expect(screen.getByText('3 of 121 seats filled')).toBeInTheDocument()

    await user.click(screen.getByLabelText(/^Fri 6 Nov Day seat 3:/))
    await user.click(within(await screen.findByRole('dialog')).getByText('Remove extra doctor'))
    await waitFor(async () => expect(await db.assignments.get('2026-11|2026-11-06|D|2')).toBeUndefined())
    expect(screen.queryByLabelText(/^Fri 6 Nov Day seat 3:/)).not.toBeInTheDocument()
  })

  it('warns about a 24h run with the last night of the previous month', async () => {
    await saveDoctor({ id: 'd0', name: 'Dr. 0', levelId: 'level-specialist', archived: false })
    await saveDoctor({ id: 'd1', name: 'Dr. 1', levelId: 'level-specialist', archived: false })
    await db.assignments.put({ id: '2026-10|2026-10-31|N|0', monthId: '2026-10', date: '2026-10-31', shift: 'N', seat: 0, doctorId: 'd0', locked: false })
    window.location.hash = '#/month/2026-11'
    render(<App />)
    const user = userEvent.setup()
    await user.click(await screen.findByLabelText(/^Sun 1 Nov Day seat 1:/))
    const panel = await screen.findByRole('dialog')
    await waitFor(() => expect(within(panel).getByText('Dr. 0').closest('button')).toHaveTextContent('Worked the night before (31 Oct): 24h run'))
    expect(within(panel).getByText('Dr. 1').closest('button')).not.toHaveTextContent('24h run')
  })

  it('offers to turn Friday highlighting back on when no day is highlighted', async () => {
    await saveDoctor({ id: 'd0', name: 'Dr. 0', levelId: 'level-specialist', archived: false })
    await db.settings.put({ id: 'main', weekendDays: [], doctorsPerShift: 2, highlightColor: '#FBE4D5' })
    await db.assignments.put({ id: '2026-11|2026-11-01|D|0', monthId: '2026-11', date: '2026-11-01', shift: 'D', seat: 0, doctorId: 'd0', locked: false })
    window.location.hash = '#/month/2026-11'
    render(<App />)
    const user = userEvent.setup()
    await user.click(await screen.findByText('Highlight Fridays'))
    await waitFor(async () => expect((await db.settings.get('main'))?.weekendDays).toEqual([5]))
    expect(screen.queryByText('Highlight Fridays')).not.toBeInTheDocument()
  })

  it('does not let a doctor who reached the target be picked again', async () => {
    await saveDoctor({ id: 'd0', name: 'Dr. 0', levelId: 'level-specialist', archived: false })
    await saveDoctor({ id: 'd1', name: 'Dr. 1', levelId: 'level-specialist', archived: false })
    await db.months.put({ id: '2026-11', excludedDoctorIds: [], targetOverrides: { d0: 1 }, status: 'draft' })
    await db.assignments.put({ id: '2026-11|2026-11-01|D|0', monthId: '2026-11', date: '2026-11-01', shift: 'D', seat: 0, doctorId: 'd0', locked: false })
    window.location.hash = '#/month/2026-11'
    render(<App />)
    const user = userEvent.setup()

    await user.click(await screen.findByLabelText(/^Mon 2 Nov Day seat 1: Empty/))
    const panel = await screen.findByRole('dialog')
    const full = within(panel).getByText('Dr. 0').closest('button')!
    expect(full).toBeDisabled()
    expect(full).toHaveTextContent('Reached target (1/1)')
    expect(full).toHaveTextContent('1/1 full')
    expect(within(panel).getByText('Dr. 1').closest('button')).toBeEnabled()
  })

  it('changes a seat, undoes it, swaps two seats, and marks the month final', async () => {
    for (let i = 0; i < 3; i++) await saveDoctor({ id: `d${i}`, name: `Dr. ${i}`, levelId: 'level-specialist', archived: false })
    const seed = (date: string, shift: 'D' | 'N', seat: number, doctorId: string) =>
      db.assignments.put({ id: `2026-11|${date}|${shift}|${seat}`, monthId: '2026-11', date, shift, seat, doctorId, locked: false })
    await seed('2026-11-03', 'D', 0, 'd0')
    await seed('2026-11-05', 'N', 1, 'd1')
    const rowA = '2026-11|2026-11-03|D|0'
    const rowB = '2026-11|2026-11-05|N|1'
    window.location.hash = '#/month/2026-11'
    render(<App />)
    const user = userEvent.setup()

    // Replace a doctor: the panel closes (it was not an empty seat).
    await user.click(await screen.findByLabelText(/^Tue 3 Nov Day seat 1: Dr\. 0/))
    await user.click(within(await screen.findByRole('dialog')).getByText('Dr. 2'))
    await waitFor(async () => expect((await db.assignments.get(rowA))!.doctorId).toBe('d2'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByText(/Undo \(1\)/))
    await waitFor(async () => expect((await db.assignments.get(rowA))!.doctorId).toBe('d0'))

    // Swap: open a seat, choose swap, tap the second seat.
    await user.click(screen.getByLabelText(/^Tue 3 Nov Day seat 1:/))
    await user.click(within(await screen.findByRole('dialog')).getByText(/Swap with another seat/))
    await user.click(screen.getByLabelText(/^Thu 5 Nov Night seat 2:/))
    await waitFor(async () => expect((await db.assignments.get(rowA))!.doctorId).toBe('d1'))
    expect((await db.assignments.get(rowB))!.doctorId).toBe('d0')

    // Final: grid becomes read-only and the backup reminder appears.
    await user.click(screen.getByText(/Mark as final/))
    await user.click(screen.getByText(/Mark final with 118 empty seats/))
    expect(await screen.findByText(/Save a backup now/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Tue 3 Nov Day seat 1:/)).not.toBeInTheDocument()
    expect((await db.months.get('2026-11'))!.status).toBe('final')
  }, 30_000)
})
