import { useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  CalendarDays,
  Check,
  CircleSlash,
  Eraser,
  Info,
  ListChecks,
  Plus,
  Sparkles,
  SlidersHorizontal,
  Target,
  Trash,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  CourseDot,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  ProgressBar,
  Select,
  Stat,
} from '../components/ui'
import {
  addDays,
  endOfDay,
  fmtDateTime,
  fmtTime,
  format,
  fromDateTimeInput,
  hoursBetween,
  isSameDay,
  minutesOfDay,
  startOfDay,
  toDate,
  toDateTimeInput,
  toISO,
  WEEKDAY_LABELS,
  WEEKDAY_LONG,
} from '../lib/date'
import { cn } from '../lib/cn'
import { uid } from '../lib/id'
import { plannedHoursByAssessment, planStudyBlocks } from '../lib/scheduler'
import type { BusyInterval, PlanResult } from '../lib/scheduler'
import { assessmentUrgency, sortByUrgency } from '../lib/urgency'
import type { Urgency } from '../lib/urgency'
import { usePreferences, useSettings, useStore } from '../store/useStore'
import { useScope } from '../store/scope'
import type { NewStudyBlock } from '../store/useStore'
import { useGoogle } from '../store/useGoogle'
import { toast } from '../store/useToast'
import type { Assessment, AvailabilityWindow, Course, StudyBlock, Weekday } from '../types'

/** How far ahead the planner is allowed to place work. */
const HORIZON_DAYS = 60
/** How much of the plan the page renders. */
const PLAN_DAYS = 21

const round1 = (n: number) => Math.round(n * 10) / 10
const windowHours = (w: AvailabilityWindow) =>
  Math.max(0, minutesOfDay(w.end) - minutesOfDay(w.start)) / 60

