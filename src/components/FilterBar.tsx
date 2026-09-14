import { Filter, X } from 'lucide-react'
import type { Course } from '../types'
import { cn } from '../lib/cn'
import { CourseDot } from './ui/Badge'
import { Button } from './ui/Button'
import { FILTER_KINDS, useFilters, type FilterKind } from '../store/useFilters'

/**
 * Shared show/hide control for the Dashboard and Calendar. Clicking a course
 * solos it; clicking it again goes back to everything. Shift-click (or the
 * checkbox behaviour of an already-narrowed list) adds and removes individually.
 */
export function FilterBar({
  courses,
  kinds = FILTER_KINDS.map((k) => k.key),
  className,
}: {
  courses: Course[]
  /** Which kind toggles make sense on this page. */
  kinds?: FilterKind[]
  className?: string
}) {
  const courseIds = useFilters((s) => s.courseIds)
  const hiddenKinds = useFilters((s) => s.hiddenKinds)
  const onlyCourse = useFilters((s) => s.onlyCourse)
  const toggleCourse = useFilters((s) => s.toggleCourse)
  const showAllCourses = useFilters((s) => s.showAllCourses)
  const toggleKind = useFilters((s) => s.toggleKind)
  const reset = useFilters((s) => s.reset)

  const allCourses = courseIds === null
  const isOn = (id: string) => allCourses || courseIds.includes(id)
  const filtering = !allCourses || hiddenKinds.length > 0
  const shown = kinds.map((k) => FILTER_KINDS.find((f) => f.key === k)!).filter(Boolean)

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-2 rounded-card border border-line bg-surface/60 px-3 py-2.5 backdrop-blur-xl',
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-faint uppercase">
        <Filter className="h-3.5 w-3.5" />
        Show
      </span>

      <button
        type="button"
        onClick={showAllCourses}
        aria-pressed={allCourses}
        className={cn(
          'rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
          allCourses
            ? 'border-accent/30 bg-accent-bg text-accent-soft'
            : 'border-line text-muted hover:border-line-strong hover:text-ink',
        )}
      >
        All courses
      </button>

      {courses.map((course) => (
        <button
          key={course.id}
          type="button"
          data-course={course.color}
          aria-pressed={isOn(course.id)}
          title={`${course.name} — click to solo, shift-click to add`}
          onClick={(e) => (e.shiftKey && !allCourses ? toggleCourse(course.id) : onlyCourse(course.id))}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
            isOn(course.id)
              ? 'border-transparent'
              : 'border-line text-faint opacity-60 hover:opacity-100',
          )}
          style={
            isOn(course.id)
              ? { background: 'var(--course-bg)', color: 'var(--course)' }
              : undefined
          }
        >
          <CourseDot className={cn(!isOn(course.id) && 'opacity-40')} />
          {course.code}
        </button>
      ))}

      {shown.length > 0 && <span className="mx-1 hidden h-4 w-px bg-line sm:block" />}

      {shown.map((k) => {
        const on = !hiddenKinds.includes(k.key)
        return (
          <button
            key={k.key}
            type="button"
            aria-pressed={on}
            onClick={() => toggleKind(k.key)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
              on
                ? 'border-line-strong bg-surface-3 text-ink'
                : 'border-line text-faint line-through hover:text-muted',
            )}
          >
            {k.label}
          </button>
        )
      })}

      {filtering && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          icon={<X className="h-3.5 w-3.5" />}
          onClick={reset}
        >
          Clear
        </Button>
      )}
    </div>
  )
}
