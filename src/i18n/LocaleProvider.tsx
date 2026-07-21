// ============================================================================
// LocaleProvider / useT / LocaleToggle (feature 20). Holds the current locale in
// React context, persists it to localStorage (synchronous, like the theme), and
// exposes a `t()` bound to that locale. Components call `const t = useT()` and
// then `t('nav.search')` — the same ergonomics as i18next but with zero deps and
// full type-safety on the key.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { type Locale, type TranslationKey, translate } from './translations'

const STORAGE_KEY = 'klar-locale'
const DEFAULT_LOCALE: Locale = 'de' // German-first

function getStoredLocale(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'de' || v === 'en') return v
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE
}

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string

type LocaleContextValue = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: TFn
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale())

  useEffect(() => {
    document.documentElement.lang = locale
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // ignore
    }
  }, [locale])

  const t = useCallback<TFn>((key, params) => translate(locale, key, params), [locale])

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale: setLocaleState, t }),
    [locale, t],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

/** The whole context (locale + setLocale + t). */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider')
  return ctx
}

/** Convenience: just the translator, for the common `const t = useT()` case. */
export function useT(): TFn {
  return useLocale().t
}

/** DE/EN segmented control, mirroring ThemeToggle's look. */
export function LocaleToggle() {
  const { locale, setLocale, t } = useLocale()
  const options: Locale[] = ['de', 'en']
  return (
    <div
      role="radiogroup"
      aria-label={t('locale.aria')}
      className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5"
    >
      {options.map((l) => {
        const active = locale === l
        return (
          <button
            key={l}
            role="radio"
            aria-checked={active}
            onClick={() => setLocale(l)}
            className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold uppercase transition ${
              active ? 'bg-accent-tint text-accent' : 'text-faint hover:text-ink'
            }`}
          >
            {l}
          </button>
        )
      })}
    </div>
  )
}