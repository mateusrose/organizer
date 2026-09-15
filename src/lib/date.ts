import {
  addDays,
  differenceInCalendarDays,
  differenceInMinutes,
  endOfDay,
  endOfWeek,
  format,
  formatDistanceToNowStrict,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfWeek,
} from 'date-fns'
import type { ISODate, TimeOfDay, Weekday } from '../types'

export const toDate = (iso: ISODate): Date => parseISO(iso)
export const toISO = (d: Date): ISODate => d.toISOString()

/** `2026-03-14` in local time — the value an `<input type="date">` expects. */
export const toDateInput = (iso: ISODate): string => format(parseISO(iso), 'yyyy-MM-dd')
/** `2026-03-14T15:00` in local time — for `<input type="datetime-local">`. */
export const toDateTimeInput = (iso: ISODate): string =>
  format(parseISO(iso), "yyyy-MM-dd'T'HH:mm")
/** Parse a `datetime-local` / `date` input value as local time. */
export const fromDateTimeInput = (value: string): ISODate =>
  new Date(value.length <= 10 ? `${value}T12:00` : value).toISOString()

export const fmtDate = (iso: ISODate): string => format(parseISO(iso), 'd MMM yyyy')
export const fmtDayMonth = (iso: ISODate): string => format(parseISO(iso), 'd MMM')
export const fmtTime = (iso: ISODate): string => format(parseISO(iso), 'HH:mm')
export const fmtDateTime = (iso: ISODate): string => format(parseISO(iso), 'd MMM · HH:mm')
export const fmtWeekday = (iso: ISODate): string => format(parseISO(iso), 'EEE')

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** Whole days from today (local) to `iso`. Negative when overdue. */
export function daysUntil(iso: ISODate, now: Date = new Date()): number {
  return differenceInCalendarDays(parseISO(iso), now)
}

/** "in 3 days" / "2 hours ago" */
export function relative(iso: ISODate): string {
  const d = parseISO(iso)
  const past = isBefore(d, new Date())
  const dist = formatDistanceToNowStrict(d)
  return past ? `${dist} ago` : `in ${dist}`
}

/** Human countdown tuned for deadlines: "Today", "Tomorrow", "In 4 days". */
export function countdownLabel(iso: ISODate, now: Date = new Date()): string {
  const d = daysUntil(iso, now)
  if (d < -1) return `${Math.abs(d)} days overdue`
  if (d === -1) return 'Yesterday'
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d < 7) return `In ${d} days`
  if (d < 14) return 'Next week'
  return `In ${Math.round(d / 7)} weeks`
}

export function hoursBetween(startIso: ISODate, endIso: ISODate): number {
  return differenceInMinutes(parseISO(endIso), parseISO(startIso)) / 60
}

/** Combine a local calendar day with a "HH:mm" string. */
export function atTime(day: Date, time: TimeOfDay): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d
}

export function minutesOfDay(time: TimeOfDay): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function weekdayOf(d: Date): Weekday {
  return d.getDay() as Weekday
}

export function weekRange(ref: Date, weekStartsOn: 0 | 1): { start: Date; end: Date } {
  return { start: startOfWeek(ref, { weekStartsOn }), end: endOfWeek(ref, { weekStartsOn }) }
}

/** `count` consecutive days starting at `start` (local midnight). */
export function daySpan(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => startOfDay(addDays(start, i)))
}

export function isWithin(iso: ISODate, from: Date, to: Date): boolean {
  const d = parseISO(iso)
  return !isBefore(d, from) && !isAfter(d, to)
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

export { addDays, endOfDay, isSameDay, startOfDay, startOfWeek, endOfWeek, format }
