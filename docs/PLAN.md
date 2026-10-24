# Rota: Monthly Doctor Shift Scheduler (Plan v1)

_2026-10-24 · status: draft, waiting for approval · no code yet_

## 1. Goal
My wife prepares next month's shift schedule for about 20 doctors. Today she does it by hand. Rota lets her:
enter doctors and leave → generate a fair draft in one click → fix it by hand → send it to the doctors on WhatsApp.

## 2. Agreed requirements
| Topic | Decision |
|---|---|
| Users | She is the only user. Doctors get an image or PDF on WhatsApp. No logins, no server. |
| Stack | Same as Rawda: React + TypeScript + Vite PWA, Dexie (IndexedDB), Zod. Offline. |
| Language / device | English only. Responsive: month grid on laptop, day list on phone. |
| Shifts | Day 09:00–21:00 and Night 21:00–09:00. 2 doctors per shift, 4 per day. |
| Targets | Each level has a default shift count (e.g. 14 / 10 / 8). She can override it per doctor per month. |
| Active doctors | Each month she ticks who is on the rota (not all ~20 every month). |
| Hard rule | Leave: a doctor on leave can't take either shift that day. |
| Allowed | 24h/36h runs (Day + Night, Night + next Day). Any two doctors can share a shift. |
| Soft goals | Hit each target exactly, spread shifts across the month, balance nights, balance Fridays. |
| Infeasible | Fill what is possible, show empty slots in red with the reason. |
| Leave entry | She types in what doctors send by SMS, WhatsApp or call: doctor, start date, number of days, "doctor's note required" label, optional source + comment. |
| Editing | She can swap or replace any slot, lock slots, and regenerate the rest. Live warnings. |

## 3. Data model (Dexie, DB name `rota`)
```ts
Level      { id, name, defaultTarget }                       // e.g. "Resident", 14
Doctor     { id, name, levelId, phone?, archived }
Leave      { id, doctorId, startDate: 'YYYY-MM-DD', days, noteRequired,
             source?: 'sms'|'whatsapp'|'call'|'other', comment?, createdAt }
Month      { id: 'YYYY-MM', activeDoctorIds: string[],
             targetOverrides: Record<doctorId, number>, status: 'draft'|'final' }
Assignment { id, monthId, date, shift: 'D'|'N', seat: 0|1,
             doctorId: string|null, locked: boolean }
Settings   { weekendDays: number[] /* default [5] = Friday */, doctorsPerShift: 2 }
```
- A leave's end date = startDate + days − 1. It can cross into the next month and still blocks those days.
- Leave days per doctor are counted for the month and the year.
- Backup: export/import the whole DB as JSON. The data lives only in her browser, so the app reminds her to back up after she finalizes a month.

## 4. Generator (pure TS, runs in the browser, under 1 s)
**Inputs:** month days, active doctors + effective targets, leave, locked assignments, weekend days.

**Pre-check (balance meter, shown before she generates):**
- Slots = days × 2 shifts × 2 seats (e.g. 31 days = 124).
- Sum of targets vs slots: "Targets total 118 / 124 slots: 6 slots will be empty" or "6 shifts over".
- Per day: available doctors < 4 → day flagged early.

**Algorithm:**
1. Fill locked slots first.
2. Order the remaining slots hardest first: fewest available doctors, weekend nights early.
3. For each slot, pick the eligible doctor with the best score:
   - eligible = active, not on leave that day, not already in this shift, below target
   - score = remaining target share (highest weight)
     + gap since their last shift (avoid clumping)
     + night balance (nights so far vs fair share)
     + Friday balance (Fridays so far vs fair share)
     + small random tie-break
4. Repeat with ~300 random seeds and keep the best result by total penalty.
5. Local improvement: try swaps between doctors that lower the penalty without breaking hard rules.
6. Any slot nobody can fill stays empty, with a reason such as "12 Nov: 5 doctors on leave, all remaining doctors at target".

The objective is deterministic for a given seed, which keeps the unit tests stable.

## 5. Screens
1. **Doctors & levels**: add, edit or archive doctors; set levels and default targets.
2. **Leave**: fast entry form (doctor, start, days, note-required, source, comment); list filterable by doctor or month; a 📄 badge when a note is required.
3. **Month setup**: pick the month, tick active doctors, override targets, balance meter, **Generate** button.
4. **Schedule editor**
   - Laptop: grid with days as rows, Day and Night columns, 2 seats each. Leave days greyed per doctor.
   - Phone: day cards.
   - Tap a seat → choose a doctor (eligible ones first, warnings shown on the others). Lock/unlock a seat. Regenerate the unlocked seats.
   - Side panel per doctor: shifts done/target, nights, Fridays, leave days.
   - Warnings: on leave, over or under target, duplicate in the same shift, empty seat.
5. **Export & share**
   - Full month → PDF and PNG (A4 landscape).
   - Per-doctor image: "Dr. X: your November shifts" list.
   - On the phone, the Web Share API sends the file straight to WhatsApp; on the laptop it downloads.
6. **Settings**: weekend days, backup/restore.

## 6. Phases
| # | Phase | Done when |
|---|---|---|
| 1 | Scaffold (Vite, TS, Dexie, Zod, router, PWA), Doctors & Levels, backup/restore | She can enter all doctors and back them up |
| 2 | Leave entry + Month setup + balance meter | A month is fully described |
| 3 | Generator + unit tests (fixtures: normal month, heavy-leave month, infeasible month) | One click produces a draft. **First runnable slice: she tries it with real names.** |
| 4 | Schedule editor: swap, lock, regenerate, warnings, per-doctor stats | She can finalize a month |
| 5 | Export PDF/PNG + per-doctor images + WhatsApp share | Doctors receive it |
| 6 | Polish: phone layout, PWA install on laptop + Android, e2e tests (Playwright) | Used for a real month |

## 7. Testing
- Vitest: generator invariants (no leave violations, no duplicate in a shift, targets met when feasible, balance within ±1 when feasible), date math, leave overlap across months.
- Playwright: enter doctors → leave → generate → edit → export.
- Results reported honestly (what was run vs what was not).

## 8. Risks / open later
- Data lives in one browser. Mitigation: backup reminder; a later option is syncing to a file in Google Drive.
- Holidays (Eid etc.) could count as "Friday-like" days; add later if she asks.
- If she later wants doctors to see a live link, add a small published read-only page (not in v1).
