import { create } from 'zustand'
import type { Database, DatabaseSummary, SyncConflict } from '../types'
import {
  clearCredentials,
  loadCredentials,
  patchCredentials,
  saveCredentials,
  setUploadEnabled,
  uploadEnabled,
  type SyncCredentials,
} from '../lib/github/credentials'
import { ConflictError, fetchDocument, putDocument } from '../lib/github/repo'
import { useStore } from './useStore'
import { toast } from './useToast'

const PUSH_DEBOUNCE_MS = 4000
/** Refetch on refocus only if the last sync is older than this. */
const STALE_MS = 60_000

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'dirty' | 'error'

interface SyncState {
  status: SyncStatus
  lastSyncAt: string | null
  error: string | null
  /** Set when the remote moved underneath us; nothing is written until resolved. */
  conflict: SyncConflict | null

  /** False while this device is read-only: it pulls, but never writes. */
  uploads: boolean
  setUploads: (on: boolean) => void

  configured: () => boolean
  /** Store credentials and adopt the remote copy if there is one. */
  connect: (creds: SyncCredentials) => Promise<void>
  disconnect: () => void

  pull: (opts?: { silent?: boolean }) => Promise<void>
  push: (opts?: { force?: boolean }) => Promise<void>
  /** Called from every store mutation; coalesces into one write per quiet period. */
  schedulePush: () => void
  /** Push now if anything is pending — used when the tab is about to go away. */
  flush: () => void
  resolveConflict: (choice: 'local' | 'remote') => Promise<void>
}

let timer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<void> | null = null
let dirty = false
/**
 * A device must never push before it has seen the remote: a browser that has
 * just been opened holds an empty database, and writing that first would erase
 * the real one.
 */
let pulledThisSession = false
/** The remote copy awaiting a decision, kept out of React state. */
let pendingRemote: { db: Database; sha: string } | null = null

function summarise(db: Database): DatabaseSummary {
  return {
    courses: db.courses.length,
    assessments: db.assessments.length,
    themes: db.themes.length,
    tasks: db.tasks.length,
    updatedAt: db.updatedAt,
    revision: db.revision,
  }
}

