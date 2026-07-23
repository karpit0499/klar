import { LocaleToggle, useT } from '../i18n/LocaleProvider'
import { ThemeToggle, useTheme } from './useTheme'

export function PreferenceControls({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const { mode, setMode } = useTheme()

  return (
    <div className={compact ? 'flex shrink-0 flex-nowrap items-center gap-2' : 'flex w-full flex-col gap-3'}>
      <div className={compact ? 'flex items-center' : 'flex min-h-tap items-center justify-between gap-3'}>
        <span className={compact ? 'sr-only' : 'text-sm font-medium text-muted'}>{t('preferences.language')}</span>
        <LocaleToggle />
      </div>
      <div className={compact ? 'flex items-center' : 'flex min-h-tap items-center justify-between gap-3'}>
        <span className={compact ? 'sr-only' : 'text-sm font-medium text-muted'}>{t('preferences.appearance')}</span>
        <ThemeToggle mode={mode} setMode={setMode} />
      </div>
    </div>
  )
}