export default function Planner() {
  const { courses, assessments, classes, studyBlocks } = useScope()
  const preferences = usePreferences()
  const settings = useSettings()

  const updatePreferences = useStore((s) => s.updatePreferences)
  const replaceAutoBlocks = useStore((s) => s.replaceAutoBlocks)
  const clearAutoBlocks = useStore((s) => s.clearAutoBlocks)
  const addStudyBlock = useStore((s) => s.addStudyBlock)
  const updateStudyBlock = useStore((s) => s.updateStudyBlock)
  const deleteStudyBlock = useStore((s) => s.deleteStudyBlock)

  const signedIn = useGoogle((s) => s.signedIn)
  const navigate = useNavigate()

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<PlanResult | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<
    { kind: 'clear' } | { kind: 'block'; id: string; title: string } | null
  >(null)

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const assessmentById = useMemo(() => new Map(assessments.map((a) => [a.id, a])), [assessments])

  const openAssessments = useMemo(
    () => assessments.filter((a) => a.status === 'todo' || a.status === 'in-progress'),
    [assessments],
  )

  const plannedHours = useMemo(() => plannedHoursByAssessment(studyBlocks), [studyBlocks])

  // Blocks that survive a regeneration — the only ones the planner must work
  // around. Feeding it the old auto blocks would make it dodge its own slots.
  const keptBlocks = useMemo(
    () => studyBlocks.filter((b) => !b.auto || b.status !== 'planned'),
    [studyBlocks],
  )

  const demand = useMemo(
    () =>
      sortByUrgency(openAssessments, (a) => assessmentUrgency(a)).map((a) => {
        const planned = plannedHours[a.id] ?? 0
        return {
          assessment: a,
          course: courseById.get(a.courseId),
          urgency: assessmentUrgency(a),
          planned,
          deficit: Math.max(0, a.estimatedHours - planned),
        }
      }),
    [openAssessments, plannedHours, courseById],
  )

  const schedule = useMemo(() => {
    const from = startOfDay(new Date())
    const to = endOfDay(addDays(from, PLAN_DAYS - 1))
    const weekEnd = endOfDay(addDays(from, 6))
    const groups = new Map<string, { key: string; date: Date; blocks: StudyBlock[]; hours: number }>()
    let totalHours = 0
    let weekHours = 0
    let count = 0

    const sorted = [...studyBlocks].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    for (const block of sorted) {
      const start = toDate(block.startsAt)
      if (start < from || start > to) continue
      const key = format(start, 'yyyy-MM-dd')
      let group = groups.get(key)
      if (!group) {
        group = { key, date: startOfDay(start), blocks: [], hours: 0 }
        groups.set(key, group)
      }
      group.blocks.push(block)
      if (block.status !== 'skipped') {
        const h = hoursBetween(block.startsAt, block.endsAt)
        group.hours += h
        totalHours += h
        count += 1
        if (start <= weekEnd) weekHours += h
      }
    }
    return { groups: [...groups.values()], totalHours, weekHours, count }
  }, [studyBlocks])

  const usesCalendar = signedIn && settings.calendarSyncEnabled

  const generate = async () => {
    setGenerating(true)
    let busy: BusyInterval[] | undefined

    if (usesCalendar) {
      try {
        const from = new Date()
        const events = await useGoogle
          .getState()
          .fetchEvents(toISO(from), toISO(addDays(from, HORIZON_DAYS)))
        // All-day entries (birthdays, term markers) would swallow whole days.
        busy = events
          .filter((e) => !e.allDay)
          .map((e) => ({ start: e.start, end: e.end }))
      } catch {
        toast.info('Could not read Google Calendar — planning without it')
      }
    }

    try {
      const plan = planStudyBlocks({
        assessments,
        studyBlocks: keptBlocks,
        classes,
        preferences,
        busy,
        horizonDays: HORIZON_DAYS,
        now: new Date(),
      })
      replaceAutoBlocks(plan.blocks)
      setResult(plan)
      if (plan.blocks.length === 0) {
        toast.info('Nothing to schedule — no open assessments need study time')
      } else {
        toast.success(
          `Planned ${plan.blocks.length} ${plan.blocks.length === 1 ? 'block' : 'blocks'} · ${round1(plan.totalHours)} h`,
        )
      }
    } finally {
      setGenerating(false)
    }
  }

  const createBlock = (input: NewStudyBlock) => {
    addStudyBlock(input)
    setAdding(false)
    toast.success('Study block added')
  }

  const runConfirm = () => {
    if (!confirm) return
    if (confirm.kind === 'clear') {
      clearAutoBlocks()
      setResult(null)
      toast.info('Auto-generated blocks cleared')
    } else {
      deleteStudyBlock(confirm.id)
      toast.info('Study block deleted')
    }
  }

  const hasAutoBlocks = studyBlocks.some((b) => b.auto && b.status === 'planned')

  return (
    <>
      <PageHeader
        title="Study planner"
        subtitle="Turn deadlines and free time into blocks you can actually sit down and do."
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Add block
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* --- the plan (first on mobile) --------------------------------- */}
        <div className="order-1 flex min-w-0 flex-col gap-5 lg:order-2">
          <Card>
            <CardHeader
              title="Your plan"
              subtitle={`Next ${PLAN_DAYS} days`}
              icon={<Sparkles className="h-4.5 w-4.5" />}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                icon={<Sparkles className="h-4 w-4" />}
                loading={generating}
                onClick={generate}
              >
                Generate plan
              </Button>
              <Button
                variant="secondary"
                icon={<Eraser className="h-4 w-4" />}
                disabled={!hasAutoBlocks}
                onClick={() => setConfirm({ kind: 'clear' })}
              >
                Clear auto blocks
              </Button>
              {usesCalendar && (
                <Badge tone="info" icon={<CalendarDays className="h-3 w-3" />}>
                  Avoids Google Calendar events
                </Badge>
              )}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
              <Stat label="Blocks" value={schedule.count} sub={`next ${PLAN_DAYS} days`} />
              <Stat
                label="Hours"
                value={round1(schedule.totalHours)}
                sub="planned ahead"
                tone="accent"
              />
              <Stat
                label="This week"
                value={round1(schedule.weekHours)}
                sub={`goal ${preferences.weeklyHoursGoal} h`}
                tone={schedule.weekHours >= preferences.weeklyHoursGoal ? 'success' : 'neutral'}
              />
            </div>

            <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-faint">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Regenerating only replaces auto-generated blocks that are still planned. Blocks you
              added yourself, and anything already done or skipped, stay exactly where they are.
            </p>
          </Card>

          {result && result.shortfalls.length > 0 && (
            <div className="rounded-card border border-danger/30 bg-danger-bg p-4">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-danger">
                    {result.shortfalls.length === 1
                      ? "One deadline doesn't fit your availability"
                      : `${result.shortfalls.length} deadlines don't fit your availability`}
                  </h2>
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {result.shortfalls.map((s) => {
                      const a = assessmentById.get(s.assessmentId)
                      return (
                        <li key={s.assessmentId} className="text-[13px] leading-snug text-ink">
                          <span className="font-medium">{a?.title ?? 'Unknown assessment'}</span>:{' '}
                          {round1(s.missingHours)} h won't fit before the deadline
                          {a && <span className="text-muted"> · due {fmtDateTime(a.dueAt)}</span>}
                        </li>
                      )
                    })}
                  </ul>
                  <p className="mt-3 text-[12px] leading-relaxed text-muted">
                    Add availability earlier in the week, raise your max hours per day, shrink the
                    buffer before deadlines — or cut the estimate if the work is smaller than you
                    feared.
                  </p>
                </div>
              </div>
            </div>
          )}

          <Card>
            <CardHeader
              title="Workload demand"
              subtitle="Estimated against planned hours, per open assessment"
              icon={<Target className="h-4.5 w-4.5" />}
            />
            {demand.length === 0 ? (
              <EmptyState
                icon={<ListChecks />}
                title="Nothing to plan yet"
                message="Add assessments with an estimated workload and the planner will carve study time out of your week."
                action={
                  <Button
                    variant="primary"
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => navigate('/assessments')}
                  >
                    Add an assessment
                  </Button>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {demand.map((row) => (
                  <DemandRow key={row.assessment.id} {...row} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Schedule"
              subtitle={`${schedule.count} blocks over the next ${PLAN_DAYS} days`}
              icon={<CalendarClock className="h-4.5 w-4.5" />}
            />
            {schedule.groups.length === 0 ? (
              <EmptyState
                icon={<CalendarClock />}
                title="No study blocks scheduled"
                message="Generate a plan from your deadlines and availability, or drop in a block by hand."
                action={
                  <Button
                    variant="primary"
                    icon={<Sparkles className="h-4 w-4" />}
                    loading={generating}
                    onClick={generate}
                  >
                    Generate plan
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-5">
                {schedule.groups.map((group) => (
                  <section key={group.key}>
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <h3 className="text-[12px] font-semibold tracking-wider text-faint uppercase">
                        {format(group.date, 'EEE d MMM')}
                        {isSameDay(group.date, new Date()) && (
                          <span className="ml-2 text-accent-soft">Today</span>
                        )}
                      </h3>
                      <span className="text-[12px] tabular-nums text-muted">
                        {round1(group.hours)} h
                      </span>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {group.blocks.map((block) => (
                        <BlockRow
                          key={block.id}
                          block={block}
                          course={block.courseId ? courseById.get(block.courseId) : undefined}
                          assessment={
                            block.assessmentId ? assessmentById.get(block.assessmentId) : undefined
                          }
                          onStatus={(status) => updateStudyBlock(block.id, { status })}
                          onDelete={() =>
                            setConfirm({ kind: 'block', id: block.id, title: block.title })
                          }
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* --- availability + rules --------------------------------------- */}
        <div className="order-2 flex min-w-0 flex-col gap-5 lg:order-1">
          <AvailabilityCard
            windows={preferences.windows}
            weekStartsOn={settings.weekStartsOn}
            weeklyGoal={preferences.weeklyHoursGoal}
            onChange={(windows) => updatePreferences({ windows })}
          />

          <Card>
            <CardHeader
              title="Planning rules"
              subtitle="How the generator shapes your week"
              icon={<SlidersHorizontal className="h-4.5 w-4.5" />}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberPref
                label="Session length (min)"
                hint="Length of one generated block."
                value={preferences.sessionMinutes}
                min={15}
                max={300}
                step={15}
                onCommit={(sessionMinutes) => updatePreferences({ sessionMinutes })}
              />
              <NumberPref
                label="Break (min)"
                hint="Gap left between two back-to-back blocks."
                value={preferences.breakMinutes}
                min={0}
                max={120}
                step={5}
                onCommit={(breakMinutes) => updatePreferences({ breakMinutes })}
              />
              <NumberPref
                label="Max hours / day"
                hint="Hard cap so no single day turns brutal."
                value={preferences.maxHoursPerDay}
                min={0.5}
                max={16}
                step={0.5}
                onCommit={(maxHoursPerDay) => updatePreferences({ maxHoursPerDay })}
              />
              <NumberPref
                label="Buffer (days)"
                hint="Finish the work this early before it is due."
                value={preferences.bufferDays}
                min={0}
                max={14}
                step={1}
                onCommit={(bufferDays) => updatePreferences({ bufferDays })}
              />
              <NumberPref
                label="Lead time (h)"
                hint="Never schedule anything starting sooner than this."
                value={preferences.leadTimeHours}
                min={0}
                max={72}
                step={1}
                onCommit={(leadTimeHours) => updatePreferences({ leadTimeHours })}
              />
              <NumberPref
                label="Weekly goal (h)"
                hint="Target hours used by the meters above."
                value={preferences.weeklyHoursGoal}
                min={1}
                max={80}
                step={1}
                onCommit={(weeklyHoursGoal) => updatePreferences({ weeklyHoursGoal })}
              />
            </div>
          </Card>
        </div>
      </div>

      {adding && (
        <AddBlockModal
          onClose={() => setAdding(false)}
          courses={courses}
          assessments={assessments}
          defaultMinutes={preferences.sessionMinutes}
          onCreate={createBlock}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title={confirm?.kind === 'clear' ? 'Clear auto blocks?' : 'Delete study block?'}
        message={
          confirm?.kind === 'clear'
            ? 'Every auto-generated block still marked as planned will be removed. Blocks you added yourself, and anything done or skipped, are kept.'
            : `"${confirm?.kind === 'block' ? confirm.title : ''}" will be removed from your schedule.`
        }
        confirmLabel={confirm?.kind === 'clear' ? 'Clear blocks' : 'Delete'}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

function AvailabilityCard({
  windows,
  weekStartsOn,
  weeklyGoal,
  onChange,
}: {
  windows: AvailabilityWindow[]
  weekStartsOn: 0 | 1
  weeklyGoal: number
  onChange: (windows: AvailabilityWindow[]) => void
}) {
  const [day, setDay] = useState<Weekday>(weekStartsOn)
  const [start, setStart] = useState('18:00')
  const [end, setEnd] = useState('22:00')
  const [error, setError] = useState<string | null>(null)

  const order = useMemo(
    () => Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as Weekday),
    [weekStartsOn],
  )

  const byDay = useMemo(() => {
    const map = new Map<Weekday, AvailabilityWindow[]>()
    for (const w of windows) {
      const list = map.get(w.weekday) ?? []
      list.push(w)
      map.set(w.weekday, list)
    }
    for (const list of map.values()) list.sort((a, b) => minutesOfDay(a.start) - minutesOfDay(b.start))
    return map
  }, [windows])

  const total = windows.reduce((sum, w) => sum + windowHours(w), 0)

  const add = () => {
    if (!start || !end) {
      setError('Pick a start and an end time.')
      return
    }
    if (minutesOfDay(end) <= minutesOfDay(start)) {
      setError('The end time has to be after the start time.')
      return
    }
    const clash = windows.find(
      (w) =>
        w.weekday === day &&
        minutesOfDay(start) < minutesOfDay(w.end) &&
        minutesOfDay(w.start) < minutesOfDay(end),
    )
    if (clash) {
      setError(`Overlaps ${WEEKDAY_LONG[day]} ${clash.start} – ${clash.end}.`)
      return
    }
    setError(null)
    onChange([...windows, { id: uid('win'), weekday: day, start, end }])
  }

  return (
    <Card>
      <CardHeader
        title="When can you study?"
        subtitle="Recurring weekly windows the planner fills"
        icon={<CalendarClock className="h-4.5 w-4.5" />}
      />

      <div className="rounded-xl border border-line bg-surface-2/60 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink">
            <strong className="font-semibold tabular-nums">{round1(total)} h</strong> available per
            week
          </span>
          <span className="text-[12px] tabular-nums text-muted">goal {weeklyGoal} h</span>
        </div>
        <ProgressBar
          className="mt-2.5"
          value={total}
          max={weeklyGoal}
          tone={total >= weeklyGoal ? 'success' : 'warning'}
        />
        <p className="mt-2 text-[12px] text-faint">
          {total >= weeklyGoal
            ? 'Enough room for your weekly goal.'
            : `${round1(weeklyGoal - total)} h short of your weekly goal.`}
        </p>
      </div>

      <ul className="mt-4 flex flex-col gap-1">
        {order.map((d) => {
          const list = byDay.get(d) ?? []
          return (
            <li key={d} className="flex items-start gap-3 py-1">
              <span className="w-8 shrink-0 pt-1 text-[12px] font-medium text-muted">
                {WEEKDAY_LABELS[d]}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {list.length === 0 ? (
                  <span className="pt-1 text-[12px] text-faint">No windows</span>
                ) : (
                  list.map((w) => (
                    <span
                      key={w.id}
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-0.5 pr-1 pl-2.5 text-[12px] tabular-nums text-ink"
                    >
                      {w.start} – {w.end}
                      <button
                        type="button"
                        onClick={() => onChange(windows.filter((x) => x.id !== w.id))}
                        aria-label={`Remove ${WEEKDAY_LONG[d]} ${w.start} to ${w.end}`}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-faint transition-colors hover:bg-surface-3 hover:text-danger"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 border-t border-line pt-4">
        <Field label="Add window" error={error} htmlFor="window-day">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Select
                id="window-day"
                aria-label="Weekday"
                value={day}
                onChange={(e) => setDay(Number(e.target.value) as Weekday)}
              >
                {order.map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAY_LONG[d]}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              type="time"
              aria-label="Window start"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <Input
              type="time"
              aria-label="Window end"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </Field>
        <Button
          className="mt-2 w-full"
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={add}
        >
          Add window
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Planning rules
// ---------------------------------------------------------------------------

function NumberPref({
  label,
  hint,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  step: number
  onCommit: (next: number) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(String(value))
  const [lastValue, setLastValue] = useState(value)

  // Re-sync the text field when the stored preference changes elsewhere.
  if (lastValue !== value) {
    setLastValue(value)
    setDraft(String(value))
  }

  const commit = () => {
    const parsed = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const next = Math.min(max, Math.max(min, parsed))
    setDraft(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </Field>
  )
}

// ---------------------------------------------------------------------------
// Demand
// ---------------------------------------------------------------------------

function DemandRow({
  assessment,
  course,
  urgency,
  planned,
  deficit,
}: {
  assessment: Assessment
  course?: Course
  urgency: Urgency
  planned: number
  deficit: number
}) {
  return (
    <li
      data-course={course?.color}
      className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CourseDot />
          <span className="truncate text-[13px] font-medium text-ink">{assessment.title}</span>
        </div>
        <Badge tone={urgency.tone}>{urgency.label}</Badge>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3 text-[12px]">
        <span className="truncate text-muted">
          {course?.code ? `${course.code} · ` : ''}
          <span className="tabular-nums">
            {round1(planned)} of {round1(assessment.estimatedHours)} h planned
          </span>
        </span>
        {deficit > 0 ? (
          <span className="shrink-0 tabular-nums text-danger">{round1(deficit)} h missing</span>
        ) : (
          <span className="shrink-0 text-success">Covered</span>
        )}
      </div>

      <ProgressBar
        className="mt-2"
        tone="course"
        value={planned}
        max={assessment.estimatedHours || 1}
      />
    </li>
  )
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

function BlockRow({
  block,
  course,
  assessment,
  onStatus,
  onDelete,
}: {
  block: StudyBlock
  course?: Course
  assessment?: Assessment
  onStatus: (status: StudyBlock['status']) => void
  onDelete: () => void
}) {
  const done = block.status === 'done'
  const skipped = block.status === 'skipped'
  const minutes = Math.round(hoursBetween(block.startsAt, block.endsAt) * 60)
  const meta = [
    course?.code,
    assessment?.title,
    block.auto ? undefined : 'Manual',
  ].filter(Boolean) as string[]

  return (
    <li
      data-course={course?.color}
      className={cn(
        'flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors sm:gap-3 sm:px-3',
        done
          ? 'border-success/25 bg-success-bg'
          : skipped
            ? 'border-line bg-surface-2/40 opacity-55'
            : 'border-line bg-surface-2/60',
      )}
    >
      <div className="w-[46px] shrink-0 sm:w-[54px]">
        <div className="text-[13px] leading-tight font-medium tabular-nums text-ink">
          {fmtTime(block.startsAt)}
        </div>
        <div className="text-[11px] tabular-nums text-faint">
          {minutes >= 60 ? `${round1(minutes / 60)} h` : `${minutes} m`}
        </div>
      </div>

      <CourseDot />

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-[13px] font-medium text-ink',
            done && 'text-muted line-through',
          )}
        >
          {block.title}
        </div>
        {meta.length > 0 && (
          <div className="truncate text-[11px] text-faint">{meta.join(' · ')}</div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={done ? `Reopen ${block.title}` : `Mark ${block.title} done`}
          onClick={() => onStatus(done ? 'planned' : 'done')}
          className={cn(done && 'text-success')}
        >
          {done ? <Undo2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={skipped ? `Restore ${block.title}` : `Skip ${block.title}`}
          onClick={() => onStatus(skipped ? 'planned' : 'skipped')}
        >
          <CircleSlash className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${block.title}`}
          onClick={onDelete}
        >
          <Trash className="h-4 w-4" />
        </Button>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Manual block
// ---------------------------------------------------------------------------

const nextHour = (): string => {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return toDateTimeInput(toISO(d))
}

function AddBlockModal({
  onClose,
  courses,
  assessments,
  defaultMinutes,
  onCreate,
}: {
  onClose: () => void
  courses: Course[]
  assessments: Assessment[]
  defaultMinutes: number
  onCreate: (input: NewStudyBlock) => void
}) {
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [assessmentId, setAssessmentId] = useState('')
  const [startsAt, setStartsAt] = useState(nextHour)
  const [minutes, setMinutes] = useState(String(defaultMinutes))
  const [errors, setErrors] = useState<{ title?: string; startsAt?: string; minutes?: string }>({})

  const options = useMemo(
    () =>
      assessments.filter(
        (a) => a.status !== 'graded' && (courseId === '' || a.courseId === courseId),
      ),
    [assessments, courseId],
  )

  const pickAssessment = (id: string) => {
    setAssessmentId(id)
    const picked = assessments.find((a) => a.id === id)
    if (!picked) return
    setCourseId(picked.courseId)
    if (!title.trim()) setTitle(picked.title)
  }

  const submit = () => {
    const next: typeof errors = {}
    const cleanTitle = title.trim()
    const mins = Number(minutes)
    if (!cleanTitle) next.title = 'Give the block a name.'
    if (!startsAt) next.startsAt = 'Pick when it starts.'
    if (!Number.isFinite(mins) || mins < 5) next.minutes = 'At least 5 minutes.'
    if (Object.keys(next).length > 0) {
      setErrors(next)
      return
    }
    const startIso = fromDateTimeInput(startsAt)
    onCreate({
      title: cleanTitle,
      courseId: courseId || undefined,
      assessmentId: assessmentId || undefined,
      startsAt: startIso,
      endsAt: toISO(new Date(toDate(startIso).getTime() + mins * 60_000)),
      status: 'planned',
      auto: false,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a study block"
      subtitle="Manual blocks survive every regeneration."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={submit}>
            Add block
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title" required error={errors.title} htmlFor="block-title">
          <Input
            id="block-title"
            value={title}
            placeholder="Read chapter 4"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Course" htmlFor="block-course">
            <Select
              id="block-course"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value)
                setAssessmentId('')
              }}
            >
              <option value="">No course</option>
              {courses
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>

          <Field label="Assessment" htmlFor="block-assessment">
            <Select
              id="block-assessment"
              value={assessmentId}
              onChange={(e) => pickAssessment(e.target.value)}
            >
              <option value="">No assessment</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Starts" required error={errors.startsAt} htmlFor="block-start">
            <Input
              id="block-start"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>

          <Field
            label="Duration (min)"
            required
            error={errors.minutes}
            hint="How long you will sit with it."
            htmlFor="block-minutes"
          >
            <Input
              id="block-minutes"
              type="number"
              inputMode="numeric"
              min={5}
              step={15}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
