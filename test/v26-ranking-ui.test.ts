import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const search = readFileSync('src/ui/SearchStep.tsx', 'utf8')
const drawer = readFileSync('src/ui/JobDrawer.tsx', 'utf8')
const tracker = readFileSync('src/ui/TrackerBoard.tsx', 'utf8')

assert.match(search, /match\.ranking\?\.rank/)
assert.match(search, /match\.ranking\?\.features\.scores\.final/)
assert.match(search, /mergeAiExplanationWithLocal/)
assert.doesNotMatch(search, /<WeightsPanel/)
assert.doesNotMatch(search, /compositeScore/)
assert.match(drawer, /Why this job ranked here/)
assert.match(drawer, /Begründung der Rangfolge/)
assert.match(drawer, /not a probability of being hired/)
assert.match(drawer, /keine Einstellungswahrscheinlichkeit/)
assert.match(drawer, /Missing must-haves/)
assert.match(drawer, /Uncertain facts/)
assert.match(drawer, /Posting quality/)
// A tracked row renders the number stored with it. Live weights must never
// reach a historical result, so the board reads the normalized snapshot and
// never recomputes a composite score.
assert.match(tracker, /normalizeHistoricalRanking\(row\.match\)\.features\.scores\.final/)
assert.match(tracker, /trackerScoreIsHistorical/)
assert.doesNotMatch(tracker, /compositeScore/)
assert.doesNotMatch(tracker, /ScoreWeights/)

console.log('v26-ranking-ui.test.ts: all tests passed')