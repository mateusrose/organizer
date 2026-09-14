import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react'
import { COURSE_COLORS } from '../types'
import type {
  Assessment,
  ClassEntry,
  ClassKind,
  Course,
  CourseColor,
  GradeScale,
  Weekday,
} from '../types'
import { useSettings, useStore } from '../store/useStore'
import { useScope } from '../store/scope'
import { toast } from '../store/useToast'
import { computeCourseGrade, semesterAverage, totalEcts } from '../lib/grades'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Select,
  StackedBar,
  Textarea,
} from '../components/ui'
import { cn } from '../lib/cn'
import {
  WEEKDAY_LONG,
  daysUntil,
  fmtDateTime,
  fmtTime,
  fromDateTimeInput,
  toDateTimeInput,
} from '../lib/date'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Filter = 'active' | 'archived' | 'all'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
]

const CLASS_KINDS: { value: ClassKind; label: string }[] = [
  { value: 'module', label: 'Module' },
  { value: 'lecture', label: 'Lecture' },
  { value: 'lab', label: 'Lab' },
  { value: 'seminar', label: 'Seminar' },
  { value: 'office-hours', label: 'Office hours' },
]

const NO_ASSESSMENTS: Assessment[] = []
const NO_CLASSES: ClassEntry[] = []

/** 14 → "14", 14.25 → "14.3" — keeps ECTS and weights readable. */
const trim = (n: number): string => String(Math.round(n * 10) / 10)

const fmtGrade = (n: number | null): string => (n == null ? '—' : n.toFixed(1))

const kindLabel = (kind: ClassKind): string =>
  CLASS_KINDS.find((k) => k.value === kind)?.label ?? kind

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const list = map.get(key(item))
    if (list) list.push(item)
    else map.set(key(item), [item])
  }
  return map
}

const scheduleKey = (c: ClassEntry): string =>
  c.recurrence === 'weekly'
    ? `0-${c.weekday ?? 0}-${c.startTime ?? ''}`
    : `1-${c.startsAt ?? ''}`

