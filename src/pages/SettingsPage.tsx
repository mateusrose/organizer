import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import {
  CalendarCheck,
  Check,
  ChevronRight,
  CircleUserRound,
  Cloud,
  CloudUpload,
  Copy,
  Database,
  Download,
  ExternalLink,
  GraduationCap,
  HardDrive,
  Info,
  KeyRound,
  LogOut,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Divider,
  Field,
  Input,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Toggle,
} from '../components/ui'
import { useDb, useSettings, useStore } from '../store/useStore'
import { useGoogle } from '../store/useGoogle'
import { toast } from '../store/useToast'
import { looksLikeBackup } from '../lib/db'
import { format, relative } from '../lib/date'
import type { SyncState } from '../types'
import { cn } from '../lib/cn'

const APP_VERSION = '1.0.0'
const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com'
/** Browsers give an origin roughly 5 MB of localStorage. */
const STORAGE_BUDGET = 5 * 1024 * 1024

const GOOGLE_PERMISSIONS = [
  { label: 'Calendar', detail: 'create and update events on your calendars' },
  { label: 'Drive app folder', detail: 'a private folder only this app can open' },
  { label: 'Basic profile', detail: 'your name, email address and picture' },
]

type Dialog = 'restore' | 'import' | 'reset' | null

export default function SettingsPage() {
  const settings = useSettings()
  const db = useDb()
  const updateSettings = useStore((s) => s.updateSettings)
  const replaceDatabase = useStore((s) => s.replaceDatabase)
  const resetDatabase = useStore((s) => s.resetDatabase)

  const signedIn = useGoogle((s) => s.signedIn)
  const connecting = useGoogle((s) => s.connecting)
  const profile = useGoogle((s) => s.profile)
  const expiresAt = useGoogle((s) => s.expiresAt)
  const googleError = useGoogle((s) => s.error)
  const driveSync = useGoogle((s) => s.driveSync)
  const calendarSync = useGoogle((s) => s.calendarSync)
  const signIn = useGoogle((s) => s.signIn)
  const signOut = useGoogle((s) => s.signOut)
  const syncDrive = useGoogle((s) => s.syncDrive)
  const syncCalendar = useGoogle((s) => s.syncCalendar)

  const [dialog, setDialog] = useState<Dialog>(null)
  const [pendingImport, setPendingImport] = useState<unknown>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // --- appearance ---------------------------------------------------------
  const origin = window.location.origin

  // --- grading ------------------------------------------------------------
  const scale = settings.gradeScale
  const [scaleDraft, setScaleDraft] = useState({
    max: String(scale.max),
    passing: String(scale.passing),
  })

  // A Drive restore or JSON import can change the scale behind our back.
  useEffect(() => {
    setScaleDraft((d) =>
      Number(d.max) === scale.max && Number(d.passing) === scale.passing
        ? d
        : { max: String(scale.max), passing: String(scale.passing) },
    )
  }, [scale.max, scale.passing])

  const draftMax = Number(scaleDraft.max)
  const draftPassing = Number(scaleDraft.passing)
  const maxError =
    scaleDraft.max.trim() === '' || !Number.isFinite(draftMax) || draftMax <= 0
      ? 'Enter a number above 0.'
      : undefined
  const passingError =
    scaleDraft.passing.trim() === '' || !Number.isFinite(draftPassing)
      ? 'Enter a number.'
      : draftPassing < 0
        ? 'Cannot be negative.'
        : !maxError && draftPassing > draftMax
          ? `Cannot be higher than the maximum (${draftMax}).`
          : undefined

  const commitScale = (next: { max: string; passing: string }) => {
    setScaleDraft(next)
    const max = Number(next.max)
    const passing = Number(next.passing)
    if (!Number.isFinite(max) || !Number.isFinite(passing)) return
    if (next.max.trim() === '' || next.passing.trim() === '') return
    if (max <= 0 || passing < 0 || passing > max) return
    updateSettings({ gradeScale: { max, passing } })
  }

  // --- google client id ---------------------------------------------------
  const savedClientId = settings.googleClientId ?? ''
  // `null` means untouched, so a Drive restore or import flows straight through.
  const [clientIdEdit, setClientIdEdit] = useState<string | null>(null)
  const clientIdDraft = clientIdEdit ?? savedClientId
  const trimmedClientId = clientIdDraft.trim()
  const clientIdError =
    trimmedClientId !== '' && !trimmedClientId.endsWith(CLIENT_ID_SUFFIX)
      ? `That does not look like a client id — it should end in ${CLIENT_ID_SUFFIX}`
      : undefined
  const clientIdDirty = trimmedClientId !== savedClientId

  const saveClientId = () => {
    if (clientIdError) return
    updateSettings({ googleClientId: trimmedClientId || undefined })
    setClientIdEdit(null)
    toast.success(trimmedClientId ? 'Client ID saved' : 'Client ID cleared')
  }

  // --- google actions -----------------------------------------------------
  const connect = () => {
    // Failures land in `useGoogle().error`, which is rendered below.
    signIn().catch(() => undefined)
  }

  const runDrive = async (direction: 'auto' | 'pull') => {
    try {
      await syncDrive(direction)
      const state = useGoogle.getState().driveSync
      if (state.status === 'error') toast.error(state.message)
      else if (direction === 'pull') toast.success('Restored the copy from Drive')
      else toast.success('Synced with Drive')
    } catch {
      toast.error('Could not reach Google Drive')
    }
  }

  const runCalendar = async () => {
    try {
      await syncCalendar()
      const state = useGoogle.getState().calendarSync
      if (state.status === 'error') toast.error(state.message)
      else toast.success('Calendar updated')
    } catch {
      toast.error('Could not reach Google Calendar')
    }
  }

  // --- data ---------------------------------------------------------------
  const bytes = useMemo(() => new Blob([JSON.stringify(db)]).size, [db])
  const itemCount =
    db.courses.length +
    db.assessments.length +
    db.classes.length +
    db.studyBlocks.length +
    db.tasks.length

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(useStore.getState().db, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `semestre-backup-${format(new Date(), 'yyyy-MM-dd')}.json`
    // Firefox only honours a programmatic click on an anchor that is in the DOM.
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success('Backup downloaded')
  }

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      // Any JSON object used to pass here and then wipe the database, because
      // migrate() fills in empty collections for whatever it cannot find.
      if (!looksLikeBackup(parsed)) throw new Error('not a Semestre backup')
      setPendingImport(parsed)
      setDialog('import')
    } catch {
      toast.error('That file is not a Semestre backup')
    }
  }

  const driveBusy = driveSync.status === 'syncing'
  const calendarBusy = calendarSync.status === 'syncing'

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="How Semestre looks, how it grades, and where your data lives."
      />

      <div className="space-y-5">
        {/* --- appearance ------------------------------------------------ */}
        <Card>
          <CardHeader
            icon={<Palette />}
            title="Appearance"
            subtitle="Applies immediately, on this device."
          />
          <div className="space-y-5">
            <SettingRow label="Theme">
              <SegmentedControl
                value={settings.theme}
                onChange={(theme) => updateSettings({ theme })}
                options={[
                  {
                    value: 'dark',
                    label: (
                      <span className="flex items-center gap-1.5">
                        <Moon className="h-3.5 w-3.5" />
                        Dark
                      </span>
                    ),
                  },
                  {
                    value: 'light',
                    label: (
                      <span className="flex items-center gap-1.5">
                        <Sun className="h-3.5 w-3.5" />
                        Light
                      </span>
                    ),
                  },
                ]}
              />
            </SettingRow>

            <SettingRow label="Week starts on" hint="Used by the planner and calendar views.">
              <SegmentedControl
                value={String(settings.weekStartsOn)}
                onChange={(v) => updateSettings({ weekStartsOn: v === '1' ? 1 : 0 })}
                options={[
                  { value: '1', label: 'Monday' },
                  { value: '0', label: 'Sunday' },
                ]}
              />
            </SettingRow>
          </div>
        </Card>

        {/* --- grading ---------------------------------------------------- */}
        <Card>
          <CardHeader
            icon={<GraduationCap />}
            title="Grading"
            subtitle="The scale every grade and projection on the courses page uses."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Top grade"
              htmlFor="grade-max"
              error={maxError}
              hint="The highest grade you can get."
            >
              <Input
                id="grade-max"
                type="number"
                inputMode="decimal"
                min={1}
                step="0.5"
                value={scaleDraft.max}
                onChange={(e) => commitScale({ ...scaleDraft, max: e.target.value })}
              />
            </Field>
            <Field
              label="Passing grade"
              htmlFor="grade-passing"
              error={passingError}
              hint="Anything below this fails."
            >
              <Input
                id="grade-passing"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.5"
                value={scaleDraft.passing}
                onChange={(e) => commitScale({ ...scaleDraft, passing: e.target.value })}
              />
            </Field>
          </div>
          <p className="mt-3 text-[12px] text-faint">
            The two common setups are 20 / 9.5 in Portugal and 100 / 50 elsewhere.
          </p>
        </Card>

        {/* --- google ----------------------------------------------------- */}
        <Card>
          <CardHeader
            icon={<KeyRound />}
            title="Google account"
            subtitle="Optional. Connect it to back your data up and mirror deadlines into your calendar."
          />

          <Field
            label="OAuth client ID"
            htmlFor="google-client-id"
            error={clientIdError}
            hint={
              savedClientId
                ? 'Saved on this device. Change it only if you make a new project.'
                : 'Paste the client ID from your own Google Cloud project — the guide below walks you through it.'
            }
          >
            <div className="flex flex-wrap gap-2">
              <Input
                id="google-client-id"
                className="min-w-0 flex-1 font-mono"
                placeholder={`1234567890-abcdefg${CLIENT_ID_SUFFIX}`}
                spellCheck={false}
                autoComplete="off"
                value={clientIdDraft}
                onChange={(e) => setClientIdEdit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveClientId()
                }}
              />
              {clientIdDirty && (
                <Button variant="primary" onClick={saveClientId} disabled={!!clientIdError}>
                  Save
                </Button>
              )}
            </div>
          </Field>

          <details className="group mt-4 rounded-card border border-line bg-surface-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-medium text-ink [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 shrink-0 text-faint transition-transform duration-200 group-open:rotate-90" />
              How do I get this?
              <span className="ml-auto text-[12px] font-normal text-faint">about 5 minutes</span>
            </summary>

            <div className="border-t border-line px-4 py-4">
              <ol className="space-y-3.5">
                <Step n={1}>
                  Open{' '}
                  <a
                    href="https://console.cloud.google.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent-soft hover:underline"
                  >
                    console.cloud.google.com
                    <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  and create a project. Any name works — <Mono>Semestre</Mono> is fine.
                </Step>
                <Step n={2}>
                  Go to <Mono>APIs &amp; Services</Mono> → <Mono>Library</Mono> and enable two
                  things: <Mono>Google Calendar API</Mono> and <Mono>Google Drive API</Mono>.
                </Step>
                <Step n={3}>
                  Go to <Mono>OAuth consent screen</Mono>, choose <Mono>External</Mono>, fill in an
                  app name and your email, then add your own Google address under{' '}
                  <Mono>Test users</Mono>. Leaving the app in <Mono>Testing</Mono> is fine for
                  personal use — the only catch is that access expires every 7 days, so you press
                  Connect again now and then.
                </Step>
                <Step n={4}>
                  Go to <Mono>Credentials</Mono> → <Mono>Create credentials</Mono> →{' '}
                  <Mono>OAuth client ID</Mono> → <Mono>Web application</Mono>.
                </Step>
                <Step n={5}>
                  Under <Mono>Authorised JavaScript origins</Mono> add both of these, exactly —
                  origin only, no path and no trailing slash:
                  <span className="mt-2 flex flex-wrap gap-2">
                    <CopyValue value="http://localhost:5173" />
                    <CopyValue value={origin} />
                  </span>
                  <span className="mt-1.5 block text-[12px] text-faint">
                    The second one is where this page is running right now. On GitHub Pages it looks
                    like <Mono>https://yourname.github.io</Mono>.
                  </span>
                </Step>
                <Step n={6}>
                  Copy the client ID it gives you — it ends in <Mono>{CLIENT_ID_SUFFIX}</Mono> — and
                  paste it in the box above.
                </Step>
              </ol>

              <p className="mt-4 flex gap-2 rounded-lg bg-info-bg px-3 py-2.5 text-[12px] leading-relaxed text-info">
                <ShieldCheck className="mt-px h-4 w-4 shrink-0" />
                <span>
                  A client ID is not a secret — it is meant to be visible in the browser, so it is
                  safe in a public repository. This flow never uses a client secret, and Google only
                  hands over data after you approve the popup.
                </span>
              </p>
            </div>
          </details>

          {googleError && (
            <p className="mt-4 flex gap-2 rounded-lg bg-danger-bg px-3 py-2.5 text-[13px] leading-relaxed text-danger">
              <TriangleAlert className="mt-px h-4 w-4 shrink-0" />
              <span>{googleError}</span>
            </p>
          )}

          <div className="mt-5">
            {signedIn ? (
              <div className="rounded-card border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {profile?.picture ? (
                    <img
                      src={profile.picture}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full border border-line"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted">
                      <CircleUserRound className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {profile?.name ?? 'Google account'}
                      </span>
                      <Badge tone="success" icon={<Check className="h-3 w-3" />}>
                        Connected
                      </Badge>
                    </div>
                    {profile?.email && (
                      <p className="truncate text-[12px] text-muted">{profile.email}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      icon={<RefreshCw className="h-3.5 w-3.5" />}
                      loading={connecting}
                      onClick={connect}
                    >
                      Reconnect
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<LogOut className="h-3.5 w-3.5" />}
                      onClick={signOut}
                    >
                      Disconnect
                    </Button>
                  </div>
                </div>

                <Divider className="my-4" />

                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-muted">
                      {GOOGLE_PERMISSIONS.length} permissions granted
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {GOOGLE_PERMISSIONS.map((p) => (
                        <li key={p.label} className="flex gap-1.5 text-[12px] text-faint">
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                          <span>
                            <span className="text-muted">{p.label}</span> — {p.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <TokenExpiry expiresAt={expiresAt} />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  icon={<Cloud className="h-4 w-4" />}
                  loading={connecting}
                  disabled={!savedClientId}
                  onClick={connect}
                >
                  Connect Google
                </Button>
                <p className="text-[12px] text-faint">
                  {savedClientId
                    ? 'Opens a Google popup. Nothing is shared until you approve it.'
                    : 'Add your client ID above first — without it Google has no way to identify this app.'}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* --- sync -------------------------------------------------------- */}
        <Card>
          <CardHeader
            icon={<CloudUpload />}
            title="Sync"
            subtitle={
              signedIn
                ? 'Semestre keeps working offline — syncing is just a copy.'
                : 'Connect your Google account above to turn this on.'
            }
          />

          <div className="space-y-5">
            <Toggle
              checked={settings.driveSyncEnabled}
              disabled={!signedIn}
              onChange={(driveSyncEnabled) => updateSettings({ driveSyncEnabled })}
              label="Back up to Google Drive"
              hint="Keeps an encrypted-at-rest copy of your data in a private app folder in your Google Drive, so you can use this on your phone too. Only this app can read that folder."
            />
            <Toggle
              checked={settings.calendarSyncEnabled}
              disabled={!signedIn}
              onChange={(calendarSyncEnabled) => updateSettings({ calendarSyncEnabled })}
              label="Mirror into Google Calendar"
              hint="Copies deadlines and study blocks into a dedicated “Semestre · Study plan” calendar, so they show up next to everything else in your day."
            />
          </div>

          <Divider className="my-5" />

          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SyncStatus icon={<HardDrive className="h-4 w-4" />} label="Drive" state={driveSync} />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  disabled={!signedIn || driveBusy}
                  loading={driveBusy}
                  onClick={() => void runDrive('auto')}
                >
                  Sync now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Download className="h-3.5 w-3.5" />}
                  disabled={!signedIn || driveBusy}
                  onClick={() => setDialog('restore')}
                >
                  Restore from Drive
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <SyncStatus
                icon={<CalendarCheck className="h-4 w-4" />}
                label="Calendar"
                state={calendarSync}
              />
              <Button
                size="sm"
                icon={<CloudUpload className="h-3.5 w-3.5" />}
                disabled={!signedIn || calendarBusy}
                loading={calendarBusy}
                onClick={() => void runCalendar()}
              >
                Push to Calendar
              </Button>
            </div>
          </div>
        </Card>

        {/* --- data -------------------------------------------------------- */}
        <Card>
          <CardHeader
            icon={<Database />}
            title="Your data"
            subtitle="Everything lives in this browser until you sync or export it."
          />

          <div className="rounded-card border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-ink">
                Your data is <span className="font-medium">{formatBytes(bytes)}</span>, stored in
                this browser.
              </p>
              <p className="text-[12px] text-faint">
                {itemCount} {itemCount === 1 ? 'item' : 'items'} saved
              </p>
            </div>
            <ProgressBar value={bytes} max={STORAGE_BUDGET} height={4} className="mt-3" />
            <p className="mt-2 text-[12px] text-faint">
              Browsers allow roughly {formatBytes(STORAGE_BUDGET)} per site — plenty for a whole
              degree.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={<Download className="h-4 w-4" />} onClick={exportJson}>
              Export JSON
            </Button>
            <Button
              icon={<Upload className="h-4 w-4" />}
              onClick={() => fileRef.current?.click()}
            >
              Import JSON
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void pickFile(e)}
            />
          </div>

          <p className="mt-4 flex gap-2 rounded-lg bg-warning-bg px-3 py-2.5 text-[12px] leading-relaxed text-warning">
            <TriangleAlert className="mt-px h-4 w-4 shrink-0" />
            <span>
              Browser storage is not permanent — clearing site data, or a browser doing its own
              spring cleaning, wipes it. Drive sync or an occasional export is the real backup.
            </span>
          </p>

          <Divider className="my-5" />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Delete everything</p>
              <p className="mt-0.5 text-[12px] text-muted">
                Removes every course, deadline, block and task from this browser.
              </p>
            </div>
            <Button
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => setDialog('reset')}
            >
              Delete everything
            </Button>
          </div>
        </Card>

        {/* --- about ------------------------------------------------------- */}
        <Card>
          <CardHeader icon={<Info />} title="About" />
          <p className="text-[13px] leading-relaxed text-muted">
            Semestre is local-first. There is no server behind it and nothing is tracked: your
            courses, deadlines and study plan are held in this browser, and go nowhere else unless
            you connect Google — in which case the copy lands in your own Drive and your own
            calendar, under your account.
          </p>
          <p className="mt-3 text-[12px] text-faint">
            Version {APP_VERSION} · data format v{db.version} · revision {db.revision}
          </p>
        </Card>
      </div>

      <ConfirmDialog
        open={dialog === 'restore'}
        onClose={() => setDialog(null)}
        onConfirm={() => void runDrive('pull')}
        title="Restore from Drive?"
        message="The copy in your Google Drive replaces everything in this browser. Anything you changed here and did not sync will be lost."
        confirmLabel="Restore"
      />

      <ConfirmDialog
        open={dialog === 'import'}
        onClose={() => {
          setDialog(null)
          setPendingImport(null)
        }}
        onConfirm={() => {
          replaceDatabase(pendingImport)
          setPendingImport(null)
          toast.success('Backup imported')
        }}
        title="Import this backup?"
        message={
          <>
            <span className="block">
              This file holds {describeBackup(pendingImport)}. It replaces everything currently in
              this browser — export the current data first if you might want it back.
            </span>
          </>
        }
        confirmLabel="Import"
      />

      <ConfirmDialog
        open={dialog === 'reset'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          resetDatabase()
          toast.success('Everything deleted')
        }}
        title="Delete everything?"
        message="Every course, assessment, class, study block and task goes away. This cannot be undone."
        confirmLabel="Delete everything"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted">
        {n}
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted">{children}</div>
    </li>
  )
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[12px] break-words text-ink">
      {children}
    </code>
  )
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => toast.error('Could not copy — select the text instead'))
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-lg border border-line bg-surface-3 py-1 pr-1 pl-2">
      <code className="truncate font-mono text-[12px] text-ink">{value}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${value}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-ink"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  )
}

