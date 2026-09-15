import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Semester } from '../types'
import { cn } from '../lib/cn'
import { defaultSemesterName, defaultSemesterRange } from '../lib/db'
import { fmtDayMonth, fromDateTimeInput, toDateInput } from '../lib/date'
import { useAllSemesters, useDb, useStore } from '../store/useStore'
import { toast } from '../store/useToast'
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Divider,
  Field,
  Input,
  Modal,
} from './ui'

/**
 * Picks the semester everything else is scoped to, and owns creating, renaming,
 * archiving and deleting them. This is one of the few surfaces that reads
 * outside the active semester, so it uses the unscoped store hooks on purpose.
 */
export function SemesterSwitcher({ compact = false }: { compact?: boolean }) {
  const semesters = useAllSemesters()
  const db = useDb()
  const setActiveSemester = useStore((s) => s.setActiveSemester)

  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'new' | 'manage' | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const active = semesters.find((s) => s.id === db.activeSemesterId) ?? null

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /** How many courses sit in each semester — shown as context on every row. */
  const courseCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of db.courses) map.set(c.semesterId, (map.get(c.semesterId) ?? 0) + 1)
    return map
  }, [db.courses])

  const ordered = useMemo(
    () => [...semesters].sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
    [semesters],
  )
  const live = ordered.filter((s) => !s.archived)
  const past = ordered.filter((s) => s.archived)

  const pick = (s: Semester) => {
    setOpen(false)
    if (s.id === db.activeSemesterId) return
    setActiveSemester(s.id)
    toast.info(`Switched to ${s.name}`)
  }

  return (
    <div ref={wrapRef} className={cn('relative', compact ? 'min-w-0' : 'px-3')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 transition-colors hover:border-line-strong',
          compact ? 'max-w-[55vw] px-2.5 py-1.5' : 'w-full px-3 py-2',
        )}
      >
        <Layers className="h-4 w-4 shrink-0 text-accent-soft" />
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-ink">
          {active?.name ?? 'No semester'}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-faint" />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'animate-pop-in absolute z-50 mt-1.5 w-72 max-w-[calc(100vw-2rem)] overflow-hidden',
            'rounded-xl border border-line bg-surface shadow-2xl',
            compact ? 'left-0' : 'left-3 right-3 w-auto',
          )}
        >
          <div className="max-h-[50vh] overflow-y-auto p-1.5">
            {live.map((s) => (
              <SemesterRow
                key={s.id}
                semester={s}
                courses={courseCount.get(s.id) ?? 0}
                active={s.id === db.activeSemesterId}
                onPick={pick}
              />
            ))}

            {past.length > 0 && (
              <>
                <Divider label="Past" className="my-2 px-2" />
                {past.map((s) => (
                  <SemesterRow
                    key={s.id}
                    semester={s}
                    courses={courseCount.get(s.id) ?? 0}
                    active={s.id === db.activeSemesterId}
                    onPick={pick}
                  />
                ))}
              </>
            )}
          </div>

          <div className="flex items-center gap-1 border-t border-line p-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                setOpen(false)
                setDialog('new')
              }}
            >
              New
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => {
                setOpen(false)
                setDialog('manage')
              }}
            >
              Manage
            </Button>
          </div>
        </div>
      )}

      {dialog === 'new' && <NewSemesterModal onClose={() => setDialog(null)} />}
      {dialog === 'manage' && <ManageSemestersModal onClose={() => setDialog(null)} />}
    </div>
  )
}

