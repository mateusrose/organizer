import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'course'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-muted border-line',
  accent: 'bg-accent-bg text-accent-soft border-accent/25',
  success: 'bg-success-bg text-success border-success/25',
  warning: 'bg-warning-bg text-warning border-warning/25',
  danger: 'bg-danger-bg text-danger border-danger/25',
  info: 'bg-info-bg text-info border-info/25',
  course: 'border-transparent',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  icon,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  icon?: ReactNode
}) {
  return (
    <span
      style={
        tone === 'course'
          ? { background: 'var(--course-bg)', color: 'var(--course)' }
          : undefined
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
        'text-[11px] leading-5 font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/** Small colour chip identifying a course. Wrap in `data-course={color}`. */
export function CourseDot({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={{ background: 'var(--course, var(--accent))' }}
    />
  )
}
