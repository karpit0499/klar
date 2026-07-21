// Weight controls (feature 1.3): let the user say how much each factor counts,
// then re-rank instantly (no LLM call). Dragging "Salary" to zero is the
// literal "I don't care about salary" correction from the requirements.
import { Card, Button } from './atoms'
import { DEFAULT_WEIGHTS, FACTOR_KEYS, weightsAreCustom } from '../match/weights'
import type { ScoreWeights } from '../types'
import { useT } from '../i18n/LocaleProvider'
import type { TranslationKey } from '../i18n/translations'

// The same shared factor.* labels the JobDrawer breakdown uses.
const FACTOR_LABEL_KEY: Record<string, TranslationKey> = {
  skills: 'factor.skills',
  salary: 'factor.salary',
  location: 'factor.location',
  seniority: 'factor.seniority',
}

export function WeightsPanel({
  weights,
  onChange,
}: {
  weights: ScoreWeights
  onChange: (w: ScoreWeights) => void
}) {
  const t = useT()
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{t('weights.title')}</h3>
        {weightsAreCustom(weights) && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ ...DEFAULT_WEIGHTS })}>
            {t('common.reset')}
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-faint">{t('weights.hint')}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FACTOR_KEYS.map((k) => (
          <label key={k} className="block">
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>{t(FACTOR_LABEL_KEY[k])}</span>
              <span className="tabular-nums">{Math.round(weights[k] * 100)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={weights[k]}
              onChange={(e) => onChange({ ...weights, [k]: Number(e.target.value) })}
              className="w-full accent-accent"
            />
          </label>
        ))}
      </div>
    </Card>
  )
}