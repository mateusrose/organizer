import type { CalendarEvent, GoogleProfile, SyncState } from '../types'
import type { CalendarSummary } from '../lib/google/calendar'

/**
 * Contract for the Google integration store (`src/store/useGoogle.ts`).
 * Kept separate so UI can depend on the shape without importing the
 * implementation's side effects.
 */
export interface GoogleState {
  /** The GIS script finished loading and a client id is configured. */
  ready: boolean
  /** True while a token request is in flight. */
  connecting: boolean
  signedIn: boolean
  profile: GoogleProfile | null
  accessToken: string | null
  /** Epoch ms at which `accessToken` expires. */
  expiresAt: number | null
  /** Last error surfaced to the user, if any. */
  error: string | null

  calendarSync: SyncState
  /** The account's calendars, for the picker in Settings. Empty until loaded. */
  calendars: CalendarSummary[]
  calendarsLoading: boolean

  /** Wire up the GIS token client. Safe to call repeatedly. */
  init: (clientId: string) => void
  /** Opens the Google consent popup and stores the access token. */
  signIn: () => Promise<void>
  /** Revokes the token and clears local session state. */
  signOut: () => void

  /** Fetch the account's calendars so the user can choose where deadlines go. */
  loadCalendars: () => Promise<void>
  /** Mirror assessment deadlines into the chosen Google Calendar. */
  syncCalendar: () => Promise<void>
  /** Read events from every calendar the user owns, for the agenda views. */
  fetchEvents: (fromISO: string, toISO: string) => Promise<CalendarEvent[]>
}
