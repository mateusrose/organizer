import { useMemo } from 'react'
import type {
  Assessment,
  ClassEntry,
  Course,
  Semester,
  StudyBlock,
  Task,
  Theme,
} from '../types'
import { useDb } from './useStore'

/**
 * Everything, narrowed to the active semester. `db` only changes identity when
 * the database actually mutates, so one useMemo keyed on it gives every page a
 * stable scoped view with no selector churn.
 */
export interface Scope {
  semesters: Semester[]
  semester: Semester | null
  courses: Course[]
  /** Non-archived courses only — what most views want. */
  activeCourses: Course[]
  courseIds: Set<string>
  themes: Theme[]
  assessments: Assessment[]
  classes: ClassEntry[]
  studyBlocks: StudyBlock[]
  tasks: Task[]
  courseById: Map<string, Course>
  /** Convenience: undefined for an unknown or out-of-scope id. */
  getCourse: (id?: string) => Course | undefined
  isEmpty: boolean
}

export function useScope(): Scope {
  const db = useDb()

  return useMemo(() => {
    const semester = db.semesters.find((s) => s.id === db.activeSemesterId) ?? null
    const courses = semester ? db.courses.filter((c) => c.semesterId === semester.id) : []
    const courseIds = new Set(courses.map((c) => c.id))
    const courseById = new Map(courses.map((c) => [c.id, c]))

    const assessments = db.assessments.filter((a) => courseIds.has(a.courseId))
    const themes = db.themes.filter((t) => courseIds.has(t.courseId))
    const classes = db.classes.filter((c) => courseIds.has(c.courseId))
    const tasks = db.tasks.filter((t) => courseIds.has(t.courseId))
    // A study block with no course is a generic session — it stays in scope.
    const assessmentIds = new Set(assessments.map((a) => a.id))
    const studyBlocks = db.studyBlocks.filter((b) =>
      b.courseId ? courseIds.has(b.courseId) : !b.assessmentId || assessmentIds.has(b.assessmentId),
    )

    return {
      semesters: db.semesters,
      semester,
      courses,
      activeCourses: courses.filter((c) => !c.archived),
      courseIds,
      themes,
      assessments,
      classes,
      studyBlocks,
      tasks,
      courseById,
      getCourse: (id?: string) => (id ? courseById.get(id) : undefined),
      isEmpty: courses.length === 0,
    }
  }, [db])
}
