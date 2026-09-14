import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AtSign,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CornerDownLeft,
  Filter,
  Flag,
  Hash,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  CourseDot,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SectionTitle,
  SegmentedControl,
  Select,
} from '../components/ui'
import { useSettings, useStore } from '../store/useStore'
import { useScope } from '../store/scope'
import { toast } from '../store/useToast'
import { sortByUrgency, taskUrgency } from '../lib/urgency'
import {
  addDays,
  endOfWeek,
  fmtDateTime,
  fromDateTimeInput,
  isSameDay,
  startOfDay,
  toDate,
  toDateTimeInput,
  toISO,
} from '../lib/date'
import { cn } from '../lib/cn'
import type { Assessment, Course, ISODate, Priority, Task } from '../types'

type FilterKey = 'open' | 'today' | 'overdue' | 'done' | 'all'
type GroupKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done'

const FILTERS: { value: FilterKey; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'today', label: 'Today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
]

const GROUPS: { key: GroupKey; label: string; tone?: string }[] = [
  { key: 'overdue', label: 'Overdue', tone: 'text-danger' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This week' },
  { key: 'later', label: 'Later' },
  { key: 'none', label: 'No date' },
]

const PRIORITY_DOT: Record<Priority, string> = {
  high: 'bg-danger',
  medium: 'bg-warning',
  low: 'bg-surface-3',
}

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export default function Tasks() {
  const { tasks, courses, assessments } = useScope()
  const settings = useSettings()
  const addTask = useStore((s) => s.addTask)
  const updateTask = useStore((s) => s.updateTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const toggleTask = useStore((s) => s.toggleTask)

  // Countdown labels and day grouping go stale — refresh them on a slow tick.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const activeCourses = useMemo(() => courses.filter((c) => !c.archived), [courses])
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const assessmentById = useMemo(() => new Map(assessments.map((a) => [a.id, a])), [assessments])

  // --- quick add ----------------------------------------------------------
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parseQuickTask(draft, activeCourses, now), [draft, activeCourses, now])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      )
        return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submitDraft = () => {
    if (!parsed.title) {
      toast.error('Give the task a title')
      return
    }
    // Every task belongs to a course; an unmatched @code falls back to the
    // first course of the semester.
    const courseId = parsed.courseId ?? courses.find((c) => !c.archived)?.id ?? courses[0]?.id
    if (!courseId) {
      toast.error('Add a course first — every task belongs to one')
      return
    }
    addTask({
      title: parsed.title,
      priority: parsed.priority,
      tags: parsed.tags,
      courseId,
      dueAt: parsed.dueAt,
    })
    setDraft('')
    inputRef.current?.focus()
  }

  // --- filters ------------------------------------------------------------
  const [filter, setFilter] = useState<FilterKey>('open')
  const [courseFilter, setCourseFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [showDone, setShowDone] = useState(false)

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of tasks) for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag)
  }, [tasks])

  const filtersActive = filter !== 'open' || courseFilter !== 'all' || tagFilter.length > 0
  const resetFilters = () => {
    setFilter('open')
    setCourseFilter('all')
    setTagFilter([])
  }

  const visible = useMemo(() => {
    const dayStart = startOfDay(now)
    const matched = tasks.filter((t) => {
      if (courseFilter === 'none' ? !!t.courseId : courseFilter !== 'all' && t.courseId !== courseFilter)
        return false
      if (tagFilter.length > 0 && !t.tags.some((tag) => tagFilter.includes(tag))) return false
      switch (filter) {
        case 'open':
          return !t.done
        case 'done':
          return t.done
        case 'today':
          return !t.done && !!t.dueAt && isSameDay(toDate(t.dueAt), now)
        case 'overdue':
          return !t.done && !!t.dueAt && toDate(t.dueAt) < dayStart
        default:
          return true
      }
    })
    return sortByUrgency(matched, (t) => taskUrgency(t, now))
  }, [tasks, filter, courseFilter, tagFilter, now])

  const groups = useMemo(() => {
    const weekEnd = endOfWeek(now, { weekStartsOn: settings.weekStartsOn })
    const acc: Record<GroupKey, Task[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      week: [],
      later: [],
      none: [],
      done: [],
    }
    for (const t of visible) acc[groupOf(t, now, weekEnd)].push(t)
    return acc
  }, [visible, now, settings.weekStartsOn])

  const counts = useMemo(() => {
    let open = 0
    let doneToday = 0
    let done = 0
    for (const t of tasks) {
      if (!t.done) open += 1
      else {
        done += 1
        if (t.completedAt && isSameDay(toDate(t.completedAt), now)) doneToday += 1
      }
    }
    return { open, doneToday, done }
  }, [tasks, now])

  // --- dialogs ------------------------------------------------------------
  const [editing, setEditing] = useState<Task | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null)
  const [clearOpen, setClearOpen] = useState(false)

  const clearCompleted = () => {
    const done = tasks.filter((t) => t.done)
    done.forEach((t) => deleteTask(t.id))
    toast.success(`Cleared ${done.length} completed ${done.length === 1 ? 'task' : 'tasks'}`)
  }

  const doneOpen = showDone || filter === 'done'
  const hasAnyVisible = visible.length > 0

  const renderRow = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      now={now}
      course={task.courseId ? courseById.get(task.courseId) : undefined}
      assessment={task.assessmentId ? assessmentById.get(task.assessmentId) : undefined}
      onToggle={() => toggleTask(task.id)}
      onRename={(title) => updateTask(task.id, { title })}
      onEdit={() => setEditing(task)}
      onDelete={() => setPendingDelete(task)}
    />
  )

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={`${counts.open} open · ${counts.doneToday} done today`}
        action={
          counts.done > 0 && (
            <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setClearOpen(true)}>
              Clear completed
            </Button>
          )
        }
      />

      {/* --- quick add ---------------------------------------------------- */}
      <div
        className={cn(
          'mb-5 rounded-card border bg-surface/80 shadow-[var(--shadow-card)] backdrop-blur-xl transition-colors duration-150',
          focused ? 'border-line-strong' : 'border-line',
        )}
      >
        <div className="flex items-center gap-2.5 px-3 py-2.5 sm:px-4">
          <Plus className={cn('h-4.5 w-4.5 shrink-0 transition-colors', focused ? 'text-accent' : 'text-faint')} />
          <input
            ref={inputRef}
            value={draft}
            aria-label="Quick add a task"
            placeholder="Add a task…  (try: read chapter 4 !high #lab tomorrow)"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitDraft()
              }
              if (e.key === 'Escape') setDraft('')
            }}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={!parsed.title}
            onClick={submitDraft}
            icon={<CornerDownLeft className="h-3.5 w-3.5" />}
          >
            Add
          </Button>
        </div>

        {draft.trim() ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2.5 sm:px-4">
            <span className="text-[12px] text-faint">Adds</span>
            <span className="min-w-0 max-w-full truncate text-[13px] font-medium text-ink">
              {parsed.title || 'a task with no title yet'}
            </span>
            <Badge
              tone={parsed.priority === 'high' ? 'danger' : parsed.priority === 'medium' ? 'warning' : 'neutral'}
              icon={<Flag className="h-3 w-3" />}
            >
              {PRIORITY_LABEL[parsed.priority]}
            </Badge>
            {parsed.courseId && courseById.get(parsed.courseId) && (
              <span data-course={courseById.get(parsed.courseId)?.color}>
                <Badge tone="course" icon={<CourseDot />}>
                  {courseById.get(parsed.courseId)?.code}
                </Badge>
              </span>
            )}
            {parsed.unknownCourse && (
              <Badge tone="danger" icon={<AtSign className="h-3 w-3" />}>
                no course “{parsed.unknownCourse}”
              </Badge>
            )}
            {parsed.tags.map((tag) => (
              <Badge key={tag} icon={<Hash className="h-3 w-3" />}>
                {tag}
              </Badge>
            ))}
            {parsed.dueAt && (
              <Badge tone="info" icon={<CalendarClock className="h-3 w-3" />}>
                {fmtDateTime(parsed.dueAt)}
              </Badge>
            )}
            <span className="ml-auto hidden text-[11px] text-faint sm:block">Enter to add · Esc to clear</span>
          </div>
        ) : (
          focused && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2.5 text-[12px] text-faint sm:px-4">
              <span>
                <span className="text-muted">!high</span> priority
              </span>
              <span>
                <span className="text-muted">#tag</span> label
              </span>
              <span>
                <span className="text-muted">@code</span> course
              </span>
              <span>
                <span className="text-muted">tomorrow · fri · 24/5</span> due date
              </span>
            </div>
          )
        )}
      </div>

      {/* --- filters ------------------------------------------------------ */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedControl value={filter} onChange={setFilter} options={FILTERS} size="sm" />
        <div className="w-40">
          <Select
            aria-label="Filter by course"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="h-8 text-[13px]"
          >
            <option value="all">All courses</option>
            <option value="none">No course</option>
            {activeCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
        </div>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Reset
          </Button>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          {allTags.map((tag) => {
            const active = tagFilter.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setTagFilter((prev) => (active ? prev.filter((t) => t !== tag) : [...prev, tag]))
                }
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors duration-150',
                  active
                    ? 'border-accent/30 bg-accent-bg text-accent-soft'
                    : 'border-line bg-surface-2 text-muted hover:text-ink',
                )}
              >
                <Hash className="h-3 w-3" />
                {tag}
              </button>
            )
          })}
        </div>
      )}

      {/* --- list --------------------------------------------------------- */}
      {tasks.length === 0 ? (
        <EmptyState
          icon={<ListTodo />}
          title="No tasks yet"
          message="Everything that is not a graded assessment lives here — readings, emails, errands. Type one above and hit Enter."
          action={
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => inputRef.current?.focus()}>
              Add your first task
            </Button>
          }
        />
      ) : !hasAnyVisible ? (
        <EmptyState
          icon={<Filter />}
          title="Nothing matches these filters"
          message="Try another view, or clear the course and tag filters."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {GROUPS.map(({ key, label, tone }) => {
            const items = groups[key]
            if (items.length === 0) return null
            return (
              <section key={key}>
                <SectionTitle action={<span className="text-[12px] text-faint">{items.length}</span>}>
                  <span className={tone}>{label}</span>
                </SectionTitle>
                <TaskList>
                  {items.map(renderRow)}
                </TaskList>
              </section>
            )
          })}

          {groups.done.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  aria-expanded={doneOpen}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-wider text-faint uppercase transition-colors hover:text-muted"
                >
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !doneOpen && '-rotate-90')} />
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {doneOpen ? 'Completed' : `Show ${groups.done.length} completed`}
                </button>
                {doneOpen && <span className="text-[12px] text-faint">{groups.done.length}</span>}
              </div>
              {doneOpen && (
                <TaskList>
                  {groups.done.map(renderRow)}
                </TaskList>
              )}
            </section>
          )}
        </div>
      )}

      {editing && (
        <TaskEditor
          key={editing.id}
          task={editing}
          courses={courses}
          assessments={assessments}
          courseById={courseById}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateTask(editing.id, patch)
            setEditing(null)
            toast.success('Task updated')
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteTask(pendingDelete.id)
          toast.success('Task deleted')
        }}
        title="Delete task"
        message={`“${pendingDelete?.title ?? ''}” will be removed. This cannot be undone.`}
      />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={clearCompleted}
        title="Clear completed"
        message={`Delete all ${counts.done} completed ${counts.done === 1 ? 'task' : 'tasks'}? This cannot be undone.`}
        confirmLabel="Clear"
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function TaskList({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface/80 shadow-[var(--shadow-card)] backdrop-blur-xl">
      {children}
    </div>
  )
}

