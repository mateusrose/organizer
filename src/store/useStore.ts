import { create } from 'zustand'
import type {
  Assessment,
  ClassEntry,
  Course,
  Database,
  PendingEventDeletion,
  Semester,
  Settings,
  StudyBlock,
  StudyPreferences,
  Task,
  Theme,
} from '../types'
import {
  createSemester,
  emptyDatabase,
  loadDatabase,
  migrate,
  saveDatabase,
  spreadDateRange,
} from '../lib/db'
import { uid } from '../lib/id'

type Stamped = 'id' | 'createdAt' | 'updatedAt'
export type NewSemester = Omit<Semester, Stamped | 'archived'> & { archived?: boolean }
export type NewCourse = Omit<Course, Stamped | 'archived' | 'semesterId'> & {
  archived?: boolean
  /** Defaults to the active semester. */
  semesterId?: string
}
export type NewTheme = Omit<Theme, Stamped | 'status' | 'order'> & {
  status?: Theme['status']
  order?: number
}
export type NewAssessment = Omit<Assessment, Stamped>
export type NewClass = Omit<ClassEntry, Stamped | 'completed'> & { completed?: boolean }
export type NewStudyBlock = Omit<StudyBlock, Stamped | 'auto'> & { auto?: boolean }
export type NewTask = Omit<Task, Stamped | 'done' | 'tags'> & { done?: boolean; tags?: string[] }

export interface AppState {
  db: Database
  /** Set when the last write to localStorage failed (quota, private window). */
  storageError: string | null

  addSemester: (input?: Partial<NewSemester>) => Semester
  updateSemester: (id: string, patch: Partial<Semester>) => void
  /** Deletes the semester and everything scoped to it. */
  deleteSemester: (id: string) => void
  setActiveSemester: (id: string) => void

  addTheme: (input: NewTheme) => Theme
  updateTheme: (id: string, patch: Partial<Theme>) => void
  deleteTheme: (id: string) => void
  /** Rewrites the dates of a course's themes to tile the given range evenly. */
  spreadThemes: (courseId: string, startsOn: string, endsOn: string) => void
  /** Reorders one course's themes, renumbering `order` to match. */
  reorderThemes: (courseId: string, orderedIds: string[]) => void

  addCourse: (input: NewCourse) => Course
  updateCourse: (id: string, patch: Partial<Course>) => void
  deleteCourse: (id: string) => void

  addAssessment: (input: NewAssessment) => Assessment
  updateAssessment: (id: string, patch: Partial<Assessment>) => void
  deleteAssessment: (id: string) => void

  addClass: (input: NewClass) => ClassEntry
  updateClass: (id: string, patch: Partial<ClassEntry>) => void
  deleteClass: (id: string) => void

  addStudyBlock: (input: NewStudyBlock) => StudyBlock
  updateStudyBlock: (id: string, patch: Partial<StudyBlock>) => void
  deleteStudyBlock: (id: string) => void
  /** Swap every auto-generated block for a freshly planned set. */
  replaceAutoBlocks: (blocks: NewStudyBlock[]) => void
  clearAutoBlocks: () => void

  addTask: (input: NewTask) => Task
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  toggleTask: (id: string) => void

  updatePreferences: (patch: Partial<StudyPreferences>) => void
  updateSettings: (patch: Partial<Settings>) => void

  /** Drained by the calendar sync so orphaned remote events get cleaned up. */
  queueEventDeletion: (entry: PendingEventDeletion) => void
  clearPendingDeletions: (entries: PendingEventDeletion[]) => void

  /** Replace the whole database (sync pull, JSON import, sample data). */
  replaceDatabase: (db: unknown) => void
  resetDatabase: () => void
}

const now = () => new Date().toISOString()

/**
 * Late-bound to avoid an import cycle: useSync imports this store to read the
 * database, so it cannot be imported at module scope here.
 */
let backup: (() => void) | null = null
export function registerBackup(fn: () => void) {
  backup = fn
}
const scheduleBackup = () => backup?.()

/** Remember a remote event that must be deleted on the next calendar sync. */
function queueDeletion(db: Database, eventId: string) {
  const calendarId = db.settings.studyCalendarId
  if (!calendarId) return
  if (db.pendingCalendarDeletions.some((p) => p.eventId === eventId)) return
  db.pendingCalendarDeletions = [...db.pendingCalendarDeletions, { calendarId, eventId }]
}

