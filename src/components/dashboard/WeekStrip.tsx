import { useMemo } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Assessment, ClassEntry, Course, CourseColor, StudyBlock } from '../../types'
import {
  WEEKDAY_LABELS,
  daySpan,
  fmtTime,
  format,
  hoursBetween,
  isSameDay,
  minutesOfDay,
  startOfDay,
  toDate,
  weekdayOf,
} from '../../lib/date'
import { cn } from '../../lib/cn'
import { Card, CardHeader } from '../ui'
import { fmtHours, quietLink } from './shared'

const MAX_CHIPS = 4

type ChipKind = 'deadline' | 'class' | 'study'

interface DayChip {
  id: string
  kind: ChipKind
  time: string
  label: string
  color?: CourseColor
  /** Minutes from midnight — deadlines are forced to the top of the day. */
  sort: number
}

interface DayCell {
  date: Date
  chips: DayChip[]
  studyHours: number
}

export function WeekStrip({
  assessments,
  classes,
  studyBlocks,
  courseById,
  now,
}: {
  assessments: Assessment[]
  classes: ClassEntry[]
  studyBlocks: StudyBlock[]
  courseById: Map<string, Course>
  now: Date
}) {
  const days = useMemo<DayCell[]>(() => {
    return daySpan(startOfDay(now), 7).map((date) => {
      const chips: DayChip[] = []

      for (const a of assessments) {
        if (a.status === 'submitted' || a.status === 'graded') continue
        const due = toDate(a.dueAt)
        if (!isSameDay(due, date)) continue
        chips.push({
          id: `a-${a.id}`,
          kind: 'deadline',
          time: fmtTime(a.dueAt),
          label: a.title,
          color: courseById.get(a.courseId)?.color,
          sort: -1,
        })
      }

      for (const c of classes) {
        const weekly = c.recurrence === 'weekly' && c.weekday === weekdayOf(date)
        const onceAt =
          c.recurrence === 'once' && c.startsAt && isSameDay(toDate(c.startsAt), date)
            ? c.startsAt
            : undefined
        if (!weekly && !onceAt) continue
        const time = onceAt ? fmtTime(onceAt) : (c.startTime ?? '')
        chips.push({
          id: `c-${c.id}-${date.getTime()}`,
          kind: 'class',
          time,
          label: c.title,
          color: courseById.get(c.courseId)?.color,
          sort: time ? minutesOfDay(time) : 0,
        })
      }

      let studyHours = 0
      for (const b of studyBlocks) {
        if (b.status === 'skipped') continue
        if (!isSameDay(toDate(b.startsAt), date)) continue
        const hours = hoursBetween(b.startsAt, b.endsAt)
        studyHours += hours
        const time = fmtTime(b.startsAt)
        chips.push({
          id: `b-${b.id}`,
          kind: 'study',
          time: `${time} · ${fmtHours(hours)}`,
          label: b.title,
          color: b.courseId ? courseById.get(b.courseId)?.color : undefined,
          sort: minutesOfDay(time),
        })
      }

      chips.sort((x, y) => x.sort - y.sort)
      return { date, chips, studyHours }
    })
  }, [assessments, classes, studyBlocks, courseById, now])

  return (
    <Card>
      <CardHeader
        title="Next 7 days"
        subtitle="Deadlines, sessions and study blocks"
        icon={<CalendarDays />}
        action={
          <Link to="/calendar" className={quietLink}>
            Calendar
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-7 md:overflow-visible md:px-0">
        {days.map((day) => (
          <DayColumn key={day.date.toISOString()} day={day} today={isSameDay(day.date, now)} />
        ))}
      </div>
    </Card>
  )
}

function DayColumn({ day, today }: { day: DayCell; today: boolean }) {
  const visible = day.chips.slice(0, MAX_CHIPS)
  const hidden = day.chips.length - visible.length

  return (
    <div
      role="group"
      aria-label={`${format(day.date, 'EEEE d MMMM')}${today ? ' (today)' : ''}`}
      className="flex w-[136px] shrink-0 flex-col rounded-xl border border-line bg-surface-2/50 p-2 md:w-auto md:min-w-0"
      style={today ? { background: 'var(--accent-bg)', borderColor: 'var(--accent)' } : undefined}
    >
      <div className="mb-2 flex items-baseline justify-between gap-1 px-0.5">
        <div className="min-w-0">
          <div
            className={cn(
              'text-[10px] font-semibold tracking-wider uppercase',
              today ? 'text-accent-soft' : 'text-faint',
            )}
          >
            {WEEKDAY_LABELS[day.date.getDay()]}
          </div>
          <div className={cn('text-[17px] leading-tight font-semibold', today ? 'text-ink' : 'text-muted')}>
            {format(day.date, 'd')}
          </div>
        </div>
        {day.studyHours > 0 && (
          <span className="shrink-0 text-[10px] tabular-nums text-faint">
            {fmtHours(day.studyHours)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {visible.length === 0 && (
          <p className="px-0.5 py-1 text-[11px] text-faint">Free</p>
        )}
        {visible.map((chip) => (
          <Chip key={chip.id} chip={chip} />
        ))}
        {hidden > 0 && (
          <p className="px-0.5 pt-0.5 text-[10px] font-medium text-faint">+{hidden} more</p>
        )}
      </div>
    </div>
  )
}

function Chip({ chip }: { chip: DayChip }) {
  const tinted = chip.kind === 'study' && chip.color
  return (
    <div
      data-course={chip.color}
      className={cn(
        'min-w-0 rounded-md px-1.5 py-1',
        chip.kind === 'deadline' && 'bg-danger-bg text-danger',
        chip.kind === 'class' && 'bg-surface-3 text-muted',
        chip.kind === 'study' && !tinted && 'bg-accent-bg text-accent-soft',
      )}
      style={tinted ? { background: 'var(--course-bg)', color: 'var(--course)' } : undefined}
    >
      {chip.time && <div className="truncate text-[10px] font-medium opacity-80">{chip.time}</div>}
      <div className="truncate text-[11px] leading-4 font-medium">{chip.label}</div>
    </div>
  )
}
