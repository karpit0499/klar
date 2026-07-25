// ============================================================================
// WorkModeSwitch (v2.4.1). A segmented control that lets ANY user move between
// career discovery and Flexible Work. Before v2.4.1 the two surfaces were
// mutually exclusive — saving a résumé silently removed Flexible Work from the
// app. Flexible Work is a feature for everyone, so this control is shown
// whenever both surfaces are meaningful.
// ============================================================================
import type { WorkMode } from '../onboarding/setupState'
import { useT } from '../i18n/LocaleProvider'

export function WorkModeSwitch({
  mode,
  onChange,
  className = '',
}: {
  mode: WorkMode
  onChange: (mode: WorkMode) => void
  className?: string
}) {
  const t = useT()
  const options: { value: WorkMode; label: string }[] = [
    { value: 'career', label: t('workmode.career') },
    { value: 'flexible', label: t('workmode.flexible') },
  ]
  return (
    <div
      role="radiogroup"
      aria-label={t('workmode.aria')}
      className={`inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-surface p-1 ${className}`}
    >
      {options.map((option) => {
        const active = mode === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`min-h-tap rounded-full px-4 text-sm font-medium transition ${
              active ? 'bg-accent-tint text-accent' : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}