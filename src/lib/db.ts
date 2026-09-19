import { ASSESSMENT_MODES, DB_VERSION, RESOURCE_KINDS } from '../types'
import type {
  ClassEntry,
  LearningResource,
  ThemeResourceRef,
  Course,
  Database,
  Instructor,
  Semester,
  Settings,
  StudyPreferences,
  Theme,
} from '../types'
import { uid } from './id'

export const STORAGE_KEY = 'semestre.db.v1'

export const defaultPreferences = (): StudyPreferences => ({
  windows: [1, 2, 3, 4, 5].map((weekday) => ({
    id: uid('win'),
    weekday: weekday as 1 | 2 | 3 | 4 | 5,
    start: '18:00',
    end: '22:00',
  })),
  maxHoursPerDay: 4,
  weeklyHoursGoal: 20,
  sessionMinutes: 90,
  breakMinutes: 15,
  bufferDays: 1,
  leadTimeHours: 2,
})

export const defaultSettings = (): Settings => ({
  theme: 'dark',
  weekStartsOn: 1,
  gradeScale: { max: 20, passing: 9.5 },
  calendarSyncEnabled: false,
})

/** "2026/27 · 1st semester" — derived from the month so it stays sensible. */
export function defaultSemesterName(now: Date = new Date()): string {
  const month = now.getMonth()
  const year = now.getFullYear()
  const first = month >= 8 || month <= 0 // Sep–Jan
  const startYear = first ? (month === 0 ? year - 1 : year) : year - 1
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')} · ${first ? '1st' : '2nd'} semester`
}

/** Sensible teaching range for a brand-new semester: today → ~18 weeks out. */
export function defaultSemesterRange(now: Date = new Date()): { startsOn: string; endsOn: string } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 18 * 7)
  return { startsOn: start.toISOString(), endsOn: end.toISOString() }
}

