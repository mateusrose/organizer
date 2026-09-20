// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

export type ISODate = string // "2026-03-14T15:00:00.000Z"
export type TimeOfDay = string // "09:30"
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sunday

export const COURSE_COLORS = [
  'violet',
  'sky',
  'emerald',
  'amber',
  'rose',
  'cyan',
  'fuchsia',
  'lime',
  'orange',
  'indigo',
] as const
export type CourseColor = (typeof COURSE_COLORS)[number]

export interface Semester {
  id: string
  /** Display name, e.g. "2026/27 · 1st semester". */
  name: string
  /** Local-midnight ISO for the first and last day of teaching. */
  startsOn: ISODate
  endsOn: ISODate
  archived: boolean
  createdAt: ISODate
  updatedAt: ISODate
}

export const INSTRUCTOR_ROLES = ['docente', 'tutor'] as const
export type InstructorRole = (typeof INSTRUCTOR_ROLES)[number]

export const INSTRUCTOR_ROLE_LABEL: Record<InstructorRole, string> = {
  docente: 'Docente',
  tutor: 'Tutor',
}

/** One member of a course's teaching staff. */
export interface Instructor {
  name: string
  role: InstructorRole
}

export interface Course {
  id: string
  name: string
  code: string
  color: CourseColor
  ects: number
  /** Owning semester. Everything in the app is scoped through this. */
  semesterId: string
  /** Teaching staff, in the order the student wants to see them. */
  instructors: Instructor[]
  /** Everything to read or watch for this course. Themes point at these. */
  resources: LearningResource[]
  /** Target final grade on the configured scale. */
  targetGrade?: number
  /** Course homepage / Moodle link. */
  url?: string
  notes?: string
  archived: boolean
  createdAt: ISODate
  updatedAt: ISODate
}

export type ThemeStatus = 'not-started' | 'in-progress' | 'done'

/**
 * A unit of course content — the syllabus topic you are meant to be working
 * through in a given stretch of the semester. Themes are laid out as bands on
 * the calendar so the student always knows what they *should* be studying now,
 * independently of any task or deadline.
 */
/** One checkable step of the work a theme asks for. */
export interface ThemeTodo {
  id: string
  text: string
  done: boolean
}

export const RESOURCE_KINDS = ['reading', 'video', 'slides', 'exercise', 'link'] as const
export type ResourceKind = (typeof RESOURCE_KINDS)[number]

export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  reading: 'Reading',
  video: 'Video',
  slides: 'Slides',
  exercise: 'Exercises',
  link: 'Link',
}

/** How far through a resource the student is. */
export interface ResourceProgress {
  /** Units done so far. */
  current: number
  /** The whole, when it is known. Without it there is a count but no bar. */
  total?: number
  /** What is being counted: pages, chapters, videos, exercises. */
  unit: string
}

/**
 * Something to read, watch or work through. Owned by the course — a book serves
 * several themes, and progress through it only makes sense in one place.
 */
export interface LearningResource {
  id: string
  title: string
  kind: ResourceKind
  url?: string
  progress?: ResourceProgress
  /** What a number cannot hold — "skipped ch. 4, redo later". */
  progressNote?: string
  /** Notes written elsewhere: a tablet app, Obsidian, a shared doc. */
  notesUrl?: string
  /** Where the notes are when they are not a link — "Notebook 2, p.14". */
  notesLocation?: string
}

/** A course resource a theme uses, narrowed to the part that theme needs. */
export interface ThemeResourceRef {
  resourceId: string
  /** "chapters 5-6 only" — what this theme wants out of it. */
  detail?: string
}

