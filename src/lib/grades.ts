import type { Assessment, Course, GradeScale } from '../types'

/**
 * Grade maths.
 *
 * The model in plain language: the course is worth `scale.max` points (20 in
 * Portugal) and every assessment owns a slice of them — a course might split
 * 4 / 4 / 12. Each assessment is then scored as a percentage of its own slice,
 * so a 12-point exam scored 75% contributes 12 * 0.75 = 9 points. `earned` is
 * the sum of those contributions, i.e. the grade the student already has in the
 * bag if everything still open scored zero.
 *
 * From there we read three futures:
 *   · worst     — nothing else is done: the final grade is exactly `earned`.
 *   · best      — everything left scores 100%: `earned` + remaining points.
 *   · projected — the realistic one: the remaining points score the same
 *                 percentage as the work done so far. With nothing graded yet
 *                 there is no average to extrapolate from, so it is `null`.
 *
 * `neededForTarget` inverts the projection: what percentage must the remaining
 * points score for the final grade to reach the course target.
 *
 * Two different units meet in here, so the names keep them apart: anything
 * `…Points` or a grade is on the 0–`scale.max` scale, anything `…Score` is a
 * percentage 0–100.
 */

export interface CourseGrade {
  courseId: string
  /** Points whose assessment is graded, on the 0–scale.max scale. */
  gradedPoints: number
  /** Points assigned to assessments that are not graded yet. */
  pendingPoints: number
  /** Points of the course no assessment has claimed. */
  unassignedPoints: number
  earned: number
  /** Percentage (0–100) scored across the graded points so far. */
  currentScore: number | null
  projected: number | null
  best: number
  worst: number
  /** Percentage (0–100) the remaining points must score to hit the target. */
  neededForTarget: number | null
  targetReachable: boolean
  passing: boolean | null
}

const EPS = 1e-9

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(Math.max(value, lo), hi)

const finite = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/** Points and scores arrive from user input, so never trust the shape. */
const safeScale = (scale: GradeScale): GradeScale => {
  const max = finite(scale?.max, 20)
  return {
    max: max > 0 ? max : 20,
    passing: clamp(finite(scale?.passing, 0), 0, max > 0 ? max : 20),
  }
}

const isGraded = (a: Assessment): boolean =>
  a.status === 'graded' && typeof a.score === 'number' && Number.isFinite(a.score)

/** The score (0–100) an assessment must reach to clear the course pass mark. */
export function passingScore(scale: GradeScale): number {
  const { max, passing } = safeScale(scale)
  return (passing / max) * 100
}

export function computeCourseGrade(
  course: Course,
  assessments: Assessment[],
  scale: GradeScale,
): CourseGrade {
  const { max, passing } = safeScale(scale)
  const mine = assessments.filter((a) => a.courseId === course.id)

  let gradedPoints = 0
  let pendingPoints = 0
  let earned = 0

  for (const a of mine) {
    const points = Math.max(0, finite(a.points))
    if (isGraded(a)) {
      const score = clamp(finite(a.score), 0, 100)
      gradedPoints += points
      earned += (points * score) / 100
    } else {
      pendingPoints += points
    }
  }

  // A student can mis-enter points summing past the scale; keep the reported
  // totals honest but never let the projections go through a negative remainder.
  const gp = clamp(gradedPoints, 0, max)
  const remainingPoints = max - gp
  const unassignedPoints = Math.max(0, max - gradedPoints - pendingPoints)

  // Divide by the REAL graded points, not the clamped ones: where the points
  // over-allocate past the scale the clamped value stops being an average at all.
  const currentScore = gradedPoints > EPS ? clamp((earned / gradedPoints) * 100, 0, 100) : null
  const projected =
    currentScore === null
      ? null
      : clamp(earned + (currentScore / 100) * remainingPoints, 0, max)
  const best = clamp(earned + remainingPoints, 0, max)
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
    } else if (remainingPoints <= EPS) {
      neededForTarget = null
      targetReachable = false
    } else {
      // A percentage now: how well the points still open have to be scored.
      neededForTarget = ((target - earned) / remainingPoints) * 100
      targetReachable = neededForTarget <= 100 + EPS
    }
  }

  return {
    courseId: course.id,
    gradedPoints,
    pendingPoints,
    unassignedPoints,
    earned,
    currentScore,
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
