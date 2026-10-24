import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { addMonths, monthOf, todayIso } from '../domain/dates'
import { DoctorsPage } from '../features/doctors/DoctorsPage'
import { LeavePage } from '../features/leave/LeavePage'
import { MonthPage } from '../features/month/MonthPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { Layout } from './Layout'

/** She schedules ahead, so the app opens on next month. */
export function defaultMonth(): string {
  return addMonths(monthOf(todayIso()), 1)
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to={`/month/${defaultMonth()}`} replace />} />
          <Route path="month/:monthId" element={<MonthPage />} />
          <Route path="leave" element={<LeavePage />} />
          <Route path="doctors" element={<DoctorsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