export interface Theme {
  id: string
  courseId: string
  title: string
  /** Position in the syllabus, 0-based. Drives auto-spreading. */
  order: number
  /** Local-midnight ISO. A theme occupies whole days, inclusive of endsOn. */
  startsOn: ISODate
  endsOn: ISODate
  status: ThemeStatus
  description?: string
  /** The unit's own page — a Moodle section or course chapter. */
  url?: string
  /**
   * The assessment this unit feeds, chosen by the student. The theme owns the
   * date range the work happens in; the assessment keeps only its own deadline.
   */
  assessmentId?: string
  /** The work itself, as checkable points. */
  todos: ThemeTodo[]
  /** Which of the course's resources this theme uses, and for what. */
  resourceRefs: ThemeResourceRef[]
  createdAt: ISODate
  updatedAt: ISODate
}

export type AssessmentKind =
  | 'assignment'
  | 'exam'
  | 'quiz'
  | 'project'
  | 'presentation'
  | 'lab'
  | 'reading'

export type AssessmentStatus = 'todo' | 'in-progress' | 'submitted' | 'graded'

/**
 * How the assessment is sat: alone, with a group, or through Wiseflow, the
 * digital exam platform — which says as much about how you prepare as the kind does.
 */
export const ASSESSMENT_MODES = ['individual', 'group', 'wiseflow'] as const
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number]

export const ASSESSMENT_MODE_LABEL: Record<AssessmentMode, string> = {
  individual: 'Individual',
  group: 'Group',
  wiseflow: 'Wiseflow',
}

/**
 * Kinds that run over a stretch of days rather than landing on one. Only these
 * offer a start date; everything else is just its deadline.
 */
export const RANGED_ASSESSMENT_KINDS = ['assignment', 'project'] as const

export function hasDateRange(kind: AssessmentKind): boolean {
  return (RANGED_ASSESSMENT_KINDS as readonly AssessmentKind[]).includes(kind)
}

export interface Assessment {
  id: string
  courseId: string
  title: string
  kind: AssessmentKind
  /** Worked alone or as a group. Most work is individual, so that is the default. */
  mode: AssessmentMode
  /**
   * When the work opens, for the kinds that run over days. Undefined means the
   * assessment is only its deadline.
   */
  startsAt?: ISODate
  dueAt: ISODate
  /**
   * Share of the final course grade, in points on the course scale — a course
   * worth 20 might split 4 / 4 / 12. Its assessments should sum to `scale.max`.
   */
  points: number
  /** Student estimate of total work, in hours. Drives the study planner. */
  estimatedHours: number
  status: AssessmentStatus
  /** Percentage achieved (0–100) once status === 'graded'. */
  score?: number
  description?: string
  url?: string
  /** Id of the mirrored event in Google Calendar, when synced. */
  calendarEventId?: string
  createdAt: ISODate
  updatedAt: ISODate
}

export type ClassKind = 'lecture' | 'lab' | 'seminar' | 'office-hours' | 'module'

/**
 * A scheduled course activity. Async courses mostly use `kind: 'module'` with
 * `recurrence: 'once'` — a unit that unlocks on a date and must be finished by
 * another. Live courses use weekly recurrence.
 */
export interface ClassEntry {
  id: string
  courseId: string
  title: string
  kind: ClassKind
  recurrence: 'weekly' | 'once'
  /** recurrence === 'weekly' */
  weekday?: Weekday
  startTime?: TimeOfDay
  endTime?: TimeOfDay
  /** recurrence === 'once' */
  startsAt?: ISODate
  endsAt?: ISODate
  location?: string
  /** Recording / live-session link. */
  url?: string
  /** Async modules are checkable. */
  completed: boolean
  createdAt: ISODate
  updatedAt: ISODate
}

export type StudyBlockStatus = 'planned' | 'done' | 'skipped'

export interface StudyBlock {
  id: string
  title: string
  courseId?: string
  assessmentId?: string
  startsAt: ISODate
  endsAt: ISODate
  status: StudyBlockStatus
  /** True when generated by the auto-planner (safe to regenerate/discard). */
  auto: boolean
  calendarEventId?: string
  createdAt: ISODate
  updatedAt: ISODate
}

export type Priority = 'low' | 'medium' | 'high'

