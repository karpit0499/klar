// ============================================================================
// useTheme + ThemeToggle (feature 3). The hook owns the current mode in React
// state, persists changes, and applies them. The toggle is a 3-way segmented
// control (Light / System / Dark) that is fully keyboard- and screen-reader-
// friendly (radiogroup semantics + visible focus ring from index.css).
// ============================================================================
import { useEffect, useState } from 'react'
import { type ThemeMode, applyTheme, getStoredTheme, storeTheme, resolveTheme } from './theme'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'

export function useTheme(): {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  setMode: (m: ThemeMode) => void
} {
  const [mode, setModeState] = useState<ThemeMode>(() => getStoredTheme())

  useEffect(() => {
    applyTheme(mode)
    storeTheme(mode)
  }, [mode])

  return { mode, resolved: resolveTheme(mode), setMode: setModeState }
}

const OPTIONS: { value: ThemeMode; labelKey: TranslationKey; glyph: string }[] = [
  { value: 'light', labelKey: 'theme.light', glyph: '☀' },
  { value: 'system', labelKey: 'theme.system', glyph: '◐' },
  { value: 'dark', labelKey: 'theme.dark', glyph: '☾' },
]

export function ThemeToggle({
  mode,
  setMode,
}: {
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
}) {
  const t = useT()
  return (
    <div
      role="radiogroup"
      aria-label={t('theme.aria')}
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5"
    >
      {OPTIONS.map((o) => {
        const active = mode === o.value
        const label = t(o.labelKey)
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setMode(o.value)}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition ${
              active ? 'bg-accent-tint text-accent' : 'text-faint hover:text-ink'
            }`}
          >
            <span aria-hidden="true">{o.glyph}</span>
          </button>
        )
      })}
    </div>
  )
}