function SemesterRow({
  semester,
  courses,
  active,
  onPick,
}: {
  semester: Semester
  courses: number
  active: boolean
  onPick: (s: Semester) => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => onPick(semester)}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
        active ? 'bg-accent-bg' : 'hover:bg-surface-3',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{semester.name}</span>
        <span className="block truncate text-[11px] text-faint">
          {fmtDayMonth(semester.startsOn)} – {fmtDayMonth(semester.endsOn)} ·{' '}
          {courses === 1 ? '1 course' : `${courses} courses`}
        </span>
      </span>
      {active && <Check className="h-4 w-4 shrink-0 text-accent-soft" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// New
// ---------------------------------------------------------------------------

/** Mounted only while open, so the draft starts clean every time. */
function NewSemesterModal({ onClose }: { onClose: () => void }) {
  const addSemester = useStore((s) => s.addSemester)
  const [form, setForm] = useState(blankSemesterForm)
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    const name = form.name.trim()
    if (!name) return setError('Give the semester a name')
    if (!form.startsOn || !form.endsOn) return setError('Both dates are required')
    if (form.endsOn <= form.startsOn) return setError('The end date must be after the start date')

    const created = addSemester({
      name,
      startsOn: fromDateTimeInput(form.startsOn),
      endsOn: fromDateTimeInput(form.endsOn),
    })
    toast.success(`${created.name} created — you are now in it`)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New semester"
      subtitle="Courses, deadlines and study blocks all live inside one semester."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="sem-name" required error={error ?? undefined}>
          <Input
            id="sem-name"
            value={form.name}
            placeholder={defaultSemesterName()}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First day" htmlFor="sem-start">
            <Input
              id="sem-start"
              type="date"
              value={form.startsOn}
              onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))}
            />
          </Field>
          <Field label="Last day" htmlFor="sem-end" hint="Used to spread themes evenly.">
            <Input
              id="sem-end"
              type="date"
              value={form.endsOn}
              onChange={(e) => setForm((f) => ({ ...f, endsOn: e.target.value }))}
            />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

function blankSemesterForm() {
  const range = defaultSemesterRange()
  return {
    name: defaultSemesterName(),
    startsOn: toDateInput(range.startsOn),
    endsOn: toDateInput(range.endsOn),
  }
}

// ---------------------------------------------------------------------------
// Manage
// ---------------------------------------------------------------------------

function ManageSemestersModal({ onClose }: { onClose: () => void }) {
  const semesters = useAllSemesters()
  const db = useDb()
  const updateSemester = useStore((s) => s.updateSemester)
  const deleteSemester = useStore((s) => s.deleteSemester)
  const [pendingDelete, setPendingDelete] = useState<Semester | null>(null)

  const ordered = useMemo(
    () => [...semesters].sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
    [semesters],
  )

  /** Everything that would be deleted along with a semester. */
  const contentsOf = (id: string) => {
    const courseIds = new Set(db.courses.filter((c) => c.semesterId === id).map((c) => c.id))
    return {
      courses: courseIds.size,
      assessments: db.assessments.filter((a) => courseIds.has(a.courseId)).length,
      themes: db.themes.filter((t) => courseIds.has(t.courseId)).length,
      tasks: db.tasks.filter((t) => courseIds.has(t.courseId)).length,
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Manage semesters"
        subtitle="Rename, re-date, archive or delete."
        footer={
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {ordered.map((s) => {
            const counts = contentsOf(s.id)
            return (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2/50 p-3"
              >
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Name of ${s.name}`}
                    value={s.name}
                    onChange={(e) => updateSemester(s.id, { name: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${s.name}`}
                    title={
                      semesters.length === 1
                        ? 'The last semester cannot be deleted'
                        : `Delete ${s.name}`
                    }
                    disabled={semesters.length === 1}
                    onClick={() => setPendingDelete(s)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="First day" htmlFor={`sem-${s.id}-start`}>
                    <Input
                      id={`sem-${s.id}-start`}
                      type="date"
                      value={toDateInput(s.startsOn)}
                      onChange={(e) =>
                        e.target.value &&
                        updateSemester(s.id, { startsOn: fromDateTimeInput(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Last day" htmlFor={`sem-${s.id}-end`}>
                    <Input
                      id={`sem-${s.id}-end`}
                      type="date"
                      value={toDateInput(s.endsOn)}
                      onChange={(e) =>
                        e.target.value &&
                        updateSemester(s.id, { endsOn: fromDateTimeInput(e.target.value) })
                      }
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[12px] text-faint">
                    {counts.courses} courses · {counts.assessments} assessments ·{' '}
                    {counts.themes} themes · {counts.tasks} tasks
                  </p>
                  <Checkbox
                    checked={s.archived}
                    onChange={(archived) => updateSemester(s.id, { archived })}
                    label={<span className="text-[12px] text-muted">Archived</span>}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteSemester(pendingDelete.id)
          toast.success(`${pendingDelete.name} deleted`)
        }}
        title={`Delete ${pendingDelete?.name ?? 'semester'}?`}
        message={
          pendingDelete
            ? (() => {
                const c = contentsOf(pendingDelete.id)
                return `This also deletes ${c.courses} courses, ${c.assessments} assessments, ${c.themes} themes and ${c.tasks} tasks. It cannot be undone.`
              })()
            : ''
        }
        confirmLabel="Delete everything"
      />
    </>
  )
}
