import type { Assessment, ClassEntry, StudyBlock, StudyPreferences } from '../types'
import {
  addDays,
  atTime,
  daySpan,
  format,
  hoursBetween,
  startOfDay,
  toDate,
  toISO,
  weekdayOf,
} from './date'

/**
 * Greedy earliest-fit study planner.
 *
 * Availability windows are expanded onto real calendar days, everything
 * already booked (study blocks, classes, external calendar events) is cut out
 * of them, and the remaining free fragments are handed to assessments in
 * order of their effective deadline (due date minus the buffer). Each
 * assessment takes the earliest fragments it can reach; whatever does not fit
 * before its deadline comes back as a shortfall.
 *
 * The plan is a pure function of its input — no clocks, no randomness — so the
 * same database always yields the same schedule.
 */

export interface BusyInterval {
  start: string
  end: string
}

export interface PlannerInput {
  assessments: Assessment[]
  /** Existing blocks to schedule around. Exclude the auto blocks being replaced. */
  studyBlocks: StudyBlock[]
  classes: ClassEntry[]
  preferences: StudyPreferences
  busy?: BusyInterval[]
  horizonDays?: number
  now?: Date
}

export interface PlannedBlock {
  title: string
  courseId?: string
  assessmentId?: string
  startsAt: string
  endsAt: string
  status: 'planned'
  auto: true
}

export interface Shortfall {
  assessmentId: string
  missingHours: number
}

export interface PlanResult {
  blocks: PlannedBlock[]
  shortfalls: Shortfall[]
  totalHours: number
  /** Hours planned per ISO day key 'yyyy-MM-dd'. */
  perDay: Record<string, number>
}

/** A half-open interval in epoch milliseconds. */
export interface Span {
  start: number
  end: number
}

const MINUTE = 60_000
const HOUR = 3_600_000
const MIN_BLOCK_MS = 20 * MINUTE
/** A tail shorter than this is glued onto the block before it. */
const MERGE_REMAINDER_MS = 25 * MINUTE
/** Pathological input (thousands of tiny slots) must never spin forever. */
const MAX_STEPS = 500_000

const num = (value: unknown, fallback: number, lo: number, hi: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, lo), hi)
    : fallback

const msOf = (iso?: string): number => {
  if (!iso) return Number.NaN
  const t = toDate(iso).getTime()
  return Number.isFinite(t) ? t : Number.NaN
}

const dayKey = (ms: number): string => format(new Date(ms), 'yyyy-MM-dd')

/**
 * The parts of `slot` left once every interval in `busy` is removed. Handles
 * partial overlap at either end, full containment and slots swallowed whole.
 */
export function subtractIntervals(slot: Span, busy: Span[]): Span[] {
  let parts: Span[] = [{ start: slot.start, end: slot.end }]
  for (const b of busy) {
    if (b.end <= b.start) continue
    const next: Span[] = []
    for (const part of parts) {
      if (b.end <= part.start || b.start >= part.end) {
        next.push(part)
        continue
      }
      if (b.start > part.start) next.push({ start: part.start, end: b.start })
      if (b.end < part.end) next.push({ start: b.end, end: part.end })
    }
    parts = next
    if (parts.length === 0) break
  }
  return parts
}

/** Sort + union so subtraction never sees overlapping busy time. */
const mergeSpans = (spans: Span[]): Span[] => {
  const valid = spans
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Span[] = []
  for (const span of valid) {
    const last = out[out.length - 1]
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end)
    else out.push({ start: span.start, end: span.end })
  }
  return out
}

/** Hours of planned+done study per assessment id. */
export function plannedHoursByAssessment(blocks: StudyBlock[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const block of blocks) {
    if (!block.assessmentId) continue
    if (block.status !== 'planned' && block.status !== 'done') continue
    const hours = hoursBetween(block.startsAt, block.endsAt)
    if (!Number.isFinite(hours) || hours <= 0) continue
    out[block.assessmentId] = (out[block.assessmentId] ?? 0) + hours
  }
  return out
}

interface Slot extends Span {
  /** Immutable original start, so the sorted order survives allocation. */
  origStart: number
}

interface Demand {
  assessment: Assessment
  cutoff: number
  remainingMs: number
  /** Points of the final grade riding on this, used only to break ties. */
  points: number
}

