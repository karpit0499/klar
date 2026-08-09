#!/usr/bin/env node
import {
  readdir,
  stat,
} from 'node:fs/promises'
import path from 'node:path'

const LIMITS = Object.freeze({
  largestApplicationJavaScript: 1_000_000,
  totalApplicationJavaScript: 2_300_000,
  largestStyleSheet: 100_000,
  pdfWorker: 1_500_000,
})

const assets = path.resolve('dist', 'assets')
const entries = await readdir(assets)
const files = await Promise.all(entries.map(async (name) => ({
  name,
  bytes: (await stat(path.join(assets, name))).size,
})))

const pdfWorkers = files.filter((file) => file.name.startsWith('pdf.worker.'))
const applicationJavaScript = files.filter((file) =>
  /\.(?:js|mjs)$/.test(file.name) && !file.name.startsWith('pdf.worker.'))
const styleSheets = files.filter((file) => file.name.endsWith('.css'))

function largest(rows) {
  return rows.reduce((maximum, row) => Math.max(maximum, row.bytes), 0)
}

const measurements = {
  largestApplicationJavaScript: largest(applicationJavaScript),
  totalApplicationJavaScript: applicationJavaScript.reduce(
    (total, file) => total + file.bytes,
    0,
  ),
  largestStyleSheet: largest(styleSheets),
  pdfWorker: largest(pdfWorkers),
}
const failures = Object.entries(measurements)
  .filter(([name, bytes]) => bytes > LIMITS[name])
  .map(([name, bytes]) =>
    `${name}: ${bytes} bytes exceeds ${LIMITS[name]} bytes`)

console.log(JSON.stringify({
  schemaVersion: 1,
  measurements,
  limits: LIMITS,
  passed: failures.length === 0,
}, null, 2))

if (failures.length) {
  throw new Error(`Bundle-size gate failed:\n${failures.join('\n')}`)
}
