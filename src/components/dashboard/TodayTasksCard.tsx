import { useMemo } from 'react'
import { ArrowRight, ListTodo, PartyPopper } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Course, Task } from '../../types'
import { sortByUrgency, taskUrgency } from '../../lib/urgency'
import { endOfDay, toDate } from '../../lib/date'
import { useStore } from '../../store/useStore'
import { cn } from '../../lib/cn'
import { Badge, Card, CardHeader, Checkbox, CourseDot, EmptyState } from '../ui'
import { primaryLink, quietLink } from './shared'

const MAX_ROWS = 6

export function TodayTasksCard({
  tasks,
  courseById,
  now,
}: {
  tasks: Task[]
  courseById: Map<string, Course>
  now: Date
}) {
  const toggleTask = useStore((s) => s.toggleTask)

  const { rows, total } = useMemo(() => {
    const cutoff = endOfDay(now)
    const open = tasks.filter((t) => !t.done && t.dueAt && toDate(t.dueAt) <= cutoff)
    const sorted = sortByUrgency(open, (t) => taskUrgency(t, now))
    return {
      total: sorted.length,
      rows: sorted.slice(0, MAX_ROWS).map((task) => ({
        task,
        urgency: taskUrgency(task, now),
        course: task.courseId ? courseById.get(task.courseId) : undefined,
      })),
    }
  }, [tasks, courseById, now])

  return (
    <Card>
      <CardHeader
        title="Today's tasks"
        subtitle={total > 0 ? `${total} open · due today or earlier` : 'Due today or earlier'}
        icon={<ListTodo />}
        action={
          <Link to="/tasks" className={quietLink}>
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<PartyPopper />}
          title="Inbox zero for today"
          message="No task is due today. Add one if something is on your mind."
          action={
            <Link to="/tasks" className={primaryLink}>
              Add a task
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col">
          {rows.map(({ task, urgency, course }) => (
            <li
              key={task.id}
              className="flex items-center gap-3 border-b border-line py-2.5 last:border-0"
            >
              <Checkbox
                checked={task.done}
                onChange={() => toggleTask(task.id)}
                className="min-w-0 flex-1"
                label={
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{task.title}</span>
                    {course && <CourseTag course={course} className="mt-0.5" />}
                  </span>
                }
              />
              <div className="flex shrink-0 items-center gap-1.5">
                {task.priority === 'high' && <Badge tone="warning">High</Badge>}
                <Badge tone={urgency.tone}>{urgency.label}</Badge>
              </div>
            </li>
          ))}
          {total > rows.length && (
            <li className="pt-3">
              <Link to="/tasks" className={quietLink}>
                {total - rows.length} more open today
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </li>
          )}
        </ul>
      )}
    </Card>
  )
}

/** Colour dot + course code. Sets `data-course` so the dot resolves its var. */
function CourseTag({ course, className }: { course: Course; className?: string }) {
  return (
    <span
      data-course={course.color}
      className={cn('inline-flex min-w-0 items-center gap-1.5 text-[12px] text-muted', className)}
    >
      <CourseDot />
      <span className="truncate font-medium">{course.code}</span>
    </span>
  )
}
