import { Moon, Sparkles, Sun, Sunrise } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { format } from '../../lib/date'
import { Button } from '../ui'
import { fmtHours, greetingLabel, plural } from './shared'

export function GreetingStrip({
  now,
  deadlines,
  plannedHours,
}: {
  now: Date
  deadlines: number
  plannedHours: number
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
      </div>
      <Button icon={<Sparkles className="h-4 w-4" />} onClick={() => navigate('/planner')}>
        Plan my week
      </Button>
    </div>
  )
}