export const useStore = create<AppState>()((set, get) => {
  /** Apply `fn` to a shallow clone of the db, bump revision, persist. */
  const commit = (fn: (db: Database) => void) => {
    set((state) => {
      const db: Database = {
        ...state.db,
        semesters: [...state.db.semesters],
        courses: [...state.db.courses],
        themes: [...state.db.themes],
        assessments: [...state.db.assessments],
        classes: [...state.db.classes],
        studyBlocks: [...state.db.studyBlocks],
        tasks: [...state.db.tasks],
      }
      fn(db)
      db.revision += 1
      db.updatedAt = now()
      const result = saveDatabase(db)
      return { db, storageError: result.ok ? null : (result.error ?? 'Storage unavailable') }
    })
    // Every mutation funnels through here, so hooking the backup in at this one
    // point means a new action can never forget to sync. Navigation and
    // filtering never call commit, so browsing writes nothing.
    scheduleBackup()
  }

  const patchIn = <T extends { id: string; updatedAt: string }>(
    list: T[],
    id: string,
    patch: Partial<T>,
  ): T[] => list.map((it) => (it.id === id ? { ...it, ...patch, id, updatedAt: now() } : it))

  return {
    db: loadDatabase(),
    storageError: null,

    // --- semesters --------------------------------------------------------
    addSemester: (input) => {
      const semester: Semester = { ...createSemester(input?.name), ...input, id: uid('sem') }
      commit((db) => {
        db.semesters.push(semester)
        db.activeSemesterId = semester.id
      })
      return semester
    },
    updateSemester: (id, patch) =>
      commit((db) => {
        db.semesters = patchIn(db.semesters, id, patch)
      }),
    deleteSemester: (id) =>
      commit((db) => {
        const courseIds = new Set(db.courses.filter((c) => c.semesterId === id).map((c) => c.id))
        for (const a of db.assessments) {
          if (courseIds.has(a.courseId) && a.calendarEventId) queueDeletion(db, a.calendarEventId)
        }
        for (const b of db.studyBlocks) {
          if (b.courseId && courseIds.has(b.courseId) && b.calendarEventId) {
            queueDeletion(db, b.calendarEventId)
          }
        }
        db.semesters = db.semesters.filter((s) => s.id !== id)
        db.courses = db.courses.filter((c) => c.semesterId !== id)
        db.themes = db.themes.filter((t) => !courseIds.has(t.courseId))
        db.assessments = db.assessments.filter((a) => !courseIds.has(a.courseId))
        db.classes = db.classes.filter((c) => !courseIds.has(c.courseId))
        db.studyBlocks = db.studyBlocks.filter((b) => !b.courseId || !courseIds.has(b.courseId))
        db.tasks = db.tasks.filter((t) => !courseIds.has(t.courseId))
        if (db.activeSemesterId === id) {
          db.activeSemesterId = db.semesters[0]?.id ?? null
        }
      }),
    setActiveSemester: (id) =>
      commit((db) => {
        if (db.semesters.some((s) => s.id === id)) db.activeSemesterId = id
      }),

    // --- themes -----------------------------------------------------------
    addTheme: (input) => {
      const siblings = get().db.themes.filter((t) => t.courseId === input.courseId)
      const theme: Theme = {
        status: 'not-started',
        order: siblings.length,
        ...input,
        id: uid('thm'),
        createdAt: now(),
        updatedAt: now(),
      }
      commit((db) => {
        db.themes.push(theme)
      })
      return theme
    },
    updateTheme: (id, patch) =>
      commit((db) => {
        db.themes = patchIn(db.themes, id, patch)
      }),
    deleteTheme: (id) =>
      commit((db) => {
        db.themes = db.themes.filter((t) => t.id !== id)
      }),
    spreadThemes: (courseId, startsOn, endsOn) =>
      commit((db) => {
        const mine = db.themes
          .filter((t) => t.courseId === courseId)
          .sort((a, b) => a.order - b.order)
        const spans = spreadDateRange(mine.length, startsOn, endsOn)
        const byId = new Map(mine.map((t, i) => [t.id, spans[i]]))
        db.themes = db.themes.map((t) => {
          const span = byId.get(t.id)
          return span ? { ...t, ...span, updatedAt: now() } : t
        })
      }),
    reorderThemes: (courseId, orderedIds) =>
      commit((db) => {
        const rank = new Map(orderedIds.map((id, i) => [id, i]))
        db.themes = db.themes.map((t) =>
          t.courseId === courseId && rank.has(t.id)
            ? { ...t, order: rank.get(t.id)!, updatedAt: now() }
            : t,
        )
      }),

    // --- courses ----------------------------------------------------------
    addCourse: (input) => {
      const course: Course = {
        archived: false,
        semesterId: get().db.activeSemesterId ?? get().db.semesters[0]?.id ?? '',
        ...input,
        id: uid('crs'),
        createdAt: now(),
        updatedAt: now(),
      }
      commit((db) => {
        db.courses.push(course)
      })
      return course
    },
    updateCourse: (id, patch) =>
      commit((db) => {
        db.courses = patchIn(db.courses, id, patch)
      }),
    deleteCourse: (id) =>
      commit((db) => {
        for (const a of db.assessments) {
          if (a.courseId === id && a.calendarEventId) queueDeletion(db, a.calendarEventId)
        }
        for (const b of db.studyBlocks) {
          if (b.courseId === id && b.calendarEventId) queueDeletion(db, b.calendarEventId)
        }
        db.courses = db.courses.filter((c) => c.id !== id)
        db.themes = db.themes.filter((t) => t.courseId !== id)
        db.assessments = db.assessments.filter((a) => a.courseId !== id)
        db.classes = db.classes.filter((c) => c.courseId !== id)
        db.studyBlocks = db.studyBlocks.filter((b) => b.courseId !== id)
        db.tasks = db.tasks.filter((t) => t.courseId !== id)
      }),

    // --- assessments ------------------------------------------------------
    addAssessment: (input) => {
      const item: Assessment = { ...input, id: uid('ass'), createdAt: now(), updatedAt: now() }
      commit((db) => {
        db.assessments.push(item)
      })
      return item
    },
    updateAssessment: (id, patch) =>
      commit((db) => {
        db.assessments = patchIn(db.assessments, id, patch)
      }),
    deleteAssessment: (id) =>
      commit((db) => {
        const gone = db.assessments.find((a) => a.id === id)
        if (gone?.calendarEventId) queueDeletion(db, gone.calendarEventId)
        for (const b of db.studyBlocks) {
          if (b.assessmentId === id && b.calendarEventId) queueDeletion(db, b.calendarEventId)
        }
        db.assessments = db.assessments.filter((a) => a.id !== id)
        db.studyBlocks = db.studyBlocks.filter((b) => b.assessmentId !== id)
        db.tasks = db.tasks.map((t) =>
          t.assessmentId === id ? { ...t, assessmentId: undefined } : t,
        )
      }),

    // --- classes ----------------------------------------------------------
    addClass: (input) => {
      const item: ClassEntry = {
        completed: false,
        ...input,
        id: uid('cls'),
        createdAt: now(),
        updatedAt: now(),
      }
      commit((db) => {
        db.classes.push(item)
      })
      return item
    },
    updateClass: (id, patch) =>
      commit((db) => {
        db.classes = patchIn(db.classes, id, patch)
      }),
    deleteClass: (id) =>
      commit((db) => {
        db.classes = db.classes.filter((c) => c.id !== id)
      }),

    // --- study blocks -----------------------------------------------------
    addStudyBlock: (input) => {
      const item: StudyBlock = {
        auto: false,
        ...input,
        id: uid('blk'),
        createdAt: now(),
        updatedAt: now(),
      }
      commit((db) => {
        db.studyBlocks.push(item)
      })
      return item
    },
    updateStudyBlock: (id, patch) =>
      commit((db) => {
        db.studyBlocks = patchIn(db.studyBlocks, id, patch)
      }),
    deleteStudyBlock: (id) =>
      commit((db) => {
        const gone = db.studyBlocks.find((b) => b.id === id)
        if (gone?.calendarEventId) queueDeletion(db, gone.calendarEventId)
        db.studyBlocks = db.studyBlocks.filter((b) => b.id !== id)
      }),
    replaceAutoBlocks: (blocks) =>
      commit((db) => {
        // Keep manual blocks and anything already completed — only pending
        // auto-planned blocks are regenerated.
        for (const b of db.studyBlocks) {
          if (b.auto && b.status === 'planned' && b.calendarEventId) queueDeletion(db, b.calendarEventId)
        }
        db.studyBlocks = [
          ...db.studyBlocks.filter((b) => !b.auto || b.status !== 'planned'),
          ...blocks.map((b) => ({
            auto: true,
            ...b,
            id: uid('blk'),
            createdAt: now(),
            updatedAt: now(),
          })),
        ]
      }),
    clearAutoBlocks: () =>
      commit((db) => {
        for (const b of db.studyBlocks) {
          if (b.auto && b.status === 'planned' && b.calendarEventId) queueDeletion(db, b.calendarEventId)
        }
        db.studyBlocks = db.studyBlocks.filter((b) => !b.auto || b.status !== 'planned')
      }),

    // --- tasks ------------------------------------------------------------
    addTask: (input) => {
      const item: Task = {
        done: false,
        tags: [],
        ...input,
        id: uid('tsk'),
        createdAt: now(),
        updatedAt: now(),
      }
      commit((db) => {
        db.tasks.push(item)
      })
      return item
    },
    updateTask: (id, patch) =>
      commit((db) => {
        db.tasks = patchIn(db.tasks, id, patch)
      }),
    deleteTask: (id) =>
      commit((db) => {
        db.tasks = db.tasks.filter((t) => t.id !== id)
      }),
    toggleTask: (id) =>
      commit((db) => {
        db.tasks = db.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                done: !t.done,
                completedAt: !t.done ? now() : undefined,
                updatedAt: now(),
              }
            : t,
        )
      }),

    // --- preferences ------------------------------------------------------
    updatePreferences: (patch) =>
      commit((db) => {
        db.preferences = { ...db.preferences, ...patch }
      }),
    updateSettings: (patch) =>
      commit((db) => {
        db.settings = { ...db.settings, ...patch }
      }),

    queueEventDeletion: (entry) =>
      commit((db) => {
        if (!db.pendingCalendarDeletions.some((p) => p.eventId === entry.eventId)) {
          db.pendingCalendarDeletions = [...db.pendingCalendarDeletions, entry]
        }
      }),
    clearPendingDeletions: (entries) =>
      commit((db) => {
        const done = new Set(entries.map((e) => e.eventId))
        db.pendingCalendarDeletions = db.pendingCalendarDeletions.filter((p) => !done.has(p.eventId))
      }),

    // --- whole database ---------------------------------------------------
    replaceDatabase: (input) => {
      const db = migrate(input)
      // The revision must never move backwards: a restored older export would
      // otherwise lose to the remote on the next sync and silently undo the import.
      db.revision = Math.max(get().db.revision, db.revision) + 1
      db.updatedAt = now()
      const result = saveDatabase(db)
      set({ db, storageError: result.ok ? null : (result.error ?? 'Storage unavailable') })
    },
    resetDatabase: () => {
      const db = emptyDatabase()
      // Same reasoning: a wipe has to out-rank whatever is sitting remotely.
      db.revision = get().db.revision + 1
      const result = saveDatabase(db)
      set({ db, storageError: result.ok ? null : (result.error ?? 'Storage unavailable') })
    },
  }
})

// Convenience selectors. Each returns a value that only changes identity when
// the database actually changes, so they are safe to use directly.
//
// NOTE: these are UNSCOPED — they span every semester. Pages should almost
// always use `useScope()` from './scope' instead, which narrows everything to
// the active semester.
export const useDb = () => useStore((s) => s.db)
export const useAllSemesters = () => useStore((s) => s.db.semesters)
export const useAllCourses = () => useStore((s) => s.db.courses)
export const useAllThemes = () => useStore((s) => s.db.themes)
export const useAllAssessments = () => useStore((s) => s.db.assessments)
export const useAllClasses = () => useStore((s) => s.db.classes)
export const useAllStudyBlocks = () => useStore((s) => s.db.studyBlocks)
export const useAllTasks = () => useStore((s) => s.db.tasks)
export const usePreferences = () => useStore((s) => s.db.preferences)
export const useSettings = () => useStore((s) => s.db.settings)
export const useStorageError = () => useStore((s) => s.storageError)
