import { LocaleToggle, useT } from '../i18n/LocaleProvider'
import { ThemeToggle, useTheme } from './useTheme'

export function PreferenceControls({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const { mode, setMode } = useTheme()

  return (
    <div className={`flex w-full flex-col ${compact ? 'gap-1.5' : 'gap-3'}`}>
      <div className="flex min-h-tap items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted">{t('preferences.language')}</span>
        <LocaleToggle />
      </div>
      <div className="flex min-h-tap items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted">{t('preferences.appearance')}</span>
        <ThemeToggle mode={mode} setMode={setMode} />
      </div>
    </div>
  )
}