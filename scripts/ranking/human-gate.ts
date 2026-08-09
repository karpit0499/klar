import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { evaluateHumanRankingGate } from '../../qa/ranking/humanGate.ts'

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
  const bundle = {
    corpus: await readJson(options.corpus),
    reviewers: [
      await readJson(options.reviewerA),
      await readJson(options.reviewerB),
    ],
    adjudication: await readJson(options.adjudication),
  }
  const report = evaluateHumanRankingGate(bundle, {
    releaseMode: !options.development,
  })
  const rendered = `${JSON.stringify(report, null, 2)}\n`
  process.stdout.write(rendered)
  if (options.out) {
    await writeFile(resolve(options.out), rendered, { encoding: 'utf8', flag: 'wx' })
    process.stderr.write(`Ranking report written once to ${resolve(options.out)}\n`)
  }
  if (!report.evaluated) {
    for (const issue of report.validationIssues) {
      process.stderr.write(`ranking evidence invalid: ${issue}\n`)
    }
    process.exitCode = 1
  } else if (!options.development && !report.passed) {
    for (const gate of report.gates.filter((entry) => !entry.passed)) {
      process.stderr.write(`ranking gate failed: ${gate.id} — ${gate.evidence}\n`)
    }
    for (const issue of report.validationIssues) {
      process.stderr.write(`ranking evidence invalid: ${issue}\n`)
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
    if (!value || value.startsWith('--')) {
      throw new Error(`${token} requires a file path`)
    }
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

async function readJson(path: string): Promise<unknown> {
  const absolute = resolve(path)
  try {
    return JSON.parse(await readFile(absolute, 'utf8')) as unknown
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Cannot read ${absolute}: ${detail}`)
  }
}

function printUsage(): void {
  process.stderr.write([
    'Human release ranking gate (decision 6A)',
    '',
    'Usage:',
    '  npx tsx scripts/ranking/human-gate.ts \\',
    '    --corpus qa-evidence/human-corpus.json \\',
    '    --reviewer-a qa-evidence/reviewer-a.json \\',
    '    --reviewer-b qa-evidence/reviewer-b.json \\',
    '    --adjudication qa-evidence/adjudication.json \\',
    '    --out qa-evidence/ranking-report.json',
    '',
    'The default is the release gate and accepts only locked human evidence.',
    'Use --development for synthetic/test harness debugging; it can never pass release.',
    '',
  ].join('\n'))
}
