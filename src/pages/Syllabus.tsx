import { useMemo, useState } from 'react'
import { BookOpen, GraduationCap, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Assessment, Course, Theme } from '../types'
import { cn } from '../lib/cn'
import { fmtDate, fmtDayMonth, startOfDay, toDate } from '../lib/date'
import { THEME_STATUS_LABEL, isBehind, themeProgress } from '../lib/themes'
import { useScope } from '../store/scope'
import { useStore } from '../store/useStore'
import { useFilters } from '../store/useFilters'
import { FilterBar } from '../components/FilterBar'
import {
  Badge,
  Button,
  Card,
  CourseDot,
  EmptyState,
  Modal,
  PageHeader,
  SegmentedControl,
  Stat,
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
  const [open, setOpen] = useState<Theme | null>(null)

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
        <SegmentedControl
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'timeline', label: 'Timeline' },
            { value: 'list', label: 'List' },
          ]}
        />
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
          message="Open a course and use its Syllabus button to paste the topic list, then spread it across the term."
          action={
            <Link
              to="/courses"
              className="inline-flex h-9.5 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-contrast transition-[filter] hover:brightness-110"
            >
              Add a syllabus
            </Link>
          }
        />
      ) : view === 'timeline' ? (
        <Timeline
          courses={courses}
          byCourse={byCourse}
          from={toDate(semester.startsOn)}
          to={toDate(semester.endsOn)}
          now={now}
          onPick={setOpen}
        />
      ) : (
        <ThemeList courses={courses} byCourse={byCourse} now={now} onPick={setOpen} />
      )}

      {open && (
        <ThemeDetail
          theme={open}
          course={courses.find((c) => c.id === open.courseId)}
          assessments={assessments}
          onClose={() => setOpen(null)}
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

  const x = (ms: number) => ((ms - start) / DAY) * MIN_PX_PER_DAY

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
  }, [start, end])

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

function ThemeDetail({
  theme,
  course,
  assessments,
  onClose,
}: {
  theme: Theme
  course?: Course
  assessments: Assessment[]
  onClose: () => void
}) {
  const updateTheme = useStore((s) => s.updateTheme)

  // Assessments of this course that fall inside the band — "this unit is
  // assessed by X" is the connection worth surfacing here.
  const assessed = useMemo(() => {
    const from = startOfDay(toDate(theme.startsOn)).getTime()
    const to = startOfDay(toDate(theme.endsOn)).getTime() + DAY
    return assessments.filter((a) => {
      if (a.courseId !== theme.courseId) return false
      const due = toDate(a.dueAt).getTime()
      return due >= from && due < to
    })
  }, [assessments, theme])

  return (
    <Modal
      open
      onClose={onClose}
      title={theme.title}
      subtitle={course ? `${course.code} · ${course.name}` : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div data-course={course?.color} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">
            {fmtDate(theme.startsOn)} – {fmtDate(theme.endsOn)}
          </p>
          <SegmentedControl
            size="sm"
            value={theme.status}
            options={STATUSES}
            onChange={(status) => updateTheme(theme.id, { status })}
          />
        </div>

        {isBehind(theme) && (
          <p className="rounded-xl border border-danger/25 bg-danger-bg px-3 py-2 text-[13px] text-danger">
            This theme&rsquo;s window has passed and it is not marked done.
          </p>
        )}

        {theme.description && (
          <p className="text-[13px] leading-relaxed text-muted">{theme.description}</p>
        )}

        {theme.url && (
          <a
            href={theme.url}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-accent-soft underline underline-offset-2"
          >
            Open course material
          </a>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-wider text-faint uppercase">
            Assessed in this window
          </p>
          {assessed.length === 0 ? (
            <p className="text-[13px] text-faint">Nothing is due while this theme runs.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {assessed.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="truncate text-ink">{a.title}</span>
                  <span className="shrink-0 text-faint">{fmtDayMonth(a.dueAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
