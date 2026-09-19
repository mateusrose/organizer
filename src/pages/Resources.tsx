import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ExternalLink, GraduationCap, Library, NotebookPen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RESOURCE_KIND_LABEL } from '../types'
import type { Assessment, Course, LearningResource, Theme } from '../types'
import { cn } from '../lib/cn'
import { fmtDayMonth } from '../lib/date'
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
  Input,
  PageHeader,
  ProgressBar,
  Stat,
} from '../components/ui'

/** What a theme wants out of a resource, plus the deadline it feeds. */
interface Association {
  theme: Theme
  detail?: string
  assessment?: Assessment
}

/** Sensible units so the common case needs no typing. */
const DEFAULT_UNIT: Record<LearningResource['kind'], string> = {
  reading: 'pages',
  video: 'videos',
  slides: 'slides',
  exercise: 'exercises',
  link: 'items',
}

const isDone = (r: LearningResource): boolean => {
  const p = r.progress
  return p !== undefined && p.total !== undefined && p.total > 0 && p.current >= p.total
}

const isStarted = (r: LearningResource): boolean => (r.progress?.current ?? 0) > 0

/**
 * Everything this course asks you to read or watch, in one place you can
 * actually open — the point of the page. Progress is edited in place: there is
 * no form to open and nothing to save.
 */
