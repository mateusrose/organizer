import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useToast, type Toast } from '../../store/useToast'
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

  // Toasts are the only feedback for a lot of outcomes, so they have to reach a
  // screen reader. Failures go in an assertive region; the rest stay polite so
  // they do not interrupt whatever is being read.
  const errors = toasts.filter((t) => t.tone === 'error')
  const rest = toasts.filter((t) => t.tone !== 'error')

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      <div role="alert" aria-live="assertive" className="contents">
        {errors.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
      <div role="status" aria-live="polite" aria-atomic="false" className="contents">
        {rest.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </div>
  )
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const Icon = ICONS[toast.tone]
  return (
    <div
      className={cn(
        'animate-fade-up pointer-events-auto flex w-full max-w-sm items-center gap-2.5',
        'rounded-xl border bg-surface/95 px-3.5 py-2.5 shadow-xl backdrop-blur-xl',
        TONES[toast.tone],
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <p className="flex-1 text-[13px] text-ink">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-faint transition-colors hover:text-ink"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
