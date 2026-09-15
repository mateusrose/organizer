import { useState } from 'react'
import { Cloud, Download, Laptop } from 'lucide-react'
import type { DatabaseSummary } from '../types'
import { cn } from '../lib/cn'
import { fmtDateTime } from '../lib/date'
import { useGoogle } from '../store/useGoogle'
import { useStore } from '../store/useStore'
import { Button, Modal } from './ui'

/**
 * Shown the first time a device meets an existing Drive backup and both sides
 * already hold data. Nothing is written until a choice is made — losing a
 * semester to an automatic merge is not a recoverable mistake.
 */
export function DriveConflictDialog() {
  const conflict = useGoogle((s) => s.driveConflict)
  const resolve = useGoogle((s) => s.resolveDriveConflict)
  const [choice, setChoice] = useState<'local' | 'remote'>('remote')
  const [busy, setBusy] = useState(false)

  if (!conflict) return null

  const apply = async () => {
    setBusy(true)
    try {
      await resolve(choice)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        /* Deliberately not dismissible — a stray click must not pick a winner. */
      }}
      title="Two copies of your data"
      subtitle="This device has never synced, and Drive already holds a backup. Pick which one to keep."
      footer={
        <>
          <Button variant="ghost" onClick={exportLocal} icon={<Download className="h-4 w-4" />}>
            Export this device first
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void apply()}>
            {choice === 'remote' ? 'Use the Drive copy' : 'Keep this device'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Option
          selected={choice === 'remote'}
          onSelect={() => setChoice('remote')}
          icon={<Cloud className="h-4 w-4" />}
          title="The copy in Google Drive"
          summary={conflict.remote}
          note="Replaces what is in this browser."
        />
        <Option
          selected={choice === 'local'}
          onSelect={() => setChoice('local')}
          icon={<Laptop className="h-4 w-4" />}
          title="What is on this device"
          summary={conflict.local}
          note="Overwrites the backup in Drive."
        />

        <p className="text-[12px] leading-relaxed text-faint">
          Whichever you pick, the other copy is gone. Export first if you are unsure — the file
          can be imported again from Settings.
        </p>
      </div>
    </Modal>
  )
}

function Option({
  selected,
  onSelect,
  icon,
  title,
  summary,
  note,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  summary: DatabaseSummary
  note: string
}) {
  const counts = [
    [summary.courses, 'course'],
    [summary.assessments, 'assessment'],
    [summary.themes, 'theme'],
    [summary.tasks, 'task'],
  ] as const

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-xl border px-3.5 py-3 text-left transition-colors',
        selected
          ? 'border-accent/40 bg-accent-bg'
          : 'border-line bg-surface-2/50 hover:border-line-strong',
      )}
    >
      <span className="flex items-center gap-2">
        <span className={cn('shrink-0', selected ? 'text-accent-soft' : 'text-faint')}>{icon}</span>
        <span className="text-sm font-medium text-ink">{title}</span>
        <span
          className={cn(
            'ml-auto h-3.5 w-3.5 shrink-0 rounded-full border-2',
            selected ? 'border-accent bg-accent' : 'border-line-strong',
          )}
        />
      </span>

      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-muted">
        {counts.map(([n, noun]) => (
          <span key={noun}>
            <span className="font-medium text-ink">{n}</span> {noun}
            {n === 1 ? '' : 's'}
          </span>
        ))}
      </span>

      <span className="mt-1.5 block text-[11px] text-faint">
        last changed {fmtDateTime(summary.updatedAt)} · {note}
      </span>
    </button>
  )
}

/** Downloads the current database so a wrong choice is still recoverable. */
function exportLocal() {
  const db = useStore.getState().db
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `semestre-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
