import { NavLink, Outlet, useLocation } from 'react-router-dom'
import s from './layout.module.css'

const LINKS = [
  { to: '/month', label: 'Schedule', icon: '📅' },
  { to: '/leave', label: 'Leave', icon: '🌴' },
  { to: '/doctors', label: 'Doctors', icon: '🩺' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export function Layout() {
  const { pathname } = useLocation()
  return (
    <div className={s.shell}>
      <header className={s.top}>
        <div className={s.brand}>
          <img src="./icon.svg" alt="" width={28} height={28} />
          <span>Rota</span>
        </div>
        <nav className={s.nav} aria-label="Main">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              // "Schedule" keeps the month in the URL, so match on the prefix.
              to={l.to === '/month' ? (pathname.startsWith('/month/') ? pathname : '/') : l.to}
              className={() => [s.link, pathname.startsWith(l.to) && s.active].filter(Boolean).join(' ')}
            >
              <span aria-hidden="true">{l.icon}</span>
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main className={s.main}>
        <Outlet />
      </main>
    </div>
  )
}
