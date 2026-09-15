import type { CalendarEvent, DriveConflict, GoogleProfile, SyncState } from '../types'

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

  driveSync: SyncState
  calendarSync: SyncState

  /**
   * Set instead of merging when this device has never synced and both it and
   * Drive already hold data. The user picks; nothing is written until they do.
   */
  driveConflict: DriveConflict | null

  /** Wire up the GIS token client. Safe to call repeatedly. */
  init: (clientId: string) => void
  /** Opens the Google consent popup and stores the access token. */
  signIn: () => Promise<void>
  /** Revokes the token and clears local session state. */
  signOut: () => void

  /** Pull remote db, merge by revision, push the winner. */
  syncDrive: (direction?: 'auto' | 'push' | 'pull') => Promise<void>
  /** Answer a `driveConflict`: keep this device's copy, or take Drive's. */
  resolveDriveConflict: (choice: 'local' | 'remote') => Promise<void>
  /** Mirror assessments + planned study blocks into Google Calendar. */
  syncCalendar: () => Promise<void>
  /** Read events from every calendar the user owns, for the agenda views. */
  fetchEvents: (fromISO: string, toISO: string) => Promise<CalendarEvent[]>
}