export interface Task {
  id: string
  title: string
  /** Every task belongs to a course — that is what scopes it to a semester. */
  courseId: string
  assessmentId?: string
  dueAt?: ISODate
  priority: Priority
  done: boolean
  tags: string[]
  createdAt: ISODate
  updatedAt: ISODate
  completedAt?: ISODate
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/** A recurring window of the week the student is free to study. */
export interface AvailabilityWindow {
  id: string
  weekday: Weekday
  start: TimeOfDay
  end: TimeOfDay
}

export interface StudyPreferences {
  windows: AvailabilityWindow[]
  /** Hard cap on planned study hours per calendar day. */
  maxHoursPerDay: number
  /** Target study hours per week, used for the dashboard progress ring. */
  weeklyHoursGoal: number
  /** Length of one generated study block, in minutes. */
  sessionMinutes: number
  /** Gap inserted between two generated blocks, in minutes. */
  breakMinutes: number
  /** Finish planned work this many days before the deadline. */
  bufferDays: number
  /** Do not schedule blocks starting sooner than this many hours from now. */
  leadTimeHours: number
}

export interface GradeScale {
  /** Maximum final grade, e.g. 20 (PT) or 100. Assessment points sum to this. */
  max: number
  /** Minimum passing final grade on the same scale. */
  passing: number
}

export interface Settings {
  theme: 'dark' | 'light'
  weekStartsOn: 0 | 1
  gradeScale: GradeScale
  /** Google OAuth client id, entered by the user at runtime. */
  googleClientId?: string
  /**
   * The Google Calendar the user chose for deadlines. The app writes nowhere
   * else and never creates one; unset means nothing is pushed.
   */
  studyCalendarId?: string
  /** Mirror assessment deadlines into Google Calendar. */
  calendarSyncEnabled: boolean
}

// ---------------------------------------------------------------------------
// Persisted database
// ---------------------------------------------------------------------------

export const DB_VERSION = 6

/** A calendar event this app wrote that still needs deleting remotely. */
export interface PendingEventDeletion {
  calendarId: string
  eventId: string
}

export interface Database {
  version: number
  semesters: Semester[]
  /** Semester currently in view. Null only when none exist yet. */
  activeSemesterId: string | null
  courses: Course[]
  themes: Theme[]
  assessments: Assessment[]
  classes: ClassEntry[]
  studyBlocks: StudyBlock[]
  tasks: Task[]
  /**
   * Events we mirrored to Google whose local row has since been deleted or
   * regenerated. Drained by the next calendar sync so re-planning cannot leave
   * orphaned duplicates behind.
   */
  pendingCalendarDeletions: PendingEventDeletion[]
  preferences: StudyPreferences
  settings: Settings
  /** Monotonic counter bumped on every local mutation; drives sync conflicts. */
  revision: number
  updatedAt: ISODate
}

// ---------------------------------------------------------------------------
// Google integration
// ---------------------------------------------------------------------------

export interface GoogleProfile {
  email: string
  name: string
  picture?: string
}

export interface CalendarEvent {
  id: string
  calendarId: string
  summary: string
  description?: string
  location?: string
  start: ISODate
  end: ISODate
  allDay: boolean
  htmlLink?: string
  colorId?: string
}

/** Enough of a database to tell two copies apart in a chooser. */
export interface DatabaseSummary {
  courses: number
  assessments: number
  themes: number
  tasks: number
  updatedAt: ISODate
  revision: number
}

/**
 * Raised when a device and the remote copy have both moved on and BOTH sides
 * hold real data. Revision is a per-device edit counter, not a clock, so
 * picking a winner automatically can silently destroy the other copy.
 */
export interface SyncConflict {
  local: DatabaseSummary
  remote: DatabaseSummary
}

export type SyncState =
  | { status: 'idle'; lastSyncedAt?: ISODate }
  | { status: 'syncing' }
  | { status: 'error'; message: string; lastSyncedAt?: ISODate }
