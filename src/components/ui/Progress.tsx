import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function ProgressBar({
  value,
  max = 100,
  tone = 'accent',
  className,
  height = 6,
}: {
  value: number
  max?: number
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'course'
  className?: string
  height?: number
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const color =
    tone === 'course'
      ? 'var(--course, var(--accent))'
      : `var(--${tone === 'accent' ? 'accent' : tone})`
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-surface-3', className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

/** Stacked bar — used for "graded / pending / unassigned" weight splits. */
export function StackedBar({
  segments,
  height = 8,
  className,
}: {
  segments: { value: number; color: string; label?: string }[]
  height?: number
  className?: string
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div
      className={cn('flex w-full overflow-hidden rounded-full bg-surface-3', className)}
      style={{ height }}
    >
      {segments.map((s, i) => (
        <div
          key={i}
          title={s.label}
          style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          className="h-full transition-[width] duration-500"
        />
      ))}
    </div>
  )
}

export function ProgressRing({
  value,
  max = 100,
  size = 120,
  stroke = 9,
  tone = 'accent',
  children,
  className,
}: {
  value: number
  max?: number
  size?: number
  stroke?: number
  tone?: 'accent' | 'success' | 'warning' | 'danger'
  children?: ReactNode
  className?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`var(--${tone})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  )
}
