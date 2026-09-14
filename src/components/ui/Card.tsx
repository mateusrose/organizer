import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover lift — use for cards that navigate or open something. */
  interactive?: boolean
  padded?: boolean
}

export function Card({ interactive, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'rounded-card border border-line bg-surface/80 backdrop-blur-xl',
        'shadow-[var(--shadow-card)]',
        padded && 'p-5',
        interactive &&
          'cursor-pointer transition-[border-color,transform,background] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-2/80',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-muted [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] leading-tight font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
