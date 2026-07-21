// ============================================================================
// Brutto → Netto (gross → net) salary estimator for Germany (feature 21).
//
// DELIBERATELY A BALLPARK — clearly labelled "estimate, not tax advice". German
// net pay depends on tax class, church tax, health-insurer Zusatzbeitrag, kids,
// state, and more; an exact figure needs a full payroll engine. This gives a
// close, transparent approximation from a handful of inputs, using the OFFICIAL
// 2025 income-tax formula (§32a EStG) plus standard 2025 social-security rates
// and contribution ceilings. Every number is a pure function → fully testable.
//
// Verify the year's constants at build time (rates/ceilings change annually);
// they all live in the CONSTANTS block so an update is a one-place edit.
// ============================================================================

/** 2025 constants. Update these once a year — nothing else needs to change. */
export const DE_2025 = {
  year: 2025,
  // Income-tax (§32a EStG 2025) — Grundfreibetrag baked into the formula.
  grundfreibetrag: 12_096,
  // Social-security employee shares.
  pensionRate: 0.093, // Rentenversicherung (RV)
  unemploymentRate: 0.013, // Arbeitslosenversicherung (AV)
  healthRate: 0.073, // Krankenversicherung base (KV)
  healthZusatzHalf: 0.0125, // half the 2025 average Zusatzbeitrag (~2.5%)
  careRate: 0.018, // Pflegeversicherung (PV) employee base
  careChildlessSurcharge: 0.006, // extra for childless employees 23+
  // Contribution ceilings (annual, 2025, nationwide).
  bbgPensionUnemployment: 96_600, // RV + AV ceiling
  bbgHealthCare: 66_150, // KV + PV ceiling
  // Lump-sum deduction (Werbungskostenpauschale).
  werbungskosten: 1_230,
  // Solidaritätszuschlag: 5.5% of income tax above a Freigrenze (single).
  soliRate: 0.055,
  soliFreigrenzeSingle: 19_950,
  soliMilderungRate: 0.119,
} as const

export type TaxClass = 1 | 2 | 3 | 4 | 5 | 6
/** 0 = no church tax; 0.08 = Bavaria/Baden-Württemberg; 0.09 = elsewhere. */
export type ChurchRate = 0 | 0.08 | 0.09

export type NettoInput = {
  grossAnnual: number
  taxClass: TaxClass
  churchRate: ChurchRate
  /** Childless 23+ pay a small extra care-insurance surcharge. */
  childless: boolean
}

export type NettoBreakdown = {
  grossAnnual: number
  incomeTax: number
  soli: number
  churchTax: number
  pension: number
  unemployment: number
  health: number
  care: number
  totalDeductions: number
  netAnnual: number
  netMonthly: number
  effectiveRate: number // totalDeductions / gross, 0–1
  assumptions: string[]
  disclaimer: string
}

/** The official 2025 §32a income-tax formula. Input rounded down to whole euro. */
export function incomeTax2025(zvE: number): number {
  const x = Math.floor(Math.max(0, zvE))
  if (x <= 12_096) return 0
  if (x <= 17_443) {
    const y = (x - 12_096) / 10_000
    return round2((932.30 * y + 1_400) * y)
  }
  if (x <= 68_480) {
    const z = (x - 17_443) / 10_000
    return round2((176.64 * z + 2_397) * z + 1_015.13)
  }
  if (x <= 277_825) return round2(0.42 * x - 10_911.92)
  return round2(0.45 * x - 19_246.67)
}

/** Solidaritätszuschlag with the single-filer Freigrenze + Milderungszone. */
function soli(incomeTax: number, freigrenze: number): number {
  if (incomeTax <= freigrenze) return 0
  return round2(Math.min(DE_2025.soliRate * incomeTax, DE_2025.soliMilderungRate * (incomeTax - freigrenze)))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Estimate annual/monthly net pay. Tax-class handling is intentionally simple:
 *   • I / II / IV → the §32a formula on the individual's taxable income.
 *   • III → splitting best-case (formula on half, doubled) assuming a
 *           non-earning partner — the most favourable, clearly stated.
 *   • V → a higher effective burden (partner takes class III); approximated.
 *   • VI → second job, no allowances; approximated as no Grundfreibetrag.
 */
export function estimateNetSalary(input: NettoInput): NettoBreakdown {
  const gross = Math.max(0, input.grossAnnual)
  const c = DE_2025

  // 1. Social-security employee contributions (capped at the ceilings).
  const rvBase = Math.min(gross, c.bbgPensionUnemployment)
  const kvBase = Math.min(gross, c.bbgHealthCare)
  const pension = round2(rvBase * c.pensionRate)
  const unemployment = round2(rvBase * c.unemploymentRate)
  const health = round2(kvBase * (c.healthRate + c.healthZusatzHalf))
  const care = round2(kvBase * (c.careRate + (input.childless ? c.careChildlessSurcharge : 0)))

  // 2. Taxable income ≈ gross − Werbungskosten − deductible provisions
  //    (a pragmatic stand-in for the Vorsorgepauschale: pension + health + care).
  const deductibleProvisions = pension + health + care
  let taxable = Math.max(0, gross - c.werbungskosten - deductibleProvisions)

  // 3. Income tax by class.
  let incomeTax: number
  let soliFreigrenze = c.soliFreigrenzeSingle
  if (input.taxClass === 3) {
    incomeTax = round2(2 * incomeTax2025(taxable / 2))
    soliFreigrenze = c.soliFreigrenzeSingle * 2
  } else if (input.taxClass === 5) {
    // Class V carries a heavier load (partner uses III). Rough uplift.
    incomeTax = round2(incomeTax2025(taxable) * 1.25 + taxable * 0.06)
  } else if (input.taxClass === 6) {
    // No Grundfreibetrag on a second job → tax as if the tax-free allowance is
    // already used up. Shift the income UP by the Grundfreibetrag so its first
    // euro is taxed at the entry rate. (The old `+ incomeTax2025(grundfreibetrag)`
    // added ZERO — tax on exactly the Grundfreibetrag is 0 — so class VI silently
    // collapsed onto class I instead of carrying the heavier no-allowance burden.)
    incomeTax = round2(incomeTax2025(taxable + c.grundfreibetrag))
  } else {
    incomeTax = incomeTax2025(taxable) // I / II / IV
  }

  const soliAmt = soli(incomeTax, soliFreigrenze)
  const churchTax = round2(incomeTax * input.churchRate)

  const totalDeductions = round2(
    incomeTax + soliAmt + churchTax + pension + unemployment + health + care,
  )
  const netAnnual = round2(gross - totalDeductions)
  const netMonthly = round2(netAnnual / 12)
  const effectiveRate = gross > 0 ? round2(totalDeductions / gross) : 0

  return {
    grossAnnual: gross,
    incomeTax,
    soli: soliAmt,
    churchTax,
    pension,
    unemployment,
    health,
    care,
    totalDeductions,
    netAnnual,
    netMonthly,
    effectiveRate,
    assumptions: [
      `${c.year} rates and contribution ceilings`,
      `Tax class ${input.taxClass}${input.taxClass === 3 ? ' (splitting best-case, non-earning partner)' : ''}`,
      input.churchRate ? `Church tax ${Math.round(input.churchRate * 100)}%` : 'No church tax',
      input.childless ? 'Childless care surcharge applied' : 'With children (no care surcharge)',
      'Average health-insurer Zusatzbeitrag; no other allowances (children, commute, etc.)',
    ],
    disclaimer: 'Ballpark estimate only — not tax advice. Your actual net pay depends on your insurer, allowances, and personal circumstances.',
  }
}