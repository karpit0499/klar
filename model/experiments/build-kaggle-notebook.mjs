#!/usr/bin/env node
// Keeps the two slot notebooks in sync. The Precision notebook is the authored
// source of truth; the Writer notebook is derived from it by switching the one
// beginner-visible slot switch. --check fails if the Writer copy is stale.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = path.join(here, 'klar_qwen35_adapter_kaggle_precision.ipynb')
const DERIVED = path.join(here, 'klar_qwen35_adapter_kaggle_writer.ipynb')
const SLOT_LINE_PRECISION = 'ADAPTER_SLOT = "precision"'
const SLOT_LINE_WRITER = 'ADAPTER_SLOT = "writer"'

function deriveWriter(notebook) {
  let substitutions = 0
  const cells = notebook.cells.map((cell) => {
    if (!Array.isArray(cell.source)) return cell
    const source = cell.source.map((line) => {
      if (!line.includes(SLOT_LINE_PRECISION)) return line
      substitutions += 1
      return line.split(SLOT_LINE_PRECISION).join(SLOT_LINE_WRITER)
    })
    return { ...cell, source }
  })
  if (substitutions < 2) {
    throw new Error(
      `Expected at least 2 "${SLOT_LINE_PRECISION}" lines in the Precision notebook, found ${substitutions}.`,
    )
  }
  return { ...notebook, cells }
}

const check = process.argv.includes('--check')
const sourceText = await readFile(SOURCE, 'utf8')
const notebook = JSON.parse(sourceText)
if (`${JSON.stringify(notebook, null, 1)}\n` !== sourceText) {
  throw new Error(
    `${path.basename(SOURCE)} is not serialized as JSON.stringify(notebook, null, 1) + "\\n". Re-save it before continuing.`,
  )
}
const serialized = `${JSON.stringify(deriveWriter(notebook), null, 1)}\n`

if (check) {
  let existing = null
  try {
    existing = await readFile(DERIVED, 'utf8')
  } catch {
    throw new Error(`${path.basename(DERIVED)} is missing. Run this generator without --check.`)
  }
  if (existing !== serialized) {
    throw new Error(`${path.basename(DERIVED)} is stale. Run this generator without --check.`)
  }
  console.log(`Both Kaggle notebooks are in sync (${path.basename(DERIVED)} matches ${path.basename(SOURCE)}).`)
} else {
  await writeFile(DERIVED, serialized, 'utf8')
  console.log(`Wrote ${DERIVED}`)
}
