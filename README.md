# Rota

Monthly doctor shift schedule for one department: two 12-hour shifts a day
(9 AM – 9 PM, 9 PM – 9 AM), filled by hand, shared as an image on WhatsApp.
Works offline; all data stays in the browser it was entered in.

## Online (any device)

https://galileo103.github.io/rota/ — published from `main` by
`.github/workflows/pages.yml` (lint, tests, build, deploy). Open it on a phone
and choose **Add to Home screen / Install app**. Each device and address keeps
its own data; move data with **Settings → Backup / Restore**.

## Daily use (laptop)

```sh
npm run serve        # builds and serves the app at http://localhost:5190
```

Open http://localhost:5190 in Chrome and use the **Install** icon in the
address bar to get a Rota app window. After the first visit the app works
offline, even when the server is not running. Run `npm run serve` again after
an update; the open app picks up the new version on its next load.

> The data lives in Chrome under `localhost:5190`. Keep that address: another
> port or browser starts empty. Use **Settings → Backup** to save a copy, and
> **Restore** to move to another device.

## Development

```sh
npm install
npm run dev          # http://localhost:5191 (separate data from daily use)
npm test             # unit + screen tests (Vitest)
npm run e2e          # end-to-end tests in Chrome, laptop and phone sizes (Playwright)
npm run typecheck && npm run lint
```

End-to-end tests build the app and serve it on port 4191, each test in a fresh
browser profile, so they never touch real data.

## Where things are

| Path | What |
|---|---|
| `src/domain` | Pure rules: dates, leave, targets, balance check, seat options and checks, the shared-image table |
| `src/services` | IndexedDB (Dexie) storage, editing with undo, backup/restore |
| `src/features` | Screens: Schedule (month), Leave, Doctors, Settings, the share image |
| `docs/PLAN.md` | The original plan |