export function createSemester(name?: string, now: Date = new Date()): Semester {
  const stamp = now.toISOString()
  return {
    id: uid('sem'),
    name: name ?? defaultSemesterName(now),
    ...defaultSemesterRange(now),
    archived: false,
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export const emptyDatabase = (): Database => {
  const semester = createSemester()
  return {
    version: DB_VERSION,
    semesters: [semester],
    activeSemesterId: semester.id,
    courses: [],
    themes: [],
    assessments: [],
    classes: [],
    studyBlocks: [],
    tasks: [],
    pendingCalendarDeletions: [],
    preferences: defaultPreferences(),
    settings: defaultSettings(),
    revision: 0,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * v1 shape: courses carried a free-text `term` and syllabus units were classes.
 * v2 shape: a course had at most one `instructor`.
 */
/** v5 shape: a theme carried its own copy of each resource. */
interface LegacyTheme extends Omit<Theme, 'resourceRefs'> {
  resources?: LearningResource[]
  resourceRefs?: ThemeResourceRef[]
}

interface LegacyCourse extends Omit<Course, 'semesterId' | 'instructors' | 'resources'> {
  resources?: LearningResource[]
  term?: string
  semesterId?: string
  instructor?: string
  instructors?: (Instructor | string)[]
}

/**
 * Bring a database read from disk or the sync remote up to the current shape. Missing
 * collections are filled in so a partial or older payload never crashes the app.
 */
export function migrate(input: unknown): Database {
  const base = emptyDatabase()
  if (!input || typeof input !== 'object' || Array.isArray(input)) return base
  const raw = input as Partial<Database> & { courses?: LegacyCourse[] }

  const courses = (raw.courses ?? []) as LegacyCourse[]
  let semesters = raw.semesters ?? []
  let themes: LegacyTheme[] = (raw.themes ?? []) as LegacyTheme[]
  let classes = raw.classes ?? []
  let activeSemesterId = raw.activeSemesterId ?? null

  // --- v1 → v2: invent semesters from the old free-text `term` --------------
  if (semesters.length === 0) {
    const stamp = new Date().toISOString()
    const terms = [...new Set(courses.map((c) => c.term?.trim()).filter(Boolean))] as string[]
    const names = terms.length > 0 ? terms : [base.semesters[0].name]

    semesters = names.map((name) => {
      // Bound each semester by the work that actually sits inside it.
      const ids = new Set(courses.filter((c) => (c.term?.trim() ?? names[0]) === name).map((c) => c.id))
      const dates = (raw.assessments ?? [])
        .filter((a) => ids.has(a.courseId))
        .map((a) => new Date(a.dueAt).getTime())
        .filter((t) => Number.isFinite(t))
      const fallback = defaultSemesterRange()
      return {
        id: uid('sem'),
        name,
        startsOn: dates.length ? new Date(Math.min(...dates)).toISOString() : fallback.startsOn,
        endsOn: dates.length ? new Date(Math.max(...dates)).toISOString() : fallback.endsOn,
        archived: false,
        createdAt: stamp,
        updatedAt: stamp,
      }
    })

    const byName = new Map(semesters.map((s) => [s.name, s.id]))
    for (const c of courses) {
      c.semesterId = byName.get(c.term?.trim() ?? names[0]) ?? semesters[0].id
      delete c.term
    }

    // Syllabus units used to be classes of kind 'module' — promote them to
    // themes and spread them evenly across their course's semester.
    const modules = classes.filter((c) => c.kind === 'module')
    if (modules.length > 0) {
      classes = classes.filter((c) => c.kind !== 'module')
      const byCourse = new Map<string, ClassEntry[]>()
      for (const m of modules) {
        byCourse.set(m.courseId, [...(byCourse.get(m.courseId) ?? []), m])
      }
      const promoted: LegacyTheme[] = []
      for (const [courseId, list] of byCourse) {
        const course = courses.find((c) => c.id === courseId)
        const semester = semesters.find((s) => s.id === course?.semesterId) ?? semesters[0]
        const spans = spreadDateRange(list.length, semester.startsOn, semester.endsOn)
        list.forEach((m, i) => {
          promoted.push({
            id: uid('thm'),
            courseId,
            title: m.title,
            order: i,
            startsOn: spans[i].startsOn,
            endsOn: spans[i].endsOn,
            status: m.completed ? 'done' : 'not-started',
            todos: [],
            resources: m.url ? [{ id: uid('res'), title: m.title, kind: 'link' as const, url: m.url }] : [],
            resourceRefs: [],
            createdAt: m.createdAt,
            updatedAt: stamp,
          })
        })
      }
      themes = [...themes, ...promoted]
    }
  }

  if (semesters.length === 0) semesters = base.semesters
  if (!activeSemesterId || !semesters.some((s) => s.id === activeSemesterId)) {
    // Prefer the semester covering today, else the most recently started one.
    const nowMs = Date.now()
    const live = semesters.find(
      (s) => new Date(s.startsOn).getTime() <= nowMs && nowMs <= new Date(s.endsOn).getTime(),
    )
    const newest = [...semesters].sort(
      (a, b) => new Date(b.startsOn).getTime() - new Date(a.startsOn).getTime(),
    )[0]
    activeSemesterId = (live ?? newest ?? semesters[0]).id
  }

  // Tasks are course-scoped now. A legacy task without one adopts the first
  // course of the active semester rather than being dropped; if the database has
  // no courses at all it keeps an empty id and the Tasks page asks for one.
  const tasks = (raw.tasks ?? []).map((t) => {
    if (t.courseId) return t
    const fallback = courses.find((c) => c.semesterId === activeSemesterId) ?? courses[0]
    return { ...t, courseId: fallback?.id ?? '' }
  })

  // Any course left without a semester joins the active one rather than vanishing.
  const known = new Set(semesters.map((s) => s.id))
  for (const c of courses) {
    if (!c.semesterId || !known.has(c.semesterId)) c.semesterId = activeSemesterId
  }

  // Assessments written before the mode existed are individual, which is what
  // the field defaults to anyway.
  const assessments = (raw.assessments ?? []).map((a) => ({
    ...a,
    mode: ASSESSMENT_MODES.includes(a.mode) ? a.mode : ('individual' as const),
  }))

  // A theme's checklist is a collection the UI maps over, so it has to exist even
  // on a payload written before it did.
  themes = themes.map((t) => ({
    ...t,
    todos: Array.isArray(t.todos) ? t.todos : [],
  }))

  // --- v5 → v6: resources belong to the course, themes point at them --------
  // A book serves several themes, so each theme used to hold its own copy of it.
  // Lift every copy onto the owning course, merging duplicates, and leave the
  // theme holding a reference. Nothing the student typed is thrown away.
  const resourcesByCourse = new Map<string, LearningResource[]>()
  for (const c of courses) {
    const own = Array.isArray(c.resources) ? c.resources : []
    resourcesByCourse.set(c.id, own.filter((r) => r && r.title))
  }

  // Two rows are the same thing when they point at the same link. Without a link
  // on both sides the title has to decide, or "K&R" typed with a url and "k&r"
  // typed without one survive as two rows that read identically on screen.
  const norm = (v?: string) => (v ?? '').trim().toLowerCase()
  const sameThing = (a: { title?: string; url?: string }, b: { title?: string; url?: string }) => {
    const [au, bu] = [norm(a.url), norm(b.url)]
    return au && bu ? au === bu : norm(a.title) === norm(b.title)
  }

  themes = themes.map((t) => {
    const legacy = Array.isArray(t.resources) ? t.resources : []
    const shelf = resourcesByCourse.get(t.courseId)
    const { resources: _dropped, ...rest } = t
    // A theme whose course is gone keeps nothing to point at.
    if (!shelf) return { ...rest, resourceRefs: [] }

    const refs: ThemeResourceRef[] = Array.isArray(t.resourceRefs) ? [...t.resourceRefs] : []
    for (const raw of legacy) {
      const title = (raw?.title ?? '').trim()
      if (!title) continue
      let landed = shelf.find((r) => sameThing(r, raw))
      if (!landed) {
        landed = {
          id: raw.id || uid('res'),
          title,
          kind: RESOURCE_KINDS.includes(raw.kind) ? raw.kind : 'reading',
          url: (raw.url ?? '').trim() || undefined,
        }
        shelf.push(landed)
      } else if (!landed.url && (raw.url ?? '').trim()) {
        // One copy carried the link and another did not; keep the link.
        landed.url = (raw.url ?? '').trim()
      }
      if (!refs.some((ref) => ref.resourceId === landed.id)) {
        refs.push({ resourceId: landed.id })
      }
    }
    return { ...rest, resourceRefs: refs }
  })

  for (const c of courses) c.resources = resourcesByCourse.get(c.id) ?? []

  // A ref to something no longer on the shelf — deleted, or left behind when the
  // theme moved course — would render as a blank row, so drop it here.
  themes = themes.map((t) => {
    const ids = new Set((resourcesByCourse.get(t.courseId) ?? []).map((r) => r.id))
    const refs = t.resourceRefs ?? []
    const kept = refs.filter((ref) => ids.has(ref.resourceId))
    return kept.length === refs.length ? t : { ...t, resourceRefs: kept }
  })

  // --- v2 → v3: several people teach a course, each with a role -------------
  for (const c of courses) {
    const legacy = Array.isArray(c.instructors)
      ? c.instructors
      : c.instructor
        ? [c.instructor]
        : []
    // A lone pre-v3 name was always the course's main teacher.
    c.instructors = legacy
      .map((entry) =>
        typeof entry === 'string'
          ? { name: entry.trim(), role: 'docente' as const }
          : { name: entry.name.trim(), role: entry.role },
      )
      .filter((i) => i.name)
    delete c.instructor
  }

  return {
    ...base,
    ...raw,
    version: DB_VERSION,
    semesters,
    activeSemesterId,
    courses: courses as Course[],
    themes: themes as Theme[],
    assessments,
    classes,
    studyBlocks: raw.studyBlocks ?? [],
    tasks,
    pendingCalendarDeletions: raw.pendingCalendarDeletions ?? [],
    preferences: { ...base.preferences, ...(raw.preferences ?? {}) },
    settings: {
      ...base.settings,
      ...(raw.settings ?? {}),
      gradeScale: { ...base.settings.gradeScale, ...(raw.settings?.gradeScale ?? {}) },
    },
    revision: raw.revision ?? 0,
  }
}

/** Split [startsOn, endsOn] into `count` consecutive whole-day spans. */
export function spreadDateRange(
  count: number,
  startsOn: string,
  endsOn: string,
): { startsOn: string; endsOn: string }[] {
  if (count <= 0) return []
  const start = new Date(startsOn)
  start.setHours(0, 0, 0, 0)
  const end = new Date(endsOn)
  end.setHours(0, 0, 0, 0)
  const DAY = 86_400_000
  const totalDays = Math.max(count, Math.round((end.getTime() - start.getTime()) / DAY) + 1)

  return Array.from({ length: count }, (_, i) => {
    const from = new Date(start)
    from.setDate(from.getDate() + Math.floor((i * totalDays) / count))
    const to = new Date(start)
    to.setDate(to.getDate() + Math.floor(((i + 1) * totalDays) / count) - 1)
    if (to < from) to.setTime(from.getTime())
    return { startsOn: from.toISOString(), endsOn: to.toISOString() }
  })
}

/** True when the payload plausibly is a Semestre backup, not just any JSON. */
export function looksLikeBackup(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const raw = input as Partial<Database>
  if (typeof raw.version !== 'number') return false
  return (
    Array.isArray(raw.courses) || Array.isArray(raw.assessments) || Array.isArray(raw.tasks)
  )
}

export function loadDatabase(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDatabase()
    return migrate(JSON.parse(raw))
  } catch {
    return emptyDatabase()
  }
}

export function saveDatabase(db: Database): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
    return { ok: true }
  } catch (err) {
    // Quota exhausted, or storage blocked in a private window. The caller must
    // surface this — silently losing writes is worse than a loud failure.
    console.error('[semestre] failed to persist database', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Storage unavailable' }
  }
}
