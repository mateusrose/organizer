import { create } from 'zustand'

export type FilterKind = 'assessments' | 'themes' | 'classes' | 'study' | 'tasks' | 'external'

export const FILTER_KINDS: { key: FilterKind; label: string }[] = [
  { key: 'assessments', label: 'Deadlines' },
  { key: 'themes', label: 'Themes' },
  { key: 'classes', label: 'Classes' },
  { key: 'study', label: 'Study blocks' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'external', label: 'Google events' },
]

interface Persisted {
  /** null means "every course" — survives adding a new course. */
  courseIds: string[] | null
  hiddenKinds: FilterKind[]
}

export interface FilterState extends Persisted {
  toggleCourse: (id: string) => void
  /** Solo a course: click again to go back to showing everything. */
  onlyCourse: (id: string) => void
  showAllCourses: () => void
  toggleKind: (kind: FilterKind) => void
  reset: () => void
  isCourseVisible: (id?: string) => boolean
  isKindVisible: (kind: FilterKind) => boolean
  /** True when anything at all is filtered out. */
  active: () => boolean
}

const KEY = 'semestre.filters.v1'

// View state, not data: deliberately kept out of the synced database so a phone
// and a laptop can be looking at different things.
function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { courseIds: null, hiddenKinds: [] }
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return {
      courseIds: Array.isArray(parsed.courseIds) ? parsed.courseIds : null,
      hiddenKinds: Array.isArray(parsed.hiddenKinds) ? parsed.hiddenKinds : [],
    }
  } catch {
    return { courseIds: null, hiddenKinds: [] }
  }
}

function save(state: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ courseIds: state.courseIds, hiddenKinds: state.hiddenKinds }))
  } catch {
    // A filter that fails to persist is not worth bothering the user about.
  }
}

export const useFilters = create<FilterState>()((set, get) => ({
  ...load(),

  toggleCourse: (id) =>
    set((s) => {
      const next = s.courseIds === null ? [] : [...s.courseIds]
      // null means everything is on, so the first click turns this one OFF by
      // materialising the full list minus this id — but we do not know the full
      // list here, so callers use onlyCourse for that. From an explicit list we
      // simply toggle membership.
      const i = next.indexOf(id)
      if (i >= 0) next.splice(i, 1)
      else next.push(id)
      const value = { courseIds: next, hiddenKinds: s.hiddenKinds }
      save(value)
      return value
    }),

  onlyCourse: (id) =>
    set((s) => {
      const solo = s.courseIds?.length === 1 && s.courseIds[0] === id
      const value = { courseIds: solo ? null : [id], hiddenKinds: s.hiddenKinds }
      save(value)
      return value
    }),

  showAllCourses: () =>
    set((s) => {
      const value = { courseIds: null, hiddenKinds: s.hiddenKinds }
      save(value)
      return value
    }),

  toggleKind: (kind) =>
    set((s) => {
      const hiddenKinds = s.hiddenKinds.includes(kind)
        ? s.hiddenKinds.filter((k) => k !== kind)
        : [...s.hiddenKinds, kind]
      const value = { courseIds: s.courseIds, hiddenKinds }
      save(value)
      return value
    }),

  reset: () => {
    const value = { courseIds: null, hiddenKinds: [] }
    save(value)
    set(value)
  },

  isCourseVisible: (id) => {
    const { courseIds } = get()
    if (courseIds === null) return true
    if (!id) return true // course-less items are never hidden by a course filter
    return courseIds.includes(id)
  },

  isKindVisible: (kind) => !get().hiddenKinds.includes(kind),

  active: () => {
    const { courseIds, hiddenKinds } = get()
    return courseIds !== null || hiddenKinds.length > 0
  },
}))