export function planStudyBlocks(input: PlannerInput): PlanResult {
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const prefs: Partial<StudyPreferences> = input.preferences ?? {}

  const horizonDays = Math.round(num(input.horizonDays, 60, 1, 365))
  const sessionMs = num(prefs.sessionMinutes, 90, 20, 480) * MINUTE
  const breakMs = num(prefs.breakMinutes, 0, 0, 240) * MINUTE
  const bufferDays = Math.round(num(prefs.bufferDays, 0, 0, 60))
  const leadMs = num(prefs.leadTimeHours, 0, 0, 720) * HOUR
  const maxDayMs = num(prefs.maxHoursPerDay, 24, 0, 24) * HOUR

  const earliest = nowMs + leadMs
  const days = daySpan(startOfDay(now), horizonDays + 1)
  const horizonEnd = addDays(startOfDay(now), horizonDays + 1).getTime()

  // --- busy time -----------------------------------------------------------
  const busyRaw: Span[] = []

  for (const block of input.studyBlocks ?? []) {
    if (block.status === 'skipped') continue
    busyRaw.push({ start: msOf(block.startsAt), end: msOf(block.endsAt) })
  }

  const weeklyClasses = (input.classes ?? []).filter((c) => c.recurrence === 'weekly')
  for (const entry of input.classes ?? []) {
    if (entry.recurrence !== 'once') continue
    busyRaw.push({ start: msOf(entry.startsAt), end: msOf(entry.endsAt) })
  }
  for (const day of days) {
    const weekday = weekdayOf(day)
    for (const entry of weeklyClasses) {
      if (entry.weekday !== weekday || !entry.startTime || !entry.endTime) continue
      busyRaw.push({
        start: atTime(day, entry.startTime).getTime(),
        end: atTime(day, entry.endTime).getTime(),
      })
    }
  }

  for (const interval of input.busy ?? []) {
    busyRaw.push({ start: msOf(interval.start), end: msOf(interval.end) })
  }

  const busy = mergeSpans(busyRaw)

  // --- free slots ----------------------------------------------------------
  const windows = prefs.windows ?? []
  const windowSpans: Span[] = []

  for (const day of days) {
    const weekday = weekdayOf(day)
    for (const window of windows) {
      if (window.weekday !== weekday) continue
      const start = atTime(day, window.start).getTime()
      let end = atTime(day, window.end).getTime()
      // A window like 22:00 → 01:00 runs past midnight into the next day.
      if (end < start) end = atTime(addDays(day, 1), window.end).getTime()
      windowSpans.push({ start, end })
    }
  }

  // Merged across the whole horizon, so windows that touch or overlap — including
  // one spilling past midnight onto the next day's — never yield two slots over
  // the same minutes.
  const slots: Slot[] = []
  for (const window of mergeSpans(windowSpans)) {
    const start = Math.max(window.start, earliest)
    const end = Math.min(window.end, horizonEnd)
    if (end - start < MIN_BLOCK_MS) continue
    const relevant = busy.filter((b) => b.end > start && b.start < end)
    for (const free of subtractIntervals({ start, end }, relevant)) {
      if (free.end - free.start >= MIN_BLOCK_MS) {
        slots.push({ start: free.start, end: free.end, origStart: free.start })
      }
    }
  }

  // --- demand --------------------------------------------------------------
  const alreadyPlanned = plannedHoursByAssessment(input.studyBlocks ?? [])
  const demands: Demand[] = []

  for (const assessment of input.assessments ?? []) {
    if (assessment.status === 'graded' || assessment.status === 'submitted') continue

    const dueMs = msOf(assessment.dueAt)
    if (!Number.isFinite(dueMs) || dueMs <= nowMs) continue

    const estimated = Math.max(0, num(assessment.estimatedHours, 0, 0, 10_000))
    const remainingHours = estimated - (alreadyPlanned[assessment.id] ?? 0)
    if (remainingHours <= 0.001) continue

    let cutoff = addDays(toDate(assessment.dueAt), -bufferDays).getTime()
    // A buffer that lands in the past would make the work unschedulable, so
    // fall back to the real deadline rather than reporting a phantom shortfall.
    if (cutoff <= earliest) cutoff = dueMs
    cutoff = Math.min(cutoff, horizonEnd)

    demands.push({
      assessment,
      cutoff,
      // Honour the 20-minute floor even for a tiny estimate.
      remainingMs: Math.max(remainingHours * HOUR, MIN_BLOCK_MS),
      points: Math.max(0, num(assessment.points, 0, 0, 100)),
    })
  }

  demands.sort(
    (a, b) =>
      a.cutoff - b.cutoff ||
      b.points - a.points ||
      (a.assessment.id < b.assessment.id ? -1 : a.assessment.id > b.assessment.id ? 1 : 0),
  )

  // --- allocation ----------------------------------------------------------
  // `dayUsed` enforces maxHoursPerDay across old and new work alike; `perDayMs`
  // only reports what this plan adds.
  const dayUsed: Record<string, number> = {}
  for (const block of input.studyBlocks ?? []) {
    if (block.status === 'skipped') continue
    const start = msOf(block.startsAt)
    const end = msOf(block.endsAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    dayUsed[dayKey(start)] = (dayUsed[dayKey(start)] ?? 0) + (end - start)
  }

  const perDayMs: Record<string, number> = {}
  const blocks: PlannedBlock[] = []
  const shortfalls: Shortfall[] = []
  let totalMs = 0
  let steps = 0

  planning: for (const demand of demands) {
    let remainingMs = demand.remainingMs

    for (const slot of slots) {
      if (remainingMs < MIN_BLOCK_MS) break
      // Slots keep their original order, so nothing further back can help.
      if (slot.origStart >= demand.cutoff) break
      const limit = Math.min(slot.end, demand.cutoff)

      while (remainingMs >= MIN_BLOCK_MS && limit - slot.start >= MIN_BLOCK_MS) {
        if (++steps > MAX_STEPS) break planning

        const key = dayKey(slot.start)
        const dayLeft = maxDayMs - (dayUsed[key] ?? 0)
        if (dayLeft < MIN_BLOCK_MS) {
          // The day is full. A slot running past midnight still has tomorrow.
          const tomorrow = addDays(startOfDay(new Date(slot.start)), 1).getTime()
          if (tomorrow < limit) {
            slot.start = tomorrow
            continue
          }
          break
        }

        const room = Math.min(limit - slot.start, dayLeft)
        let length = Math.min(sessionMs, remainingMs, room)
        const tail = remainingMs - length
        // Absorb a stub rather than scheduling it as its own session.
        if (tail > 0 && tail < MERGE_REMAINDER_MS && length + tail <= room) {
          length += tail
        } else if (tail > 0 && tail < MIN_BLOCK_MS) {
          // A sub-floor tail can never be emitted by a later pass, so it would
          // be stranded and then reported as a deadline shortfall even with
          // weeks of free time left. Either leave a placeable remainder behind,
          // or carry the whole demand to the next slot.
          const shrunk = remainingMs - MIN_BLOCK_MS
          if (shrunk >= MIN_BLOCK_MS) length = shrunk
          else break
        }
        if (length < MIN_BLOCK_MS) break

        const startMs = slot.start
        const endMs = startMs + length

        blocks.push({
          title: demand.assessment.title,
          courseId: demand.assessment.courseId,
          assessmentId: demand.assessment.id,
          startsAt: toISO(new Date(startMs)),
          endsAt: toISO(new Date(endMs)),
          status: 'planned',
          auto: true,
        })

        remainingMs -= length
        totalMs += length
        dayUsed[key] = (dayUsed[key] ?? 0) + length
        perDayMs[key] = (perDayMs[key] ?? 0) + length
        slot.start = endMs + breakMs
      }
    }

    // Only a genuinely placeable amount counts as unmet work.
    if (remainingMs >= MIN_BLOCK_MS) {
      shortfalls.push({ assessmentId: demand.assessment.id, missingHours: remainingMs / HOUR })
    }
  }

  blocks.sort(
    (a, b) =>
      (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0) ||
      (a.title < b.title ? -1 : a.title > b.title ? 1 : 0),
  )

  const perDay: Record<string, number> = {}
  for (const [key, ms] of Object.entries(perDayMs)) perDay[key] = ms / HOUR

  return { blocks, shortfalls, totalHours: totalMs / HOUR, perDay }
}
