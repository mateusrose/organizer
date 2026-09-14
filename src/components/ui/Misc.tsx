import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  message?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-line px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-3 text-faint [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {message && <p className="mt-1 max-w-sm text-[13px] text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
  icon?: ReactNode
  className?: string
}) {
  const toneText = {
    neutral: 'text-ink',
    accent: 'text-accent-soft',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  }[tone]
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-faint uppercase">
        {icon && <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
        {label}
      </div>
      <div className={cn('mt-1 text-2xl leading-none font-semibold tracking-tight', toneText)}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[12px] text-muted">{sub}</div>}
    </div>
  )
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-[13px] font-semibold tracking-wider text-faint uppercase">{children}</h2>
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-lg bg-surface-3', className)}
      style={{
        backgroundImage:
          'linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.06) 50%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s linear infinite',
      }}
    />
  )
}

/** Thin horizontal rule with an optional centred label. */
export function Divider({ label, className }: { label?: ReactNode; className?: string }) {
  if (!label) return <div className={cn('h-px w-full bg-line', className)} />
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="h-px flex-1 bg-line" />
      <span className="text-[11px] font-medium tracking-wider text-faint uppercase">{label}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}
