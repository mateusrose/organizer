import type { GoogleProfile } from '../../types'

/**
 * OAuth scopes requested in one consent screen. Google is used for Calendar
 * only — the database syncs through a private GitHub repository instead, so no
 * Drive scope is requested.
 *
 * - `openid email profile`                 — identify the signed-in account so the UI
 *                                            can show who the data belongs to.
 * - `calendar.events`                      — create/patch/delete the events this app
 *                                            mirrors (assessments + study blocks).
 * - `calendar.readonly`                    — read existing commitments from every
 *                                            calendar so the planner can avoid them.
 * - `calendar.app.created`                 — full control of the one calendar this app
 *                                            creates ("Semestre · Study plan"), without
 *                                            asking for control of every calendar.
 */
export const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.app.created',
].join(' ')

// ---------------------------------------------------------------------------
// Script loading
// ---------------------------------------------------------------------------

/** Resolve once the GIS script in index.html has defined `window.google`. */
export function waitForGis(timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(timer)
        resolve()
        return
      }
      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer)
        reject(
          new Error(
            'Google sign-in could not load. Check your connection or a content blocker, then reload.',
          ),
        )
      }
    }, 50)
  })
}

// ---------------------------------------------------------------------------
// Token client
// ---------------------------------------------------------------------------

export function createTokenClient(
  clientId: string,
  onToken: (response: GoogleTokenResponse) => void,
  onError: (error: GoogleTokenErrorEvent) => void,
): GoogleTokenClient {
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new Error('Google sign-in is not loaded yet.')

  return oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    // Empty prompt = reuse an existing grant silently when there is one.
    prompt: '',
    callback: (response) => {
      // GIS reports some failures through the success callback instead of
      // error_callback, so normalise them here.
      if (response.error || !response.access_token) {
        onError({
          type: response.error ?? 'no_token',
          message: response.error_description ?? response.error ?? 'Google returned no token.',
        })
        return
      }
      onToken(response)
    },
    error_callback: onError,
  })
}

export function requestToken(client: GoogleTokenClient, opts?: { consent?: boolean }): void {
  client.requestAccessToken({ prompt: opts?.consent ? 'consent' : '' })
}

export function revoke(token: string): void {
  try {
    window.google?.accounts?.oauth2?.revoke(token, () => {})
  } catch {
    // Revocation is best-effort — an already-dead token throws and that is fine.
  }
}

// ---------------------------------------------------------------------------
// REST helper
// ---------------------------------------------------------------------------

export class GoogleApiError extends Error {
  status: number
  body?: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'GoogleApiError'
    this.status = status
    this.body = body
  }
}

interface GoogleErrorPayload {
  error?: { message?: string; status?: string } | string
  error_description?: string
}

/** Authorised `fetch` for the Google REST APIs, with Google's error text surfaced. */
export async function gapiFetch<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(url, { ...init, headers })

  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    let body: unknown = raw
    let message = res.statusText || `Google request failed (${res.status})`
    try {
      const parsed = JSON.parse(raw) as GoogleErrorPayload
      body = parsed
      if (typeof parsed.error === 'string') {
        message = parsed.error_description ?? parsed.error
      } else if (parsed.error?.message) {
        message = parsed.error.message
      }
    } catch {
      // Non-JSON error body (HTML error page, empty 500) — keep the status text.
    }
    // 401 is meaningful to callers: the access token died and a silent re-request
    // may fix it, so the status travels with the error.
    throw new GoogleApiError(message, res.status, body)
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleProfile> {
  const info = await gapiFetch<{ email?: string; name?: string; picture?: string }>(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    accessToken,
  )
  return {
    email: info?.email ?? '',
    name: info?.name ?? info?.email ?? 'Google account',
    picture: info?.picture,
  }
}

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

const SESSION_KEY = 'semestre.google.session'
/** Treat a token as dead a minute early to absorb clock skew and slow requests. */
const SKEW_MS = 60_000

export interface GoogleSession {
  accessToken: string
  /** Epoch ms. */
  expiresAt: number
  profile: GoogleProfile | null
}

/**
 * Access tokens are short-lived (~1h). This is a personal, single-user app, so the
 * intended UX on expiry is a silent `prompt: ''` re-request against the grant the
 * user already gave — not a login wall.
 *
 * Refresh tokens are deliberately absent: obtaining one requires a client secret
 * and a server-side token exchange, and this app has no backend at all.
 */
export function saveSession(session: GoogleSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Private mode / full storage: the session simply will not survive a reload.
  }
}

export function loadSession(): GoogleSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GoogleSession>
    if (typeof parsed?.accessToken !== 'string' || typeof parsed?.expiresAt !== 'number') return null
    if (parsed.expiresAt - SKEW_MS <= Date.now()) return null
    return {
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
      profile: parsed.profile ?? null,
    }
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // Nothing to do — the in-memory state is cleared by the caller regardless.
  }
}
