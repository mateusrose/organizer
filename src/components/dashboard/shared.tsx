/** Formatting helpers shared by the dashboard cards. */

/** "45 min" / "6.5 h" — hours written the way a student says them out loud. */
export function fmtHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 h'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  return `${Number(hours.toFixed(1))} h`
}

export function fmtGrade(value: number | null | undefined, max: number): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)} / ${max}`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many
}

export function greetingLabel(now: Date): string {
  const hour = now.getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

/** A quiet inline action — used for the "View all" links in card headers. */
export const quietLink =
  'inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-ink'

/** A <Link> that should read as a primary button. */
export const primaryLink =
  'inline-flex h-9.5 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-medium text-accent-contrast transition-[filter] duration-150 hover:brightness-110 active:scale-[0.98]'
