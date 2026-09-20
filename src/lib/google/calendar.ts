import type { CalendarEvent, ISODate } from '../../types'
import { format } from '../date'
import { GoogleApiError, gapiFetch } from './auth'

/** Summary of the dedicated calendar this app creates and owns. */

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

export async function listCalendars(
  token: string,
  /** 'writer' for the picker: a read-only feed would 403 on every sync. */
  minAccessRole?: string,
): Promise<CalendarSummary[]> {
  const items = await calendarList(token, minAccessRole)
  return items.map((c) => ({
    id: c.id,
    summary: c.summaryOverride ?? c.summary ?? c.id,
    primary: c.primary,
    backgroundColor: c.backgroundColor,
  }))
}

/**
 * Confirm the calendar the user picked is still there and still writable.
 *
 * The app never creates a calendar: it writes only where it has been pointed, so
 * a target that has been deleted in Google's UI is reported rather than quietly
 * replaced by a new one the user never asked for.
 */
export async function verifyCalendar(token: string, id: string): Promise<boolean> {
  try {
    const cal = await gapiFetch<{ id?: string }>(`${CAL_API}/calendars/${path(id)}`, token)
    return Boolean(cal?.id)
  } catch (err) {
    const status = statusOf(err)
    // Only 404/410 means gone. A 403 is usually transient permission or quota
    // trouble, and throwing the user's choice away over one would be rude.
    if (status === 404 || status === 410) return false
    throw err
  }
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

/**
 * Every event id in a calendar, following pagination to the end.
 *
 * `listEvents` caps at one page because the agenda only ever needs a visible
 * window; a wipe has to see all of them or it leaves stragglers behind.
 */
export async function listAllEventIds(token: string, calendarId: string): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({ maxResults: '2500', showDeleted: 'false' })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await gapiFetch<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      `${CAL_API}/calendars/${path(calendarId)}/events?${params.toString()}`,
      token,
    )
    for (const item of res?.items ?? []) {
      if (item.id && item.status !== 'cancelled') ids.push(item.id)
    }
    pageToken = res?.nextPageToken
  } while (pageToken)
  return ids
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
