import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Lock, Settings as SettingsIcon } from 'lucide-react'
import { useSettings } from '../store/useStore'
import { useGoogle } from '../store/useGoogle'
import { Button, Spinner } from './ui'

/** Case-insensitive, so a different capitalisation of the same address gets in. */
function isOwner(email: string | undefined, owner: string | undefined): boolean {
  if (!owner) return true
  if (!email) return false
  return email.trim().toLowerCase() === owner.trim().toLowerCase()
}

/**
 * Optional lock screen in front of the whole app.
 *
 * This is a front-door lock, not access control: the site is a static page, so
 * its code is public and nothing here can be enforced server-side. What keeps
 * the data private is that it never leaves this browser and the owner's own
 * Google Drive. The gate exists so the published page is tied to one account.
 */
export function SignInGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const settings = useSettings()
  const ready = useGoogle((s) => s.ready)
  const connecting = useGoogle((s) => s.connecting)
  const signedIn = useGoogle((s) => s.signedIn)
  const profile = useGoogle((s) => s.profile)
  const error = useGoogle((s) => s.error)
  const signIn = useGoogle((s) => s.signIn)

  if (!settings.requireSignIn) return <>{children}</>
  if (signedIn && isOwner(profile?.email, settings.ownerEmail)) return <>{children}</>
  // Settings is always reachable, or a locked-out owner could never undo this.
  if (pathname === '/settings') return <>{children}</>

  const configured = Boolean(settings.googleClientId)

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface/80 p-6 text-center shadow-[var(--shadow-card)] backdrop-blur-xl">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-bg text-accent-soft">
          <Lock className="h-5 w-5" />
        </div>

        <h1 className="text-lg font-semibold tracking-tight text-ink">Semestre</h1>
        <p className="mt-1 text-sm text-muted">This planner is private.</p>

        {signedIn && !isOwner(profile?.email, settings.ownerEmail) && (
          <p className="mt-4 rounded-xl border border-danger/25 bg-danger-bg px-3 py-2 text-[13px] text-danger">
            {profile?.email} is not the owner of this planner.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-danger/25 bg-danger-bg px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="mt-5">
          {configured ? (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!ready || connecting}
              onClick={() => void signIn()}
            >
              {connecting ? <Spinner /> : null}
              Continue with Google
            </Button>
          ) : (
            <p className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
              No Google client id is configured yet, so nobody can sign in. Add one in Settings
              first.
            </p>
          )}
        </div>

        {/* Escape hatch: without this the owner can lock themselves out for good. */}
        <Link
          to="/settings"
          className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-muted underline underline-offset-2 transition-colors hover:text-ink"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
          Open settings
        </Link>

        <p className="mt-6 text-[11px] leading-relaxed text-faint">
          This keeps the published page tied to one Google account. It is not server-side
          security — your data is private because it stays in this browser and your own Google
          Drive, never on a server.
        </p>
      </div>
    </div>
  )
}