export default function Resources() {
  const { activeCourses, themes, assessments, semester } = useScope()
  const courseIds = useFilters((s) => s.courseIds)

  const courses = useMemo(
    () => activeCourses.filter((c) => courseIds === null || courseIds.includes(c.id)),
    [activeCourses, courseIds],
  )

  /** resourceId → the themes using it, with the assessment each one feeds. */
  const associations = useMemo(() => {
    const byId = new Map<string, Association[]>()
    const assessmentById = new Map(assessments.map((a) => [a.id, a]))
    for (const theme of themes) {
      for (const ref of theme.resourceRefs) {
        const entry: Association = {
          theme,
          detail: ref.detail,
          // The link can dangle when another device deleted the assessment.
          assessment: theme.assessmentId ? assessmentById.get(theme.assessmentId) : undefined,
        }
        byId.set(ref.resourceId, [...(byId.get(ref.resourceId) ?? []), entry])
      }
    }
    for (const list of byId.values()) list.sort((a, b) => a.theme.order - b.theme.order)
    return byId
  }, [themes, assessments])

  const totals = useMemo(() => {
    const all = courses.flatMap((c) => c.resources)
    return {
      total: all.length,
      started: all.filter((r) => isStarted(r) && !isDone(r)).length,
      done: all.filter(isDone).length,
    }
  }, [courses])

  const header = (
    <PageHeader
      title="Resources"
      subtitle={
        semester
          ? `${totals.total} ${totals.total === 1 ? 'resource' : 'resources'} across ${
              courses.length
            } ${courses.length === 1 ? 'course' : 'courses'} · ${semester.name}`
          : 'No active semester'
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
          message="Pick or create one from the switcher at the top of the sidebar."
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
          message="Resources belong to a course, so add a course first."
          action={
            <Link
              to="/courses"
              className="inline-flex h-9.5 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-contrast transition-[filter] hover:brightness-110"
            >
              Add a course
            </Link>
          }
        />
      </>
    )
  }

  const withResources = courses.filter((c) => c.resources.length > 0)

  return (
    <>
      {header}

      {activeCourses.length > 1 && (
        <FilterBar courses={activeCourses} kinds={[]} className="mb-4" />
      )}

      <div className="mb-5 grid grid-cols-3 gap-4">
        <Stat label="Resources" value={totals.total} />
        <Stat label="In progress" value={totals.started} tone="accent" />
        <Stat label="Finished" value={totals.done} tone="success" />
      </div>

      {withResources.length === 0 ? (
        <EmptyState
          icon={<Library />}
          title="No resources yet"
          message="Open a course and list what it asks you to read or watch. Themes then pick from that list, and you track your way through it here."
          action={
            <Link
              to="/courses"
              className="inline-flex h-9.5 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-contrast transition-[filter] hover:brightness-110"
            >
              Go to courses
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {withResources.map((course) => (
            <CourseResources key={course.id} course={course} associations={associations} />
          ))}
        </div>
      )}
    </>
  )
}

function CourseResources({
  course,
  associations,
}: {
  course: Course
  associations: Map<string, Association[]>
}) {
  return (
    <Card data-course={course.color} padded={false}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <CourseDot />
        <span className="text-sm font-semibold text-ink">{course.code}</span>
        <span className="truncate text-[13px] text-muted">{course.name}</span>
        <span className="ml-auto shrink-0 text-[12px] text-faint">
          {course.resources.length}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {course.resources.map((resource) => (
          <ResourceRow
            key={resource.id}
            courseId={course.id}
            resource={resource}
            associations={associations.get(resource.id) ?? []}
          />
        ))}
      </ul>
    </Card>
  )
}

function ResourceRow({
  courseId,
  resource,
  associations,
}: {
  courseId: string
  resource: LearningResource
  associations: Association[]
}) {
  const update = useStore((s) => s.updateCourseResource)
  const done = isDone(resource)

  const unit = resource.progress?.unit || DEFAULT_UNIT[resource.kind]
  const total = resource.progress?.total
  // A total of zero would render a bar stuck at 0% rather than saying nothing.
  const showBar = total !== undefined && total > 0
  const current = resource.progress?.current ?? 0
  const pct = showBar ? Math.min(100, (current / total) * 100) : 0

  const patchProgress = (patch: { current?: number; total?: number }) =>
    update(courseId, resource.id, {
      progress: {
        current: patch.current ?? current,
        total: 'total' in patch ? patch.total : total,
        unit,
      },
    })

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3">
      {/* identity ------------------------------------------------------- */}
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[13px] font-medium text-ink',
            done && 'line-through opacity-60',
          )}
        >
          {resource.title}
        </span>
        <Badge tone={done ? 'success' : 'neutral'}>{RESOURCE_KIND_LABEL[resource.kind]}</Badge>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Open ${resource.title}`}
          title={resource.url ? 'Open in a new tab' : 'No link on this resource'}
          disabled={!resource.url}
          icon={<ExternalLink className="h-4 w-4" />}
          onClick={() => resource.url && window.open(resource.url, '_blank', 'noopener,noreferrer')}
        />
      </div>

      {/* progress ------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="w-14 shrink-0">
            <NumberCell
              value={current}
              label={`${resource.title} progress`}
              onCommit={(n) => patchProgress({ current: n })}
            />
          </div>
          <span className="text-[12px] text-faint">of</span>
          <div className="w-14 shrink-0">
            <NumberCell
              value={total}
              label={`${resource.title} total`}
              placeholder="?"
              onCommit={(n) => patchProgress({ total: n })}
            />
          </div>
          <div className="w-24 shrink-0">
            <Input
              value={unit}
              aria-label={`${resource.title} unit`}
              className="h-8 text-[12px]"
              onChange={(e) =>
                update(courseId, resource.id, {
                  progress: { current, total, unit: e.target.value },
                })
              }
            />
          </div>
        </div>
        {showBar && (
          <div className="flex min-w-[8rem] flex-1 items-center gap-2">
            <ProgressBar className="flex-1" value={current} max={total} tone="course" />
            <span className="shrink-0 text-[12px] tabular-nums text-faint">{Math.round(pct)}%</span>
          </div>
        )}
      </div>

      <Input
        value={resource.progressNote ?? ''}
        aria-label={`${resource.title} note`}
        placeholder="Anything the numbers miss — skipped a chapter, worth a second pass"
        className="h-8 text-[12px]"
        onChange={(e) => update(courseId, resource.id, { progressNote: e.target.value })}
      />

      {/* notes ---------------------------------------------------------- */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <NotebookPen className="h-3.5 w-3.5 shrink-0 text-faint" />
          <Input
            type="url"
            value={resource.notesUrl ?? ''}
            aria-label={`${resource.title} notes link`}
            placeholder="https:// your notes"
            className="h-8 min-w-0 flex-1 text-[12px]"
            onChange={(e) => update(courseId, resource.id, { notesUrl: e.target.value })}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Open notes for ${resource.title}`}
            disabled={!resource.notesUrl}
            icon={<ExternalLink className="h-4 w-4" />}
            onClick={() =>
              resource.notesUrl &&
              window.open(resource.notesUrl, '_blank', 'noopener,noreferrer')
            }
          />
        </div>
        <div className="min-w-0 sm:w-56 sm:shrink-0">
          <Input
            value={resource.notesLocation ?? ''}
            aria-label={`${resource.title} notes location`}
            placeholder="or where — Notebook 2, p.14"
            className="h-8 text-[12px]"
            onChange={(e) => update(courseId, resource.id, { notesLocation: e.target.value })}
          />
        </div>
      </div>

      {/* what uses it --------------------------------------------------- */}
      {associations.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-line pt-2">
          {associations.map(({ theme, detail, assessment }) => (
            <li key={theme.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <BookOpen className="h-3 w-3 shrink-0 text-faint" />
              <Link to="/syllabus" className="text-[12px] text-ink hover:text-accent-soft">
                {theme.title}
              </Link>
              {detail && <span className="text-[12px] text-muted">· {detail}</span>}
              <span className="text-[11px] text-faint">
                {fmtDayMonth(theme.startsOn)} – {fmtDayMonth(theme.endsOn)}
              </span>
              {assessment && (
                <Link to="/assessments" className="ml-auto shrink-0">
                  <Badge tone="accent">
                    {assessment.title} · {fmtDayMonth(assessment.dueAt)}
                  </Badge>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * A number you can type over. Held locally while editing and committed on blur,
 * so a reading session is one write per field rather than one per keystroke —
 * every commit bumps the sync revision.
 */
function NumberCell({
  value,
  label,
  placeholder,
  onCommit,
}: {
  value?: number
  label: string
  placeholder?: string
  onCommit: (next: number | undefined) => void
}) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value))
  const editing = useRef(false)

  // Adopt changes from elsewhere (a sync pull) unless the field is being typed in.
  useEffect(() => {
    if (!editing.current) setDraft(value === undefined ? '' : String(value))
  }, [value])

  const commit = () => {
    editing.current = false
    const trimmed = draft.trim()
    if (trimmed === '') {
      onCommit(undefined)
      return
    }
    const n = Number(trimmed)
    // Number('abc') is NaN and would poison the stored value.
    if (!Number.isFinite(n) || n < 0) {
      setDraft(value === undefined ? '' : String(value))
      return
    }
    onCommit(n)
  }

  return (
    <Input
      type="number"
      min={0}
      inputMode="numeric"
      aria-label={label}
      placeholder={placeholder}
      className="h-8 text-[12px] tabular-nums"
      value={draft}
      onFocus={() => {
        editing.current = true
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
