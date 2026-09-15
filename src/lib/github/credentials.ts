/**
 * Per-device sync credentials.
 *
 * Deliberately NOT part of `Database`: credentials must never travel inside the
 * document they unlock, or a new device would need the token in order to
 * download the token. They are also never committed — the user pastes them into
 * Settings at runtime, so the published app carries no secrets at all.
 */

const KEY = 'semestre.github'

export interface SyncCredentials {
  /** Fine-grained PAT, scoped to the data repository only. */
  token: string
  owner: string
  repo: string
  /** Path of the JSON document inside that repo. */
  path: string
  /** Blob sha of the last version this device saw — drives conflict detection. */
  sha?: string
  lastSyncAt?: string
}

export function loadCredentials(): SyncCredentials | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SyncCredentials>
    if (!parsed.token || !parsed.owner || !parsed.repo) return null
    return {
      token: parsed.token,
      owner: parsed.owner,
      repo: parsed.repo,
      path: parsed.path || 'semestre.json',
      sha: parsed.sha,
      lastSyncAt: parsed.lastSyncAt,
    }
  } catch {
    return null
  }
}

export function saveCredentials(creds: SyncCredentials): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(creds))
  } catch {
    // Private window or full storage — the caller surfaces the failure.
  }
}

export function patchCredentials(patch: Partial<SyncCredentials>): SyncCredentials | null {
  const current = loadCredentials()
  if (!current) return null
  const next = { ...current, ...patch }
  saveCredentials(next)
  return next
}

export function clearCredentials(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing useful to do.
  }
}

/** True once this device has completed a reconciliation with the remote. */
export function hasSyncedBefore(): boolean {
  return Boolean(loadCredentials()?.lastSyncAt)
}
