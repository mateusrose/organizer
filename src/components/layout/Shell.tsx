import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { NAV } from './nav'
import { TopBar } from './TopBar'
import { Toaster } from '../ui/Toaster'
import { SemesterSwitcher } from '../SemesterSwitcher'

export function Shell() {
  const { pathname } = useLocation()

  return (
    <div className="flex min-h-full">
      {/* --- desktop sidebar -------------------------------------------- */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface/50 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Logo />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-ink">Semestre</div>
            <div className="text-[11px] text-faint">study command centre</div>
          </div>
        </div>

        <SemesterSwitcher />

        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-accent-bg text-ink'
                    : 'text-muted hover:bg-surface-3 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-accent transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <item.icon className={cn('h-4.5 w-4.5', isActive && 'text-accent-soft')} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 text-[11px] text-faint">
          Local-first · your data stays in this browser
        </div>
      </aside>

      {/* --- main column ------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          key={pathname}
          className="animate-fade-up mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:pb-10"
        >
          <Outlet />
        </main>
        <Toaster />
      </div>

      {/* --- mobile bottom nav ------------------------------------------ */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-0.5 border-t border-line bg-surface/90 px-1.5 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] font-medium transition-colors',
                isActive ? 'text-accent-soft' : 'text-faint hover:text-muted',
              )
            }
          >
            <item.icon className="h-4.5 w-4.5" />
            {item.short}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Logo() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent-bg">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="var(--accent-soft)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
