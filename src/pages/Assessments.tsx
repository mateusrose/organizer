import { useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  CheckCheck,
  CirclePlay,
  ClipboardList,
  ExternalLink,
  FileText,
  FlaskConical,
  FolderKanban,
  GraduationCap,
  ListChecks,
  Pencil,
  Plus,
  Presentation,
  Search,
  Send,
  Trash,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Assessment, AssessmentKind, AssessmentStatus, Course, GradeScale } from '../types'
import type { NewAssessment } from '../store/useStore'
import { useSettings, useStore } from '../store/useStore'
import { useScope } from '../store/scope'
import { toast } from '../store/useToast'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CourseDot,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  ProgressBar,
  SectionTitle,
  SegmentedControl,
  Select,
  Textarea,
} from '../components/ui'
import { computeCourseGrade } from '../lib/grades'
import { assessmentUrgency, sortByUrgency } from '../lib/urgency'
import type { Urgency } from '../lib/urgency'
import { plannedHoursByAssessment } from '../lib/scheduler'
import {
  daysUntil,
  fmtDateTime,
  fmtDayMonth,
  fmtTime,
  fmtWeekday,
  fromDateTimeInput,
  toDate,
  toDateTimeInput,
} from '../lib/date'

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const KINDS: { value: AssessmentKind; label: string; icon: LucideIcon }[] = [
  { value: 'assignment', label: 'Assignment', icon: FileText },
  { value: 'exam', label: 'Exam', icon: GraduationCap },
  { value: 'quiz', label: 'Quiz', icon: ListChecks },
  { value: 'project', label: 'Project', icon: FolderKanban },
  { value: 'presentation', label: 'Presentation', icon: Presentation },
  { value: 'lab', label: 'Lab', icon: FlaskConical },
  { value: 'reading', label: 'Reading', icon: BookOpen },
]

const STATUSES: { value: AssessmentStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'graded', label: 'Graded' },
]

type Bucket = 'overdue' | 'week' | 'fortnight' | 'later' | 'done'
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'week', label: 'This week' },
  { key: 'fortnight', label: 'Next 14 days' },
  { key: 'later', label: 'Later' },
  { key: 'done', label: 'Done' },
]

type StatusFilter = 'open' | 'submitted' | 'graded' | 'all'
type SortKey = 'urgency' | 'due' | 'weight' | 'course'

const kindMeta = (kind: AssessmentKind) => KINDS.find((k) => k.value === kind) ?? KINDS[0]
const statusLabel = (status: AssessmentStatus) =>
  STATUSES.find((s) => s.value === status)?.label ?? status

/** Trim float noise so "8" stays "8" and 15.666 becomes 15.67. */
const num = (n: number) => String(Math.round(n * 100) / 100)

const isDone = (a: Assessment) => a.status === 'submitted' || a.status === 'graded'
const isPast = (iso: string, now: Date) => toDate(iso).getTime() < now.getTime()

