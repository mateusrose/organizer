import { create } from 'zustand'
import type { Assessment, CalendarEvent, Course, SyncState } from '../types'
import type { GoogleState } from './googleTypes'
import { useStore } from './useStore'
import { toast } from './useToast'
import {
  GoogleApiError,
  clearSession,
  createTokenClient,
  fetchUserInfo,
  loadSession,
  requestToken,
  revoke,
  saveSession,
  waitForGis,
} from '../lib/google/auth'
import {
  deleteEvent,
  verifyCalendar,
  listCalendars,
  listEvents,
  upsertEvent,
} from '../lib/google/calendar'

/** Refresh a minute before Google would refuse the token. */
const SKEW_MS = 60_000
/** Give up on a token request GIS never answers, so the store cannot deadlock. */
const TOKEN_TIMEOUT_MS = 120_000
/** Assessments get a 30-minute marker on the calendar at their deadline. */
const DEADLINE_MINUTES = 30

/** Shown when nothing has been picked, or what was picked no longer exists. */
const NO_CALENDAR = 'Pick a calendar in Settings first.'

// ---------------------------------------------------------------------------
// Token plumbing (module-scoped: the GIS client is not serialisable state)
// ---------------------------------------------------------------------------

let tokenClient: GoogleTokenClient | null = null
let clientIdInUse: string | null = null
let initialisingFor: string | null = null

interface TokenResult {
  accessToken: string
  expiresAt: number
}

interface PendingToken {
  resolve: (result: TokenResult) => void
  reject: (error: Error) => void
  timer: number
}

let pending: PendingToken | null = null

const settlePending = (apply: (p: PendingToken) => void) => {
  const current = pending
  pending = null
  if (!current) return
  window.clearTimeout(current.timer)
  apply(current)
}

const handleToken = (response: GoogleTokenResponse) => {
  const seconds = Number(response.expires_in) || 3600
  const result: TokenResult = {
    accessToken: response.access_token,
    expiresAt: Date.now() + seconds * 1000,
  }
  // Nothing is waiting for this: the user signed out while the popup was open.
  // Storing it would resurrect the session, so revoke it instead.
  if (!pending) {
    revoke(result.accessToken)
    useGoogle.setState({ connecting: false })
    return
  }
  useGoogle.setState({
    accessToken: result.accessToken,
    expiresAt: result.expiresAt,
    connecting: false,
    error: null,
  })
  settlePending((p) => p.resolve(result))
}

const tokenErrorMessage = (error: GoogleTokenErrorEvent): string => {
  switch (error.type) {
    case 'popup_closed':
      return 'The Google window closed before sign-in finished.'
    case 'popup_failed_to_open':
      return 'Google could not open its sign-in window — allow pop-ups for this site.'
    case 'access_denied':
      return 'Access was declined. Semestre needs Calendar access to mirror your deadlines.'
    default:
      return error.message || 'Google sign-in failed.'
  }
}

const handleTokenError = (error: GoogleTokenErrorEvent) => {
  const message = tokenErrorMessage(error)
  useGoogle.setState({ connecting: false, error: message })
  settlePending((p) => p.reject(new Error(message)))
}

const requestTokenAsync = (consent: boolean): Promise<TokenResult> =>
  new Promise<TokenResult>((resolve, reject) => {
    const client = tokenClient
    if (!client) {
      reject(new Error('Google sign-in is not ready. Add your OAuth client id in Settings.'))
      return
    }
    if (pending) {
      reject(new Error('A Google sign-in request is already running.'))
      return
    }
    const timer = window.setTimeout(() => {
      useGoogle.setState({ connecting: false })
      settlePending((p) => p.reject(new Error('Google never answered the sign-in request.')))
    }, TOKEN_TIMEOUT_MS)
    pending = { resolve, reject, timer }
    try {
      requestToken(client, { consent })
    } catch (err) {
      settlePending((p) => p.reject(err instanceof Error ? err : new Error(String(err))))
    }
  })

