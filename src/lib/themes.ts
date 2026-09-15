import { isWithin, startOfDay, endOfDay, toDate } from './date'
import type { Theme } from '../types'

/** Themes whose date band covers `now` — what the student should be on today. */
export function currentThemes(themes: Theme[], now: Date = new Date()): Theme[] {
  return themes.filter((t) =>
    isWithin(now.toISOString(), startOfDay(toDate(t.startsOn)), endOfDay(toDate(t.endsOn))),
  )
}

/** The next theme that has not started yet, in syllabus order. */
export function nextTheme(themes: Theme[], now: Date = new Date()): Theme | undefined {
  return [...themes]
    .filter((t) => toDate(t.startsOn) > now)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0]
}

/** How far through a theme's own checklist the student is. */
export function todoProgress(theme: Theme): { done: number; total: number; pct: number } {
  const total = theme.todos.length
  const done = theme.todos.filter((t) => t.done).length
  return { done, total, pct: total > 0 ? (done / total) * 100 : 0 }
}

export function themeProgress(themes: Theme[]): { done: number; total: number; pct: number } {
  const total = themes.length
  const done = themes.filter((t) => t.status === 'done').length
  return { done, total, pct: total > 0 ? (done / total) * 100 : 0 }
}

/**
 * A theme is "behind" when its band has ended but it is not done — the single
 * most useful signal in an asynchronous course, where nobody chases you.
 */
export function isBehind(theme: Theme, now: Date = new Date()): boolean {
  return theme.status !== 'done' && endOfDay(toDate(theme.endsOn)) < now
}

export function themeTone(theme: Theme, now: Date = new Date()) {
  if (theme.status === 'done') return 'success' as const
  if (isBehind(theme, now)) return 'danger' as const
  if (theme.status === 'in-progress') return 'accent' as const
  return 'neutral' as const
}

export const THEME_STATUS_LABEL: Record<Theme['status'], string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  done: 'Done',
}
