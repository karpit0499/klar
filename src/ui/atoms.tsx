// ============================================================================
// Shared UI atoms (feature 3 refresh). Every atom now speaks the brand token
// language (bg-surface / text-ink / border-border …) so it renders correctly in
// both light and dark mode with no per-call `dark:` variants. Buttons meet the
// 44px minimum tap target (WCAG 2.5.5) and inherit the global focus ring.
//
// Button variants map to the brand kit:
//   primary → ink fill (near-black on light, near-white on dark)
//   accent  → cobalt fill (the one high-emphasis action per view)
//   ghost   → surface + border (low emphasis)
//   danger  → destructive red
// Rule of thumb from the brand kit: at most ONE primary/accent button per view.
// ============================================================================
import type { ReactNode, ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'accent' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition ' +
    'disabled:opacity-50 disabled:cursor-not-allowed select-none'
  // Both sizes clear the 44px tap target via min-h-tap; padding controls density.
  const sizes: Record<Size, string> = {
    sm: 'min-h-tap px-3 py-1.5 text-sm',
    md: 'min-h-tap px-4 py-2.5 text-base',
  }
  const styles: Record<Variant, string> = {
    primary: 'bg-primary text-primary-ink hover:opacity-90',
    accent: 'bg-accent text-accent-ink hover:opacity-90',
    ghost: 'bg-surface text-ink border border-border hover:bg-surface-2',
    danger: 'bg-danger text-danger-ink hover:opacity-90',
  }
  return <button className={`${base} ${sizes[size]} ${styles[variant]} ${className}`} {...props} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  // Elevation is borders-first (brand): a hairline border, no heavy shadow.
  return (
    <div className={`rounded-xl border border-border bg-surface ${className}`}>{children}</div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'outline' | 'success' | 'danger'
}) {
  // Brand chip roles: metadata tags are neutral + uppercase; matched skills use
  // the cobalt tint (the only accent-derived fill); gaps are a neutral outline.
  // success/danger are functional (system feedback only), never decoration.
  const tones: Record<string, string> = {
    neutral: 'bg-surface-2 text-muted border border-border uppercase tracking-wide',
    accent: 'bg-accent-tint text-accent',
    outline: 'border border-border text-muted',
    success: 'bg-surface-2 text-success border border-border',
    danger: 'bg-surface-2 text-danger border border-border',
  }
  // 4px radius — brand chips are 4px (rounded), not pills.
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1 block text-base font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full min-h-tap rounded-md border border-border bg-surface px-3 py-2 text-base text-ink placeholder:text-faint outline-none focus:border-accent ${props.className ?? ''}`}
    />
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-base text-muted" role="status">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent"
      />
      {label}
    </span>
  )
}