import type { Assessment, Course, GradeScale } from '../types'

/**
 * Grade maths.
 *
 * The model in plain language: every assessment owns a slice of the final
 * grade (its `weight`, a percentage). A graded assessment converts its slice
 * into points on the scale — a 16/20 worth 30% contributes 16 * 0.30 = 4.8
 * points. `earned` is the sum of those contributions, i.e. the grade the
 * student already has in the bag if everything still open scored zero.
 *
 * From there we read three futures:
 *   · worst     — nothing else is done: the final grade is exactly `earned`.
 *   · best      — everything left is perfect: `earned` + max * remaining.
 *   · projected — the realistic one: the remaining weight scores the same as
 *                 the average achieved so far. With nothing graded yet there
 *                 is no average to extrapolate from, so it is `null`.
 *
 * `neededForTarget` inverts the projection: what average must the remaining
 * weight score for the final grade to reach the course target.
 */

export interface CourseGrade {
  courseId: string
  gradedWeight: number
  pendingWeight: number
  unassignedWeight: number
  earned: number
  currentAverage: number | null
  projected: number | null
  best: number
  worst: number
  neededForTarget: number | null
  targetReachable: boolean
  passing: boolean | null
}

const EPS = 1e-9

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(Math.max(value, lo), hi)

const finite = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/** Grades and weights arrive from user input, so never trust the shape. */
const safeScale = (scale: GradeScale): GradeScale => {
  const max = finite(scale?.max, 20)
  return {
    max: max > 0 ? max : 20,
    passing: clamp(finite(scale?.passing, 0), 0, max > 0 ? max : 20),
  }
}

const isGraded = (a: Assessment): boolean =>
  a.status === 'graded' && typeof a.grade === 'number' && Number.isFinite(a.grade)

export function computeCourseGrade(
  course: Course,
  assessments: Assessment[],
  scale: GradeScale,
): CourseGrade {
  const { max, passing } = safeScale(scale)
  const mine = assessments.filter((a) => a.courseId === course.id)

  let gradedWeight = 0
  let pendingWeight = 0
  let earned = 0

  for (const a of mine) {
    const weight = Math.max(0, finite(a.weight))
    if (isGraded(a)) {
      const grade = clamp(finite(a.grade), 0, max)
      gradedWeight += weight
      earned += (grade * weight) / 100
    } else {
      pendingWeight += weight
    }
  }

  // A student can mis-enter weights summing past 100; keep the reported totals
  // honest but never let the projections go through a negative remainder.
  const gw = clamp(gradedWeight, 0, 100)
  const remainingWeight = (100 - gw) / 100
  const unassignedWeight = Math.max(0, 100 - gradedWeight - pendingWeight)

  // Divide by the REAL graded weight, not the clamped one: with weights that
  // over-allocate past 100% the clamped value stops being an average at all.
  const currentAverage = gradedWeight > EPS ? clamp(earned / (gradedWeight / 100), 0, max) : null
  const projected =
    currentAverage === null ? null : clamp(earned + currentAverage * remainingWeight, 0, max)
  const best = clamp(earned + max * remainingWeight, 0, max)
  const worst = clamp(earned, 0, max)

  const target =
    typeof course.targetGrade === 'number' && Number.isFinite(course.targetGrade)
      ? course.targetGrade
      : null

  let neededForTarget: number | null = null
  let targetReachable = true

  if (target !== null) {
    if (earned >= target - EPS) {
      // Already secured whatever happens next.
      neededForTarget = 0
    } else if (remainingWeight <= EPS) {
      neededForTarget = null
      targetReachable = false
    } else {
      neededForTarget = (target - earned) / remainingWeight
      targetReachable = neededForTarget <= max + EPS
    }
  }

  return {
    courseId: course.id,
    gradedWeight,
    pendingWeight,
    unassignedWeight,
    earned,
    currentAverage,
    projected,
    best,
    worst,
    neededForTarget,
    targetReachable,
    passing: projected === null ? null : projected >= passing,
  }
}

/** ECTS-weighted mean of every active course's projected final grade. */
export function semesterAverage(
  courses: Course[],
  assessments: Assessment[],
  scale: GradeScale,
): number | null {
  const byCourse = new Map<string, Assessment[]>()
  for (const a of assessments) {
    const list = byCourse.get(a.courseId)
    if (list) list.push(a)
    else byCourse.set(a.courseId, [a])
  }

  let weighted = 0
  let weight = 0
  let plain = 0
  let counted = 0

  for (const course of courses) {
    if (course.archived) continue
    const { projected } = computeCourseGrade(course, byCourse.get(course.id) ?? [], scale)
    if (projected === null) continue
    const ects = Math.max(0, finite(course.ects))
    weighted += projected * ects
    weight += ects
    plain += projected
    counted += 1
  }

  if (counted === 0) return null
  // Every counted course carries 0 ECTS — fall back to a plain mean.
  return weight > EPS ? weighted / weight : plain / counted
}

export function totalEcts(courses: Course[]): number {
  return courses.reduce(
    (sum, course) => (course.archived ? sum : sum + Math.max(0, finite(course.ects))),
    0,
  )
}
