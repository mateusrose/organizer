import { useState } from 'react'
import { Check, CloudUpload, ExternalLink, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { cn } from '../lib/cn'
import { relative } from '../lib/date'
import { loadCredentials } from '../lib/github/credentials'
import { parseRepoRef, probe, type ProbeResult } from '../lib/github/repo'
import { useSync } from '../store/useSync'
import { Button, Card, CardHeader, ConfirmDialog, Field, Input, Spinner } from './ui'

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new'
const NEW_REPO_URL = 'https://github.com/new'

/**
 * Where the user pastes their GitHub credentials. They live in this browser
 * only — never in the repository, and never inside the synced document, since
 * a new device would otherwise need the token in order to fetch the token.
 */
export function SyncSetupCard() {
  const status = useSync((s) => s.status)
  const lastSyncAt = useSync((s) => s.lastSyncAt)
  const error = useSync((s) => s.error)
  const connect = useSync((s) => s.connect)
  const disconnect = useSync((s) => s.disconnect)
  const pull = useSync((s) => s.pull)
  const push = useSync((s) => s.push)

  const existing = loadCredentials()
  const [token, setToken] = useState('')
  const [repoRef, setRepoRef] = useState(
    existing ? `${existing.owner}/${existing.repo}` : '',
  )
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ProbeResult | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)

  const parsed = parseRepoRef(repoRef)

  const test = async () => {
    setProblem(null)
    setResult(null)
    if (!token.trim()) return setProblem('Paste the token first')
    if (!parsed) return setProblem('Write the repository as owner/name')

    setTesting(true)
    try {
      const outcome = await probe({
        token: token.trim(),
        owner: parsed.owner,
        repo: parsed.repo,
        path: 'semestre.json',
      })
      setResult(outcome)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    if (!parsed) return
    await connect({
      token: token.trim(),
      owner: parsed.owner,
      repo: parsed.repo,
      path: 'semestre.json',
    })
    setToken('')
    setResult(null)
  }

  return (
    <Card>
      <CardHeader
        icon={<CloudUpload />}
        title="Sync & backup"
        subtitle="Keeps every device on the same data, through a private repository you own."
      />

      {existing ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <StatusDot status={status} />
                {existing.owner}/{existing.repo}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                {status === 'syncing'
                  ? 'Syncing…'
                  : status === 'dirty'
                    ? 'Unsaved changes — backing up shortly'
                    : lastSyncAt
                      ? `Last synced ${relative(lastSyncAt)}`
                      : 'Not synced yet'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<RefreshCw className={cn('h-3.5 w-3.5', status === 'syncing' && 'animate-spin')} />}
                onClick={() => void pull()}
              >
                Pull
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void push({ force: true })}>
                Push
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Turn sync off on this device"
                onClick={() => setConfirmOff(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {error && (
            <p className="rounded-xl border border-danger/25 bg-danger-bg px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}

          <p className="text-[12px] leading-relaxed text-faint">
            Every change is saved a few seconds after you stop editing, and again when you leave
            the page. Opening the app on another device pulls whatever is newest. The token is
            stored in this browser only.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Steps />

          <Field
            label="Data repository"
            htmlFor="sync-repo"
            hint="owner/name — must be a private repo, and not the one hosting this app."
          >
            <Input
              id="sync-repo"
              value={repoRef}
              placeholder="yourname/organizer-data"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setRepoRef(e.target.value)}
            />
          </Field>

          <Field
            label="Access token"
            htmlFor="sync-token"
            hint="Stored only in this browser. Never committed, never synced."
            error={problem ?? undefined}
          >
            <Input
              id="sync-token"
              type="password"
              value={token}
              placeholder="github_pat_…"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setToken(e.target.value)}
            />
          </Field>

          {result && (
            <div
              className={cn(
                'rounded-xl border px-3.5 py-3 text-[13px]',
                result.private
                  ? 'border-success/25 bg-success-bg text-success'
                  : 'border-warning/25 bg-warning-bg text-warning',
              )}
            >
              <p className="flex items-center gap-2 font-medium">
                {result.private ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <TriangleAlert className="h-4 w-4" />
                )}
                Connected to {result.fullName}
              </p>
              <p className="mt-1">
                {result.private
                  ? 'Private, writable'
                  : 'This repository is PUBLIC — anyone could read your grades. Use a private one.'}
                {result.hasDocument
                  ? ' · already holds a Semestre file, which will be loaded'
                  : ' · empty, this device will seed it'}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" loading={testing} onClick={() => void test()}>
              Test connection
            </Button>
            <Button
              variant="primary"
              disabled={!result || status === 'syncing'}
              onClick={() => void save()}
            >
              {status === 'syncing' ? <Spinner /> : null}
              Turn on sync
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        onConfirm={disconnect}
        title="Turn off sync on this device?"
        message="The token is forgotten here. Your data stays in this browser and in the repository — nothing is deleted."
        confirmLabel="Turn off"
      />
    </Card>
  )
}

function StatusDot({ status }: { status: string }) {
  const tone =
    status === 'error'
      ? 'bg-danger'
      : status === 'syncing'
        ? 'bg-info animate-pulse'
        : status === 'dirty'
          ? 'bg-warning'
          : 'bg-success'
  return <span className={cn('h-2 w-2 shrink-0 rounded-full', tone)} />
}

function Steps() {
  return (
    <details className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-3">
      <summary className="cursor-pointer text-[13px] font-medium text-ink select-none">
        How do I set this up? (about 3 minutes)
      </summary>
      <ol className="mt-3 flex list-decimal flex-col gap-2 pl-4 text-[13px] leading-relaxed text-muted">
        <li>
          Create an empty <span className="font-medium text-ink">private</span> repository — call
          it something like <code className="text-accent-soft">organizer-data</code>. Keep it
          separate from the repo hosting this app, which is public.{' '}
          <a
            href={NEW_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent-soft underline underline-offset-2"
          >
            New repository <ExternalLink className="h-3 w-3" />
          </a>
        </li>
        <li>
          Create a fine-grained access token.{' '}
          <a
            href={TOKEN_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent-soft underline underline-offset-2"
          >
            New token <ExternalLink className="h-3 w-3" />
          </a>
        </li>
        <li>
          Under <span className="font-medium text-ink">Repository access</span> pick{' '}
          <span className="font-medium text-ink">Only select repositories</span> and choose just
          the data repository — so the token can never touch anything else you own.
        </li>
        <li>
          Under <span className="font-medium text-ink">Permissions → Repository permissions</span>,
          set <span className="font-medium text-ink">Contents</span> to{' '}
          <span className="font-medium text-ink">Read and write</span>. Nothing else is needed.
        </li>
        <li>
          Set the expiry to <span className="font-medium text-ink">No expiration</span>, unless you
          would rather re-paste it periodically.
        </li>
        <li>Copy the token and paste it below, with the repository as owner/name.</li>
      </ol>
      <p className="mt-3 text-[12px] text-faint">
        The token stays in this browser. If it ever leaks, revoke it on GitHub and the access is
        gone — it can only reach that one repository.
      </p>
    </details>
  )
}
