import { useT } from '../i18n/LocaleProvider'
import { KB_URL } from '../lib/config'
import { Button, Card } from './atoms'
import { IssueReportCard } from './IssueReportCard'

export function SupportWorkspace({ onBack }: { onBack: () => void }) {
  const t = useT()
  return (
    <div className="page-container" data-page="support">
      <div className="reading-container">
        <Button variant="ghost" onClick={onBack}>← {t('support.backDashboard')}</Button>
        <Card className="mt-4 p-4 sm:p-6">
          <h1 tabIndex={-1} className="font-display text-display-md font-semibold text-ink">
            {t('support.title')}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted">
            {t('support.intro')}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a className="inline-flex min-h-tap items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink" href={`${KB_URL}/docs/troubleshooting/`}>
              {t('support.troubleshooting')}
            </a>
            <a className="inline-flex min-h-tap items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink" href={`${KB_URL}/docs/security-privacy-and-threat-model/`}>
              {t('support.privacySecurity')}
            </a>
          </div>
        </Card>
        <IssueReportCard />
      </div>
    </div>
  )
}
