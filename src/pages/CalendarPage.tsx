import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Flag,
  MapPin,
  RefreshCw,
  Timer,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { addMinutes, addMonths, isSameMonth, startOfMonth } from 'date-fns'
import type { CalendarEvent, CourseColor } from '../types'
import { useSettings } from '../store/useStore'
import { useScope } from '../store/scope'
import { useGoogle } from '../store/useGoogle'
import {
  addDays,
  atTime,
  daySpan,
  endOfDay,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
  toDate,
  toISO,
  WEEKDAY_LABELS,
  weekdayOf,
} from '../lib/date'
import { cn } from '../lib/cn'
import {
  Badge,
  Button,
  Card,
  CourseDot,
  EmptyState,
  Modal,
  PageHeader,
  SegmentedControl,
  Skeleton,
} from '../components/ui'
import type { Tone } from '../components/ui'

type ViewMode = 'month' | 'week' | 'agenda'
type CalKind = 'assessment' | 'class' | 'study' | 'external'

interface CalItem {
  id: string
  kind: CalKind
  title: string
  start: Date
  end: Date
  allDay: boolean
  courseId?: string
  color?: CourseColor
  href?: string
  done?: boolean
  /** Location / calendar name — only surfaced in the day detail modal. */
  detail?: string
  /**
   * A moment, not a span: `end` is synthetic (a deadline, or a class with no
   * stated end time) and exists only to render a time label. Such an item must
   * never be fanned across days — a 23:59 deadline is not also tomorrow.
   */
  point?: boolean
}

const KIND_META: Record<CalKind, { label: string; icon: LucideIcon; tone: Tone }> = {
  assessment: { label: 'Deadline', icon: Flag, tone: 'danger' },
  class: { label: 'Class', icon: BookOpen, tone: 'info' },
  study: { label: 'Study', icon: Timer, tone: 'accent' },
  external: { label: 'Google', icon: CalendarDays, tone: 'neutral' },
}

const HOUR_PX = 48
const WEEK_COLS = 'grid-cols-[52px_repeat(7,minmax(0,1fr))]'

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')
/** Deadlines have a time but read as day markers — they live in the all-day strip. */
const isPinned = (i: CalItem) => i.allDay || i.kind === 'assessment'

const byStart = (a: CalItem, b: CalItem) =>
  Number(b.allDay) - Number(a.allDay) ||
  a.start.getTime() - b.start.getTime() ||
  a.title.localeCompare(b.title)

