import type { Database } from '../../types'
import { migrate } from '../db'
import type { SyncCredentials } from './credentials'

/**
 * Reads and writes one JSON document in a private GitHub repository.
 *
 * `api.github.com` sends `access-control-allow-origin: *` and allows PUT, so a
 * static page can do this directly with no proxy and no backend. A private repo
 * answers 404 to anyone without the token, so the data is genuinely private
 * rather than merely unlisted.
 */

const API = 'https://api.github.com'
const ACCEPT = 'application/vnd.github+json'

export class GitHubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
  }
}

/** Raised when the remote moved since the sha we hold — never overwrite blindly. */
export class ConflictError extends GitHubError {
  constructor(message = 'The remote copy changed since this device last synced.') {
    super(409, message)
    this.name = 'ConflictError'
  }
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: ACCEPT,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function failure(res: Response): Promise<GitHubError> {
  let detail = res.statusText
  try {
    const body = (await res.json()) as { message?: string }
    if (body.message) detail = body.message
  } catch {
    // Non-JSON error body; the status text will do.
  }

  if (res.status === 401) {
    return new GitHubError(401, 'That token was rejected. Check it, or create a new one.')
  }
  if (res.status === 403) {
    return new GitHubError(403, `GitHub refused the request: ${detail}`)
  }
  if (res.status === 409 || res.status === 422) {
    return new ConflictError()
  }
  return new GitHubError(res.status, detail)
}

// --- base64 that survives accented course names ----------------------------

function encode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decode(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

// --- repository reference ---------------------------------------------------

/** Accepts "owner/repo", a full URL, or an SSH remote. */
export function parseRepoRef(input: string): { owner: string; repo: string } | null {
  const text = input.trim()
  if (!text) return null

  const patterns = [
    /^https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?\/?$/i,
    /^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i,
    /^([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)$/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return { owner: match[1], repo: match[2].replace(/\.git$/i, '') }
  }
  return null
}

// --- document access --------------------------------------------------------

interface ContentsResponse {
  content?: string
  sha: string
  encoding?: string
}

export interface RemoteDocument {
  db: Database
  sha: string
}

const contentsUrl = (c: Pick<SyncCredentials, 'owner' | 'repo' | 'path'>) =>
  `${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`

/**
 * Current remote document, or null when the file does not exist yet (a fresh
 * data repo). Anything else throws.
 */
export async function fetchDocument(creds: SyncCredentials): Promise<RemoteDocument | null> {
  const res = await fetch(`${contentsUrl(creds)}?ref=HEAD&t=${Date.now()}`, {
    headers: headers(creds.token),
    cache: 'no-store',
  })

  if (res.status === 404) return null
  if (!res.ok) throw await failure(res)

  const body = (await res.json()) as ContentsResponse
  if (!body.content) throw new GitHubError(500, 'GitHub returned the file without its contents.')

  try {
    return { db: migrate(JSON.parse(decode(body.content))), sha: body.sha }
  } catch {
    throw new GitHubError(500, 'The file in the repository is not valid Semestre JSON.')
  }
}

/**
 * Writes the document. `sha` must be the blob sha this device last saw; GitHub
 * rejects the write if the file moved on, which is how a silent overwrite is
 * prevented. Pass undefined only when creating the file for the first time.
 */
export async function putDocument(
  creds: SyncCredentials,
  db: Database,
  sha: string | undefined,
  message: string,
): Promise<string> {
  const res = await fetch(contentsUrl(creds), {
    method: 'PUT',
    headers: { ...headers(creds.token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: encode(JSON.stringify(db, null, 2)),
      ...(sha ? { sha } : {}),
    }),
  })

  if (!res.ok) throw await failure(res)
  const body = (await res.json()) as { content?: { sha?: string } }
  const next = body.content?.sha
  if (!next) throw new GitHubError(500, 'GitHub accepted the write but returned no sha.')
  return next
}

export interface ProbeResult {
  ok: true
  private: boolean
  fullName: string
  canWrite: boolean
  hasDocument: boolean
}

/**
 * Validates a token + repo before anything is stored, so a typo is caught at
 * setup rather than at the first silent background push.
 */
export async function probe(creds: SyncCredentials): Promise<ProbeResult> {
  const res = await fetch(
    `${API}/repos/${encodeURIComponent(creds.owner)}/${encodeURIComponent(creds.repo)}`,
    { headers: headers(creds.token), cache: 'no-store' },
  )

  if (res.status === 404) {
    throw new GitHubError(
      404,
      'No such repository, or this token cannot see it. Private repos need the token scoped to them.',
    )
  }
  if (!res.ok) throw await failure(res)

  const repo = (await res.json()) as {
    private?: boolean
    full_name?: string
    permissions?: { push?: boolean }
  }

  const canWrite = Boolean(repo.permissions?.push)
  if (!canWrite) {
    throw new GitHubError(403, 'That token can read the repository but not write to it.')
  }

  const existing = await fetchDocument(creds)
  return {
    ok: true,
    private: Boolean(repo.private),
    fullName: repo.full_name ?? `${creds.owner}/${creds.repo}`,
    canWrite,
    hasDocument: existing !== null,
  }
}
