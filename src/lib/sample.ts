import { addDays, atTime, startOfDay, toISO } from './date'
import { createSemester, emptyDatabase, spreadDateRange } from './db'
import { uid } from './id'
import { hasDateRange } from '../types'
import type {
  Assessment,
  ClassEntry,
  Course,
  CourseColor,
  Database,
  Instructor,
  LearningResource,
  Task,
  Theme,
  ThemeTodo,
  Weekday,
} from '../types'

/**
 * A realistic semester used by "Load sample data" in Settings, so a new user can
 * see what a filled-in app looks like before typing anything. Every date is
 * relative to `now`, so the sample never looks stale.
 */
export function sampleDatabase(now: Date = new Date()): Database {
  const db = emptyDatabase()
  const stamp = toISO(now)
  const day = (offset: number, time = '23:59') => toISO(atTime(addDays(startOfDay(now), offset), time))

  // A semester already three weeks old, so the sample has history behind it.
  const semester = {
    ...createSemester(undefined, now),
    startsOn: toISO(startOfDay(addDays(now, -28))),
    endsOn: toISO(startOfDay(addDays(now, 56))),
  }
  db.semesters = [semester]
  db.activeSemesterId = semester.id

  const mkCourse = (
    name: string,
    code: string,
    color: CourseColor,
    ects: number,
    instructors: Instructor[],
    targetGrade?: number,
  ): Course => ({
    id: uid('crs'),
    name,
    code,
    color,
    ects,
    semesterId: semester.id,
    instructors,
    targetGrade,
    archived: false,
    createdAt: stamp,
    updatedAt: stamp,
  })

  const calculus = mkCourse('Calculus I', 'MAT101', 'violet', 6, [{ name: 'Prof. Almeida', role: 'docente' }], 15)
  const programming = mkCourse('Imperative Programming', 'PRG102', 'emerald', 6, [{ name: 'Prof. Nunes', role: 'docente' }, { name: 'Eng. Vieira', role: 'tutor' }], 17)
  const linear = mkCourse('Linear Algebra', 'ALG103', 'sky', 6, [{ name: 'Prof. Cardoso', role: 'docente' }])
  const architecture = mkCourse('Computer Architecture', 'ARQ104', 'amber', 6, [{ name: 'Prof. Reis', role: 'docente' }, { name: 'Prof. Matos', role: 'docente' }], 14)
  const english = mkCourse('Technical English', 'ING105', 'rose', 3, [{ name: 'Prof. Santos', role: 'docente' }])

  db.courses = [calculus, programming, linear, architecture, english]

  const mkAssessment = (
    course: Course,
    title: string,
    kind: Assessment['kind'],
    dueOffset: number,
    points: number,
    estimatedHours: number,
    status: Assessment['status'] = 'todo',
    score?: number,
    /** Days before the deadline the work opens, for assignments and projects. */
    opensBefore?: number,
    mode: Assessment['mode'] = 'individual',
  ): Assessment => ({
    id: uid('ass'),
    courseId: course.id,
    title,
    kind,
    mode,
    startsAt:
      opensBefore !== undefined && hasDateRange(kind)
        ? day(dueOffset - opensBefore, '09:00')
        : undefined,
    dueAt: day(dueOffset, kind === 'exam' ? '14:00' : '23:59'),
    points,
    estimatedHours,
    status,
    score,
    createdAt: stamp,
    updatedAt: stamp,
  })

  // Points are slices of each course's 20, scores are percentages of the slice.
  // Calculus and Programming allocate all 20; the rest leave points unassigned
  // so the dashboard's third bar segment has something to show.
  db.assessments = [
    // Already graded — gives the projection something to work with.
    mkAssessment(calculus, 'Continuous assessment 1', 'quiz', -24, 4, 6, 'graded', 68),
    mkAssessment(programming, 'Lab series 1–3', 'lab', -18, 4, 10, 'graded', 85),
    mkAssessment(linear, 'Problem set 1', 'assignment', -11, 2, 5, 'graded', 55, 9),
    mkAssessment(architecture, 'Quiz 1', 'quiz', -9, 2, 4, 'graded', 75),

    // Overdue — the dashboard should shout about this one.
    mkAssessment(english, 'Reading report: technical writing', 'reading', -2, 3, 3),

    // The live pipeline.
    mkAssessment(linear, 'Problem set 2', 'assignment', 3, 3, 6, 'todo', undefined, 10),
    mkAssessment(programming, 'Project: inventory CLI', 'project', 9, 6, 22, 'in-progress', undefined, 28, 'group'),
    mkAssessment(calculus, 'Continuous assessment 2', 'quiz', 12, 4, 8),
    mkAssessment(architecture, 'Assembly lab report', 'lab', 16, 4, 9),
    mkAssessment(english, 'Oral presentation', 'presentation', 21, 5, 6, 'todo', undefined, undefined, 'group'),

    // Exams at the end of the semester.
    mkAssessment(calculus, 'Final exam', 'exam', 38, 12, 30),
    mkAssessment(programming, 'Final exam', 'exam', 41, 10, 24),
    mkAssessment(linear, 'Final exam', 'exam', 45, 11, 26),
    mkAssessment(architecture, 'Final exam', 'exam', 48, 11, 25),
    mkAssessment(english, 'Written test', 'exam', 33, 9, 10),
  ]

  const mkWeekly = (
    course: Course,
    title: string,
    weekday: Weekday,
    startTime: string,
    endTime: string,
  ): ClassEntry => ({
    id: uid('cls'),
    courseId: course.id,
    title,
    kind: 'seminar',
    recurrence: 'weekly',
    weekday,
    startTime,
    endTime,
    completed: false,
    createdAt: stamp,
    updatedAt: stamp,
  })

  db.classes = [
    // The synchronous parts a distance course usually keeps.
    mkWeekly(programming, 'Live Q&A session', 3, '18:00', '19:30'),
    mkWeekly(calculus, 'Tutor office hours', 5, '17:00', '18:00'),
  ]

  // --- syllabus themes, tiled across the semester -------------------------
  const mkThemes = (course: Course, titles: string[], doneCount: number): Theme[] => {
    const spans = spreadDateRange(titles.length, semester.startsOn, semester.endsOn)
    return titles.map((title, i) => ({
      id: uid('thm'),
      courseId: course.id,
      title,
      order: i,
      startsOn: spans[i].startsOn,
      endsOn: spans[i].endsOn,
      status: i < doneCount ? 'done' : i === doneCount ? 'in-progress' : 'not-started',
      todos: [],
      resources: [],
      createdAt: stamp,
      updatedAt: stamp,
    }))
  }

  const todo = (text: string, done = false): ThemeTodo => ({ id: uid('td'), text, done })
  const resource = (title: string, kind: LearningResource['kind'], url?: string): LearningResource => ({
    id: uid('res'),
    title,
    kind,
    url,
  })

  db.themes = [
    ...mkThemes(
      calculus,
      ['Limits and continuity', 'Derivatives', 'Integration techniques', 'Series', 'Applications'],
      2,
    ),
    ...mkThemes(
      programming,
      ['Types and control flow', 'Arrays and strings', 'Pointers and memory', 'File I/O', 'Data structures'],
      3,
    ),
    ...mkThemes(linear, ['Matrices', 'Vector spaces', 'Eigenvalues', 'Orthogonality'], 1),
    ...mkThemes(
      architecture,
      ['Number representation', 'Assembly basics', 'Memory hierarchy', 'Pipelining'],
      1,
    ),
    ...mkThemes(english, ['Technical writing', 'Presentations', 'Documentation'], 1),
  ]

  // Fill one theme in properly, so the syllabus detail has something to show.
  const pointers = db.themes.find((t) => t.title === 'Pointers and memory')
  if (pointers) {
    pointers.description =
      'Addresses, dynamic allocation and the ownership rules the project leans on.'
    pointers.url = 'https://example.edu/prg102/pointers'
    pointers.assessmentId = db.assessments.find(
      (a) => a.courseId === programming.id && a.kind === 'project',
    )?.id
    pointers.todos = [
      todo('Read chapter 6 and take notes', true),
      todo('Work through the malloc/free exercises', true),
      todo('Draw the stack vs heap diagram from memory'),
      todo('Fix the leaks flagged by valgrind in lab 3'),
    ]
    pointers.resources = [
      resource('K&R chapter 5 — Pointers and Arrays', 'reading'),
      resource('Lecture 7: memory layout', 'video', 'https://example.edu/prg102/lec7'),
      resource('Pointer exercise sheet', 'exercise', 'https://example.edu/prg102/ex7.pdf'),
    ]
  }

  const derivatives = db.themes.find((t) => t.title === 'Derivatives')
  if (derivatives) {
    derivatives.todos = [
      todo('Memorise the differentiation rules', true),
      todo('Problem set 4, odd numbers'),
    ]
    derivatives.resources = [resource('Chain rule worked examples', 'slides')]
  }

  const mkTask = (
    title: string,
    dueOffset: number | null,
    priority: Task['priority'],
    tags: string[],
    course: Course,
    done = false,
  ): Task => ({
    id: uid('tsk'),
    title,
    courseId: course.id,
    dueAt: dueOffset === null ? undefined : day(dueOffset, '18:00'),
    priority,
    done,
    tags,
    createdAt: stamp,
    updatedAt: stamp,
    completedAt: done ? stamp : undefined,
  })

  db.tasks = [
    mkTask('Email the tutor about the project scope', -1, 'high', ['admin'], programming),
    mkTask('Print the formula sheet', 0, 'medium', ['exam'], calculus),
    mkTask('Re-watch unit 3 recording', 1, 'medium', ['study'], calculus),
    mkTask('Buy a new notebook', 4, 'low', ['errand'], architecture),
    mkTask('Ask about the oral presentation format', 2, 'high', ['admin'], english),
    mkTask('Set up the lab VM', null, 'medium', ['setup'], architecture),
    mkTask('Register for the exam season', 7, 'high', ['admin'], calculus),
    mkTask('Read chapter 4', -3, 'medium', ['study'], linear, true),
  ]

  db.updatedAt = stamp
  db.revision = 1
  return db
}
