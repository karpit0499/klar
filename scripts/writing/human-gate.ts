import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { evaluateWritingHumanGate } from '../../qa/writing/gate.ts'
import type {
  WritingAdjudication,
  WritingEvaluationCorpus,
  WritingReviewBundle,
  WritingReviewerSubmission,
} from '../../qa/writing/humanReview.ts'

type CliOptions = {
  corpus?: string
  reviewerA?: string
  reviewerB?: string
  adjudication?: string
  out?: string
  development: boolean
}

const options = parseArgs(process.argv.slice(2))
if (
  !options.corpus ||
  !options.reviewerA ||
  !options.reviewerB ||
  !options.adjudication
) {
  printUsage()
  process.exitCode = 2
} else {
  const bundle: WritingReviewBundle = {
    corpus: await readJson<WritingEvaluationCorpus>(options.corpus),
    reviewers: [
      await readJson<WritingReviewerSubmission>(options.reviewerA),
      await readJson<WritingReviewerSubmission>(options.reviewerB),
    ],
    adjudication: await readJson<WritingAdjudication>(options.adjudication),
  }
  const report = evaluateWritingHumanGate(bundle, {
    releaseMode: !options.development,
  })
  const rendered = `${JSON.stringify(report, null, 2)}\n`
  process.stdout.write(rendered)
  if (options.out) {
    await writeFile(resolve(options.out), rendered, { encoding: 'utf8', flag: 'wx' })
    process.stderr.write(`Writing report written once to ${resolve(options.out)}\n`)
  }
  if (!report.evaluated) {
    for (const issue of report.validationIssues) {
      process.stderr.write(`writing evidence invalid: ${issue}\n`)
    }
    process.exitCode = 1
  } else if (!options.development && report.decision !== 'PASS') {
    for (const gate of report.gates.filter((entry) => !entry.passed)) {
      process.stderr.write(`writing gate failed: ${gate.id} — ${gate.evidence}\n`)
    }
    process.exitCode = 1
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { development: false }
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === '--development') {
      options.development = true
      continue
    }
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a file path`)
    if (token === '--corpus') options.corpus = value
    else if (token === '--reviewer-a') options.reviewerA = value
    else if (token === '--reviewer-b') options.reviewerB = value
    else if (token === '--adjudication') options.adjudication = value
    else if (token === '--out') options.out = value
    else throw new Error(`Unknown argument: ${token}`)
    index += 1
  }
  return options
}

async function readJson<T>(path: string): Promise<T> {
  const absolute = resolve(path)
  try {
    return JSON.parse(await readFile(absolute, 'utf8')) as T
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Cannot read ${absolute}: ${detail}`)
  }
}

function printUsage(): void {
  process.stderr.write([
    'Klar v2.6 bilingual human writing gate',
    '',
    'Usage:',
    '  npx tsx scripts/writing/human-gate.ts \\',
    '    --corpus qa-evidence/writing-corpus.json \\',
    '    --reviewer-a qa-evidence/writing-reviewer-a.json \\',
    '    --reviewer-b qa-evidence/writing-reviewer-b.json \\',
    '    --adjudication qa-evidence/writing-adjudication.json \\',
    '    --out qa-evidence/writing-gate-report.json',
    '',
    'The default accepts only locked bilingual human release evidence.',
    '--development computes diagnostics for test fixtures but always returns HOLD.',
    '',
  ].join('\n'))
}
