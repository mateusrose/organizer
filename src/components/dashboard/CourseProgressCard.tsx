import { useMemo } from 'react'
import { ArrowRight, GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Assessment, Course, GradeScale } from '../../types'
import { computeCourseGrade } from '../../lib/grades'
import type { CourseGrade } from '../../lib/grades'
import { cn } from '../../lib/cn'
import { Card, CardHeader, CourseDot, EmptyState, StackedBar } from '../ui'
import { fmtGrade, primaryLink, quietLink } from './shared'

export function CourseProgressCard({
  courses,
  assessments,
  scale,
}: {
  courses: Course[]
  assessments: Assessment[]
  scale: GradeScale
}) {
  const rows = useMemo(
    () =>
      courses.map((course) => ({
        course,
        grade: computeCourseGrade(
          course,
          assessments.filter((a) => a.courseId === course.id),
          scale,
        ),
      })),
    [courses, assessments, scale],
  )

  return (
    <Card>
      <CardHeader
        title="Course progress"
        subtitle="Where every grade currently stands"
        icon={<GraduationCap />}
        action={
          rows.length > 0 && (
            <Link to="/courses" className={quietLink}>
              Courses
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title="No active courses"
          message="Add the courses you are enrolled in to track weights and projected grades."
          action={
            <Link to="/courses" className={primaryLink}>
              Add a course
            </Link>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {rows.map(({ course, grade }) => (
              <li key={course.id} data-course={course.color}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2 pt-0.5">
                    <CourseDot />
                    <span className="shrink-0 text-[13px] font-semibold text-ink">
                      {course.code}
                    </span>
                    <span className="truncate text-[13px] text-muted">{course.name}</span>
                  </div>
                  <div
                    className="shrink-0 text-right"
                    title={`Best case ${fmtGrade(grade.best, scale.max)} · Worst case ${fmtGrade(grade.worst, scale.max)}`}
                  >
                    <div
                      className={cn(
                        'text-sm leading-tight font-semibold tabular-nums',
                        grade.passing === true && 'text-success',
                        grade.passing === false && 'text-danger',
                        grade.passing == null && 'text-muted',
                      )}
                    >
                      {fmtGrade(grade.projected, scale.max)}
                    </div>
                    <div className="text-[10px] tracking-wider text-faint uppercase">projected</div>
                  </div>
                </div>

                <StackedBar
                  className="mt-2.5"
                  height={7}
                  segments={[
                    {
                      value: grade.gradedWeight,
                      color: 'var(--success)',
                      label: `${Math.round(grade.gradedWeight)}% graded`,
                    },
                    {
                      value: grade.pendingWeight,
                      color: 'var(--warning)',
                      label: `${Math.round(grade.pendingWeight)}% pending`,
                    },
                    {
                      value: grade.unassignedWeight,
                      color: 'var(--surface-3)',
                      label: `${Math.round(grade.unassignedWeight)}% unassigned`,
                    },
                  ]}
                />

                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-faint">
                    {Math.round(grade.gradedWeight)}% graded · {Math.round(grade.pendingWeight)}%
                    pending
                  </span>
                  <TargetNote course={course} grade={grade} scale={scale} />
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[11px] text-faint">
            <LegendDot color="var(--success)" label="Graded" />
            <LegendDot color="var(--warning)" label="Pending" />
            <LegendDot color="var(--surface-3)" label="Not assigned" />
          </div>
        </>
      )}
    </Card>
  )
}

function TargetNote({
  course,
  grade,
  scale,
}: {
  course: Course
  grade: CourseGrade
  scale: GradeScale
}) {
  const target = course.targetGrade
  if (target == null) return null

  if (!grade.targetReachable) {
    return (
      <span className="text-danger">
        {target} out of reach — best case {fmtGrade(grade.best, scale.max)}
      </span>
    )
  }
  if (grade.neededForTarget == null || grade.neededForTarget <= 0) {
    return <span className="text-success">Target of {target} already secured</span>
  }
  return (
    <span className="text-muted">
      needs {grade.neededForTarget.toFixed(1)} to hit {target}
    </span>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}
