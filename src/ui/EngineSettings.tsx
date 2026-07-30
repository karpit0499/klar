// ============================================================================
// v2.5 · WS3 + R10 — Settings › AI engine and Settings › v2.5 features.
//
// Two small, self-contained cards so SettingsStep stays readable:
//
//  1. EngineSettingsCard — the OpenAI-compatible endpoint, the two model ids,
//     whether a key is needed, and the cost-control switch for matching. It also
//     answers the D2 model-drift problem ("Groq rotates its catalogue often") by
//     asking the endpoint which ids it really serves, and it is HONEST about the
//     mixed-content blocker rather than promising a local model that a browser
//     will refuse to call from an https:// page.
//
//  2. FeatureFlagsCard — per-feature kill switches for the new v2.5 work, using
//     the same pattern v2.4 shipped for connectors. Turning one off always
//     leaves a working, honest path.
// ============================================================================
import { useEffect, useState } from 'react'
import { Button, Card, Field, TextInput } from './atoms'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'
import {
  DEFAULT_ENGINE, engineWarning, listEngineModels, loadEngineSettings, resetEngineSettings,
  saveEngineSettings, validateEngineDraft, type EngineProblem, type EngineSettings,
} from '../llm/provider'
import { DEFAULT_APP_FLAGS, loadAppFlags, saveAppFlags, type AppFlags } from '../lib/appFlags'

const PROBLEM_LABEL: Record<EngineProblem, TranslationKey> = {
  baseUrl: 'settings.engine.problem.baseUrl',
  scheme: 'settings.engine.problem.scheme',
  model: 'settings.engine.problem.model',
}