export default function CalendarPage() {
  const { courses, assessments, classes, studyBlocks } = useScope()
  const settings = useSettings()
  const navigate = useNavigate()

  const signedIn = useGoogle((s) => s.signedIn)
  const fetchEvents = useGoogle((s) => s.fetchEvents)

  const weekStartsOn = settings.weekStartsOn

  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
      ? 'agenda'
      : 'month',
  )
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [detailDay, setDetailDay] = useState<Date | null>(null)
  const [external, setExternal] = useState<CalendarEvent[]>([])
  const [loadingExternal, setLoadingExternal] = useState(false)
  const [externalError, setExternalError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Drives the "now" line and the today highlight without a reload.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  const today = useMemo(() => startOfDay(now), [now])

  // --- visible range ------------------------------------------------------
  const days = useMemo(() => {
    if (view === 'month') return daySpan(startOfWeek(startOfMonth(anchor), { weekStartsOn }), 42)
    if (view === 'week') return daySpan(startOfWeek(anchor, { weekStartsOn }), 7)
    return daySpan(startOfDay(anchor), 30)
  }, [view, anchor, weekStartsOn])

  const rangeStart = days[0]
  const rangeEnd = useMemo(() => endOfDay(days[days.length - 1]), [days])

  // --- google events ------------------------------------------------------
  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    // The skeletons have to appear on the same paint as the request going out.
    // oxlint-disable-next-line react/set-state-in-effect
    setLoadingExternal(true)
    setExternalError(null)
    fetchEvents(toISO(rangeStart), toISO(rangeEnd))
      .then((events) => {
        if (!cancelled) setExternal(events)
      })
      .catch(() => {
        if (cancelled) return
        setExternal([])
        setExternalError('Could not load your Google calendars.')
      })
      .finally(() => {
        if (!cancelled) setLoadingExternal(false)
      })
    return () => {
      cancelled = true
    }
  }, [signedIn, fetchEvents, rangeStart, rangeEnd, refreshKey])

  // --- normalised items ---------------------------------------------------
  /** Signing out must hide cached events without a state write in the effect. */
  const externalEvents = useMemo(() => (signedIn ? external : []), [signedIn, external])

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c] as const)), [courses])
  const codeOf = (courseId?: string) => (courseId ? courseById.get(courseId)?.code : undefined)

  /** Events this app itself pushed to Google — skip them or they show up twice. */
  const mirroredIds = useMemo(() => {
    const ids = new Set<string>()
    for (const a of assessments) if (a.calendarEventId) ids.add(a.calendarEventId)
    for (const b of studyBlocks) if (b.calendarEventId) ids.add(b.calendarEventId)
    return ids
  }, [assessments, studyBlocks])

  const items = useMemo<CalItem[]>(() => {
    const list: CalItem[] = []
    const within = (s: Date, e: Date) => s <= rangeEnd && e >= rangeStart
    const colorOf = (courseId?: string) =>
      courseId ? courseById.get(courseId)?.color : undefined

    for (const a of assessments) {
      const start = toDate(a.dueAt)
      if (!within(start, start)) continue
      list.push({
        id: `as-${a.id}`,
        kind: 'assessment',
        title: a.title,
        start,
        end: addMinutes(start, 30),
        allDay: false,
        courseId: a.courseId,
        color: colorOf(a.courseId),
        href: '/assessments',
        done: a.status === 'submitted' || a.status === 'graded',
        detail: `${Math.round(a.weight)}% of final grade`,
        point: true,
      })
    }

    for (const c of classes) {
      if (c.recurrence === 'weekly') {
        if (c.weekday === undefined) continue
        for (const day of days) {
          if (weekdayOf(day) !== c.weekday) continue
          const start = c.startTime ? atTime(day, c.startTime) : startOfDay(day)
          const end = c.endTime ? atTime(day, c.endTime) : addMinutes(start, 60)
          list.push({
            id: `cl-${c.id}-${dayKey(day)}`,
            kind: 'class',
            title: c.title,
            start,
            end: end > start ? end : addMinutes(start, 60),
            allDay: !c.startTime,
            courseId: c.courseId,
            color: colorOf(c.courseId),
            href: '/courses',
            detail: c.location,
            point: !c.endTime,
          })
        }
        continue
      }
      if (!c.startsAt) continue
      const start = toDate(c.startsAt)
      const end = c.endsAt ? toDate(c.endsAt) : addMinutes(start, 60)
      if (!within(start, end)) continue
      list.push({
        id: `cl-${c.id}`,
        kind: 'class',
        title: c.title,
        start,
        end: end > start ? end : addMinutes(start, 60),
        allDay: false,
        courseId: c.courseId,
        color: colorOf(c.courseId),
        href: '/courses',
        done: c.completed,
        detail: c.location,
        point: !c.endsAt,
      })
    }

    for (const b of studyBlocks) {
      const start = toDate(b.startsAt)
      const end = toDate(b.endsAt)
      if (!within(start, end)) continue
      list.push({
        id: `sb-${b.id}`,
        kind: 'study',
        title: b.title,
        start,
        end: end > start ? end : addMinutes(start, 30),
        allDay: false,
        courseId: b.courseId,
        color: colorOf(b.courseId),
        href: '/planner',
        done: b.status !== 'planned',
      })
    }

    for (const e of externalEvents) {
      if (mirroredIds.has(e.id)) continue
      const start = toDate(e.start)
      const end = toDate(e.end)
      if (!within(start, end)) continue
      list.push({
        id: `gc-${e.id}`,
        kind: 'external',
        title: e.summary || 'Untitled event',
        start,
        end: end > start ? end : addMinutes(start, 30),
        allDay: e.allDay,
        href: e.htmlLink,
        detail: e.location,
      })
    }

    return list
  }, [
    assessments,
    classes,
    studyBlocks,
    externalEvents,
    mirroredIds,
    courseById,
    days,
    rangeStart,
    rangeEnd,
  ])

  /** One bucket per calendar day; multi-day items appear on every day they touch. */
  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalItem[]>()
    const firstDay = startOfDay(rangeStart)
    const lastDay = startOfDay(rangeEnd)
    for (const item of items) {
      // Point items live on exactly one day; spans are clamped to the visible
      // range so a long item is neither dropped nor iterated pointlessly.
      const rawLast = item.point ? startOfDay(item.start) : startOfDay(addMinutes(item.end, -1))
      const last = rawLast > lastDay ? lastDay : rawLast
      const from = startOfDay(item.start)
      let cursor = from < firstDay ? firstDay : from
      // Guard: a malformed end date must not spin the loop forever.
      for (let i = 0; cursor <= last && i < 400; i += 1) {
        const key = dayKey(cursor)
        const bucket = map.get(key)
        if (bucket) bucket.push(item)
        else map.set(key, [item])
        cursor = addDays(cursor, 1)
      }
    }
    for (const bucket of map.values()) bucket.sort(byStart)
    return map
  }, [items, rangeStart, rangeEnd])

  const groups = useMemo(
    () =>
      days
        .map((day) => ({ day, list: itemsByDay.get(dayKey(day)) ?? [] }))
        .filter((g) => g.list.length > 0),
    [days, itemsByDay],
  )

  const weekdayHeaders = useMemo(
    () => Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(i + weekStartsOn) % 7]),
    [weekStartsOn],
  )

  const shift = (dir: 1 | -1) =>
    setAnchor((a) =>
      view === 'month' ? addMonths(a, dir) : addDays(a, (view === 'week' ? 7 : 30) * dir),
    )

  const rangeLabel =
    view === 'month'
      ? format(anchor, 'MMMM yyyy')
      : view === 'week'
        ? `${format(days[0], 'd MMM')} – ${format(days[6], 'd MMM yyyy')}`
        : `Next 30 days · ${format(days[0], 'd MMM')} – ${format(days[days.length - 1], 'd MMM')}`

  const detailItems = detailDay ? (itemsByDay.get(dayKey(detailDay)) ?? []) : []

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={rangeLabel}
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-[10px] border border-line bg-surface-2 p-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous period"
                onClick={() => shift(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={() => setAnchor(startOfDay(new Date()))}
                className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:text-ink"
              >
                Today
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next period"
                onClick={() => shift(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <SegmentedControl
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'month', label: 'Month' },
                { value: 'week', label: 'Week' },
                { value: 'agenda', label: 'Agenda' },
              ]}
            />
          </div>
        }
      />

      <SyncLine
        signedIn={signedIn}
        loading={loadingExternal}
        error={externalError}
        count={externalEvents.length}
        onRefresh={() => setRefreshKey((n) => n + 1)}
      />

      {view === 'month' && (
        <MonthGrid
          days={days}
          anchor={anchor}
          today={today}
          headers={weekdayHeaders}
          itemsByDay={itemsByDay}
          onPickDay={setDetailDay}
        />
      )}

      {view === 'month' && items.length === 0 && <RangeEmpty className="mt-4" />}

      {/* Seven columns never fit a phone — fall back to the agenda below sm. */}
      {view === 'week' && (
        <>
          <div className="hidden sm:block">
            <WeekGrid
              days={days}
              today={today}
              now={now}
              itemsByDay={itemsByDay}
              onPickDay={setDetailDay}
            />
            {items.length === 0 && <RangeEmpty className="mt-4" />}
          </div>
          <div className="sm:hidden">
            <AgendaList groups={groups} today={today} codeOf={codeOf} />
          </div>
        </>
      )}

      {view === 'agenda' && <AgendaList groups={groups} today={today} codeOf={codeOf} />}

      <Modal
        open={detailDay !== null}
        onClose={() => setDetailDay(null)}
        title={detailDay ? format(detailDay, 'EEEE d MMMM') : ''}
        subtitle={
          detailItems.length === 0
            ? 'Nothing scheduled'
            : detailItems.length === 1
              ? '1 item'
              : `${detailItems.length} items on this day`
        }
        footer={
          <Button variant="ghost" onClick={() => setDetailDay(null)}>
            Close
          </Button>
        }
      >
        {detailItems.length > 0 ? (
          <div className="flex flex-col gap-1">
            {detailItems.map((item) => (
              <ItemRow key={item.id} item={item} code={codeOf(item.courseId)} showRange />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<CalendarX />}
            title="Nothing scheduled"
            message="No deadlines, classes or study blocks on this day."
            action={
              <Button
                variant="subtle"
                icon={<Timer className="h-4 w-4" />}
                onClick={() => {
                  setDetailDay(null)
                  navigate('/planner')
                }}
              >
                Plan study time
              </Button>
            }
          />
        )}
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function RangeEmpty({ className }: { className?: string }) {
  const navigate = useNavigate()
  return (
    <EmptyState
      className={className}
      icon={<CalendarX />}
      title="Nothing in this range"
      message="Deadlines, classes and planned study blocks show up here as soon as you add them."
      action={
        <Button
          variant="subtle"
          icon={<CalendarPlus className="h-4 w-4" />}
          onClick={() => navigate('/assessments')}
        >
          Add an assessment
        </Button>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Google status line
// ---------------------------------------------------------------------------

function SyncLine({
  signedIn,
  loading,
  error,
  count,
  onRefresh,
}: {
  signedIn: boolean
  loading: boolean
  error: string | null
  count: number
  onRefresh: () => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-line bg-surface/60 px-3 py-2">
      {!signedIn ? (
        <>
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-faint" />
          <span className="min-w-0 text-[12px] text-muted">
            Connect Google in Settings to see your other calendars.
          </span>
          <Link
            to="/settings"
            className="ml-auto text-[12px] font-medium text-accent-soft hover:underline"
          >
            Open Settings
          </Link>
        </>
      ) : loading ? (
        <>
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </>
      ) : (
        <>
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-accent-soft" />
          <span className="min-w-0 text-[12px] text-muted">
            {error ? (
              <span className="text-warning">{error}</span>
            ) : count === 0 ? (
              'No Google events in this range.'
            ) : (
              `${count} event${count === 1 ? '' : 's'} synced from Google Calendar`
            )}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label="Refresh Google events"
            onClick={onRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Month
// ---------------------------------------------------------------------------

function MonthGrid({
  days,
  anchor,
  today,
  headers,
  itemsByDay,
  onPickDay,
}: {
  days: Date[]
  anchor: Date
  today: Date
  headers: string[]
  itemsByDay: Map<string, CalItem[]>
  onPickDay: (d: Date) => void
}) {
  return (
    <>
      <Card padded={false} className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line">
          {headers.map((label) => (
            <div
              key={label}
              className="px-1 py-2 text-center text-[11px] font-medium tracking-wider text-faint uppercase"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const list = itemsByDay.get(dayKey(day)) ?? []
            const isToday = isSameDay(day, today)
            const outside = !isSameMonth(day, anchor)
            return (
              <button
                key={dayKey(day)}
                type="button"
                onClick={() => onPickDay(day)}
                aria-label={`${format(day, 'EEEE d MMMM')}, ${list.length} items`}
                className={cn(
                  'flex min-h-[68px] flex-col gap-1 border-b border-r border-line p-1 text-left',
                  'transition-colors duration-150 hover:bg-surface-2 focus-visible:z-10 sm:min-h-[116px] sm:p-1.5',
                  outside && 'bg-surface-2',
                  i % 7 === 6 && 'border-r-0',
                  i >= 35 && 'border-b-0',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-medium tabular-nums',
                    isToday
                      ? 'bg-accent text-accent-contrast'
                      : outside
                        ? 'text-faint'
                        : 'text-muted',
                  )}
                >
                  {format(day, 'd')}
                </span>

                <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {list.slice(0, 3).map((item) => (
                    <Chip key={item.id} item={item} />
                  ))}
                  {list.length > 3 && (
                    <span className="pl-1 text-[11px] text-faint">+{list.length - 3} more</span>
                  )}
                </span>

                <span className="flex flex-wrap items-center gap-1 sm:hidden">
                  {list.slice(0, 3).map((item) => (
                    <span key={item.id} data-course={item.color}>
                      <CourseDot className={cn('h-1.5 w-1.5', item.done && 'opacity-40')} />
                    </span>
                  ))}
                  {list.length > 3 && (
                    <span className="text-[10px] leading-none text-faint">+{list.length - 3}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-faint">
        {(Object.keys(KIND_META) as CalKind[]).map((kind) => {
          const Icon = KIND_META[kind].icon
          return (
            <span key={kind} className="inline-flex items-center gap-1.5">
              <Icon className="h-3 w-3" />
              {KIND_META[kind].label}
            </span>
          )
        })}
      </div>
    </>
  )
}

/** Compact colour-coded event chip used in month cells and the all-day strip. */
function Chip({ item }: { item: CalItem }) {
  const external = item.kind === 'external'
  const study = item.kind === 'study'
  return (
    <span
      data-course={item.color}
      className={cn(
        'flex min-w-0 items-center gap-1 overflow-hidden rounded-[5px] border-l-2 py-0.5 pr-1 pl-1.5',
        'text-[11px] leading-4',
        external && 'border-line-strong bg-surface-2 text-muted',
        item.done && 'line-through opacity-55',
      )}
      style={
        external
          ? undefined
          : {
              borderLeftColor: 'var(--course, var(--accent))',
              background: study ? 'var(--surface-3)' : 'var(--course-bg, var(--accent-bg))',
              color: study ? 'var(--text-muted)' : 'var(--course, var(--accent))',
            }
      }
    >
      {item.kind === 'assessment' && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
      )}
      {!item.allDay && (
        <span className="shrink-0 tabular-nums opacity-70">{format(item.start, 'HH:mm')}</span>
      )}
      <span className="min-w-0 truncate">{item.title}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Week
// ---------------------------------------------------------------------------

interface Placed {
  item: CalItem
  lane: number
  lanes: number
}

/** Greedy lane packing so overlapping blocks sit side by side instead of stacking. */
function layoutDay(items: CalItem[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime())
  const out: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -Infinity
  const laneEnds: number[] = []

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length)
    for (const p of cluster) p.lanes = lanes
    out.push(...cluster)
    cluster = []
    laneEnds.length = 0
    clusterEnd = -Infinity
  }

  for (const item of sorted) {
    const start = item.start.getTime()
    const end = Math.max(item.end.getTime(), start + 20 * 60_000)
    if (cluster.length > 0 && start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    cluster.push({ item, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, end)
  }
  if (cluster.length > 0) flush()
  return out
}

function WeekGrid({
  days,
  today,
  now,
  itemsByDay,
  onPickDay,
}: {
  days: Date[]
  today: Date
  now: Date
  itemsByDay: Map<string, CalItem[]>
  onPickDay: (d: Date) => void
}) {
  const columns = useMemo(
    () =>
      days.map((day) => {
        const all = itemsByDay.get(dayKey(day)) ?? []
        return {
          day,
          pinned: all.filter(isPinned),
          timed: all.filter((i) => !isPinned(i)),
        }
      }),
    [days, itemsByDay],
  )

  // Base window is 06:00–24:00, widened when something falls outside it.
  const [startHour, endHour] = useMemo(() => {
    let lo = 6
    let hi = 24
    for (const col of columns) {
      for (const item of col.timed) {
        lo = Math.min(lo, item.start.getHours())
        const sameDay = isSameDay(item.start, item.end)
        const raw = sameDay ? item.end.getHours() + (item.end.getMinutes() > 0 ? 1 : 0) : 24
        hi = Math.max(hi, raw)
      }
    }
    return [Math.max(0, lo), Math.min(24, Math.max(hi, lo + 4))]
  }, [columns])

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)
  const gridHeight = (endHour - startHour) * HOUR_PX
  const offsetOf = (d: Date) => ((d.getHours() * 60 + d.getMinutes() - startHour * 60) / 60) * HOUR_PX

  const nowTop = offsetOf(now)
  const showNow = nowTop >= 0 && nowTop <= gridHeight && days.some((d) => isSameDay(d, today))

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* day headers */}
          <div className={cn('grid border-b border-line', WEEK_COLS)}>
            <div />
            {columns.map(({ day }) => {
              const isToday = isSameDay(day, today)
              return (
                <button
                  key={dayKey(day)}
                  type="button"
                  onClick={() => onPickDay(day)}
                  className="border-l border-line px-1 py-2 transition-colors hover:bg-surface-2"
                  aria-label={`Open ${format(day, 'EEEE d MMMM')}`}
                >
                  <div className="text-center text-[11px] font-medium tracking-wider text-faint uppercase">
                    {WEEKDAY_LABELS[day.getDay()]}
                  </div>
                  <div
                    className={cn(
                      'mx-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums',
                      isToday ? 'bg-accent text-accent-contrast' : 'text-ink',
                    )}
                  >
                    {format(day, 'd')}
                  </div>
                </button>
              )
            })}
          </div>

          {/* all-day + deadline strip */}
          <div className={cn('grid border-b border-line bg-surface-2', WEEK_COLS)}>
            <div className="px-2 py-2 text-right text-[10px] font-medium tracking-wider text-faint uppercase">
              All day
            </div>
            {columns.map(({ day, pinned }) => (
              <div
                key={dayKey(day)}
                className="flex min-h-[38px] min-w-0 flex-col gap-1 border-l border-line p-1"
              >
                {pinned.map((item) => (
                  <Chip key={item.id} item={item} />
                ))}
              </div>
            ))}
          </div>

          {/* hour grid */}
          <div className={cn('grid', WEEK_COLS)}>
            <div className="relative" style={{ height: gridHeight }}>
              {hours.map((h, i) => (
                <span
                  key={h}
                  className="absolute right-2 text-[11px] tabular-nums text-faint"
                  style={{ top: Math.max(2, i * HOUR_PX - 6) }}
                >
                  {`${String(h).padStart(2, '0')}:00`}
                </span>
              ))}
            </div>

            {columns.map(({ day, timed }) => {
              const isToday = isSameDay(day, today)
              return (
                <div
                  key={dayKey(day)}
                  className={cn('relative border-l border-line', isToday && 'bg-accent-bg')}
                  style={{
                    height: gridHeight,
                    backgroundImage:
                      'repeating-linear-gradient(to bottom, var(--border) 0px, var(--border) 1px, transparent 1px, transparent ' +
                      `${HOUR_PX}px)`,
                  }}
                >
                  {layoutDay(timed).map(({ item, lane, lanes }) => {
                    const top = Math.max(0, offsetOf(item.start))
                    const rawBottom = isSameDay(item.start, item.end)
                      ? offsetOf(item.end)
                      : gridHeight
                    const height = Math.max(18, Math.min(rawBottom, gridHeight) - top - 2)
                    return (
                      <WeekBlock
                        key={item.id}
                        item={item}
                        top={top}
                        height={height}
                        lane={lane}
                        lanes={lanes}
                        onClick={() => onPickDay(day)}
                      />
                    )
                  })}
                  {showNow && isToday && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 h-px bg-danger"
                      style={{ top: nowTop }}
                    >
                      <span className="absolute -top-[3px] -left-[3px] h-[7px] w-[7px] rounded-full bg-danger" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}

function WeekBlock({
  item,
  top,
  height,
  lane,
  lanes,
  onClick,
}: {
  item: CalItem
  top: number
  height: number
  lane: number
  lanes: number
  onClick: () => void
}) {
  const external = item.kind === 'external'
  const study = item.kind === 'study'
  return (
    <button
      type="button"
      onClick={onClick}
      data-course={item.color}
      className={cn(
        'absolute overflow-hidden rounded-[6px] border-l-2 px-1.5 py-0.5 text-left text-[11px] leading-tight',
        'transition-[filter] duration-150 hover:brightness-125',
        external && 'border border-line-strong bg-surface-2 text-muted',
        item.done && 'opacity-55',
      )}
      style={{
        top,
        height,
        left: `calc(${(lane * 100) / lanes}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
        ...(external
          ? {}
          : {
              borderLeftColor: 'var(--course, var(--accent))',
              background: study ? 'var(--surface-3)' : 'var(--course-bg, var(--accent-bg))',
              color: study ? 'var(--text-muted)' : 'var(--course, var(--accent))',
            }),
      }}
    >
      <span className={cn('block truncate font-medium', item.done && 'line-through')}>
        {item.title}
      </span>
      {height > 32 && (
        <span className="block truncate opacity-70">
          {format(item.start, 'HH:mm')}–{format(item.end, 'HH:mm')}
        </span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

function AgendaList({
  groups,
  today,
  codeOf,
}: {
  groups: { day: Date; list: CalItem[] }[]
  today: Date
  codeOf: (courseId?: string) => string | undefined
}) {
  const navigate = useNavigate()

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<CalendarX />}
        title="Nothing coming up"
        message="No deadlines, classes or study blocks in this window. Add an assessment or generate a study plan to fill it."
        action={
          <Button
            variant="subtle"
            icon={<Timer className="h-4 w-4" />}
            onClick={() => navigate('/planner')}
          >
            Open the study planner
          </Button>
        }
      />
    )
  }

  return (
    <Card padded={false} className="overflow-hidden">
      {groups.map(({ day, list }, i) => (
        <section key={dayKey(day)} className={cn(i > 0 && 'border-t border-line')}>
          <header className="flex items-baseline gap-2 bg-surface-2 px-3 py-2">
            <span className="text-[13px] font-semibold text-ink">{format(day, 'EEE d MMM')}</span>
            {isSameDay(day, today) && (
              <Badge tone="accent" className="py-0">
                Today
              </Badge>
            )}
            <span className="ml-auto text-[11px] text-faint">
              {list.length} item{list.length === 1 ? '' : 's'}
            </span>
          </header>
          <div className="flex flex-col gap-0.5 p-1.5">
            {list.map((item) => (
              <ItemRow key={item.id} item={item} code={codeOf(item.courseId)} />
            ))}
          </div>
        </section>
      ))}
    </Card>
  )
}

/** One event line — used by the agenda, the mobile week fallback and the day modal. */
function ItemRow({
  item,
  code,
  showRange,
}: {
  item: CalItem
  code?: string
  showRange?: boolean
}) {
  const meta = KIND_META[item.kind]
  const Icon = meta.icon
  const isExternalLink = item.kind === 'external'

  const body = (
    <div
      data-course={item.color}
      className="flex w-full items-start gap-3 rounded-[10px] px-2 py-2 text-left transition-colors duration-150 hover:bg-surface-2"
    >
      <div className="w-[52px] shrink-0 pt-0.5 text-right">
        <div className="text-[12px] font-medium tabular-nums text-ink">
          {item.allDay ? 'All day' : format(item.start, 'HH:mm')}
        </div>
        {!item.allDay && (showRange || item.kind !== 'assessment') && (
          <div className="text-[11px] tabular-nums text-faint">{format(item.end, 'HH:mm')}</div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isExternalLink ? (
            <span className="h-2 w-2 shrink-0 rounded-full border border-line-strong" />
          ) : (
            <CourseDot />
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm text-ink',
              item.done && 'text-muted line-through',
            )}
          >
            {item.title}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge tone={meta.tone} icon={<Icon className="h-3 w-3" />}>
            {meta.label}
          </Badge>
          {code && <span className="text-[12px] font-medium text-muted">{code}</span>}
          {item.detail && (
            <span className="inline-flex min-w-0 items-center gap-1 text-[12px] text-faint">
              {item.kind !== 'assessment' && <MapPin className="h-3 w-3 shrink-0" />}
              <span className="truncate">{item.detail}</span>
            </span>
          )}
        </div>
      </div>

      {item.href && (
        <span className="shrink-0 pt-1 text-faint">
          {isExternalLink ? (
            <ExternalLink className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      )}
    </div>
  )

  if (!item.href) return body
  if (isExternalLink) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" className="block">
        {body}
      </a>
    )
  }
  return (
    <Link to={item.href} className="block">
      {body}
    </Link>
  )
}
