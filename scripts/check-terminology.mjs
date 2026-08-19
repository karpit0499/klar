import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'

const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.jsonc', '.jsx', '.md', '.mjs',
  '.svg', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml',
])
const RETIRED_RESUME = /(?:r(?:é|e\u0301)sum(?:é|e\u0301)|resum(?:é|e\u0301))/giu

const checkedFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
  .filter((file) => TEXT_EXTENSIONS.has(extname(file).toLowerCase()))

const failures = []
for (const file of checkedFiles) {
  // A release may deliberately delete a tracked text file (for example, the
  // retired KB hosting manifest) before the change is committed.
  if (!existsSync(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(RETIRED_RESUME)) {
    const line = text.slice(0, match.index).split('\n').length
    failures.push(`${file}:${line}: ${JSON.stringify(match[0])}`)
  }
}

if (failures.length) {
  console.error('Use "Resume" in English and "Lebenslauf" in German. Retired spelling found:')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

console.log(`Terminology check passed across ${checkedFiles.length} repository text files.`)