const scheduleLabel = (c: ClassEntry): string => {
  if (c.recurrence === 'weekly') {
    const day = c.weekday == null ? 'Weekly' : WEEKDAY_LONG[c.weekday]
    if (!c.startTime) return day
    return `${day} · ${c.startTime}${c.endTime ? `–${c.endTime}` : ''}`
  }
  if (!c.startsAt) return 'No date set'
  return `${fmtDateTime(c.startsAt)}${c.endsAt ? `–${fmtTime(c.endsAt)}` : ''}`
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export default function Courses() {
  const { courses, assessments, classes } = useScope()
  const settings = useSettings()
  const updateCourse = useStore((s) => s.updateCourse)
  const deleteCourse = useStore((s) => s.deleteCourse)

  const [filter, setFilter] = useState<Filter>('active')
  const [formFor, setFormFor] = useState<Course | 'new' | null>(null)
  const [classesFor, setClassesFor] = useState<Course | null>(null)
  const [deleting, setDeleting] = useState<Course | null>(null)

  const scale = settings.gradeScale

  const active = useMemo(() => courses.filter((c) => !c.archived), [courses])

  const visible = useMemo(() => {
    const list =
      filter === 'all'
        ? courses
        : courses.filter((c) => (filter === 'archived' ? c.archived : !c.archived))
    return [...list].sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name))
  }, [courses, filter])

  const assessmentsByCourse = useMemo(() => groupBy(assessments, (a) => a.courseId), [assessments])
  const classesByCourse = useMemo(() => groupBy(classes, (c) => c.courseId), [classes])

  const average = useMemo(
    () => semesterAverage(active, assessments, scale),
    [active, assessments, scale],
  )

  const subtitle =
    courses.length === 0
      ? 'Add the courses you are taking — everything else hangs off them'
      : [
          `${active.length} active`,
          `${trim(totalEcts(active))} ECTS`,
          average == null
            ? 'no grades yet'
            : `average ${fmtGrade(average)} / ${trim(scale.max)}`,
        ].join(' · ')

  const archivedCount = courses.length - active.length

  const removeCourse = (course: Course) => {
    deleteCourse(course.id)
    toast.success(`${course.code} deleted`)
  }

  const toggleArchive = (course: Course) => {
    updateCourse(course.id, { archived: !course.archived })
    toast.info(course.archived ? `${course.code} restored` : `${course.code} archived`)
  }

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle={subtitle}
        action={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setFormFor('new')}
          >
            Add course
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl value={filter} onChange={setFilter} options={FILTERS} />
        <span className="text-[12px] text-faint">
          {visible.length} {visible.length === 1 ? 'course' : 'courses'}
          {filter !== 'archived' && archivedCount > 0 && ` · ${archivedCount} archived`}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title={
            courses.length === 0
              ? 'No courses yet'
              : filter === 'archived'
                ? 'Nothing archived'
                : 'No active courses'
          }
          message={
            courses.length === 0
              ? 'Create a course to start tracking assessments, weights and where your grade actually stands.'
              : filter === 'archived'
                ? 'Courses you finish can be archived — they leave the active list but keep their grades.'
                : 'Every course is archived. Restore one, or add the courses for this semester.'
          }
          action={
            filter === 'archived' ? (
              <Button onClick={() => setFilter('active')}>Show active courses</Button>
            ) : (
              <Button
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setFormFor('new')}
              >
                Add course
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              assessments={assessmentsByCourse.get(course.id) ?? NO_ASSESSMENTS}
              classes={classesByCourse.get(course.id) ?? NO_CLASSES}
              scale={scale}
              onEdit={() => setFormFor(course)}
              onClasses={() => setClassesFor(course)}
              onArchive={() => toggleArchive(course)}
              onDelete={() => setDeleting(course)}
            />
          ))}
        </div>
      )}

      {formFor && (
        <CourseFormModal
          course={formFor === 'new' ? null : formFor}
          courses={courses}
          scale={scale}
          onClose={() => setFormFor(null)}
        />
      )}

      {classesFor && <ClassesModal course={classesFor} onClose={() => setClassesFor(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removeCourse(deleting)}
        title={deleting ? `Delete ${deleting.code}?` : 'Delete course'}
        confirmLabel="Delete course"
        message={
          <>
            <strong className="text-ink">{deleting?.name}</strong> will be removed along with all of
            its assessments, classes and study blocks. Tasks linked to it are kept but lose the
            link. This cannot be undone.
          </>
        }
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// card
// ---------------------------------------------------------------------------

function CourseCard({
  course,
  assessments,
  classes,
  scale,
  onEdit,
  onClasses,
  onArchive,
  onDelete,
}: {
  course: Course
  assessments: Assessment[]
  classes: ClassEntry[]
  scale: GradeScale
  onEdit: () => void
  onClasses: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const grade = useMemo(
    () => computeCourseGrade(course, assessments, scale),
    [course, assessments, scale],
  )

  const weightSum = assessments.reduce((sum, a) => sum + a.weight, 0)
  const weightsOff = assessments.length > 0 && Math.abs(weightSum - 100) >= 0.5

  const upcoming = assessments.filter(
    (a) => a.status !== 'graded' && a.status !== 'submitted' && daysUntil(a.dueAt) >= 0,
  ).length

  const modules = classes.filter((c) => c.kind === 'module')
  const modulesDone = modules.filter((c) => c.completed).length

  const meta = [
    `${trim(course.ects)} ECTS`,
    course.instructor,
  ].filter(Boolean) as string[]

  const target = course.targetGrade
  const needs =
    target != null && grade.targetReachable && grade.neededForTarget != null
      ? grade.neededForTarget
      : null

  return (
    <div data-course={course.color} className="h-full">
      <Card className="flex h-full flex-col gap-4">
        {/* identity ------------------------------------------------------- */}
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-1 h-10 w-1 shrink-0 rounded-full"
            style={{ background: 'var(--course)' }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="truncate font-mono text-[11px] font-semibold tracking-[0.12em] uppercase"
                style={{ color: 'var(--course)' }}
              >
                {course.code}
              </span>
              {course.archived && <Badge>Archived</Badge>}
            </div>
            <h3 className="mt-0.5 truncate text-[15px] leading-tight font-semibold tracking-tight text-ink">
              {course.name}
            </h3>
            <p className="mt-1 truncate text-[12px] text-muted">{meta.join(' · ')}</p>
          </div>
        </div>

        {/* weight split --------------------------------------------------- */}
        <div>
          <StackedBar
            height={6}
            segments={[
              {
                value: grade.gradedWeight,
                color: 'var(--course)',
                label: `${trim(grade.gradedWeight)}% graded`,
              },
              {
                value: grade.pendingWeight,
                color: 'color-mix(in srgb, var(--course) 40%, transparent)',
                label: `${trim(grade.pendingWeight)}% pending`,
              },
              {
                value: grade.unassignedWeight,
                color: 'transparent',
                label: `${trim(grade.unassignedWeight)}% unassigned`,
              },
            ]}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p className="text-[12px] text-muted">
              {assessments.length === 0
                ? 'No assessments yet'
                : `${trim(grade.gradedWeight)}% graded · ${trim(grade.pendingWeight)}% pending`}
            </p>
            {weightsOff && (
              <Badge tone="warning" icon={<AlertTriangle className="h-3 w-3" />}>
                weights sum to {trim(weightSum)}%
              </Badge>
            )}
          </div>
        </div>

        {/* grade ---------------------------------------------------------- */}
        <div className="rounded-card border border-line bg-surface-2/50 px-4 py-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[30px] leading-none font-semibold tracking-tight tabular-nums"
                style={{ color: grade.projected == null ? 'var(--text-faint)' : 'var(--course)' }}
              >
                {fmtGrade(grade.projected)}
              </span>
              <span className="text-[13px] text-faint">/ {trim(scale.max)}</span>
            </div>
            <span className="text-[12px] text-muted tabular-nums">
              range {fmtGrade(grade.worst)} – {fmtGrade(grade.best)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {grade.passing == null ? (
              <Badge>No grades yet</Badge>
            ) : grade.passing ? (
              <Badge tone="success">Projected to pass</Badge>
            ) : (
              <Badge tone="danger">Below {trim(scale.passing)} pass mark</Badge>
            )}
            {grade.currentAverage != null && (
              <Badge>avg so far {fmtGrade(grade.currentAverage)}</Badge>
            )}
            {target != null && !grade.targetReachable && (
              <Badge tone="danger" icon={<Target className="h-3 w-3" />}>
                target out of reach
              </Badge>
            )}
          </div>

          {target != null && grade.targetReachable && (
            <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-muted">
              <Target className="h-3.5 w-3.5 shrink-0 text-faint" />
              {needs == null || needs <= 0 ? (
                <>Target {trim(target)} already secured</>
              ) : (
                <>
                  needs <span className="font-medium text-ink">{fmtGrade(needs)}</span> avg on
                  what&rsquo;s left for {trim(target)}
                </>
              )}
            </p>
          )}
        </div>

        {/* classes & modules ---------------------------------------------- */}
        <button
          type="button"
          onClick={onClasses}
          aria-label={`Manage classes and modules for ${course.name}`}
          className="group rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-3"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-2 text-[12px] font-medium text-muted group-hover:text-ink">
              <Layers className="h-3.5 w-3.5 shrink-0 text-faint" />
              <span className="truncate">
                {modules.length > 0
                  ? `${modulesDone} / ${modules.length} modules done`
                  : classes.length > 0
                    ? `${classes.length} ${classes.length === 1 ? 'class' : 'classes'} scheduled`
                    : 'Add classes & modules'}
              </span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />
          </span>
          {modules.length > 0 && (
            <ProgressBar
              className="mt-2"
              height={4}
              tone="course"
              value={modulesDone}
              max={modules.length}
            />
          )}
        </button>

        {/* footer --------------------------------------------------------- */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <p className="text-[12px] text-muted">
            {assessments.length} {assessments.length === 1 ? 'assessment' : 'assessments'}
            {upcoming > 0 && ` · ${upcoming} upcoming`}
          </p>
          <div className="flex items-center gap-0.5">
            {course.url && (
              <a
                href={course.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open the ${course.code} course page`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-3 hover:text-ink"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${course.code}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onArchive}
              aria-label={course.archived ? `Restore ${course.code}` : `Archive ${course.code}`}
            >
              {course.archived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label={`Delete ${course.code}`}
              className="hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// course form
// ---------------------------------------------------------------------------

interface CourseForm {
  name: string
  code: string
  color: CourseColor
  ects: string
  instructor: string
  url: string
  targetGrade: string
  notes: string
}

function CourseFormModal({
  course,
  courses,
  scale,
  onClose,
}: {
  course: Course | null
  courses: Course[]
  scale: GradeScale
  onClose: () => void
}) {
  const addCourse = useStore((s) => s.addCourse)
  const updateCourse = useStore((s) => s.updateCourse)

  const [form, setForm] = useState<CourseForm>(() => {
    if (course) {
      return {
        name: course.name,
        code: course.code,
        color: course.color,
        ects: String(course.ects),
        instructor: course.instructor ?? '',
        url: course.url ?? '',
        targetGrade: course.targetGrade == null ? '' : String(course.targetGrade),
        notes: course.notes ?? '',
      }
    }
    const used = new Set(courses.map((c) => c.color))
    return {
      name: '',
      code: '',
      color: COURSE_COLORS.find((c) => !used.has(c)) ?? COURSE_COLORS[courses.length % COURSE_COLORS.length],
      ects: '6',
      instructor: '',
      url: '',
      targetGrade: '',
      notes: '',
    }
  })
  const [errors, setErrors] = useState<Partial<Record<keyof CourseForm, string>>>({})

  const set = (patch: Partial<CourseForm>) => setForm((prev) => ({ ...prev, ...patch }))

  const save = () => {
    const next: Partial<Record<keyof CourseForm, string>> = {}
    if (!form.name.trim()) next.name = 'Name is required'
    if (!form.code.trim()) next.code = 'Code is required'

    const ects = Number(form.ects)
    if (form.ects.trim() === '' || Number.isNaN(ects) || ects < 0) next.ects = 'Enter 0 or more'

    const rawTarget = form.targetGrade.trim()
    const target = rawTarget === '' ? undefined : Number(rawTarget)
    if (target != null && (Number.isNaN(target) || target < 0 || target > scale.max))
      next.targetGrade = `Must be between 0 and ${trim(scale.max)}`

    setErrors(next)
    if (Object.keys(next).length > 0) return

    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      color: form.color,
      ects,
      instructor: form.instructor.trim() || undefined,
      url: form.url.trim() || undefined,
      targetGrade: target,
      notes: form.notes.trim() || undefined,
    }

    if (course) {
      updateCourse(course.id, payload)
      toast.success(`${payload.code} updated`)
    } else {
      addCourse(payload)
      toast.success(`${payload.code} added`)
    }
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={course ? 'Edit course' : 'New course'}
      subtitle={course ? course.name : 'Assessments, classes and study blocks attach to a course'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {course ? 'Save changes' : 'Add course'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field label="Name" required error={errors.name} htmlFor="course-name">
            <Input
              id="course-name"
              value={form.name}
              autoFocus
              placeholder="Distributed Systems"
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>
          <Field label="Code" required error={errors.code} htmlFor="course-code">
            <Input
              id="course-code"
              value={form.code}
              placeholder="CS4210"
              onChange={(e) => set({ code: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field label="ECTS" required error={errors.ects} htmlFor="course-ects">
            <Input
              id="course-ects"
              type="number"
              min={0}
              step={0.5}
              value={form.ects}
              onChange={(e) => set({ ects: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instructor" htmlFor="course-instructor">
            <Input
              id="course-instructor"
              value={form.instructor}
              placeholder="Prof. Ana Silva"
              onChange={(e) => set({ instructor: e.target.value })}
            />
          </Field>
          <Field
            label="Target grade"
            error={errors.targetGrade}
            htmlFor="course-target"
            hint={`On a 0–${trim(scale.max)} scale · optional`}
          >
            <Input
              id="course-target"
              type="number"
              min={0}
              max={scale.max}
              step={0.5}
              value={form.targetGrade}
              placeholder="16"
              onChange={(e) => set({ targetGrade: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Course page" htmlFor="course-url" hint="Moodle, Canvas or the course site">
          <Input
            id="course-url"
            type="url"
            value={form.url}
            placeholder="https://"
            onChange={(e) => set({ url: e.target.value })}
          />
        </Field>

        <Field label="Colour" hint="Used everywhere this course appears">
          <ColorSwatches value={form.color} onChange={(c) => set({ color: c })} />
        </Field>

        <Field label="Notes" htmlFor="course-notes">
          <Textarea
            id="course-notes"
            rows={3}
            value={form.notes}
            placeholder="Exam is open book · lab reports due the Friday after each session"
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  )
}

function ColorSwatches({
  value,
  onChange,
}: {
  value: CourseColor
  onChange: (color: CourseColor) => void
}) {
  return (
    <div role="group" aria-label="Course colour" className="flex flex-wrap gap-2.5 pt-0.5">
      {COURSE_COLORS.map((color) => {
        const selected = color === value
        return (
          <button
            key={color}
            type="button"
            data-course={color}
            aria-label={color}
            aria-pressed={selected}
            onClick={() => onChange(color)}
            className={cn(
              'h-7 w-7 rounded-full transition-transform duration-150',
              selected ? 'scale-110' : 'hover:scale-110',
            )}
            style={{
              background: 'var(--course)',
              boxShadow: selected
                ? '0 0 0 2px var(--surface), 0 0 0 4px var(--course)'
                : undefined,
            }}
          />
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// classes & modules
// ---------------------------------------------------------------------------

interface ClassForm {
  id?: string
  title: string
  kind: ClassKind
  recurrence: 'weekly' | 'once'
  weekday: Weekday
  startTime: string
  endTime: string
  startsAt: string
  endsAt: string
  location: string
  url: string
  completed: boolean
}

const emptyClassForm = (): ClassForm => ({
  title: '',
  kind: 'module',
  recurrence: 'once',
  weekday: 1,
  startTime: '18:00',
  endTime: '20:00',
  startsAt: '',
  endsAt: '',
  location: '',
  url: '',
  completed: false,
})

const toClassForm = (c: ClassEntry): ClassForm => ({
  id: c.id,
  title: c.title,
  kind: c.kind,
  recurrence: c.recurrence,
  weekday: c.weekday ?? 1,
  startTime: c.startTime ?? '',
  endTime: c.endTime ?? '',
  startsAt: c.startsAt ? toDateTimeInput(c.startsAt) : '',
  endsAt: c.endsAt ? toDateTimeInput(c.endsAt) : '',
  location: c.location ?? '',
  url: c.url ?? '',
  completed: c.completed,
})

function ClassesModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const allClasses = useScope().classes
  const addClass = useStore((s) => s.addClass)
  const updateClass = useStore((s) => s.updateClass)
  const deleteClass = useStore((s) => s.deleteClass)

  const [form, setForm] = useState<ClassForm | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof ClassForm, string>>>({})

  const entries = useMemo(
    () =>
      allClasses
        .filter((c) => c.courseId === course.id)
        .sort((a, b) => scheduleKey(a).localeCompare(scheduleKey(b))),
    [allClasses, course.id],
  )

  const modules = entries.filter((c) => c.kind === 'module')
  const modulesDone = modules.filter((c) => c.completed).length

  const set = (patch: Partial<ClassForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))

  const save = () => {
    if (!form) return
    const next: Partial<Record<keyof ClassForm, string>> = {}
    if (!form.title.trim()) next.title = 'Title is required'
    if (form.recurrence === 'once' && !form.startsAt) next.startsAt = 'Pick a date and time'
    if (form.recurrence === 'once' && form.startsAt && form.endsAt && form.endsAt <= form.startsAt)
      next.endsAt = 'Must be after the start'
    if (form.recurrence === 'weekly' && form.startTime && form.endTime && form.endTime <= form.startTime)
      next.endTime = 'Must be after the start'

    setErrors(next)
    if (Object.keys(next).length > 0) return

    const weekly = form.recurrence === 'weekly'
    const payload = {
      courseId: course.id,
      title: form.title.trim(),
      kind: form.kind,
      recurrence: form.recurrence,
      weekday: weekly ? form.weekday : undefined,
      startTime: weekly ? form.startTime || undefined : undefined,
      endTime: weekly ? form.endTime || undefined : undefined,
      startsAt: weekly ? undefined : fromDateTimeInput(form.startsAt),
      endsAt: !weekly && form.endsAt ? fromDateTimeInput(form.endsAt) : undefined,
      location: form.location.trim() || undefined,
      url: form.url.trim() || undefined,
      completed: form.completed,
    }

    if (form.id) {
      updateClass(form.id, payload)
      toast.success('Class updated')
    } else {
      addClass(payload)
      toast.success('Class added')
    }
    setForm(null)
    setErrors({})
  }

  const remove = (entry: ClassEntry) => {
    deleteClass(entry.id)
    toast.info(`${entry.title} deleted`)
  }

  const editing = form !== null

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Classes & modules"
      subtitle={`${course.code} · ${course.name}`}
      footer={
        editing ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setForm(null)
                setErrors({})
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {form?.id ? 'Save changes' : 'Add class'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setForm(emptyClassForm())
                setErrors({})
              }}
            >
              Add class
            </Button>
          </>
        )
      }
    >
      <div data-course={course.color} className="flex flex-col gap-4">
        {modules.length > 0 && !editing && (
          <div className="rounded-card border border-line bg-surface-2/60 px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-ink">
                {modulesDone} / {modules.length} modules done
              </span>
              <span className="text-[12px] text-muted tabular-nums">
                {Math.round((modulesDone / modules.length) * 100)}%
              </span>
            </div>
            <ProgressBar
              className="mt-2.5"
              tone="course"
              value={modulesDone}
              max={modules.length}
            />
          </div>
        )}

        {editing && form ? (
          <div className="flex flex-col gap-5">
            <Field label="Title" required error={errors.title} htmlFor="class-title">
              <Input
                id="class-title"
                autoFocus
                value={form.title}
                placeholder="Module 3 — Consensus protocols"
                onChange={(e) => set({ title: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kind" htmlFor="class-kind">
                <Select
                  id="class-kind"
                  value={form.kind}
                  onChange={(e) => set({ kind: e.target.value as ClassKind })}
                >
                  {CLASS_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Recurrence" hint="Modules usually happen once">
                <SegmentedControl
                  value={form.recurrence}
                  onChange={(v) => set({ recurrence: v })}
                  options={[
                    { value: 'once' as const, label: 'Once' },
                    { value: 'weekly' as const, label: 'Weekly' },
                  ]}
                />
              </Field>
            </div>

            {form.recurrence === 'weekly' ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Weekday" htmlFor="class-weekday">
                  <Select
                    id="class-weekday"
                    value={String(form.weekday)}
                    onChange={(e) => set({ weekday: Number(e.target.value) as Weekday })}
                  >
                    {WEEKDAY_LONG.map((label, i) => (
                      <option key={label} value={i}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Starts" htmlFor="class-start-time">
                  <Input
                    id="class-start-time"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => set({ startTime: e.target.value })}
                  />
                </Field>
                <Field label="Ends" error={errors.endTime} htmlFor="class-end-time">
                  <Input
                    id="class-end-time"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => set({ endTime: e.target.value })}
                  />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts" required error={errors.startsAt} htmlFor="class-starts-at">
                  <Input
                    id="class-starts-at"
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => set({ startsAt: e.target.value })}
                  />
                </Field>
                <Field
                  label="Ends"
                  error={errors.endsAt}
                  htmlFor="class-ends-at"
                  hint="Optional — the deadline to finish it"
                >
                  <Input
                    id="class-ends-at"
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => set({ endsAt: e.target.value })}
                  />
                </Field>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location" htmlFor="class-location">
                <Input
                  id="class-location"
                  value={form.location}
                  placeholder="Room B2 · online"
                  onChange={(e) => set({ location: e.target.value })}
                />
              </Field>
              <Field label="Link" htmlFor="class-url" hint="Recording or live session">
                <Input
                  id="class-url"
                  type="url"
                  value={form.url}
                  placeholder="https://"
                  onChange={(e) => set({ url: e.target.value })}
                />
              </Field>
            </div>

            <Checkbox
              checked={form.completed}
              onChange={(v) => set({ completed: v })}
              label="Already completed"
            />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<Layers />}
            title="No classes or modules yet"
            message="Async courses are built from modules — add them here and tick each one off as you finish it."
            action={
              <Button
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => setForm(emptyClassForm())}
              >
                Add the first one
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/50 px-3.5 py-3"
              >
                <span className="pt-0.5">
                  <Checkbox
                    checked={entry.completed}
                    onChange={(v) => updateClass(entry.id, { completed: v })}
                    label={<span className="sr-only">Mark {entry.title} as done</span>}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-sm font-medium text-ink',
                      entry.completed && 'text-muted line-through',
                    )}
                  >
                    {entry.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-muted">
                    <Badge tone={entry.kind === 'module' ? 'course' : 'neutral'}>
                      {kindLabel(entry.kind)}
                    </Badge>
                    <span>{scheduleLabel(entry)}</span>
                    {entry.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-faint" />
                        {entry.location}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${entry.title}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-3 hover:text-ink"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${entry.title}`}
                    onClick={() => {
                      setForm(toClassForm(entry))
                      setErrors({})
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${entry.title}`}
                    className="hover:text-danger"
                    onClick={() => remove(entry)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
