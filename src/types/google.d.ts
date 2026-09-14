/**
 * Ambient types for Google Identity Services — the `accounts.google.com/gsi/client`
 * script loaded from index.html. Only the OAuth *token* flow is modelled, because
 * that is the only flow a static page with no backend can use: the implicit /
 * token-client flow hands us a short-lived access token in the browser and never
 * involves a client secret.
 *
 * The shapes live on `globalThis` so no module has to import them.
 */

declare global {
  /** Successful `requestAccessToken` payload (also used for in-band errors). */
  interface GoogleTokenResponse {
    access_token: string
    /** Seconds until the token expires — Google currently issues ~3600. */
    expires_in: number
    scope: string
    token_type: string
    error?: string
    error_description?: string
    error_uri?: string
  }

  /** Out-of-band failure, e.g. the user closed the consent popup. */
  interface GoogleTokenErrorEvent {
    type: string
    message?: string
    stack?: string
  }

  interface GoogleTokenClientOverrides {
    prompt?: '' | 'none' | 'consent' | 'select_account'
    hint?: string
    state?: string
    enable_granular_consent?: boolean
  }

  interface GoogleTokenClientConfig {
    client_id: string
    scope: string
    prompt?: '' | 'none' | 'consent' | 'select_account'
    hint?: string
    hosted_domain?: string
    include_granted_scopes?: boolean
    enable_granular_consent?: boolean
    callback?: (response: GoogleTokenResponse) => void
    error_callback?: (error: GoogleTokenErrorEvent) => void
  }

  interface GoogleTokenClient {
    requestAccessToken: (overrides?: GoogleTokenClientOverrides) => void
  }

  interface GoogleOAuth2 {
    initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient
    hasGrantedAllScopes: (response: GoogleTokenResponse, ...scopes: string[]) => boolean
    hasGrantedAnyScope: (response: GoogleTokenResponse, ...scopes: string[]) => boolean
    revoke: (accessToken: string, done?: () => void) => void
  }

  interface GoogleCredentialResponse {
    credential: string
    select_by?: string
  }

  interface GoogleIdConfig {
    client_id: string
    callback?: (response: GoogleCredentialResponse) => void
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
    context?: 'signin' | 'signup' | 'use'
  }

  /** One Tap / ID-token side of GIS. Declared for completeness; unused here. */
  interface GoogleAccountsId {
    initialize: (config: GoogleIdConfig) => void
    prompt: (listener?: (notification: unknown) => void) => void
    renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
    disableAutoSelect: () => void
    revoke: (
      hint: string,
      callback?: (response: { successful: boolean; error?: string }) => void,
    ) => void
  }

  interface GoogleAccounts {
    oauth2: GoogleOAuth2
    id: GoogleAccountsId
  }

  interface GoogleGlobal {
    accounts: GoogleAccounts
  }

  interface Window {
    /** Undefined until the async GIS script finishes loading. */
    google?: GoogleGlobal
  }

  /**
   * Bare global, for parity with Google's own docs. Prefer `window.google?.…`:
   * touching this before the script loads throws a ReferenceError.
   */
  const google: GoogleGlobal
}

export {}