function TaskRow({
  task,
  course,
  assessment,
  now,
  onToggle,
  onRename,
  onEdit,
  onDelete,
}: {
  task: Task
  course?: Course
  assessment?: Assessment
  now: Date
  onToggle: () => void
  onRename: (title: string) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(task.title)
  // Escape must beat the blur handler that would otherwise save the draft.
  const cancelled = useRef(false)

  // The draft is seeded when editing starts, so an edit made in the modal in
  // the meantime is never overwritten by a stale row draft.
  const startEdit = () => {
    setValue(task.title)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const next = value.trim()
    if (cancelled.current || !next || next === task.title) {
      cancelled.current = false
      setValue(task.title)
      return
    }
    onRename(next)
  }

  const urgency = task.dueAt ? taskUrgency(task, now) : null
  const hasMeta = !!course || !!assessment || task.tags.length > 0 || !!urgency

  return (
    <div className="animate-fade-up group flex items-start gap-3 border-t border-line px-3 py-2.5 transition-colors first:border-t-0 hover:bg-surface-2/60 sm:px-4">
      <Checkbox
        checked={task.done}
        onChange={onToggle}
        className="mt-1"
        label={<span className="sr-only">{task.done ? 'Mark as open' : 'Mark done'}: {task.title}</span>}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_DOT[task.priority])}
          />
          {editing ? (
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
                if (e.key === 'Escape') {
                  cancelled.current = true
                  e.currentTarget.blur()
                }
              }}
              aria-label="Task title"
              className="-my-0.5 w-full rounded-lg border border-line-strong bg-surface-2 px-2 py-0.5 text-sm text-ink focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className={cn(
                'min-w-0 flex-1 text-left text-sm leading-6 break-words transition-colors',
                task.done ? 'text-muted line-through' : 'text-ink hover:text-accent-soft',
              )}
            >
              {task.title}
            </button>
          )}
        </div>

        {hasMeta && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {course && (
              <span data-course={course.color}>
                <Badge tone="course" icon={<CourseDot />}>
                  {course.code}
                </Badge>
              </span>
            )}
            {assessment && (
              <Badge tone="neutral" className="max-w-[12rem]">
                <span className="min-w-0 truncate">{assessment.title}</span>
              </Badge>
            )}
            {task.tags.map((tag) => (
              <span key={tag} className="text-[12px] text-faint">
                #{tag}
              </span>
            ))}
            {urgency && !task.done && <Badge tone={urgency.tone}>{urgency.label}</Badge>}
            {urgency && task.done && task.dueAt && (
              <span className="text-[12px] text-faint">{fmtDateTime(task.dueAt)}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${task.title}`} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${task.title}`} onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function TaskEditor({
  task,
  courses,
  assessments,
  courseById,
  onClose,
  onSave,
}: {
  task: Task
  courses: Course[]
  assessments: Assessment[]
  courseById: Map<string, Course>
  onClose: () => void
  onSave: (patch: Partial<Task>) => void
}) {
  const [form, setForm] = useState({
    title: task.title,
    courseId: task.courseId ?? '',
    assessmentId: task.assessmentId ?? '',
    dueAt: task.dueAt ? toDateTimeInput(task.dueAt) : '',
    priority: task.priority,
    tags: task.tags.join(' '),
  })
  const [error, setError] = useState('')

  const linkable = useMemo(
    () => assessments.filter((a) => !form.courseId || a.courseId === form.courseId),
    [assessments, form.courseId],
  )

  const save = () => {
    const title = form.title.trim()
    if (!title) {
      setError('Give the task a title')
      return
    }
    if (!form.courseId) {
      setError('Pick a course — every task belongs to one')
      return
    }
    onSave({
      title,
      courseId: form.courseId,
      assessmentId: form.assessmentId || undefined,
      dueAt: form.dueAt ? fromDateTimeInput(form.dueAt) : undefined,
      priority: form.priority,
      tags: parseTags(form.tags),
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit task"
      subtitle="Everything the quick-add bar could not capture"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required error={error} htmlFor="task-title" className="sm:col-span-2">
          <Input
            id="task-title"
            value={form.title}
            onChange={(e) => {
              setError('')
              setForm((f) => ({ ...f, title: e.target.value }))
            }}
            placeholder="Read chapter 4"
          />
        </Field>

        <Field label="Course" htmlFor="task-course" required>
          <Select
            id="task-course"
            value={form.courseId}
            onChange={(e) => {
              const courseId = e.target.value
              setForm((f) => {
                const linked = assessments.find((a) => a.id === f.assessmentId)
                const keep = !courseId || (linked && linked.courseId === courseId)
                return { ...f, courseId, assessmentId: keep ? f.assessmentId : '' }
              })
            }}
          >
            <option value="">Select a course…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Linked assessment" hint="Optional — ties this errand to a deadline" htmlFor="task-assessment">
          <Select
            id="task-assessment"
            value={form.assessmentId}
            onChange={(e) => setForm((f) => ({ ...f, assessmentId: e.target.value }))}
          >
            <option value="">None</option>
            {linkable.map((a) => (
              <option key={a.id} value={a.id}>
                {courseById.get(a.courseId)?.code ?? '—'} · {a.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Due" htmlFor="task-due">
          <Input
            id="task-due"
            type="datetime-local"
            value={form.dueAt}
            onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
          />
        </Field>

        <Field label="Priority">
          <SegmentedControl<Priority>
            value={form.priority}
            onChange={(priority) => setForm((f) => ({ ...f, priority }))}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
          />
        </Field>

        <Field label="Tags" hint="Space or comma separated" htmlFor="task-tags" className="sm:col-span-2">
          <Input
            id="task-tags"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="lab reading admin"
          />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupOf(task: Task, now: Date, weekEnd: Date): GroupKey {
  if (task.done) return 'done'
  if (!task.dueAt) return 'none'
  const due = toDate(task.dueAt)
  if (due < startOfDay(now)) return 'overdue'
  if (isSameDay(due, now)) return 'today'
  if (isSameDay(due, addDays(now, 1))) return 'tomorrow'
  if (due <= weekEnd) return 'week'
  return 'later'
}

// ---------------------------------------------------------------------------
// Quick-add parser
// ---------------------------------------------------------------------------

interface ParsedQuickTask {
  title: string
  priority: Priority
  tags: string[]
  courseId?: string
  /** Text typed after `@` that matched no course — surfaced in the preview. */
  unknownCourse?: string
  dueAt?: ISODate
}

/** Tasks with a parsed date land at the end of the study day, not at midnight. */
const DUE_HOUR = 18

const PRIORITY_TOKENS: Record<string, Priority> = {
  high: 'high',
  h: 'high',
  urgent: 'high',
  medium: 'medium',
  med: 'medium',
  m: 'medium',
  normal: 'medium',
  low: 'low',
  l: 'low',
}

const WEEKDAY_TOKENS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
}

/**
 * Grammar — `!`, `#` and `@` tokens may sit anywhere and are stripped from the
 * title; a date is only read from the *last* remaining word:
 *
 *   !high | !med | !low            priority (last one wins, default medium)
 *   #tag                           tag, repeatable
 *   @code                          course by code (case-insensitive, prefix ok)
 *   today | tomorrow | tmr        ─┐
 *   mon … sun | monday … sunday    ├─ due date, at 18:00 local
 *   d/m | d-m | d/m/yyyy          ─┘
 *
 *   'read chapter 4 !high #lab tomorrow'
 *     → title 'read chapter 4', priority high, tags ['lab'], due tomorrow 18:00
 */
function parseQuickTask(raw: string, courses: Course[], now: Date = new Date()): ParsedQuickTask {
  const result: ParsedQuickTask = { title: '', priority: 'medium', tags: [] }
  const words: string[] = []

  for (const word of raw.trim().split(/\s+/)) {
    if (!word) continue
    const lower = word.toLowerCase()

    if (word.length > 1 && word.startsWith('!')) {
      const priority = PRIORITY_TOKENS[lower.slice(1)]
      if (priority) {
        result.priority = priority
        continue
      }
    }

    if (word.length > 1 && word.startsWith('#')) {
      const tag = lower.slice(1).replace(/[^\p{L}\p{N}_-]/gu, '')
      if (tag && !result.tags.includes(tag)) result.tags.push(tag)
      continue
    }

    if (word.length > 1 && word.startsWith('@')) {
      const course = matchCourse(lower.slice(1), courses)
      if (course) {
        result.courseId = course.id
        result.unknownCourse = undefined
        continue
      }
      // No course by that code: the token is just part of the title
      // ("email @joao about the lab"), so put it back.
      result.unknownCourse = word.slice(1)
      words.push(word)
      continue
    }

    words.push(word)
  }

  const last = words[words.length - 1]
  if (last) {
    const due = parseDueToken(last, now)
    if (due) {
      result.dueAt = toISO(due)
      words.pop()
    }
  }

  result.title = words.join(' ')
  return result
}

function matchCourse(token: string, courses: Course[]): Course | undefined {
  return (
    courses.find((c) => c.code.toLowerCase() === token) ??
    courses.find((c) => c.code.toLowerCase().startsWith(token)) ??
    courses.find((c) => c.name.toLowerCase().startsWith(token))
  )
}

function parseDueToken(token: string, now: Date): Date | null {
  const t = token.toLowerCase()
  if (t === 'today' || t === 'tod') return atDueHour(now)
  if (t === 'tomorrow' || t === 'tmr' || t === 'tmw') return atDueHour(addDays(now, 1))

  const weekday = WEEKDAY_TOKENS[t]
  if (weekday !== undefined) {
    const ahead = (weekday - now.getDay() + 7) % 7
    // A bare weekday name means the *next* one — say "today" for today.
    return atDueHour(addDays(now, ahead === 0 ? 7 : ahead))
  }

  // No '.' separator: it would swallow trailing decimals like 'read section 4.2'.
  const m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(t)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  if (day < 1 || day > 31 || month < 1 || month > 12) return null

  const yearToken = m[3]
  const year = yearToken
    ? yearToken.length <= 2
      ? 2000 + Number(yearToken)
      : Number(yearToken)
    : now.getFullYear()
  const date = new Date(year, month - 1, day, DUE_HOUR, 0, 0, 0)
  if (date.getMonth() !== month - 1) return null // 31/2 and friends
  // A bare day/month that already passed means next year.
  if (!yearToken && date < startOfDay(now)) date.setFullYear(year + 1)
  return date
}

function atDueHour(day: Date): Date {
  const d = new Date(day)
  d.setHours(DUE_HOUR, 0, 0, 0)
  return d
}

function parseTags(value: string): string[] {
  const out: string[] = []
  for (const raw of value.split(/[\s,]+/)) {
    const tag = raw.replace(/^#/, '').toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '')
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out
}
