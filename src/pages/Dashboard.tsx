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
import { CurrentThemesCard } from '../components/dashboard/CurrentThemesCard'
import { FilterBar } from '../components/FilterBar'
import { useFilters, type FilterKind } from '../store/useFilters'

export default function Dashboard() {
  const now = useMemo(() => new Date(), [])
  const { courses, assessments, classes, studyBlocks, tasks, themes, semester } = useScope()
  const preferences = usePreferences()
  const settings = useSettings()

  const activeCourses = useMemo(() => courses.filter((c) => !c.archived), [courses])
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c] as const)), [courses])

  // Subscribe to the raw filter fields, not the predicates — calling
  // useFilters.getState() in render would not re-render when they change.
  const courseIds = useFilters((s) => s.courseIds)
  const hiddenKinds = useFilters((s) => s.hiddenKinds)
  const filtering = courseIds !== null || hiddenKinds.length > 0
  const showCourse = (id?: string) => courseIds === null || !id || courseIds.includes(id)
  const showKind = (kind: FilterKind) => !hiddenKinds.includes(kind)

  // The stat row and course progress stay unfiltered — they are the semester
  // overview. Everything below them respects the filter bar.
  const shownAssessments = useMemo(
    () => (showKind('assessments') ? assessments.filter((a) => showCourse(a.courseId)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assessments, courseIds, hiddenKinds],
  )
  const shownThemes = useMemo(
    () => (showKind('themes') ? themes.filter((t) => showCourse(t.courseId)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [themes, courseIds, hiddenKinds],
  )
  const shownStudyBlocks = useMemo(
    () => (showKind('study') ? studyBlocks.filter((b) => showCourse(b.courseId)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [studyBlocks, courseIds, hiddenKinds],
  )
  const shownTasks = useMemo(
    () => (showKind('tasks') ? tasks.filter((t) => showCourse(t.courseId)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, courseIds, hiddenKinds],
  )
  const shownCourses = useMemo(
    () => activeCourses.filter((c) => showCourse(c.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCourses, courseIds],
  )

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
      <GreetingStrip
        now={now}
        deadlines={deadlines.dueThisWeek}
        plannedHours={plannedHours}
        semester={semester}
      />

      <div className="flex flex-col gap-4 sm:gap-5">
        {activeCourses.length > 1 && (
          <FilterBar
            courses={activeCourses}
            kinds={['assessments', 'themes', 'study', 'tasks']}
          />
        )}

        <StatRow
          dueThisWeek={deadlines.dueThisWeek}
          overdue={deadlines.overdue}
          plannedHours={plannedHours}
          doneHours={doneHours}
          weeklyGoal={preferences.weeklyHoursGoal}
          average={average}
          scale={settings.gradeScale}
        />

        <CurrentThemesCard courses={shownCourses} themes={shownThemes} now={now} />

        <UpNextCard
          assessments={shownAssessments}
          courseById={courseById}
          plannedByAssessment={plannedByAssessment}
          now={now}
        />

        <WeekStrip
          assessments={shownAssessments}
          classes={showKind('classes') ? classes.filter((c) => showCourse(c.courseId)) : []}
          studyBlocks={shownStudyBlocks}
          courseById={courseById}
          now={now}
        />

        <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
          <CourseProgressCard
            courses={activeCourses}
            assessments={assessments}
            scale={settings.gradeScale}
            allCoursesNote={filtering}
          />
          <TodayTasksCard tasks={shownTasks} courseById={courseById} now={now} />
        </div>
      </div>
    </>
  )
}
