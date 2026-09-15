import { useCallback, useMemo, useState } from 'react'
import { BookOpen, ExternalLink, GraduationCap, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RESOURCE_KINDS, RESOURCE_KIND_LABEL } from '../types'
import type {
  Assessment,
  Course,
  LearningResource,
  ResourceKind,
  Theme,
  ThemeTodo,
} from '../types'
import { cn } from '../lib/cn'
import {
  fmtDate,
  fmtDayMonth,
  fromDateTimeInput,
  startOfDay,
  toDate,
  toDateInput,
} from '../lib/date'
import { THEME_STATUS_LABEL, isBehind, themeProgress, todoProgress } from '../lib/themes'
import { uid } from '../lib/id'
import { useScope } from '../store/scope'
import { useStore } from '../store/useStore'
import { useFilters } from '../store/useFilters'
import { toast } from '../store/useToast'
import { FilterBar } from '../components/FilterBar'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  CourseDot,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SegmentedControl,
  Select,
  Stat,
  Textarea,
} from '../components/ui'

type View = 'timeline' | 'list'

const DAY = 86_400_000
/** Minimum width per day so a long term stays readable and just scrolls. */
const MIN_PX_PER_DAY = 14
const ROW_H = 30

const STATUSES: { value: Theme['status']; label: string }[] = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'Doing' },
  { value: 'done', label: 'Done' },
]

