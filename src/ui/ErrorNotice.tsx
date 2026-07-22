import { useState } from 'react'
import type { AppErrorData } from '../errors/appError'
import { useT } from '../i18n/LocaleProvider'

export function ErrorNotice({ error }: { error: AppErrorData }) {
  const [showDetail, setShowDetail] = useState(false)
  const t = useT()

  return (
    <div role="alert" className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-base">
      <p className="font-semibold text-ink">{error.message}</p>
      <p className="mt-1 text-muted">
        {error.dataSafe ? `${t('error.dataSafe')} ` : `${t('error.unsaved')} `}
        {error.available}
      </p>
      <p className="mt-2 font-medium text-ink">{t('error.next', { action: error.action.label })}</p>
      {error.technical && (
        <div className="mt-2">
          <button
            type="button"
            className="min-h-tap text-sm text-muted underline hover:text-ink"
            aria-expanded={showDetail}
            onClick={() => setShowDetail((current) => !current)}
          >
            {showDetail ? t('error.hideDetail') : t('error.showDetail')}
          </button>
          {showDetail && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 text-xs text-muted">
              {error.technical}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}