function hasContent(db: Database): boolean {
  return (
    db.courses.length > 0 ||
    db.assessments.length > 0 ||
    db.themes.length > 0 ||
    db.tasks.length > 0
  )
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

export const useSync = create<SyncState>()((set, get) => ({
  status: loadCredentials() ? 'idle' : 'off',
  lastSyncAt: loadCredentials()?.lastSyncAt ?? null,
  error: null,
  conflict: null,
  uploads: uploadEnabled(),

  setUploads: (on) => {
    setUploadEnabled(on)
    set({ uploads: on })
    if (on) {
      // Anything edited while read-only is still sitting here unsent.
      if (dirty) get().schedulePush()
      toast.info('This device can now upload to GitHub')
    } else {
      if (timer) clearTimeout(timer)
      timer = null
      set((st) => (st.status === 'dirty' ? { status: 'idle' } : {}))
      toast.info('Uploads off — this device only reads from GitHub')
    }
  },

  configured: () => loadCredentials() !== null,

  connect: async (creds) => {
    saveCredentials(creds)
    set({ status: 'syncing', error: null })
    pulledThisSession = false
    try {
      const remote = await fetchDocument(creds)
      const local = useStore.getState().db

      if (remote && hasContent(remote.db) && hasContent(local)) {
        // Both sides hold real work and this device has never reconciled.
        pendingRemote = remote
        set({ status: 'idle', conflict: { local: summarise(local), remote: summarise(remote.db) } })
        return
      }

      if (remote && hasContent(remote.db)) {
        useStore.getState().replaceDatabase(remote.db)
        patchCredentials({ sha: remote.sha, lastSyncAt: new Date().toISOString() })
        pulledThisSession = true
        set({ status: 'idle', lastSyncAt: new Date().toISOString() })
        toast.success('Loaded your data from GitHub')
        return
      }

      // Nothing useful remotely — seed it from this device, if it may write.
      if (!uploadEnabled()) {
        pulledThisSession = true
        set({ status: 'idle' })
        toast.info('Connected read-only — turn on uploads to back this device up')
        return
      }
      const sha = await putDocument(creds, local, remote?.sha, 'Set up Semestre sync')
      patchCredentials({ sha, lastSyncAt: new Date().toISOString() })
      pulledThisSession = true
      set({ status: 'idle', lastSyncAt: new Date().toISOString() })
      toast.success('Connected — this device is now backed up')
    } catch (err) {
      set({ status: 'error', error: messageOf(err) })
      toast.error(messageOf(err))
    }
  },

  disconnect: () => {
    if (timer) clearTimeout(timer)
    timer = null
    dirty = false
    pulledThisSession = false
    pendingRemote = null
    clearCredentials()
    set({ status: 'off', lastSyncAt: null, error: null, conflict: null })
    toast.info('Sync turned off on this device')
  },

  pull: async (opts) => {
    const creds = loadCredentials()
    if (!creds || get().conflict) return

    set({ status: 'syncing', error: null })
    try {
      const remote = await fetchDocument(creds)
      if (!remote) {
        // Nothing there yet; this device becomes the source.
        pulledThisSession = true
        set({ status: 'idle' })
        return
      }

      const local = useStore.getState().db
      const moved = remote.sha !== creds.sha

      if (dirty) {
        // Unsaved local edits. If the remote also moved we cannot choose; if it
        // did not, keep what is here and let the pending push carry it up.
        // Either way, never overwrite an edit the user just made.
        if (moved) {
          pendingRemote = remote
          set({
            status: 'idle',
            conflict: { local: summarise(local), remote: summarise(remote.db) },
          })
          return
        }
      } else if (moved || !pulledThisSession) {
        useStore.getState().replaceDatabase(remote.db)
      }
      const at = new Date().toISOString()
      patchCredentials({ sha: remote.sha, lastSyncAt: at })
      pulledThisSession = true
      set({ status: 'idle', lastSyncAt: at })
      if (!opts?.silent && moved) toast.success('Updated from GitHub')
    } catch (err) {
      set({ status: 'error', error: messageOf(err) })
      if (!opts?.silent) toast.error(messageOf(err))
    }
  },

  push: async (opts) => {
    const creds = loadCredentials()
    if (!creds || get().conflict) return
    // Read-only device: keep the edit pending so turning uploads on sends it,
    // rather than dropping it on the floor.
    if (!uploadEnabled()) {
      dirty = true
      return
    }
    if (!pulledThisSession && !opts?.force) {
      // Have not seen the remote yet this session — pull first, then retry.
      await get().pull({ silent: true })
      if (!pulledThisSession || get().conflict) return
    }
    if (inFlight) {
      dirty = true
      return
    }

    const run = async () => {
      set({ status: 'syncing', error: null })
      try {
        const db = useStore.getState().db
        const sha = await putDocument(
          loadCredentials() ?? creds,
          db,
          loadCredentials()?.sha,
          `Update ${db.courses.length} courses · ${db.assessments.length} assessments`,
        )
        const at = new Date().toISOString()
        patchCredentials({ sha, lastSyncAt: at })
        dirty = false
        set({ status: 'idle', lastSyncAt: at, error: null })
      } catch (err) {
        if (err instanceof ConflictError) {
          // Someone else wrote since our sha. Fetch theirs and ask.
          try {
            const remote = await fetchDocument(loadCredentials() ?? creds)
            if (remote) {
              pendingRemote = remote
              set({
                status: 'idle',
                conflict: {
                  local: summarise(useStore.getState().db),
                  remote: summarise(remote.db),
                },
              })
              return
            }
          } catch {
            // Fall through to the generic error below.
          }
        }
        dirty = true
        set({ status: 'error', error: messageOf(err) })
      }
    }

    inFlight = run()
    await inFlight
    inFlight = null

    // A mutation that landed mid-write still needs saving.
    if (dirty && get().status !== 'error' && !get().conflict) get().schedulePush()
  },

  schedulePush: () => {
    if (!loadCredentials()) return
    dirty = true
    if (!uploadEnabled()) return
    set((s) => (s.status === 'idle' ? { status: 'dirty' } : {}))
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void get().push()
    }, PUSH_DEBOUNCE_MS)
  },

  flush: () => {
    if (!dirty || !loadCredentials() || !uploadEnabled()) return
    if (timer) clearTimeout(timer)
    timer = null
    void get().push()
  },

  resolveConflict: async (choice) => {
    const creds = loadCredentials()
    const remote = pendingRemote
    if (!creds) return

    set({ conflict: null, status: 'syncing' })
    try {
      if (choice === 'remote') {
        if (!remote) throw new Error('That copy is no longer available — sync again.')
        useStore.getState().replaceDatabase(remote.db)
        patchCredentials({ sha: remote.sha, lastSyncAt: new Date().toISOString() })
        dirty = false
        toast.success('Took the copy from GitHub')
      } else {
        if (!uploadEnabled()) {
          throw new Error('Uploads are off on this device — turn them on to push this copy.')
        }
        const sha = await putDocument(
          creds,
          useStore.getState().db,
          remote?.sha ?? creds.sha,
          'Keep this device’s copy',
        )
        patchCredentials({ sha, lastSyncAt: new Date().toISOString() })
        dirty = false
        toast.success('Kept this device and pushed it')
      }
      pendingRemote = null
      pulledThisSession = true
      set({ status: 'idle', lastSyncAt: new Date().toISOString(), error: null })
    } catch (err) {
      set({ status: 'error', error: messageOf(err) })
      toast.error(messageOf(err))
    }
  },
}))

/** True when the last successful sync is old enough to be worth refreshing. */
export function isStale(): boolean {
  const at = useSync.getState().lastSyncAt
  if (!at) return true
  return Date.now() - Date.parse(at) > STALE_MS
}