/** The whole term on one timeline: what each course teaches, and when. */
export default function Syllabus() {
  const { activeCourses, themes, assessments, semester } = useScope()
  const [view, setView] = useState<View>('timeline')
  /** `theme: null` opens the editor in create mode for `courseId`. */
  const [editing, setEditing] = useState<{ theme: Theme | null; courseId: string } | null>(null)

  const openTheme = useCallback(
    (theme: Theme) => setEditing({ theme, courseId: theme.courseId }),
    [],
  )

  const courseIds = useFilters((s) => s.courseIds)
  const hiddenKinds = useFilters((s) => s.hiddenKinds)

  const now = useMemo(() => new Date(), [])

  const courses = useMemo(
    () => activeCourses.filter((c) => courseIds === null || courseIds.includes(c.id)),
    [activeCourses, courseIds],
  )

  const visibleThemes = useMemo(() => {
    if (hiddenKinds.includes('themes')) return []
    const ids = new Set(courses.map((c) => c.id))
    return themes.filter((t) => ids.has(t.courseId))
  }, [themes, courses, hiddenKinds])

  const byCourse = useMemo(() => {
    const map = new Map<string, Theme[]>()
    for (const t of visibleThemes) {
      map.set(t.courseId, [...(map.get(t.courseId) ?? []), t])
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order)
    return map
  }, [visibleThemes])

  const totals = useMemo(() => {
    const progress = themeProgress(visibleThemes)
    return {
      ...progress,
      doing: visibleThemes.filter((t) => t.status === 'in-progress').length,
      behind: visibleThemes.filter((t) => isBehind(t, now)).length,
    }
  }, [visibleThemes, now])

  const header = (
    <PageHeader
      title="Syllabus"
      subtitle={
        semester
          ? `${totals.total} ${totals.total === 1 ? 'theme' : 'themes'} across ${courses.length} ${
              courses.length === 1 ? 'course' : 'courses'
            } · ${semester.name}`
          : 'No active semester'
      }
      action={
        <div className="flex items-center gap-2">
          <SegmentedControl
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'timeline', label: 'Timeline' },
              { value: 'list', label: 'List' },
            ]}
          />
          {activeCourses.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-4 w-4" />}
              onClick={() =>
                setEditing({ theme: null, courseId: courses[0]?.id ?? activeCourses[0].id })
              }
            >
              New theme
            </Button>
          )}
        </div>
      }
    />
  )

  if (!semester) {
    return (
      <>
        {header}
        <EmptyState
          icon={<GraduationCap />}
          title="No active semester"
          message="Pick or create one from the switcher at the top of the sidebar, then add courses to it."
        />
      </>
    )
  }

  if (activeCourses.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={<GraduationCap />}
          title="No courses in this semester"
          message="The syllabus is built per course, so add a course first."
          action={
            <Link
              to="/courses"
              className="inline-flex h-9.5 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-contrast transition-[filter] hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Add a course
            </Link>
          }
        />
      </>
    )
  }

  return (
    <>
      {header}

      {activeCourses.length > 1 && (
        <FilterBar courses={activeCourses} kinds={['themes']} className="mb-4" />
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Themes" value={totals.total} />
        <Stat label="Done" value={totals.done} tone="success" />
        <Stat label="In progress" value={totals.doing} tone="accent" />
        <Stat
          label="Behind"
          value={totals.behind}
          tone={totals.behind > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {totals.total === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="No themes yet"
          message="Add themes one at a time here, or paste a whole topic list from a course's Syllabus button and spread it across the term."
          action={
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() =>
                setEditing({ theme: null, courseId: courses[0]?.id ?? activeCourses[0].id })
              }
            >
              Add a theme
            </Button>
          }
        />
      ) : view === 'timeline' ? (
        <Timeline
          courses={courses}
          byCourse={byCourse}
          from={toDate(semester.startsOn)}
          to={toDate(semester.endsOn)}
          now={now}
          onPick={openTheme}
        />
      ) : (
        <ThemeList courses={courses} byCourse={byCourse} now={now} onPick={openTheme} />
      )}

      {editing && (
        <ThemeEditor
          key={editing.theme?.id ?? 'new'}
          theme={editing.theme}
          courses={activeCourses}
          defaultCourseId={editing.courseId}
          assessments={assessments}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function Timeline({
  courses,
  byCourse,
  from,
  to,
  now,
  onPick,
}: {
  courses: Course[]
  byCourse: Map<string, Theme[]>
  from: Date
  to: Date
  now: Date
  onPick: (t: Theme) => void
}) {
  const start = startOfDay(from).getTime()
  const end = startOfDay(to).getTime()
  const days = Math.max(1, Math.round((end - start) / DAY) + 1)
  const width = days * MIN_PX_PER_DAY

  /** Pixels from the left edge of the track for a given instant. */
  const x = useCallback(
    (ms: number) => ((ms - start) / DAY) * MIN_PX_PER_DAY,
    [start],
  )

  /** Month boundaries inside the range, for the ruler along the top. */
  const months = useMemo(() => {
    const out: { label: string; left: number }[] = []
    const cursor = new Date(start)
    cursor.setDate(1)
    while (cursor.getTime() <= end) {
      const ms = Math.max(cursor.getTime(), start)
      out.push({ label: cursor.toLocaleDateString(undefined, { month: 'short' }), left: x(ms) })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return out
  }, [start, end, x])

  const todayLeft = now.getTime() >= start && now.getTime() <= end + DAY ? x(now.getTime()) : null

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex">
        {/* sticky gutter: course identity stays put while the track scrolls */}
        <div className="w-[120px] shrink-0 border-r border-line sm:w-[150px]">
          <div className="h-8 border-b border-line" />
          {courses.map((course) => {
            const list = byCourse.get(course.id) ?? []
            return (
              <div
                key={course.id}
                data-course={course.color}
                className="flex items-center gap-2 border-b border-line px-3"
                style={{ height: ROW_H + 10 }}
              >
                <CourseDot />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink">
                    {course.code}
                  </span>
                  <span className="block text-[10px] text-faint">{list.length} themes</span>
                </span>
              </div>
            )
          })}
        </div>

        {/* only the track scrolls — never the page body */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width }}>
            <div className="flex h-8 items-end border-b border-line">
              {months.map((m) => (
                <span
                  key={`${m.label}-${m.left}`}
                  className="absolute pb-1 text-[11px] font-medium tracking-wide text-faint uppercase"
                  style={{ left: m.left + 4 }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            {todayLeft !== null && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-accent"
                style={{ left: todayLeft }}
              >
                <span className="absolute -top-0.5 -left-4 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-accent-contrast">
                  today
                </span>
              </div>
            )}

            {courses.map((course) => (
              <div
                key={course.id}
                data-course={course.color}
                className="relative border-b border-line"
                style={{ height: ROW_H + 10 }}
              >
                {(byCourse.get(course.id) ?? []).map((theme) => {
                  const left = x(startOfDay(toDate(theme.startsOn)).getTime())
                  const right = x(startOfDay(toDate(theme.endsOn)).getTime() + DAY)
                  const behind = isBehind(theme, now)
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => onPick(theme)}
                      title={`${theme.title} · ${fmtDayMonth(theme.startsOn)} – ${fmtDayMonth(theme.endsOn)}`}
                      className={cn(
                        'absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden rounded-md border-l-2 px-1.5',
                        'text-[11px] transition-[filter] hover:brightness-125',
                        behind && 'outline-1 outline-danger',
                        theme.status === 'done' && 'opacity-60',
                      )}
                      style={{
                        left,
                        width: Math.max(MIN_PX_PER_DAY, right - left - 2),
                        height: ROW_H - 8,
                        borderLeftColor: 'var(--course, var(--accent))',
                        background: 'var(--course-bg, var(--accent-bg))',
                        color: 'var(--course, var(--accent))',
                      }}
                    >
                      <span className="truncate">{theme.title}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function ThemeList({
  courses,
  byCourse,
  now,
  onPick,
}: {
  courses: Course[]
  byCourse: Map<string, Theme[]>
  now: Date
  onPick: (t: Theme) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {courses.map((course) => {
        const list = byCourse.get(course.id) ?? []
        if (list.length === 0) return null
        return (
          <Card key={course.id} data-course={course.color} padded={false}>
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <CourseDot />
              <span className="text-sm font-semibold text-ink">{course.code}</span>
              <span className="truncate text-[13px] text-muted">{course.name}</span>
            </div>
            <ul className="divide-y divide-line">
              {list.map((theme, i) => {
                const behind = isBehind(theme, now)
                const todos = todoProgress(theme)
                return (
                  <li key={theme.id}>
                    <button
                      type="button"
                      onClick={() => onPick(theme)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="w-5 shrink-0 text-center text-[12px] tabular-nums text-faint">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-[13px] text-ink',
                            theme.status === 'done' && 'line-through opacity-60',
                          )}
                        >
                          {theme.title}
                        </span>
                        <span className="block text-[11px] text-faint">
                          {fmtDayMonth(theme.startsOn)} – {fmtDayMonth(theme.endsOn)}
                          {todos.total > 0 && ` · ${todos.done}/${todos.total} done`}
                          {theme.resources.length > 0 &&
                            ` · ${theme.resources.length} ${
                              theme.resources.length === 1 ? 'resource' : 'resources'
                            }`}
                        </span>
                      </span>
                      <Badge
                        tone={behind ? 'danger' : theme.status === 'done' ? 'success' : 'neutral'}
                      >
                        {behind ? 'behind' : THEME_STATUS_LABEL[theme.status]}
                      </Badge>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function ThemeEditor({
  theme,
  courses,
  defaultCourseId,
  assessments,
  onClose,
}: {
  theme: Theme | null
  courses: Course[]
  defaultCourseId: string
  assessments: Assessment[]
  onClose: () => void
}) {
  const addTheme = useStore((s) => s.addTheme)
  const updateTheme = useStore((s) => s.updateTheme)
  const deleteTheme = useStore((s) => s.deleteTheme)

  const [courseId, setCourseId] = useState(theme?.courseId ?? defaultCourseId)
  const [title, setTitle] = useState(theme?.title ?? '')
  const [startsOn, setStartsOn] = useState(theme?.startsOn ?? new Date().toISOString())
  const [endsOn, setEndsOn] = useState(theme?.endsOn ?? new Date().toISOString())
  const [status, setStatus] = useState<Theme['status']>(theme?.status ?? 'not-started')
  const [description, setDescription] = useState(theme?.description ?? '')
  const [url, setUrl] = useState(theme?.url ?? '')
  const [assessmentId, setAssessmentId] = useState(theme?.assessmentId ?? '')
  const [todos, setTodos] = useState<ThemeTodo[]>(theme?.todos ?? [])
  const [resources, setResources] = useState<LearningResource[]>(theme?.resources ?? [])
  const [titleError, setTitleError] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const course = courses.find((c) => c.id === courseId)

  // Only this course's assessments can be linked; switching course drops a
  // link that would otherwise point across courses.
  const linkable = useMemo(
    () => assessments.filter((a) => a.courseId === courseId),
    [assessments, courseId],
  )
  const linked = linkable.find((a) => a.id === assessmentId)

  const pickCourse = (next: string) => {
    setCourseId(next)
    setAssessmentId((prev) =>
      assessments.some((a) => a.id === prev && a.courseId === next) ? prev : '',
    )
  }

  // --- checklist -----------------------------------------------------------
  const addTodo = () => setTodos((prev) => [...prev, { id: uid('td'), text: '', done: false }])
  const patchTodo = (id: string, patch: Partial<ThemeTodo>) =>
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const dropTodo = (id: string) => setTodos((prev) => prev.filter((t) => t.id !== id))

  // --- resources -----------------------------------------------------------
  const addResource = () =>
    setResources((prev) => [...prev, { id: uid('res'), title: '', kind: 'reading' }])
  const patchResource = (id: string, patch: Partial<LearningResource>) =>
    setResources((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const dropResource = (id: string) => setResources((prev) => prev.filter((r) => r.id !== id))

  const save = () => {
    if (!title.trim()) {
      setTitleError('Give the theme a title')
      return
    }
    if (!courseId) return

    // Empty rows are the natural residue of an "add row" button; drop them
    // rather than persisting blanks the student has to clean up later.
    const payload = {
      courseId,
      title: title.trim(),
      startsOn,
      endsOn: endsOn < startsOn ? startsOn : endsOn,
      status,
      description: description.trim() || undefined,
      url: url.trim() || undefined,
      assessmentId: assessmentId || undefined,
      todos: todos.map((t) => ({ ...t, text: t.text.trim() })).filter((t) => t.text),
      resources: resources
        .map((r) => ({ ...r, title: r.title.trim(), url: r.url?.trim() || undefined }))
        .filter((r) => r.title),
    }

    if (theme) {
      updateTheme(theme.id, payload)
      toast.success(`${payload.title} updated`)
    } else {
      addTheme(payload)
      toast.success(`${payload.title} added`)
    }
    onClose()
  }

  const remove = () => {
    if (!theme) return
    deleteTheme(theme.id)
    toast.success(`${theme.title} deleted`)
    onClose()
  }

  const progress = todos.filter((t) => t.done).length

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={theme ? theme.title : 'New theme'}
        subtitle={course ? `${course.code} \u00b7 ${course.name}` : 'Pick a course'}
        footer={
          <>
            {theme && (
              <Button
                variant="danger"
                className="mr-auto"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {theme ? 'Save changes' : 'Add theme'}
            </Button>
          </>
        }
      >
        <div data-course={course?.color} className="flex flex-col gap-5">
          {/* identity ----------------------------------------------------- */}
          <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
            <Field label="Title" required error={titleError} htmlFor="theme-title">
              <Input
                id="theme-title"
                value={title}
                autoFocus
                placeholder="Pointers and memory"
                onChange={(e) => {
                  setTitle(e.target.value)
                  setTitleError(undefined)
                }}
              />
            </Field>
            <Field label="Course" htmlFor="theme-course">
              <Select
                id="theme-course"
                value={courseId}
                onChange={(e) => pickCourse(e.target.value)}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* the band ----------------------------------------------------- */}
          {/* `cn` is plain clsx, so a `w-auto` here would not beat the control's
              own `w-full` — the grid sizes the inputs instead. */}
          <div className="grid gap-4 sm:grid-cols-[1fr_max-content]">
            <Field label="Date range" hint="The stretch of term this theme is worked through">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <Input
                  aria-label="Starts on"
                  type="date"
                  value={toDateInput(startsOn)}
                  onChange={(e) => e.target.value && setStartsOn(fromDateTimeInput(e.target.value))}
                />
                <span className="text-[12px] text-faint">→</span>
                <Input
                  aria-label="Ends on"
                  type="date"
                  value={toDateInput(endsOn)}
                  onChange={(e) => e.target.value && setEndsOn(fromDateTimeInput(e.target.value))}
                />
              </div>
            </Field>
            <Field label="Status">
              <SegmentedControl
                size="sm"
                value={status}
                options={STATUSES}
                onChange={setStatus}
              />
            </Field>
          </div>

          {/* the relation ------------------------------------------------- */}
          <Field
            label="Assessed by"
            htmlFor="theme-assessment"
            hint={
              linked
                ? `Due ${fmtDate(linked.dueAt)} \u00b7 worth ${linked.points} pts`
                : 'Link the assessment this theme feeds, if there is one'
            }
          >
            <Select
              id="theme-assessment"
              value={assessmentId}
              onChange={(e) => setAssessmentId(e.target.value)}
            >
              <option value="">Not linked</option>
              {linkable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Link" htmlFor="theme-url" hint="Moodle section, course chapter, slides">
            <div className="flex items-center gap-2">
              <Input
                id="theme-url"
                type="url"
                value={url}
                placeholder="https://"
                className="min-w-0 flex-1"
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open link"
                title="Open in a new tab"
                disabled={!url.trim()}
                icon={<ExternalLink className="h-4 w-4" />}
                onClick={() => window.open(url.trim(), '_blank', 'noopener,noreferrer')}
              />
            </div>
          </Field>

          <Field label="Notes" htmlFor="theme-notes">
            <Textarea
              id="theme-notes"
              value={description}
              placeholder="What this unit is actually about"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          {/* checklist ---------------------------------------------------- */}
          <Field
            label="To do"
            hint={
              todos.length > 0
                ? `${progress} of ${todos.length} done \u00b7 blank points are dropped on save`
                : 'The work this theme asks for, one point per line'
            }
          >
            <div className="flex flex-col gap-2">
              {todos.map((t, i) => (
                <div key={t.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={t.done}
                    onChange={(done) => patchTodo(t.id, { done })}
                    className="shrink-0"
                  />
                  <Input
                    value={t.text}
                    aria-label={`To-do ${i + 1}`}
                    placeholder="Work through the exercise sheet"
                    className={cn('min-w-0 flex-1', t.done && 'line-through opacity-60')}
                    onChange={(e) => patchTodo(t.id, { text: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove to-do ${i + 1}`}
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => dropTodo(t.id)}
                  />
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                icon={<Plus className="h-4 w-4" />}
                onClick={addTodo}
              >
                Add point
              </Button>
            </div>
          </Field>

          {/* resources ---------------------------------------------------- */}
          <Field label="Learning resources" hint="Rows without a title are dropped on save">
            <div className="flex flex-col gap-2">
              {resources.map((r, i) => (
                <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2/50 p-2 sm:flex-row sm:items-center">
                  <Input
                    value={r.title}
                    aria-label={`Resource ${i + 1} title`}
                    placeholder="K&R chapter 5"
                    className="min-w-0 flex-1"
                    onChange={(e) => patchResource(r.id, { title: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <div className="w-28 shrink-0">
                      <Select
                        value={r.kind}
                        aria-label={`Resource ${i + 1} kind`}
                        onChange={(e) =>
                          patchResource(r.id, { kind: e.target.value as ResourceKind })
                        }
                      >
                        {RESOURCE_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {RESOURCE_KIND_LABEL[kind]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Input
                      type="url"
                      value={r.url ?? ''}
                      aria-label={`Resource ${i + 1} link`}
                      placeholder="https://"
                      className="min-w-0 flex-1 sm:w-44 sm:flex-none"
                      onChange={(e) => patchResource(r.id, { url: e.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove resource ${i + 1}`}
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={() => dropResource(r.id)}
                    />
                  </div>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                icon={<Plus className="h-4 w-4" />}
                onClick={addResource}
              >
                Add resource
              </Button>
            </div>
          </Field>

          {theme && isBehind(theme) && (
            <p className="rounded-xl border border-danger/25 bg-danger-bg px-3 py-2 text-[13px] text-danger">
              This theme&rsquo;s window has passed and it is not marked done.
            </p>
          )}
        </div>
      </Modal>

      {confirmDelete && (
        <ConfirmDialog
          open
          destructive
          title="Delete this theme?"
          message="Its checklist and resources go with it. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
