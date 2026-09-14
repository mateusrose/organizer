import { CalendarClock, GraduationCap, Target, Timer } from 'lucide-react'
import type { GradeScale } from '../../types'
import { Card, ProgressBar, Stat } from '../ui'
import { fmtHours, plural } from './shared'

export function StatRow({
  dueThisWeek,
  overdue,
  plannedHours,
  doneHours,
  weeklyGoal,
  average,
  scale,
}: {
  dueThisWeek: number
  overdue: number
  plannedHours: number
  doneHours: number
  weeklyGoal: number
  average: number | null
  scale: GradeScale
}) {
  const goalPct = weeklyGoal > 0 ? Math.round((doneHours / weeklyGoal) * 100) : 0
  const goalReached = weeklyGoal > 0 && doneHours >= weeklyGoal

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Card padded={false} className="p-4 sm:p-5">
        <Stat
          label="Due this week"
          icon={<CalendarClock />}
          value={dueThisWeek}
          tone={dueThisWeek > 0 ? 'danger' : 'success'}
          sub={
            overdue > 0
              ? `${overdue} already overdue`
              : dueThisWeek > 0
                ? `${plural(dueThisWeek, 'deadline')} in the next 7 days`
                : 'Nothing on fire'
          }
        />
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        <Stat
          label="Study planned"
          icon={<Timer />}
          value={fmtHours(plannedHours)}
          tone={plannedHours > 0 ? 'accent' : 'neutral'}
          sub={plannedHours > 0 ? 'across the next 7 days' : 'No blocks scheduled yet'}
        />
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        <Stat
          label="Weekly goal"
          icon={<Target />}
          value={fmtHours(doneHours)}
          tone={goalReached ? 'success' : 'neutral'}
          sub={
            <div>
              <ProgressBar
                value={doneHours}
                max={weeklyGoal || 1}
                tone={goalReached ? 'success' : 'accent'}
                height={4}
              />
              <div className="mt-1.5">
                {goalPct}% of {fmtHours(weeklyGoal)}
              </div>
            </div>
          }
        />
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        <Stat
          label="Semester avg"
          icon={<GraduationCap />}
          value={
            average == null ? (
              '—'
            ) : (
              <span>
                {average.toFixed(1)}
                <span className="text-base font-medium text-faint"> / {scale.max}</span>
              </span>
            )
          }
          tone={average == null ? 'neutral' : average >= scale.passing ? 'success' : 'danger'}
          sub={average == null ? 'No grades yet' : 'ECTS-weighted across courses'}
        />
      </Card>
    </div>
  )
}
