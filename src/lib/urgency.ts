import type { Assessment, Task } from '../types'
import { countdownLabel, daysUntil } from './date'

/**
 * Deadline pressure, shared by every list in the app so sorting and colour
 * always agree.
 *
 * score = PROXIMITY / (max(daysLeft, 0) + 1) + importance
 *         + OVERDUE_BOOST + 5 * daysOverdue   (overdue only)
 *
 * The proximity term decays hyperbolically — today is worth 1000, tomorrow
 * 500, next week ~125 — so closeness dominates while importance (an
 * assessment's weight, a task's priority) breaks ties between items sitting
 * at the same distance. The overdue constant is larger than any reachable
 * proximity + importance sum, so a missed deadline always sorts first.
 */

export type UrgencyLevel = 'overdue' | 'critical' | 'soon' | 'upcoming' | 'later' | 'done'

export interface Urgency {
  score: number
  level: UrgencyLevel
  tone: 'danger' | 'warning' | 'accent' | 'info' | 'neutral' | 'success'
  label: string
}

const PROXIMITY = 1000
const OVERDUE_BOOST = 10_000

const PRIORITY_BONUS = { high: 40, medium: 15, low: 0 } as const

const proximity = (days: number): number => PROXIMITY / (Math.max(days, 0) + 1)

/** Day buckets are shared by assessments and tasks so colours stay consistent. */
const bucket = (days: number): { level: UrgencyLevel; tone: Urgency['tone'] } => {
  if (days < 0) return { level: 'overdue', tone: 'danger' }
  if (days <= 2) return { level: 'critical', tone: 'danger' }
  if (days <= 6) return { level: 'soon', tone: 'warning' }
  if (days <= 14) return { level: 'upcoming', tone: 'accent' }
  return { level: 'later', tone: 'neutral' }
}

const overdueBoost = (days: number): number =>
  days < 0 ? OVERDUE_BOOST + Math.min(-days, 180) * 5 : 0

export function assessmentUrgency(a: Assessment, now: Date = new Date()): Urgency {
  if (a.status === 'graded' || a.status === 'submitted') {
    return {
      score: -1,
      level: 'done',
      tone: 'success',
      label: a.status === 'graded' ? 'Graded' : 'Submitted',
    }
  }

  const days = daysUntil(a.dueAt, now)
  const weight = Number.isFinite(a.weight) ? Math.max(0, a.weight) : 0
  const { level, tone } = bucket(days)

  return {
    score: proximity(days) + weight * 2 + overdueBoost(days),
    level,
    tone,
    label: days === 0 ? 'Due today' : countdownLabel(a.dueAt, now),
  }
}

export function taskUrgency(t: Task, now: Date = new Date()): Urgency {
  if (t.done) return { score: -1, level: 'done', tone: 'success', label: 'Done' }

  const bonus = PRIORITY_BONUS[t.priority] ?? 0

  // No deadline: priority alone decides, so a high-priority loose task still
  // floats above a low-priority one weeks out.
  if (!t.dueAt) return { score: bonus, level: 'later', tone: 'neutral', label: '' }

  const days = daysUntil(t.dueAt, now)
  const { level, tone } = bucket(days)

  return {
    score: proximity(days) + bonus + overdueBoost(days),
    level,
    tone,
    label: days === 0 ? 'Due today' : countdownLabel(t.dueAt, now),
  }
}

/** Sorted most-urgent-first, done/graded items last. Stable within equal scores. */
export function sortByUrgency<T extends { dueAt?: string }>(
  items: T[],
  urgencyOf: (i: T) => Urgency,
): T[] {
  return items
    .map((item, index) => ({ item, index, urgency: urgencyOf(item) }))
    .sort((a, b) => {
      const aDone = a.urgency.level === 'done' ? 1 : 0
      const bDone = b.urgency.level === 'done' ? 1 : 0
      if (aDone !== bDone) return aDone - bDone
      const diff = (b.urgency.score || 0) - (a.urgency.score || 0)
      if (diff !== 0) return diff
      return a.index - b.index
    })
    .map((entry) => entry.item)
}
