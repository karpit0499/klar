// ============================================================================
// useTheme + ThemeToggle (feature 3). The hook owns the current mode in React
// state, persists changes, and applies them. The toggle is a 3-way segmented
// control (Light / System / Dark) that is fully keyboard- and screen-reader-
// friendly (radiogroup semantics + visible focus ring from index.css).
//
// v2.3.1: icons are crisp lucide-react glyphs (Sun / Monitor / Moon) instead of
// raw Unicode characters, which rendered inconsistently (e.g. a colour emoji sun
// on Apple platforms) and failed non-text contrast. Inactive icons use text-muted
// so they clear the WCAG contrast threshold in both themes.
// ============================================================================
import { useEffect, useState } from 'react'
import { Moon, Monitor, Sun, type LucideIcon } from 'lucide-react'
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

const OPTIONS: { value: ThemeMode; labelKey: TranslationKey; Icon: LucideIcon }[] = [
  { value: 'light', labelKey: 'theme.light', Icon: Sun },
  { value: 'system', labelKey: 'theme.system', Icon: Monitor },
  { value: 'dark', labelKey: 'theme.dark', Icon: Moon },
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
      className="inline-flex min-h-tap items-center gap-0.5 rounded-full border border-border bg-surface p-0.5"
    >
      {OPTIONS.map((o) => {
        const active = mode === o.value
        const label = t(o.labelKey)
        const Icon = o.Icon
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setMode(o.value)}
            className="group flex h-11 w-11 items-center justify-center rounded-full transition"
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                active ? 'bg-accent-tint text-accent' : 'text-muted group-hover:text-ink'
              }`}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={2} />
            </span>
          </button>
        )
      })}
    </div>
  )
}