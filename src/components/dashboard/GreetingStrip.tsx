import { Moon, Sparkles, Sun, Sunrise } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Semester } from '../../types'
import { format, toDate } from '../../lib/date'
import { Button, ProgressBar } from '../ui'
import { fmtHours, greetingLabel, plural } from './shared'

export function GreetingStrip({
  now,
  deadlines,
  plannedHours,
  semester,
}: {
  now: Date
  deadlines: number
  plannedHours: number
  semester: Semester | null
}) {
  const navigate = useNavigate()
  const hour = now.getHours()
  const greeting = greetingLabel(now)
  const Icon = hour < 12 ? Sunrise : hour < 18 ? Sun : Moon

  const summary = [
    deadlines > 0
      ? `${deadlines} ${plural(deadlines, 'deadline')} this week`
      : 'No deadlines this week',
    plannedHours > 0 ? `${fmtHours(plannedHours)} of study planned` : 'nothing planned yet',
  ].join(' · ')

  const term = semesterProgress(semester, now)

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-bg text-accent-soft">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{greeting}</h1>
        </div>
        <p className="mt-2 text-sm text-muted">
          {format(now, 'EEEE, d MMMM')}
          <span className="px-1.5 text-faint">·</span>
          {summary}
        </p>

        {term && (
          <div className="mt-3 flex max-w-sm items-center gap-3">
            <ProgressBar className="flex-1" height={4} value={term.pct} />
            <span className="shrink-0 text-[12px] text-faint">
              Week {term.week} of {term.weeks} · {Math.round(term.pct)}%
            </span>
          </div>
        )}
      </div>
      <Button icon={<Sparkles className="h-4 w-4" />} onClick={() => navigate('/planner')}>
        Plan my week
      </Button>
    </div>
  )
}

/** How far through the teaching period we are. Null outside a semester. */
function semesterProgress(semester: Semester | null, now: Date) {
  if (!semester) return null
  const start = toDate(semester.startsOn).getTime()
  const end = toDate(semester.endsOn).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null

  const WEEK = 7 * 86_400_000
  const weeks = Math.max(1, Math.round((end - start) / WEEK))
  const elapsed = now.getTime() - start
  const pct = Math.max(0, Math.min(100, (elapsed / (end - start)) * 100))
  const week = Math.max(1, Math.min(weeks, Math.floor(elapsed / WEEK) + 1))
  return { weeks, week, pct }
}