/**
 * A valid access token, requested silently when the cached one is gone or stale.
 * Throws a message that is safe to show the user.
 *
 * The refresh is memoised: a Drive sync and a Calendar sync fired together would
 * otherwise have the second one rejected by `requestTokenAsync`'s in-flight
 * guard, and be reported as an expired session.
 */
let refreshing: Promise<string> | null = null

const ensureToken = async (): Promise<string> => {
  const { accessToken, expiresAt } = useGoogle.getState()
  if (accessToken && expiresAt && expiresAt - SKEW_MS > Date.now()) return accessToken
  if (refreshing) return refreshing

  refreshing = (async () => {
    try {
      const result = await requestTokenAsync(false)
      saveSession({ ...result, profile: useGoogle.getState().profile })
      useGoogle.setState({ signedIn: true, error: null })
      return result.accessToken
    } catch (err) {
      // Only an authentication failure means the session is dead. A network
      // blip or a popup timeout must not sign the user out.
      if (isAuthFailure(err)) {
        clearSession()
        useGoogle.setState({ signedIn: false, accessToken: null, expiresAt: null })
        throw new Error('Your Google session expired. Connect the account again to keep syncing.')
      }
      throw err instanceof Error ? err : new Error(String(err))
    } finally {
      refreshing = null
    }
  })()

  return refreshing
}

/** Distinguishes "Google says no" from "the network hiccuped". */
function isAuthFailure(err: unknown): boolean {
  if (err instanceof GoogleApiError) return err.status === 401 || err.status === 403
  const message = err instanceof Error ? err.message.toLowerCase() : ''
  return (
    message.includes('access_denied') ||
    message.includes('denied') ||
    message.includes('not ready') ||
    message.includes('popup')
  )
}

/** Run `job` with a fresh token; a 401 mid-flight buys exactly one silent retry. */
const authed = async <T>(job: (token: string) => Promise<T>): Promise<T> => {
  const token = await ensureToken()
  try {
    return await job(token)
  } catch (err) {
    if (!(err instanceof GoogleApiError) || err.status !== 401) throw err
    useGoogle.setState({ accessToken: null, expiresAt: null })
    const retryToken = await ensureToken()
    return await job(retryToken)
  }
}

const messageOf = (err: unknown): string => {
  if (err instanceof GoogleApiError) {
    if (err.status === 401) return 'Google rejected the session — connect the account again.'
    if (err.status === 403) return `Google denied the request: ${err.message}`
    return err.message
  }
  if (err instanceof Error) return err.message
  return String(err)
}

const lastSyncedAt = (state: SyncState): string | undefined =>
  state.status === 'syncing' ? undefined : state.lastSyncedAt

// ---------------------------------------------------------------------------
// Calendar payloads
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<Assessment['status'], string> = {
  todo: 'To do',
  'in-progress': 'In progress',
  submitted: 'Submitted',
  graded: 'Graded',
}

const assessmentDescription = (a: Assessment, course?: Course): string => {
  const lines = [
    course ? `${course.name} · ${course.code}` : 'Semestre',
    `${a.kind}${a.mode === 'individual' ? '' : ` (${a.mode})`} · worth ${a.points} points of the final grade`,
    `Status: ${STATUS_LABEL[a.status]}`,
    `Estimated work: ${a.estimatedHours}h`,
  ]
  if (a.description) lines.push('', a.description)
  return lines.join('\n')
}


const titled = (course: Course | undefined, title: string) =>
  course ? `${course.code} · ${title}` : title

