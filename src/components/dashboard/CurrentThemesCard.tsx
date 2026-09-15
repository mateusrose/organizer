import { useMemo } from 'react'
import { BookOpen, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Course, Theme } from '../../types'
import { cn } from '../../lib/cn'
import { daysUntil, fmtDayMonth, toDate } from '../../lib/date'
import { THEME_STATUS_LABEL, isBehind } from '../../lib/themes'
import { useStore } from '../../store/useStore'
import { Badge, Card, CardHeader, CourseDot, EmptyState, ProgressBar, SegmentedControl } from '../ui'
import { primaryLink } from './shared'

const STATUSES: { value: Theme['status']; label: string }[] = [
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'Doing' },
  { value: 'done', label: 'Done' },
]

/**
 * What you are meant to be studying right now, per course. On an asynchronous
 * course nobody chases you, so this — and the "falling behind" list under it —
 * is the single most useful thing on the dashboard.
 */
export function CurrentThemesCard({
  courses,
  themes,
  now,
}: {
  courses: Course[]
  themes: Theme[]
  now: Date
}) {
  const updateTheme = useStore((s) => s.updateTheme)

  const rows = useMemo(
    () =>
      courses.map((course) => {
        const mine = themes
          .filter((t) => t.courseId === course.id)
          .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
        const current = mine.find(
          (t) => toDate(t.startsOn) <= now && now <= endOfDayOf(t) && t.status !== 'done',
        )
        const next = mine.find((t) => toDate(t.startsOn) > now)
        return { course, current: current ?? null, next: next ?? null }
      }),
    [courses, themes, now],
  )

  const behind = useMemo(
    () =>
      themes
        .filter((t) => isBehind(t, now))
        .sort((a, b) => a.endsOn.localeCompare(b.endsOn))
        .slice(0, 5),
    [themes, now],
  )

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const anyThemes = themes.length > 0

  return (
    <Card>
      <CardHeader
        icon={<BookOpen />}
        title="Currently studying"
        subtitle={anyThemes ? 'Where each course should be today' : undefined}
      />

      {!anyThemes ? (
        <EmptyState
          icon={<BookOpen />}
          title="No syllabus yet"
          message="Add the topics each course teaches and they show up here, so you always know what you should be on."
          action={
            <Link to="/courses" className={primaryLink}>
              Add a syllabus
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map(({ course, current, next }) => (
            <li key={course.id} data-course={course.color} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex min-w-0 items-center gap-2">
                  <CourseDot />
                  <span className="shrink-0 text-[12px] font-medium tracking-wide text-muted">
                    {course.code}
                  </span>
                  <span
                    className={cn(
                      'truncate text-sm',
                      current ? 'font-medium text-ink' : 'text-faint',
                    )}
                  >
                    {current?.title ?? (next ? `Next: ${next.title}` : 'Nothing scheduled')}
                  </span>
                </div>

                {current && (
                  <SegmentedControl
                    size="sm"
                    value={current.status}
                    options={STATUSES}
                    onChange={(status) => updateTheme(current.id, { status })}
                  />
                )}
              </div>

              {current ? (
                <BandProgress theme={current} now={now} />
              ) : next ? (
                <p className="text-[12px] text-faint">starts {fmtDayMonth(next.startsOn)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {behind.length > 0 && (
        <div className="mt-4 rounded-xl border border-danger/25 bg-danger-bg p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-danger uppercase">
            <TriangleAlert className="h-3.5 w-3.5" />
            Falling behind
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {behind.map((theme) => {
              const course = courseById.get(theme.courseId)
              const over = Math.abs(daysUntil(theme.endsOn, now))
              return (
                <li
                  key={theme.id}
                  data-course={course?.color}
                  className="flex items-center justify-between gap-3 text-[13px]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <CourseDot />
                    <span className="truncate text-ink">{theme.title}</span>
                  </span>
                  <Badge tone="danger">
                    {over === 0 ? 'due today' : `${over}d late`}
                  </Badge>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Card>
  )
}

function BandProgress({ theme, now }: { theme: Theme; now: Date }) {
  const start = toDate(theme.startsOn).getTime()
  const end = endOfDayOf(theme).getTime()
  const total = Math.max(1, Math.round((end - start) / 86_400_000))
  const elapsed = Math.max(0, Math.min(total, Math.floor((now.getTime() - start) / 86_400_000) + 1))

  return (
    <div className="flex items-center gap-3">
      <ProgressBar className="flex-1" height={4} tone="course" value={elapsed} max={total} />
      <span className="shrink-0 text-[12px] text-faint">
        day {elapsed} of {total} · {THEME_STATUS_LABEL[theme.status]}
      </span>
    </div>
  )
}

/** A theme's band includes its end day, so compare against that day's midnight. */
function endOfDayOf(theme: Theme): Date {
  const d = toDate(theme.endsOn)
  d.setHours(23, 59, 59, 999)
  return d
}