const bucketOf = (a: Assessment, now: Date): Bucket => {
  if (isDone(a)) return 'done'
  if (isPast(a.dueAt, now)) return 'overdue'
  const days = daysUntil(a.dueAt, now)
  if (days <= 7) return 'week'
  if (days <= 14) return 'fortnight'
  return 'later'
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Assessments() {
  const navigate = useNavigate()
  const { courses, assessments, studyBlocks } = useScope()
  const settings = useSettings()
  const scale = settings.gradeScale
  const updateAssessment = useStore((s) => s.updateAssessment)
  const deleteAssessment = useStore((s) => s.deleteAssessment)

  const [query, setQuery] = useState('')
  const [courseFilter, setCourseFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [sort, setSort] = useState<SortKey>('urgency')
  const [editor, setEditor] = useState<{ assessment: Assessment | null; grade?: boolean } | null>(
    null,
  )
  const [pendingDelete, setPendingDelete] = useState<Assessment | null>(null)

  // One clock for the whole render tree keeps buckets and badges in agreement.
  const now = useMemo(() => new Date(), [])

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const planned = useMemo(() => plannedHoursByAssessment(studyBlocks), [studyBlocks])
  const urgencies = useMemo(
    () => new Map(assessments.map((a) => [a.id, assessmentUrgency(a, now)])),
    [assessments, now],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = assessments.filter((a) => {
      if (courseFilter !== 'all' && a.courseId !== courseFilter) return false
      if (statusFilter === 'open' && isDone(a)) return false
      if (statusFilter === 'submitted' && a.status !== 'submitted') return false
      if (statusFilter === 'graded' && a.status !== 'graded') return false
      if (!q) return true
      const course = courseMap.get(a.courseId)
      const haystack = `${a.title} ${course ? `${course.code} ${course.name}` : ''}`.toLowerCase()
      return haystack.includes(q)
    })

    if (sort === 'urgency') {
      return sortByUrgency(list, (a) => urgencies.get(a.id) ?? assessmentUrgency(a, now))
    }
    const code = (a: Assessment) => courseMap.get(a.courseId)?.code ?? ''
    if (sort === 'due') return list.sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    if (sort === 'weight') {
      return list.sort((a, b) => b.weight - a.weight || a.dueAt.localeCompare(b.dueAt))
    }
    return list.sort((a, b) => code(a).localeCompare(code(b)) || a.dueAt.localeCompare(b.dueAt))
  }, [assessments, courseFilter, courseMap, now, query, sort, statusFilter, urgencies])

  const groups = useMemo(
    () =>
      BUCKETS.map((b) => ({
        ...b,
        items: visible.filter((a) => bucketOf(a, now) === b.key),
      })).filter((g) => g.items.length > 0),
    [now, visible],
  )

  const subtitle = useMemo(() => {
    if (assessments.length === 0) return 'Every graded thing, in one place'
    const open = assessments.filter((a) => !isDone(a))
    const overdue = open.filter((a) => isPast(a.dueAt, now))
    const next = open
      .filter((a) => !isPast(a.dueAt, now))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
    const parts = [`${open.length} open`]
    if (overdue.length > 0) parts.push(`${overdue.length} overdue`)
    parts.push(next ? `next due ${fmtDateTime(next.dueAt)}` : 'nothing upcoming')
    return parts.join(' · ')
  }, [assessments, now])

  const filtersActive = query !== '' || courseFilter !== 'all' || statusFilter !== 'open'
  const clearFilters = () => {
    setQuery('')
    setCourseFilter('all')
    setStatusFilter('open')
  }

  const cycleStatus = (a: Assessment) => {
    if (a.status === 'graded') return
    // Submitted work needs a number, so hand it to the form instead of guessing.
    if (a.status === 'submitted') {
      setEditor({ assessment: a, grade: true })
      return
    }
    const next: AssessmentStatus = a.status === 'todo' ? 'in-progress' : 'submitted'
    updateAssessment(a.id, { status: next })
    toast.success(`${a.title} · ${statusLabel(next).toLowerCase()}`)
  }

  const markSubmitted = (a: Assessment) => {
    updateAssessment(a.id, { status: 'submitted' })
    toast.success(`${a.title} marked submitted`)
  }

  return (
    <>
      <PageHeader
        title="Assessments"
        subtitle={subtitle}
        action={
          courses.length === 0 ? (
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => navigate('/courses')}
            >
              Add a course
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setEditor({ assessment: null })}
            >
              Add assessment
            </Button>
          )
        }
      />

      {assessments.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 basis-full sm:basis-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or course"
              aria-label="Search assessments"
              className="pl-9"
            />
          </div>

          <SegmentedControl
            size="sm"
            value={statusFilter}
            onChange={setStatusFilter}
            className="basis-full sm:basis-auto"
            options={[
              { value: 'open', label: 'Open' },
              { value: 'submitted', label: 'Submitted' },
              { value: 'graded', label: 'Graded' },
              { value: 'all', label: 'All' },
            ]}
          />

          <div className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-44">
            <Select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              aria-label="Filter by course"
            >
              <option value="all">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-44">
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort assessments"
            >
              <option value="urgency">Sort by urgency</option>
              <option value="due">Sort by due date</option>
              <option value="weight">Sort by weight</option>
              <option value="course">Sort by course</option>
            </Select>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyStateFor
          hasCourses={courses.length > 0}
          hasAssessments={assessments.length > 0}
          filtersActive={filtersActive}
          onAdd={() => setEditor({ assessment: null })}
          onClear={clearFilters}
          onCourses={() => navigate('/courses')}
        />
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.key}>
              <SectionTitle
                action={
                  <span className="text-[12px] font-medium text-faint">{group.items.length}</span>
                }
              >
                {group.label}
              </SectionTitle>
              <ul className="space-y-2">
                {group.items.map((a) => (
                  <li key={a.id} data-course={courseMap.get(a.courseId)?.color}>
                    <AssessmentRow
                      assessment={a}
                      course={courseMap.get(a.courseId)}
                      urgency={urgencies.get(a.id) ?? assessmentUrgency(a, now)}
                      plannedHours={planned[a.id] ?? 0}
                      overdue={!isDone(a) && isPast(a.dueAt, now)}
                      scale={scale}
                      onOpen={() => setEditor({ assessment: a })}
                      onCycle={() => cycleStatus(a)}
                      onSubmit={() => markSubmitted(a)}
                      onDelete={() => setPendingDelete(a)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editor && (
        <AssessmentModal
          key={`${editor.assessment?.id ?? 'new'}${editor.grade ? ':grade' : ''}`}
          assessment={editor.assessment}
          forceGraded={editor.grade}
          courses={courses}
          assessments={assessments}
          scale={scale}
          onClose={() => setEditor(null)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteAssessment(pendingDelete.id)
          toast.info(`${pendingDelete.title} deleted`)
        }}
        title="Delete assessment"
        message={
          <>
            <span className="text-ink">{pendingDelete?.title}</span> and every study block planned
            for it will be removed. This cannot be undone.
          </>
        }
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function AssessmentRow({
  assessment: a,
  course,
  urgency,
  plannedHours,
  overdue,
  scale,
  onOpen,
  onCycle,
  onSubmit,
  onDelete,
}: {
  assessment: Assessment
  course?: Course
  urgency: Urgency
  plannedHours: number
  overdue: boolean
  scale: GradeScale
  onOpen: () => void
  onCycle: () => void
  onSubmit: () => void
  onDelete: () => void
}) {
  const kind = kindMeta(a.kind)
  const KindIcon = kind.icon
  const done = isDone(a)

  const meta = [
    `Due ${fmtWeekday(a.dueAt)} ${fmtDayMonth(a.dueAt)}`,
    fmtTime(a.dueAt),
    `${num(a.weight)}% of grade`,
    `${num(a.estimatedHours)} h estimated`,
  ]
  if (plannedHours > 0) meta.push(`${num(plannedHours)} h planned`)

  const cycle =
    a.status === 'todo'
      ? { icon: CirclePlay, label: 'Start working' }
      : a.status === 'in-progress'
        ? { icon: Send, label: 'Mark submitted' }
        : { icon: CheckCheck, label: 'Add grade' }
  const CycleIcon = cycle.icon

  return (
    <Card
      padded={false}
      onClick={onOpen}
      className="cursor-pointer px-4 py-3 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2/70"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex shrink-0 items-center gap-1.5 pt-1">
            <CourseDot />
            <span
              className="max-w-[88px] truncate text-[12px] font-medium"
              style={{ color: 'var(--course, var(--accent))' }}
            >
              {course?.code ?? '—'}
            </span>
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={onOpen}
                title={a.title}
                className="max-w-full truncate text-left text-sm font-medium text-ink transition-colors hover:text-accent-soft"
              >
                {a.title}
              </button>
              <Badge icon={<KindIcon className="h-3 w-3" />}>{kind.label}</Badge>
              {a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Open the link for ${a.title}`}
                  className="text-faint transition-colors hover:text-accent-soft"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{meta.join(' · ')}</p>
          </div>
        </div>

        <div
          onClick={(e) => e.stopPropagation()}
          className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {a.status === 'graded' && a.grade !== undefined && (
              <Badge tone={a.grade >= scale.passing ? 'success' : 'danger'}>
                {num(a.grade)} / {num(scale.max)}
              </Badge>
            )}
            {!(a.status === 'graded' && a.grade !== undefined) && (
              <Badge tone={done ? 'neutral' : urgency.tone}>
                {done ? statusLabel(a.status) : urgency.label}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            {overdue && (
              <Button
                size="sm"
                variant="subtle"
                icon={<Send className="h-3.5 w-3.5" />}
                onClick={onSubmit}
              >
                Mark submitted
              </Button>
            )}
            {a.status !== 'graded' && (
              <Button
                variant="ghost"
                size="icon-sm"
                title={cycle.label}
                aria-label={`${cycle.label}: ${a.title}`}
                onClick={onCycle}
              >
                <CycleIcon className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit"
              aria-label={`Edit ${a.title}`}
              onClick={onOpen}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete"
              aria-label={`Delete ${a.title}`}
              onClick={onDelete}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {a.estimatedHours > 0 && (
        <ProgressBar
          tone="course"
          value={plannedHours}
          max={a.estimatedHours}
          height={3}
          className="mt-3"
        />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function EmptyStateFor({
  hasCourses,
  hasAssessments,
  filtersActive,
  onAdd,
  onClear,
  onCourses,
}: {
  hasCourses: boolean
  hasAssessments: boolean
  filtersActive: boolean
  onAdd: () => void
  onClear: () => void
  onCourses: () => void
}) {
  if (!hasCourses) {
    return (
      <EmptyState
        icon={<GraduationCap />}
        title="No courses yet"
        message="Assessments hang off a course. Create one and you can start tracking deadlines, weights and grades."
        action={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onCourses}>
            Go to courses
          </Button>
        }
      />
    )
  }
  if (!hasAssessments) {
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="Nothing graded yet"
        message="Add every assignment, exam and quiz with its weight and your hour estimate — the planner turns them into study blocks."
        action={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
            Add assessment
          </Button>
        }
      />
    )
  }
  return (
    <EmptyState
      icon={<Search />}
      title="Nothing matches"
      message={
        filtersActive
          ? 'No assessment fits the current search and filters.'
          : 'Everything here is done. Enjoy the quiet.'
      }
      action={
        filtersActive ? (
          <Button onClick={onClear}>Clear filters</Button>
        ) : (
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>
            Add assessment
          </Button>
        )
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

interface FormState {
  courseId: string
  title: string
  kind: AssessmentKind
  dueAt: string
  weight: string
  estimatedHours: string
  status: AssessmentStatus
  grade: string
  url: string
  description: string
}

function initialForm(a: Assessment | null, courses: Course[], forceGraded?: boolean): FormState {
  if (!a) {
    const due = new Date()
    due.setDate(due.getDate() + 7)
    due.setHours(23, 59, 0, 0)
    return {
      courseId: courses[0]?.id ?? '',
      title: '',
      kind: 'assignment',
      dueAt: toDateTimeInput(due.toISOString()),
      weight: '',
      estimatedHours: '4',
      status: 'todo',
      grade: '',
      url: '',
      description: '',
    }
  }
  return {
    courseId: a.courseId,
    title: a.title,
    kind: a.kind,
    dueAt: toDateTimeInput(a.dueAt),
    weight: String(a.weight),
    estimatedHours: String(a.estimatedHours),
    status: forceGraded ? 'graded' : a.status,
    grade: a.grade === undefined ? '' : String(a.grade),
    url: a.url ?? '',
    description: a.description ?? '',
  }
}

function AssessmentModal({
  assessment,
  forceGraded,
  courses,
  assessments,
  scale,
  onClose,
}: {
  assessment: Assessment | null
  forceGraded?: boolean
  courses: Course[]
  assessments: Assessment[]
  scale: GradeScale
  onClose: () => void
}) {
  const addAssessment = useStore((s) => s.addAssessment)
  const updateAssessment = useStore((s) => s.updateAssessment)

  const fid = useId()
  const [form, setForm] = useState<FormState>(() => initialForm(assessment, courses, forceGraded))
  const [submitted, setSubmitted] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }) as FormState)

  const errors = useMemo(() => {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.courseId) e.courseId = 'Pick a course'
    if (!form.title.trim()) e.title = 'Give this assessment a title'
    if (!form.dueAt) e.dueAt = 'Set a due date and time'
    const weight = Number(form.weight)
    if (form.weight !== '' && (!Number.isFinite(weight) || weight < 0 || weight > 100)) {
      e.weight = 'Weight must be between 0 and 100'
    }
    const hours = Number(form.estimatedHours)
    if (form.estimatedHours !== '' && (!Number.isFinite(hours) || hours < 0)) {
      e.estimatedHours = 'Estimated hours cannot be negative'
    }
    if (form.status === 'graded') {
      const grade = Number(form.grade)
      if (form.grade === '' || !Number.isFinite(grade) || grade < 0 || grade > scale.max) {
        e.grade = `Grade must be between 0 and ${num(scale.max)}`
      }
    }
    return e
  }, [form, scale.max])

  const shown: Partial<Record<keyof FormState, string>> = submitted ? errors : {}

  const unallocated = useMemo(() => {
    if (!form.courseId) return null
    const used = assessments
      .filter((a) => a.courseId === form.courseId && a.id !== assessment?.id)
      .reduce((sum, a) => sum + (Number.isFinite(a.weight) ? a.weight : 0), 0)
    return Math.round((100 - used) * 10) / 10
  }, [assessment, assessments, form.courseId])

  const weightHint =
    unallocated === null
      ? undefined
      : unallocated >= 0
        ? `this course has ${num(unallocated)}% unallocated`
        : `this course is over-allocated by ${num(-unallocated)}%`

  const save = () => {
    setSubmitted(true)
    if (Object.keys(errors).length > 0) return
    const course = courses.find((c) => c.id === form.courseId)
    if (!course) return

    const graded = form.status === 'graded'
    const payload: NewAssessment = {
      courseId: form.courseId,
      title: form.title.trim(),
      kind: form.kind,
      dueAt: fromDateTimeInput(form.dueAt),
      weight: Math.min(100, Math.max(0, Number(form.weight || 0))),
      estimatedHours: Math.max(0, Number(form.estimatedHours || 0)),
      status: form.status,
      grade: graded ? Number(form.grade) : undefined,
      url: form.url.trim() || undefined,
      description: form.description.trim() || undefined,
      calendarEventId: assessment?.calendarEventId,
    }

    let saved: Assessment
    if (assessment) {
      updateAssessment(assessment.id, payload)
      saved = { ...assessment, ...payload }
    } else {
      saved = addAssessment(payload)
    }

    if (graded) {
      const after = assessments
        .filter((a) => a.courseId === course.id && a.id !== saved.id)
        .concat(saved)
      const result = computeCourseGrade(course, after, scale)
      if (result.projected !== null) {
        toast.success(
          `${course.code} now projects ${num(result.projected)} / ${num(scale.max)}` +
            (result.passing === false ? ' — below passing' : ''),
        )
      } else {
        toast.success('Grade saved')
      }
    } else {
      toast.success(assessment ? 'Assessment updated' : 'Assessment added')
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={assessment ? 'Edit assessment' : 'New assessment'}
      subtitle={
        assessment ? 'Changes apply immediately' : 'Weight and hour estimates drive the planner'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={`${fid}-form`}>
            {assessment ? 'Save changes' : 'Add assessment'}
          </Button>
        </>
      }
    >
      <form
        id={`${fid}-form`}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Course" required htmlFor={`${fid}-course`} error={shown.courseId}>
          <Select
            id={`${fid}-course`}
            value={form.courseId}
            onChange={(e) => set('courseId', e.target.value)}
          >
            <option value="" disabled>
              Pick a course
            </option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Kind" htmlFor={`${fid}-kind`}>
          <Select
            id={`${fid}-kind`}
            value={form.kind}
            onChange={(e) => set('kind', e.target.value as AssessmentKind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          className="sm:col-span-2"
          label="Title"
          required
          htmlFor={`${fid}-title`}
          error={shown.title}
        >
          <Input
            id={`${fid}-title`}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Essay 2 — comparative analysis"
            autoFocus
          />
        </Field>

        <Field label="Due" required htmlFor={`${fid}-due`} error={shown.dueAt}>
          <Input
            id={`${fid}-due`}
            type="datetime-local"
            value={form.dueAt}
            onChange={(e) => set('dueAt', e.target.value)}
          />
        </Field>

        <Field label="Status" htmlFor={`${fid}-status`}>
          <Select
            id={`${fid}-status`}
            value={form.status}
            onChange={(e) => set('status', e.target.value as AssessmentStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Weight"
          htmlFor={`${fid}-weight`}
          hint={weightHint}
          error={shown.weight}
        >
          <Input
            id={`${fid}-weight`}
            type="number"
            min={0}
            max={100}
            step="any"
            inputMode="decimal"
            value={form.weight}
            onChange={(e) => set('weight', e.target.value)}
            placeholder="% of the final grade"
          />
        </Field>

        <Field
          label="Estimated hours"
          htmlFor={`${fid}-hours`}
          hint="Total work, split into study blocks by the planner"
          error={shown.estimatedHours}
        >
          <Input
            id={`${fid}-hours`}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={form.estimatedHours}
            onChange={(e) => set('estimatedHours', e.target.value)}
          />
        </Field>

        {form.status === 'graded' && (
          <Field
            label="Grade"
            required
            htmlFor={`${fid}-grade`}
            hint={`Out of ${num(scale.max)} · passing is ${num(scale.passing)}`}
            error={shown.grade}
          >
            <Input
              id={`${fid}-grade`}
              type="number"
              min={0}
              max={scale.max}
              step="any"
              inputMode="decimal"
              value={form.grade}
              onChange={(e) => set('grade', e.target.value)}
            />
          </Field>
        )}

        <Field
          className={form.status === 'graded' ? undefined : 'sm:col-span-2'}
          label="Link"
          htmlFor={`${fid}-url`}
          hint="Brief, submission page, rubric"
        >
          <Input
            id={`${fid}-url`}
            type="url"
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://"
          />
        </Field>

        <Field className="sm:col-span-2" label="Notes" htmlFor={`${fid}-notes`}>
          <Textarea
            id={`${fid}-notes`}
            rows={3}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Requirements, deliverables, anything worth remembering."
          />
        </Field>
      </form>
    </Modal>
  )
}
