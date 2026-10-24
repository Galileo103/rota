import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

async function addDoctor(page: Page, name: string) {
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'Add doctor' }).click()
  await expect(page.getByRole('cell', { name })).toBeVisible()
}

async function pickInPanel(page: Page, doctor: string) {
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${doctor}`) }).click()
}

test('set up doctors, record leave, fill the month by hand and share the image', async ({ page }) => {
  // Doctors
  await page.goto('/#/doctors')
  for (const name of ['Dr. Lina', 'Dr. Sami', 'Dr. Rami']) await addDoctor(page, name)

  // Leave: Dr. Sami is off 3–4 Nov and needs a doctor's note.
  await page.goto('/#/leave')
  await page.getByRole('combobox', { name: 'Doctor', exact: true }).selectOption({ label: 'Dr. Sami' })
  await page.getByLabel('First day').fill('2026-11-03')
  await page.getByLabel('Number of days').fill('2')
  await page.getByLabel(/note required/).check()
  await page.getByRole('button', { name: 'Add leave' }).click()
  await expect(page.getByText('Saved: Dr. Sami, 2 days from 3 Nov.')).toBeVisible()

  // Fill seats one after another: each pick opens the next empty seat.
  await page.goto('/#/month/2026-11')
  await expect(page.getByText('0 of 120 seats filled')).toBeVisible()
  await page.getByRole('button', { name: '＋ Fill next empty' }).click()
  await expect(page.getByRole('dialog', { name: /Sun 1 Nov · Day/ })).toBeVisible()
  await pickInPanel(page, 'Dr. Lina')
  await expect(page.getByRole('dialog')).toContainText('seat 2')
  await pickInPanel(page, 'Dr. Rami')
  await expect(page.getByRole('dialog', { name: /Sun 1 Nov · Night/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel(/^Sun 1 Nov Day seat 1: Dr\. Lina/)).toBeVisible()
  await expect(page.getByText('2 of 120 seats filled')).toBeVisible()

  // Leave shows up when picking, and a clash is listed in the checks.
  await page.getByLabel(/^Tue 3 Nov Day seat 1:/).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Dr\. Sami/ })).toContainText('On leave this day')
  await pickInPanel(page, 'Dr. Sami')
  await expect(page.getByText('Tue 3 Nov Day: Dr. Sami is on leave')).toBeVisible()
  await page.keyboard.press('Escape')

  // A 3rd doctor on a busy shift.
  await page.getByLabel('Add another doctor to Sun 1 Nov Day').click()
  await pickInPanel(page, 'Dr. Sami')
  await expect(page.getByLabel(/^Sun 1 Nov Day seat 3: Dr\. Sami/)).toBeVisible()

  // Share: the image is a real PNG, 2160 px wide (1080 × 2).
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '⬇ Download image' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('schedule-2026-11.png')
  const png = readFileSync((await download.path())!)
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect(png.readUInt32BE(16)).toBe(2160)

  // Final: read-only.
  await page.getByRole('button', { name: '✓ Mark as final' }).click()
  await page.getByRole('button', { name: /Mark final with \d+ empty seats/ }).click()
  await expect(page.getByText(/Save a backup now/)).toBeVisible()
  await expect(page.getByLabel(/^Sun 1 Nov Day seat 1:/)).toHaveCount(0)
})

test('everything stays after closing and reopening the app', async ({ page }) => {
  await page.goto('/#/doctors')
  await addDoctor(page, 'Dr. Tamer')
  await page.goto('/#/month/2026-12')
  await page.getByLabel(/^Tue 1 Dec Day seat 1:/).click()
  await pickInPanel(page, 'Dr. Tamer')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.getByLabel(/^Tue 1 Dec Day seat 1: Dr\. Tamer/)).toBeVisible()
  await expect(page.getByText('1 of 124 seats filled')).toBeVisible() // December: 31 days
})

test('fits the screen: no sideways scrolling on any page', async ({ page }) => {
  for (const route of ['/#/month/2026-11', '/#/leave', '/#/doctors', '/#/settings']) {
    await page.goto(route)
    await expect(page.locator('main h1')).toBeVisible()
    const { scroll, view } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: window.innerWidth }))
    expect(scroll, route).toBeLessThanOrEqual(view)
  }
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})

test('can be installed: manifest with icons and a working offline service worker', async ({ page }) => {
  await page.goto('/')
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ short_name: 'Rota', display: 'standalone' })
  const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`)
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']))
  for (const icon of manifest.icons) expect((await page.request.get(`/${icon.src}`)).ok(), icon.src).toBe(true)
  const active = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)
  expect(active).toBe('activated')
})
