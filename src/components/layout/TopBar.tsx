import { useLocation } from 'react-router-dom'
import { CloudOff, Moon, RefreshCw, Sun } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { NAV } from './nav'
import { useSettings, useStore } from '../../store/useStore'
import { useGoogle } from '../../store/useGoogle'

export function TopBar() {
  const { pathname } = useLocation()
  const settings = useSettings()
  const updateSettings = useStore((s) => s.updateSettings)

  const google = useGoogle()
  const current = NAV.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))

  const syncing = google.driveSync.status === 'syncing' || google.calendarSync.status === 'syncing'

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold tracking-tight text-ink lg:hidden">
            {current?.label ?? 'Semestre'}
          </h1>
          <p className="hidden text-[13px] text-muted lg:block">
            {format(new Date(), 'EEEE, d MMMM yyyy')}
          </p>
        </div>

        {google.signedIn && (
          <Button
            variant="ghost"
            size="icon-sm"
            title="Sync now"
            onClick={() => {
              void google.syncDrive()
              if (settings.calendarSyncEnabled) void google.syncCalendar()
            }}
          >
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin text-accent-soft')} />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          title={settings.theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
        >
          {settings.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {google.signedIn && google.profile ? (
          <button
            type="button"
            onClick={google.signOut}
            title={`${google.profile.email} · click to sign out`}
            className="flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-3 pl-1 transition-colors hover:border-line-strong"
          >
            {google.profile.picture ? (
              <img
                src={google.profile.picture}
                alt=""
                referrerPolicy="no-referrer"
                className="h-6 w-6 rounded-full"
              />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-contrast">
                {google.profile.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="hidden max-w-32 truncate text-[13px] text-muted sm:block">
              {google.profile.name}
            </span>
          </button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            icon={<CloudOff className="h-3.5 w-3.5" />}
            onClick={() => void google.signIn()}
            disabled={!google.ready}
            title={google.ready ? 'Connect Google' : 'Add a Google client id in Settings first'}
          >
            <span className="hidden sm:inline">Connect</span>
          </Button>
        )}
      </div>
    </header>
  )
}