const sourceFor = (url?: string) => (url ? { title: 'Semestre', url } : undefined)

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGoogle = create<GoogleState>()((set, get) => ({
  ready: false,
  connecting: false,
  signedIn: false,
  profile: null,
  accessToken: null,
  expiresAt: null,
  error: null,
  calendarSync: { status: 'idle' },
  calendars: [],
  calendarsLoading: false,

  init: (clientId) => {
    const id = clientId.trim()
    if (!id) {
      set({ ready: false, error: null })
      return
    }
    if (clientIdInUse === id && get().ready) return
    if (initialisingFor === id) return

    // Switching client id invalidates every token issued for the previous one.
    if (clientIdInUse && clientIdInUse !== id) {
      clearSession()
      tokenClient = null
      set({ signedIn: false, profile: null, accessToken: null, expiresAt: null })
    }

    initialisingFor = id
    void (async () => {
      try {
        await waitForGis()
        tokenClient = createTokenClient(id, handleToken, handleTokenError)
        clientIdInUse = id

        const session = loadSession()
        if (session) {
          set({
            accessToken: session.accessToken,
            expiresAt: session.expiresAt,
            profile: session.profile,
            signedIn: true,
          })
        }
        set({ ready: true, error: null })
      } catch (err) {
        set({ ready: false, error: messageOf(err) })
      } finally {
        initialisingFor = null
      }
    })()
  },

  signIn: async () => {
    if (!tokenClient) {
      const message =
        get().error ?? 'Google sign-in is not ready yet. Add your OAuth client id in Settings.'
      set({ error: message })
      toast.error(message)
      return
    }

    set({ connecting: true, error: null })
    try {
      const { accessToken, expiresAt } = await requestTokenAsync(true)
      const profile = await fetchUserInfo(accessToken)

      saveSession({ accessToken, expiresAt, profile })
      set({ signedIn: true, profile, accessToken, expiresAt, connecting: false, error: null })
      toast.success(`Connected as ${profile.email || profile.name}`)

    } catch (err) {
      const message = messageOf(err)
      set({ connecting: false, signedIn: false, error: message })
      toast.error(message)
    }
  },

  signOut: () => {
    // Cancel anything in flight first, so a token that lands after this point
    // is rejected rather than written back into the store.
    settlePending((p) => p.reject(new Error('Disconnected from Google.')))
    refreshing = null
    const token = get().accessToken
    if (token) revoke(token)
    clearSession()
    set({
      signedIn: false,
      profile: null,
      accessToken: null,
      expiresAt: null,
      connecting: false,
      error: null,
          calendarSync: { status: 'idle' },
    })
    toast.info('Disconnected from Google')
  },

  loadCalendars: async () => {
    if (!get().signedIn) return
    set({ calendarsLoading: true })
    try {
      // Only calendars the user can write to — a subscribed feed would 403.
      const calendars = await authed((token) => listCalendars(token, 'writer'))
      set({ calendars, calendarsLoading: false })
    } catch (err) {
      set({ calendarsLoading: false, error: messageOf(err) })
    }
  },

  syncCalendar: async () => {
    if (!get().signedIn) {
      const message = 'Connect your Google account first.'
      set({
        calendarSync: { status: 'error', message, lastSyncedAt: lastSyncedAt(get().calendarSync) },
      })
      toast.error(message)
      return
    }

    const previous = lastSyncedAt(get().calendarSync)
    set({ calendarSync: { status: 'syncing' } })
    try {
      const counts = await authed(async (token) => {
        const calendarId = useStore.getState().db.settings.studyCalendarId
        if (!calendarId) throw new Error(NO_CALENDAR)
        // The user may have deleted it in Google since choosing it. Forget the
        // dead id rather than writing somewhere they did not pick.
        if (!(await verifyCalendar(token, calendarId))) {
          useStore.getState().updateSettings({ studyCalendarId: undefined })
          throw new Error(NO_CALENDAR)
        }

        const courses = new Map(useStore.getState().db.courses.map((c) => [c.id, c]))
        let written = 0
        let removed = 0

        // Rows deleted or regenerated locally (re-planning replaces every
        // pending auto block) took their event id with them. The store parks
        // those ids here so the events can still be cleaned up — without this,
        // every re-plan leaves a full orphaned set behind and the calendar
        // grows a duplicate layer each sync.
        const pending = useStore.getState().db.pendingCalendarDeletions
        if (pending.length > 0) {
          const settled: typeof pending = []
          for (const entry of pending) {
            try {
              await deleteEvent(token, entry.calendarId, entry.eventId)
              settled.push(entry)
              removed += 1
            } catch {
              // Already gone, or a transient failure: deleteEvent swallows
              // 404/410, so anything reaching here is worth retrying next sync.
            }
          }
          if (settled.length > 0) useStore.getState().clearPendingDeletions(settled)
        }

        // Sequential on purpose: a handful of writes is fast enough and Google
        // throttles bursts on a fresh calendar.
        for (const a of useStore.getState().db.assessments) {
          if (a.status === 'graded') {
            // Nothing left to be reminded about — retire the deadline event
            // rather than leaving it on the calendar saying "To do" forever.
            if (a.calendarEventId) {
              await deleteEvent(token, calendarId, a.calendarEventId)
              useStore.getState().updateAssessment(a.id, { calendarEventId: undefined })
              removed += 1
            }
            continue
          }
          const dueMs = Date.parse(a.dueAt)
          if (!Number.isFinite(dueMs)) continue
          const course = courses.get(a.courseId)
          const eventId = await upsertEvent(token, calendarId, {
            id: a.calendarEventId,
            summary: titled(course, a.title),
            description: assessmentDescription(a, course),
            start: new Date(dueMs).toISOString(),
            end: new Date(dueMs + DEADLINE_MINUTES * 60_000).toISOString(),
            colorId: '11',
            source: sourceFor(a.url ?? course?.url),
          })
          if (eventId !== a.calendarEventId) {
            useStore.getState().updateAssessment(a.id, { calendarEventId: eventId })
          }
          written += 1
        }

        // Study blocks are no longer mirrored. Any this app pushed before that
        // decision are taken back out, so nothing is left orphaned in Google.
        // After one sync there is nothing left to find.
        for (const b of useStore.getState().db.studyBlocks) {
          if (!b.calendarEventId) continue
          await deleteEvent(token, calendarId, b.calendarEventId)
          useStore.getState().updateStudyBlock(b.id, { calendarEventId: undefined })
          removed += 1
        }

        return { written, removed }
      })

      set({ calendarSync: { status: 'idle', lastSyncedAt: new Date().toISOString() } })
      toast.success(
        counts.removed > 0
          ? `Calendar synced · ${counts.written} events, ${counts.removed} removed`
          : `Calendar synced · ${counts.written} events`,
      )
    } catch (err) {
      const message = messageOf(err)
      set({ calendarSync: { status: 'error', message, lastSyncedAt: previous } })
      toast.error(message)
    }
  },

  fetchEvents: async (fromISO, toISO) => {
    if (!get().signedIn) return []
    try {
      return await authed(async (token) => {
        const calendars = await listCalendars(token)
        const perCalendar = await Promise.all(
          calendars.map(async (cal) => {
            try {
              return await listEvents(token, cal.id, fromISO, toISO)
            } catch {
              // Shared/holiday calendars can 403 — skip them, keep the rest.
              return [] as CalendarEvent[]
            }
          }),
        )
        // Drop the deadlines this app pushed, by event id rather than by
        // calendar: the target may well be the user's main calendar, and
        // skipping the whole of it would hide every real event they have.
        const db = useStore.getState().db
        const mine = new Set(
          [...db.assessments, ...db.studyBlocks]
            .map((row) => row.calendarEventId)
            .filter((id): id is string => Boolean(id)),
        )
        return perCalendar
          .flat()
          .filter((e) => !mine.has(e.id))
          .sort((a, b) => a.start.localeCompare(b.start))
      })
    } catch (err) {
      set({ error: messageOf(err) })
      return []
    }
  },
}))