export function EngineSettingsCard({ apiKey }: { apiKey?: string }) {
  const t = useT()
  const [draft, setDraft] = useState<EngineSettings>(DEFAULT_ENGINE)
  const [problem, setProblem] = useState<EngineProblem | null>(null)
  const [saved, setSaved] = useState(false)
  const [listing, setListing] = useState(false)
  const [models, setModels] = useState<string[] | null>(null)

  useEffect(() => {
    void loadEngineSettings().then(setDraft)
  }, [])

  const warning = engineWarning(draft)

  async function save() {
    const checked = validateEngineDraft(draft)
    if (!checked.ok) {
      setProblem(checked.problem)
      return
    }
    setProblem(null)
    const stored = await saveEngineSettings(checked.value)
    setDraft(stored)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function reset() {
    setDraft(await resetEngineSettings())
    setProblem(null)
    setModels(null)
  }

  async function list() {
    setListing(true)
    try {
      const checked = validateEngineDraft(draft)
      if (!checked.ok) {
        setProblem(checked.problem)
        return
      }
      setModels(await listEngineModels(checked.value, apiKey))
    } catch {
      setModels([])
    } finally {
      setListing(false)
    }
  }

  return (
    <Card className="mt-4 p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-ink">{t('settings.engine.title')}</h2>
      <p className="mt-1 text-base leading-relaxed text-muted">{t('settings.engine.intro')}</p>

      <div className="mt-4 grid gap-4">
        <Field label={t('settings.engine.baseUrl')} htmlFor="engine-base-url">
          <TextInput
            id="engine-base-url"
            value={draft.baseUrl}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.engine.model')} htmlFor="engine-model">
            <TextInput
              id="engine-model"
              value={draft.model}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setDraft({ ...draft, model: event.target.value })}
            />
          </Field>
          <Field label={t('settings.engine.fastModel')} htmlFor="engine-fast-model">
            <TextInput
              id="engine-fast-model"
              value={draft.fastModel}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setDraft({ ...draft, fastModel: event.target.value })}
            />
          </Field>
        </div>

        <label className="flex min-h-tap items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 rounded border-border accent-accent"
            checked={draft.requiresKey}
            onChange={(event) => setDraft({ ...draft, requiresKey: event.target.checked })}
          />
          <span className="text-base text-ink">{t('settings.engine.requiresKey')}</span>
        </label>

        <label className="flex min-h-tap items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 rounded border-border accent-accent"
            checked={draft.fastMatching}
            onChange={(event) => setDraft({ ...draft, fastMatching: event.target.checked })}
          />
          <span className="text-base text-ink">
            {t('settings.engine.fastMatching')}
            <span className="mt-0.5 block text-sm text-faint">{t('settings.engine.fastMatchingHint')}</span>
          </span>
        </label>
      </div>

      {problem && <p className="mt-3 wrap-anywhere text-base text-danger">{t(PROBLEM_LABEL[problem])}</p>}

      {warning === 'mixed_content' && (
        <p className="mt-3 wrap-anywhere text-base text-danger">{t('settings.engine.warnMixed')}</p>
      )}
      {warning === 'insecure_dev' && (
        <p className="mt-3 wrap-anywhere text-base text-muted">{t('settings.engine.warnInsecureDev')}</p>
      )}
      {warning === 'no_key' && (
        <p className="mt-3 wrap-anywhere text-base text-muted">{t('settings.engine.warnNoKey')}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={() => void save()}>{t('settings.engine.save')}</Button>
        <Button variant="ghost" onClick={() => void list()} disabled={listing}>
          {listing ? t('settings.engine.listing') : t('settings.engine.listModels')}
        </Button>
        <Button variant="ghost" onClick={() => void reset()}>{t('settings.engine.reset')}</Button>
      </div>

      <p className="mt-3 text-sm text-success" aria-live="polite">
        {saved ? t('settings.engine.saved') : ''}
      </p>

      {models && (
        <p className="mt-2 wrap-anywhere text-sm text-muted">
          {models.length
            ? t('settings.engine.modelsFound', { models: models.slice(0, 12).join(', ') })
            : t('settings.engine.modelsNone')}
        </p>
      )}

      <p className="mt-3 wrap-anywhere text-sm text-faint">{t('settings.engine.localNote')}</p>
    </Card>
  )
}

const FLAG_LABEL: Record<keyof AppFlags, TranslationKey> = {
  jdRequirementExtractor: 'settings.flags.jdExtractor',
  tailoringReview: 'settings.flags.tailoringReview',
  customEngine: 'settings.flags.customEngine',
  packets: 'settings.flags.packets',
  deterministicMatching: 'settings.flags.deterministicMatching',
  budgetGuard: 'settings.flags.budgetGuard',
  tailoringChunking: 'settings.flags.tailoringChunking',
}

const FLAG_ORDER: (keyof AppFlags)[] = [
  'jdRequirementExtractor',
  'tailoringReview',
  'customEngine',
  'packets',
  'deterministicMatching',
  'budgetGuard',
  'tailoringChunking',
]

export function FeatureFlagsCard() {
  const t = useT()
  const [flags, setFlags] = useState<AppFlags>(DEFAULT_APP_FLAGS)

  useEffect(() => {
    void loadAppFlags().then(setFlags)
  }, [])

  async function toggle(key: keyof AppFlags, value: boolean) {
    setFlags(await saveAppFlags({ [key]: value }))
  }

  return (
    <Card className="mt-4 p-4 sm:p-6">
      <h2 className="text-xl font-semibold text-ink">{t('settings.flags.title')}</h2>
      <p className="mt-1 text-base leading-relaxed text-muted">{t('settings.flags.intro')}</p>
      <div className="mt-4 grid gap-2">
        {FLAG_ORDER.map((key) => (
          <label key={key} className="flex min-h-tap items-center gap-3">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 rounded border-border accent-accent"
              checked={flags[key]}
              onChange={(event) => void toggle(key, event.target.checked)}
            />
            <span className="text-base text-ink">{t(FLAG_LABEL[key])}</span>
          </label>
        ))}
      </div>
    </Card>
  )
}