import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResumeData } from '../resume/types'
import { DEFAULT_APP_FLAGS, loadAppFlags } from '../lib/appFlags'
import { useT } from '../i18n/LocaleProvider'
import { toAppError, type AppErrorData } from '../errors/appError'
import { Button, Card } from './atoms'
import { ErrorNotice } from './ErrorNotice'
import { ResumeDesignLab } from './ResumeDesignLab'
import { ResumeEditor } from './ResumeEditor'
import { ResumeHistory } from './ResumeHistory'
import { ResumeReupload } from './ResumeReupload'

export function ResumeEmptyWorkspace({
  onAdd,
  onBack,
}: {
  onAdd: () => void
  onBack: () => void
}) {
  const t = useT()
  return (
    <div className="page-container" data-page="resume">
      <div className="reading-container">
        <Button variant="ghost" onClick={onBack}>← {t('resume.backDashboard')}</Button>
        <Card className="mt-4 p-4 sm:p-6">
          <h1 tabIndex={-1} className="font-display text-display-md font-semibold text-ink">
            {t('resume.workspaceTitle')}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted">
            {t('resume.emptyIntro')}
          </p>
          <Button className="mt-5" onClick={onAdd}>{t('resume.add')}</Button>
        </Card>
      </div>
    </div>
  )
}

export function ResumeWorkspace({
  resume,
  apiKey,
  requireGroq,
  onSave,
  onReplace,
  onChanged,
  onDirtyChange,
  onBack,
}: {
  resume: ResumeData
  apiKey?: string
  requireGroq: (action: string) => Promise<string | null>
  onSave: (resume: ResumeData) => void | Promise<void>
  onReplace: (resume: ResumeData) => void | Promise<void>
  onChanged: () => void
  onDirtyChange: (dirty: boolean) => void
  onBack: () => void
}) {
  const t = useT()
  const [draft, setDraft] = useState(() => structuredClone(resume))
  const [baseline, setBaseline] = useState(() => structuredClone(resume))
  const [saved, setSaved] = useState('')
  const [saveError, setSaveError] = useState<AppErrorData | null>(null)
  const [labEnabled, setLabEnabled] = useState(DEFAULT_APP_FLAGS.resumeDesignLab)
  const savedTimer = useRef<number>()
  const onDirtyChangeRef = useRef(onDirtyChange)
  onDirtyChangeRef.current = onDirtyChange

  useEffect(() => {
    const next = structuredClone(resume)
    setDraft(next)
    setBaseline(structuredClone(next))
  }, [resume])
  useEffect(() => {
    void loadAppFlags().then((flags) => setLabEnabled(flags.resumeDesignLab))
  }, [])

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [baseline, draft],
  )

  useEffect(() => {
    onDirtyChangeRef.current(dirty)
    return () => onDirtyChangeRef.current(false)
  }, [dirty])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => () => {
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
  }, [])

  async function save() {
    setSaveError(null)
    try {
      await onSave(draft)
      setBaseline(structuredClone(draft))
      setSaved(t('resume.saved'))
      if (savedTimer.current) window.clearTimeout(savedTimer.current)
      savedTimer.current = window.setTimeout(() => setSaved(''), 1_500)
    } catch (caught) {
      setSaveError(toAppError(caught, {
        category: 'storage',
        message: t('resume.saveFailed'),
        dataSafe: true,
        available: t('resume.draftAvailable'),
        action: { label: t('resume.tryAgain'), kind: 'retry' },
      }))
    }
  }

  return (
    <div className="page-container" data-page="resume">
      <div className="reading-container">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={onBack}>← {t('resume.backDashboard')}</Button>
          {dirty && <span className="text-sm text-muted">{t('resume.unsaved')}</span>}
        </div>

        <Card className="p-4 sm:p-6">
          <h1 tabIndex={-1} className="font-display text-display-md font-semibold text-ink">
            {t('resume.workspaceTitle')}
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted">
            {t('resume.workspaceIntro')}
          </p>
        </Card>

        <Card className="mt-4 p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">{t('resume.editTitle')}</h2>
          <div className="mt-4">
            <ResumeEditor value={draft} onChange={setDraft} onSave={() => void save()} />
          </div>
          {saved && <p className="mt-2 text-sm text-success" role="status">{saved}</p>}
          {saveError && <div className="mt-3"><ErrorNotice error={saveError} /></div>}
        </Card>

        <Card className="mt-4 p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">{t('resume.replaceTitle')}</h2>
          <p className="mt-1 text-base leading-relaxed text-muted">
            {t('resume.replaceIntro')}
          </p>
          <div className="mt-4">
            <ResumeReupload apiKey={apiKey} requireGroq={requireGroq} onReplace={onReplace} />
          </div>
        </Card>

        <Card className="mt-4 p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">{t('resume.historyTitle')}</h2>
          <div className="mt-4"><ResumeHistory onRestored={onChanged} /></div>
        </Card>

        <ResumeDesignLab resume={resume} enabled={labEnabled} />
      </div>
    </div>
  )
}
