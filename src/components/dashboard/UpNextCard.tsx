import { useMemo } from 'react'
import { ArrowRight, CircleCheck, Flame } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { Assessment, Course } from '../../types'
import { assessmentUrgency, sortByUrgency } from '../../lib/urgency'
import type { Urgency } from '../../lib/urgency'
import { fmtDateTime } from '../../lib/date'
import { cn } from '../../lib/cn'
import { Badge, Card, CardHeader, CourseDot, EmptyState, ProgressBar } from '../ui'
import { fmtHours, primaryLink, quietLink } from './shared'

const MAX_ROWS = 5

export function UpNextCard({
  assessments,
  courseById,
  plannedByAssessment,
  now,
}: {
  assessments: Assessment[]
  courseById: Map<string, Course>
  plannedByAssessment: Record<string, number>
  now: Date
}) {
  const rows = useMemo(() => {
    const open = assessments.filter((a) => a.status !== 'submitted' && a.status !== 'graded')
    return sortByUrgency(open, (a) => assessmentUrgency(a, now))
      .slice(0, MAX_ROWS)
      .map((a) => ({
        assessment: a,
        urgency: assessmentUrgency(a, now),
        course: courseById.get(a.courseId),
        planned: plannedByAssessment[a.id] ?? 0,
      }))
  }, [assessments, courseById, plannedByAssessment, now])

  return (
    <Card>
      <CardHeader
        title="Up next"
        subtitle="What deserves your hours today"
        icon={<Flame />}
        action={
          rows.length > 0 && (
            <Link to="/assessments" className={quietLink}>
              All work
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<CircleCheck />}
          title="Nothing pending"
          message="Every assessment is submitted or graded. Add the next one when it lands."
          action={
            <Link to="/assessments" className={primaryLink}>
              Add an assessment
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <UpNextRow key={row.assessment.id} {...row} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function UpNextRow({
  assessment,
  urgency,
  course,
  planned,
}: {
  assessment: Assessment
  urgency: Urgency
  course?: Course
  planned: number
}) {
  const navigate = useNavigate()
  const estimated = assessment.estimatedHours
  const missing = Math.max(0, estimated - planned)
  const overdue = urgency.level === 'overdue'

  return (
    <li data-course={course?.color}>
      <button
        type="button"
        onClick={() => navigate('/assessments')}
        className={cn(
          'w-full rounded-xl px-3 py-3 text-left transition-colors duration-150',
          overdue ? 'bg-danger-bg hover:brightness-125' : 'hover:bg-surface-3',
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {course && (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-muted">
              <CourseDot />
              <span className="truncate">{course.code}</span>
            </span>
          )}
          <Badge tone="neutral" className="capitalize">
            {assessment.kind}
          </Badge>
          <Badge tone={course ? 'course' : 'accent'}>{assessment.points} pts of grade</Badge>
          <Badge tone={urgency.tone} className="ml-auto">
            {urgency.label}
          </Badge>
        </div>

        <p className="mt-2 truncate text-sm font-medium text-ink">{assessment.title}</p>

        <div className="mt-2.5 flex items-center gap-3">
          <ProgressBar
            tone="course"
            value={planned}
            max={Math.max(estimated, planned, 1)}
            height={4}
            className="min-w-0 flex-1"
          />
          <span className="shrink-0 text-[11px] tabular-nums text-faint">
            {fmtHours(planned)} / {fmtHours(estimated)}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px]">
          <span className="text-faint">Due {fmtDateTime(assessment.dueAt)}</span>
          {missing > 0.05 && (
            <>
              <span className="text-faint">·</span>
              <span className="text-warning">{fmtHours(missing)} still unplanned</span>
            </>
          )}
        </div>
      </button>
    </li>
  )
}
