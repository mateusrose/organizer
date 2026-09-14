import type { CalendarEvent, ISODate } from '../../types'
import { format } from '../date'
import { GoogleApiError, gapiFetch } from './auth'

/** Summary of the dedicated calendar this app creates and owns. */
export const STUDY_CALENDAR_SUMMARY = 'Semestre · Study plan'

const CAL_API = 'https://www.googleapis.com/calendar/v3'

const path = (...parts: string[]) => parts.map(encodeURIComponent).join('/')

const statusOf = (err: unknown): number => (err instanceof GoogleApiError ? err.status : 0)

// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

export interface CalendarSummary {
  id: string
  summary: string
  primary?: boolean
  backgroundColor?: string
}

interface CalendarListEntry {
  id: string
  summary?: string
  summaryOverride?: string
  primary?: boolean
  backgroundColor?: string
  deleted?: boolean
}

async function calendarList(token: string, minAccessRole?: string): Promise<CalendarListEntry[]> {
  const params = new URLSearchParams({ maxResults: '250', showHidden: 'true' })
  if (minAccessRole) params.set('minAccessRole', minAccessRole)
  const res = await gapiFetch<{ items?: CalendarListEntry[] }>(
    `${CAL_API}/users/me/calendarList?${params.toString()}`,
    token,
  )
  return (res?.items ?? []).filter((c) => !c.deleted)
}

export async function listCalendars(token: string): Promise<CalendarSummary[]> {
  const items = await calendarList(token)
  return items.map((c) => ({
    id: c.id,
    summary: c.summaryOverride ?? c.summary ?? c.id,
    primary: c.primary,
    backgroundColor: c.backgroundColor,
  }))
}

/**
 * Resolve the id of the study calendar, creating it on first run. `existingId` is
 * the id remembered in settings — it is verified rather than trusted, because the
 * user may have deleted the calendar in Google's UI.
 */
export async function ensureStudyCalendar(token: string, existingId?: string): Promise<string> {
  if (existingId) {
    try {
      const cal = await gapiFetch<{ id?: string }>(
        `${CAL_API}/calendars/${path(existingId)}`,
        token,
      )
      if (cal?.id) return cal.id
    } catch (err) {
      const status = statusOf(err)
      // Gone or no longer ours: fall through and find/create a fresh one.
      if (status !== 404 && status !== 403 && status !== 410) throw err
    }
  }

  const existing = (await calendarList(token, 'writer')).find(
    (c) => (c.summaryOverride ?? c.summary) === STUDY_CALENDAR_SUMMARY,
  )
  if (existing) return existing.id

  const created = await gapiFetch<{ id?: string }>(`${CAL_API}/calendars`, token, {
    method: 'POST',
    body: JSON.stringify({
      summary: STUDY_CALENDAR_SUMMARY,
      description: 'Deadlines and study blocks mirrored from Semestre.',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  })
  if (!created?.id) throw new Error('Google Calendar did not return an id for the new calendar.')

  try {
    await gapiFetch(`${CAL_API}/users/me/calendarList/${path(created.id)}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ colorId: '7', selected: true }),
    })
  } catch {
    // Purely cosmetic — a calendar without our colour still works.
  }
  return created.id
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

interface GoogleDateTime {
  date?: string
  dateTime?: string
  timeZone?: string
}

interface GoogleEvent {
  id?: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  colorId?: string
  start?: GoogleDateTime
  end?: GoogleDateTime
}

/** `2026-03-14` (an all-day boundary) as an ISO instant in the viewer's timezone. */
const dayToISO = (day: string): ISODate => new Date(`${day}T00:00:00`).toISOString()

const normalise = (value: string): ISODate => {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : value
}

const boundary = (slot: GoogleDateTime | undefined): ISODate | null => {
  if (slot?.dateTime) return normalise(slot.dateTime)
  if (slot?.date) return dayToISO(slot.date)
  return null
}

export async function listEvents(
  token: string,
  calendarId: string,
  fromISO: string,
  toISO: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: fromISO,
    timeMax: toISO,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })
  const res = await gapiFetch<{ items?: GoogleEvent[] }>(
    `${CAL_API}/calendars/${path(calendarId)}/events?${params.toString()}`,
    token,
  )

  const events: CalendarEvent[] = []
  for (const item of res?.items ?? []) {
    if (!item.id || item.status === 'cancelled') continue
    const start = boundary(item.start)
    if (!start) continue
    events.push({
      id: item.id,
      calendarId,
      summary: item.summary ?? '(no title)',
      description: item.description,
      location: item.location,
      start,
      end: boundary(item.end) ?? start,
      allDay: Boolean(item.start?.date),
      htmlLink: item.htmlLink,
      colorId: item.colorId,
    })
  }
  return events
}

export interface EventInput {
  /** Present when this app already created the event — triggers a PATCH. */
  id?: string
  summary: string
  description?: string
  start: ISODate
  end: ISODate
  allDay?: boolean
  colorId?: string
  source?: { title: string; url: string }
}

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url)

function eventBody(event: EventInput): Record<string, unknown> {
  const slot = (iso: ISODate): GoogleDateTime =>
    event.allDay
      ? { date: format(new Date(iso), 'yyyy-MM-dd') }
      : { dateTime: normalise(iso), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }

  const body: Record<string, unknown> = {
    summary: event.summary,
    description: event.description ?? '',
    start: slot(event.start),
    end: slot(event.end),
  }
  if (event.colorId) body.colorId = event.colorId
  // Google rejects a `source` without a valid http(s) url.
  if (event.source && isHttpUrl(event.source.url)) body.source = event.source
  return body
}

/** Create or update one event. Returns the (possibly new) Google event id. */
export async function upsertEvent(
  token: string,
  calendarId: string,
  event: EventInput,
): Promise<string> {
  const body = JSON.stringify(eventBody(event))
  const collection = `${CAL_API}/calendars/${path(calendarId)}/events`

  if (event.id) {
    try {
      const patched = await gapiFetch<{ id?: string }>(`${collection}/${path(event.id)}`, token, {
        method: 'PATCH',
        body,
      })
      return patched?.id ?? event.id
    } catch (err) {
      const status = statusOf(err)
      // Deleted in Google Calendar — recreate instead of failing the whole sync.
      if (status !== 404 && status !== 410) throw err
    }
  }

  const created = await gapiFetch<{ id?: string }>(collection, token, { method: 'POST', body })
  if (!created?.id) throw new Error('Google Calendar did not return an id for the new event.')
  return created.id
}

export async function deleteEvent(
  token: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await gapiFetch<void>(`${CAL_API}/calendars/${path(calendarId)}/events/${path(eventId)}`, token, {
      method: 'DELETE',
    })
  } catch (err) {
    const status = statusOf(err)
    // Already gone is the desired end state.
    if (status !== 404 && status !== 410) throw err
  }
}
