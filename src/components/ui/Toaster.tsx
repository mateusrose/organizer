import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useToast } from '../../store/useToast'
import { cn } from '../../lib/cn'

const ICONS = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
} as const

const TONES = {
  success: 'text-success border-success/25',
  error: 'text-danger border-danger/25',
  info: 'text-info border-info/25',
} as const

export function Toaster() {
  const toasts = useToast((s) => s.toasts)
  const dismiss = useToast((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone]
        return (
          <div
            key={t.id}
            className={cn(
              'animate-fade-up pointer-events-auto flex w-full max-w-sm items-center gap-2.5',
              'rounded-xl border bg-surface/95 px-3.5 py-2.5 shadow-xl backdrop-blur-xl',
              TONES[t.tone],
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <p className="flex-1 text-[13px] text-ink">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-faint transition-colors hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
