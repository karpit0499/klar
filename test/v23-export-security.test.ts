import { strict as assert } from 'node:assert'
import {
  rowsToCsv,
  rowsToSheetData,
  safeSheetName,
  safeSpreadsheetCell,
} from '../src/export/exporters'

const rows = [
  { title: '=HYPERLINK("https://attacker.invalid")', company: 'Example', score: 42 },
  { title: '  +SUM(1,1)', company: '@malicious', score: -1 },
]

assert.equal(safeSpreadsheetCell('Normal title'), 'Normal title')
assert.equal(safeSpreadsheetCell('=1+1'), "'=1+1")
assert.equal(safeSpreadsheetCell('  @command'), "'  @command")
assert.equal(safeSpreadsheetCell(-5), -5)

const csv = rowsToCsv(rows)
assert.match(csv, /^title,company,score\r\n/)
assert.match(csv, /"'=HYPERLINK\(""https:\/\/attacker\.invalid""\)"/)
assert.match(csv, /'@malicious/)

assert.deepEqual(rowsToSheetData(rows), [
  ['title', 'company', 'score'],
  ["'=HYPERLINK(\"https://attacker.invalid\")", 'Example', 42],
  ["'  +SUM(1,1)", "'@malicious", -1],
])
assert.equal(safeSheetName('Applications: July/2026'), 'Applications  July 2026')
assert.equal(safeSheetName(''), 'Sheet1')
assert.equal(safeSheetName('a'.repeat(40)).length, 31)

console.log('v23-export-security.test.ts: all tests passed')