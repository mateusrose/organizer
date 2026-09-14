import { useMemo } from 'react'
import { GraduationCap, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePreferences, useSettings } from '../store/useStore'
import { useScope } from '../store/scope'
import { semesterAverage } from '../lib/grades'
import { plannedHoursByAssessment } from '../lib/scheduler'
import { addDays, hoursBetween, isWithin, startOfDay, toDate, weekRange } from '../lib/date'
import { EmptyState, PageHeader } from '../components/ui'
import { GreetingStrip } from '../components/dashboard/GreetingStrip'
import { StatRow } from '../components/dashboard/StatRow'
import { UpNextCard } from '../components/dashboard/UpNextCard'
import { WeekStrip } from '../components/dashboard/WeekStrip'
import { CourseProgressCard } from '../components/dashboard/CourseProgressCard'
import { TodayTasksCard } from '../components/dashboard/TodayTasksCard'
import { greetingLabel, primaryLink } from '../components/dashboard/shared'

export default function Dashboard() {
  const now = useMemo(() => new Date(), [])
  const { courses, assessments, classes, studyBlocks, tasks } = useScope()
  const preferences = usePreferences()
  const settings = useSettings()

  const activeCourses = useMemo(() => courses.filter((c) => !c.archived), [courses])
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c] as const)), [courses])

  const deadlines = useMemo(() => {
    const until = addDays(now, 7)
    const open = assessments.filter((a) => a.status !== 'submitted' && a.status !== 'graded')
    return {
      // Bounded at both ends — without a lower bound every past-due item was
      // also counted as upcoming, double-reporting it alongside `overdue`.
      dueThisWeek: open.filter((a) => {
        const due = toDate(a.dueAt)
        return due >= startOfDay(now) && due <= until
      }).length,
      overdue: open.filter((a) => toDate(a.dueAt) < now).length,
    }
  }, [assessments, now])

  const plannedHours = useMemo(() => {
    const until = addDays(now, 7)
    return studyBlocks
      .filter((b) => b.status === 'planned' && isWithin(b.startsAt, now, until))
      .reduce((sum, b) => sum + hoursBetween(b.startsAt, b.endsAt), 0)
  }, [studyBlocks, now])

  const doneHours = useMemo(() => {
    const { start, end } = weekRange(now, settings.weekStartsOn)
    return studyBlocks
      .filter((b) => b.status === 'done' && isWithin(b.startsAt, start, end))
      .reduce((sum, b) => sum + hoursBetween(b.startsAt, b.endsAt), 0)
  }, [studyBlocks, now, settings.weekStartsOn])

  const average = useMemo(
    () => semesterAverage(activeCourses, assessments, settings.gradeScale),
    [activeCourses, assessments, settings.gradeScale],
  )

  const plannedByAssessment = useMemo(() => plannedHoursByAssessment(studyBlocks), [studyBlocks])

  // Study blocks can exist without a course, so only a genuinely empty
  // database gets the onboarding screen.
  const nothingAtAll =
    courses.length === 0 &&
    assessments.length === 0 &&
    tasks.length === 0 &&
    studyBlocks.length === 0

  if (nothingAtAll) {
    return (
      <>
        <PageHeader
          title={greetingLabel(now)}
          subtitle="Semestre keeps your deadlines, study hours and grades in one place."
        />
        <EmptyState
          className="py-16"
          icon={<GraduationCap />}
          title="Add your first course to get started"
          message="Courses anchor everything else — assessments and their weights, study blocks, and the grade projections on this page."
          action={
            <Link to="/courses" className={primaryLink}>
              <Plus className="h-4 w-4" />
              Add your first course
            </Link>
          }
        />
      </>
    )
  }

  return (
    <>
      <GreetingStrip now={now} deadlines={deadlines.dueThisWeek} plannedHours={plannedHours} />

      <div className="flex flex-col gap-4 sm:gap-5">
        <StatRow
          dueThisWeek={deadlines.dueThisWeek}
          overdue={deadlines.overdue}
          plannedHours={plannedHours}
          doneHours={doneHours}
          weeklyGoal={preferences.weeklyHoursGoal}
          average={average}
          scale={settings.gradeScale}
        />

        <UpNextCard
          assessments={assessments}
          courseById={courseById}
          plannedByAssessment={plannedByAssessment}
          now={now}
        />

        <WeekStrip
          assessments={assessments}
          classes={classes}
          studyBlocks={studyBlocks}
          courseById={courseById}
          now={now}
        />

        <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
          <CourseProgressCard
            courses={activeCourses}
            assessments={assessments}
            scale={settings.gradeScale}
          />
          <TodayTasksCard tasks={tasks} courseById={courseById} now={now} />
        </div>
      </div>
    </>
  )
}
