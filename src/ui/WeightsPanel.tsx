// Weight controls (feature 1.3): let the user say how much each factor counts,
// then re-rank instantly (no LLM call). Dragging "Salary" to zero is the
// literal "I don't care about salary" correction from the requirements.
import { Card, Button } from './atoms'
import { DEFAULT_WEIGHTS, FACTOR_KEYS, weightsAreCustom } from '../match/weights'
import type { ScoreWeights } from '../types'

const LABELS: Record<string, string> = {
  skills: 'Skills',
  salary: 'Salary',
  location: 'Location',
  seniority: 'Seniority',
}

export function WeightsPanel({
  weights,
  onChange,
}: {
  weights: ScoreWeights
  onChange: (w: ScoreWeights) => void
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Tune what matters</h3>
        {weightsAreCustom(weights) && (
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onChange({ ...DEFAULT_WEIGHTS })}>
            Reset
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">Adjust a factor and the ranking updates immediately.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FACTOR_KEYS.map((k) => (
          <label key={k} className="block">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
              <span>{LABELS[k]}</span>
              <span className="tabular-nums">{Math.round(weights[k] * 100)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={weights[k]}
              onChange={(e) => onChange({ ...weights, [k]: Number(e.target.value) })}
              className="w-full accent-indigo-600"
            />
          </label>
        ))}
      </div>
    </Card>
  )
}