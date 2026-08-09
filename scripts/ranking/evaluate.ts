import { evaluateSyntheticCorpus, syntheticGateFailures } from '../../qa/ranking/evaluate.ts'

const report = evaluateSyntheticCorpus()
console.log(JSON.stringify(report, null, 2))
console.error('Synthetic diagnostic only: this result is never human release evidence.')

const failures = syntheticGateFailures(report)
if (failures.length) {
  for (const failure of failures) console.error(`ranking gate failed: ${failure}`)
  process.exitCode = 1
}