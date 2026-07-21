// Run with: npx tsx test/netto.test.ts
// Covers the Brutto→Netto German salary estimator (feature 21). We assert the
// OFFICIAL 2025 §32a boundaries exactly and check the monotonic properties a
// correct estimator must have (rather than pinning fragile euro amounts).
import { incomeTax2025, estimateNetSalary, type NettoInput } from '../src/salary/netto.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

// ---- §32a 2025 formula boundaries ------------------------------------------
ok(incomeTax2025(12_096) === 0, '§32a: at the Grundfreibetrag tax is 0')
ok(incomeTax2025(12_000) === 0, '§32a: below the Grundfreibetrag tax is 0')
ok(incomeTax2025(20_000) > 0, '§32a: above the allowance tax is positive')
// Top linear zone: 0.42·x − 10,911.92 at x = 100,000 → 31,088.08
ok(Math.abs(incomeTax2025(100_000) - 31_088.08) < 0.02, '§32a: 42% linear zone matches the formula')
// Richensteuer zone: 0.45·x − 19,246.67 at x = 300,000 → 115,753.33
ok(Math.abs(incomeTax2025(300_000) - 115_753.33) < 0.02, '§32a: 45% top zone matches the formula')
// Progressivity: tax rises with income.
ok(incomeTax2025(50_000) > incomeTax2025(40_000), '§32a: monotonically increasing')

const base = (over: Partial<NettoInput> = {}): NettoInput => ({
  grossAnnual: 65_000, taxClass: 1, churchRate: 0, childless: true, ...over,
})

// ---- sanity: net is a sensible fraction of gross ---------------------------
{
  const r = estimateNetSalary(base())
  ok(r.netAnnual > 0 && r.netAnnual < r.grossAnnual, 'net: strictly between 0 and gross')
  ok(r.netMonthly === Math.round((r.netAnnual / 12) * 100) / 100, 'net: monthly = annual / 12')
  // A €65k class-I single in Germany nets very roughly €40–45k; assert a band.
  ok(r.netAnnual > 38_000 && r.netAnnual < 47_000, 'net: €65k class I lands in a realistic band')
  ok(r.effectiveRate > 0.25 && r.effectiveRate < 0.45, 'net: effective deduction rate is realistic')
}

// ---- monotonic in gross ----------------------------------------------------
ok(estimateNetSalary(base({ grossAnnual: 80_000 })).netAnnual >
   estimateNetSalary(base({ grossAnnual: 60_000 })).netAnnual, 'net: higher gross → higher net')

// ---- church tax reduces net ------------------------------------------------
ok(estimateNetSalary(base({ churchRate: 0.09 })).netAnnual <
   estimateNetSalary(base({ churchRate: 0 })).netAnnual, 'net: church tax lowers net')

// ---- tax-class ordering: III (splitting) > I > V ---------------------------
{
  const cI = estimateNetSalary(base({ taxClass: 1 })).netAnnual
  const cIII = estimateNetSalary(base({ taxClass: 3 })).netAnnual
  const cV = estimateNetSalary(base({ taxClass: 5 })).netAnnual
  ok(cIII > cI, 'class: III nets more than I (splitting best-case)')
  ok(cV < cI, 'class: V nets less than I')
}

// ---- childless surcharge reduces net --------------------------------------
ok(estimateNetSalary(base({ childless: true })).care >
   estimateNetSalary(base({ childless: false })).care, 'care: childless surcharge adds to PV')

// ---- contribution ceilings cap the social share ---------------------------
{
  // Above both ceilings, RV/AV and KV/PV stop growing.
  const hi = estimateNetSalary(base({ grossAnnual: 200_000 }))
  const veryHi = estimateNetSalary(base({ grossAnnual: 400_000 }))
  ok(hi.pension === veryHi.pension, 'ceiling: pension capped at the BBG')
  ok(hi.health === veryHi.health, 'ceiling: health capped at the BBG')
}

// ---- output carries an honest disclaimer + assumptions ---------------------
{
  const r = estimateNetSalary(base())
  ok(/not tax advice/i.test(r.disclaimer), 'output: carries a not-tax-advice disclaimer')
  ok(r.assumptions.length >= 4, 'output: lists its assumptions')
}

console.log(`\nNetto tests: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)