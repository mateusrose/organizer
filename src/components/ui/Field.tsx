import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useId } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'

const CONTROL = cn(
  'w-full rounded-[10px] border border-line bg-surface-2 px-3 text-sm text-ink',
  'placeholder:text-faint transition-[border-color,background] duration-150',
  'hover:border-line-strong focus:border-accent/60 focus:bg-surface-3 focus:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-50',
)

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-[12px] font-medium tracking-wide text-muted uppercase"
        >
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[12px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-faint">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(CONTROL, 'h-9.5', className)} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(CONTROL, 'resize-y py-2 leading-relaxed', className)} />
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={cn(CONTROL, 'h-9.5 cursor-pointer appearance-none pr-9', className)}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-faint" />
    </div>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: ReactNode
  className?: string
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 text-sm text-ink select-none',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {/* The real input is visually hidden, so the focus ring has to be drawn
          on the fake box via `peer-*` — which needs the input to come first. */}
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={cn(
          'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-150',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]',
          checked ? 'border-accent bg-accent text-accent-contrast' : 'border-line-strong bg-surface-2',
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3.5} />}
      </span>
      {label}
    </label>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: ReactNode
  hint?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || hint) && (
        <div className="min-w-0">
          {label && (
            <label htmlFor={id} className="cursor-pointer text-sm font-medium text-ink">
              {label}
            </label>
          )}
          {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
        </div>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-surface-3 border border-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 h-4.5 w-4.5 -translate-y-1/2 rounded-full bg-white shadow transition-[left] duration-200',
            checked ? 'left-[19px]' : 'left-[3px]',
          )}
        />
      </button>
    </div>
  )
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (next: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-[10px] border border-line bg-surface-2 p-0.5',
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-lg font-medium transition-colors duration-150',
            size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
            value === opt.value
              ? 'bg-surface-3 text-ink shadow-[0_1px_2px_rgb(0_0_0/0.25)]'
              : 'text-muted hover:text-ink',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
