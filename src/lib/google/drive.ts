import type { Database, DatabaseSummary } from '../../types'
import { migrate } from '../db'
import { uid } from '../id'
import { GoogleApiError, gapiFetch } from './auth'

/**
 * The whole database travels as one JSON file inside Drive's `appDataFolder`, a
 * hidden space that only this app can see and that the user can wipe from
 * Drive → Settings → Manage apps.
 */
export const FILE_NAME = 'semestre.json'

const FILES_API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files'

interface DriveFile {
  id: string
  name: string
  modifiedTime?: string
}

export async function findFileId(token: string): Promise<string | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,modifiedTime)',
    q: `name='${FILE_NAME}'`,
  })
  const res = await gapiFetch<{ files?: DriveFile[] }>(`${FILES_API}?${params.toString()}`, token)
  const files = res?.files ?? []
  if (files.length === 0) return null
  // A crashed upload can leave duplicates behind; always trust the newest.
  const newest = [...files].sort((a, b) =>
    (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''),
  )[0]
  return newest ? newest.id : null
}

export async function downloadDatabase(token: string): Promise<Database | null> {
  const id = await findFileId(token)
  if (!id) return null

  let payload: unknown
  try {
    payload = await gapiFetch<unknown>(`${FILES_API}/${encodeURIComponent(id)}?alt=media`, token)
  } catch (err) {
    // Deleted between the lookup and the download — behave as "nothing there".
    if (err instanceof GoogleApiError && err.status === 404) return null
    if (err instanceof SyntaxError) {
      throw new Error('The backup in Google Drive is not readable JSON.')
    }
    throw err
  }
  if (payload === undefined || payload === null) return null
  return migrate(payload)
}

export async function uploadDatabase(token: string, db: Database): Promise<string> {
  const content = JSON.stringify(db)
  const existing = await findFileId(token)

  if (existing) {
    try {
      const updated = await gapiFetch<{ id?: string }>(
        `${UPLOAD_API}/${encodeURIComponent(existing)}?uploadType=media&fields=id`,
        token,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content },
      )
      return updated?.id ?? existing
    } catch (err) {
      // The file was removed from Drive behind our back — fall through and create.
      const status = err instanceof GoogleApiError ? err.status : 0
      if (status !== 404 && status !== 410) throw err
    }
  }

  return createFile(token, content)
}

async function createFile(token: string, content: string): Promise<string> {
  const boundary = `semestre-${uid()}`
  const metadata = {
    name: FILE_NAME,
    mimeType: 'application/json',
    parents: ['appDataFolder'],
  }
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${content}\r\n` +
    `--${boundary}--`

  const created = await gapiFetch<{ id?: string }>(
    `${UPLOAD_API}?uploadType=multipart&fields=id`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  )
  if (!created?.id) throw new Error('Google Drive did not return a file id for the upload.')
  return created.id
}

/**
 * Last-writer-wins by `revision`, then by `updatedAt`.
 *
 * There is exactly one human editing this data, just possibly from a phone and a
 * laptop, so a whole-file winner is the correct trade-off: no per-field merge can
 * be more faithful to intent than "the copy that was edited most recently", and
 * field-level merging would happily resurrect deleted rows.
 */
export function mergeDatabases(
  local: Database,
  remote: Database | null,
): { winner: Database; reason: string } {
  if (!remote) return { winner: local, reason: 'No backup in Drive yet — uploaded this device.' }

  if (local.revision > remote.revision) {
    return { winner: local, reason: 'This device was ahead — pushed it to Drive.' }
  }
  if (remote.revision > local.revision) {
    return { winner: remote, reason: 'Drive was ahead — pulled it into this device.' }
  }

  const localAt = Date.parse(local.updatedAt)
  const remoteAt = Date.parse(remote.updatedAt)
  if (Number.isFinite(remoteAt) && (!Number.isFinite(localAt) || remoteAt > localAt)) {
    return { winner: remote, reason: 'Same revision — kept the newer Drive copy.' }
  }
  return { winner: local, reason: 'Already in sync.' }
}

// ---------------------------------------------------------------------------
// First-sync safety
// ---------------------------------------------------------------------------

/**
 * Per-device marker, deliberately NOT part of the synced database: it records
 * whether *this browser* has ever reconciled with Drive. Until it has, an
 * automatic merge could overwrite a copy the user never agreed to replace.
 */
const SYNC_MARK = 'semestre.drive.lastSync'

export function hasSyncedBefore(): boolean {
  try {
    return Boolean(localStorage.getItem(SYNC_MARK))
  } catch {
    return false
  }
}

export function markSynced(): void {
  try {
    localStorage.setItem(SYNC_MARK, new Date().toISOString())
  } catch {
    // Not worth failing a sync over.
  }
}

export function summarise(db: Database): DatabaseSummary {
  return {
    courses: db.courses.length,
    assessments: db.assessments.length,
    themes: db.themes.length,
    tasks: db.tasks.length,
    updatedAt: db.updatedAt,
    revision: db.revision,
  }
}

/** True when a database holds anything worth losing. */
export function hasContent(db: Database): boolean {
  return (
    db.courses.length > 0 ||
    db.assessments.length > 0 ||
    db.themes.length > 0 ||
    db.tasks.length > 0
  )
}