function SyncStatus({
  icon,
  label,
  state,
}: {
  icon: ReactNode
  label: string
  state: SyncState
}) {
  const error = state.status === 'error'
  const detail =
    state.status === 'syncing'
      ? 'Syncing…'
      : state.status === 'error'
        ? state.message
        : state.lastSyncedAt
          ? `Last synced ${relative(state.lastSyncedAt)}`
          : 'Never synced'

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={cn('shrink-0', error ? 'text-danger' : 'text-faint')}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className={cn('text-[12px]', error ? 'text-danger' : 'text-muted')}>{detail}</p>
      </div>
    </div>
  )
}

function TokenExpiry({ expiresAt }: { expiresAt: number | null }) {
  const [now, setNow] = useState(() => Date.now())

  // Keeps "expires in 42 minutes" honest while the page sits open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  if (expiresAt === null) return null
  const expired = expiresAt <= now
  return (
    <p className={cn('text-[12px]', expired ? 'text-warning' : 'text-faint')}>
      {expired
        ? 'Access expired — press Reconnect'
        : `Access expires ${relative(new Date(expiresAt).toISOString())}`}
    </p>
  )
}

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} bytes`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** "12 courses, 40 assessments and 8 tasks" — so a wrong file is obvious. */
function describeBackup(input: unknown): string {
  if (!input || typeof input !== 'object') return 'nothing recognisable'
  const db = input as Record<string, unknown>
  const count = (key: string) => (Array.isArray(db[key]) ? (db[key] as unknown[]).length : 0)
  const parts = [
    [count('courses'), 'course'],
    [count('assessments'), 'assessment'],
    [count('themes'), 'theme'],
    [count('tasks'), 'task'],
  ] as const
  const said = parts
    .filter(([n]) => n > 0)
    .map(([n, noun]) => `${n} ${noun}${n === 1 ? '' : 's'}`)
  if (said.length === 0) return 'no courses, assessments or tasks'
  if (said.length === 1) return said[0]
  return `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`
}
