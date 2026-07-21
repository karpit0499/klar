// Run with: npx tsx test/discovery.test.ts
// Covers employment-type classification/filters (features 7 & 8) and the local
// hide-list / distance / recency filters (feature 9).
import {
  classifyEmployment, filterByEmployment, filterStudentRoles, employmentCounts,
} from '../src/match/employment.ts'
import {
  haversineKm, isHidden, passesLocalFilters, applyLocalFilters,
} from '../src/match/localFilters.ts'
import { makeJob } from '../src/sources/normalize.ts'
import type { NormalizedJob } from '../src/types.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

function job(over: {
  title?: string; company?: string; description?: string; employment_type?: string
  remote?: boolean; lat?: number; lng?: number; posted_at?: string
}): NormalizedJob {
  return makeJob({
    source: 'ba', source_id: (over.title ?? '') + (over.company ?? ''),
    title: over.title ?? 'Role', company: over.company ?? 'Co',
    location: { country: 'DE', remote: over.remote ?? false, city: 'Berlin', lat: over.lat, lng: over.lng },
    description: over.description ?? '', url: 'https://x/' + Math.random(),
    employment_type: over.employment_type, posted_at: over.posted_at,
  })
}

// ===== EMPLOYMENT CLASSIFICATION (7) ========================================
ok(classifyEmployment(job({ employment_type: 'full-time' })) === 'full-time', 'emp: structured full-time')
ok(classifyEmployment(job({ employment_type: 'part_time' })) === 'part-time', 'emp: structured part_time (underscore)')
ok(classifyEmployment(job({ title: 'Werkstudent Data Science (m/w/d)' })) === 'werkstudent', 'emp: Werkstudent from title')
ok(classifyEmployment(job({ title: 'Working Student — ML' })) === 'werkstudent', 'emp: English working student')
ok(classifyEmployment(job({ description: 'Dies ist ein Minijob auf 538-€-Basis.' })) === 'minijob', 'emp: Minijob from description')
ok(classifyEmployment(job({ title: 'Praktikum im Data-Team' })) === 'internship', 'emp: Praktikum → internship')
ok(classifyEmployment(job({ title: 'Data Engineer (Vollzeit)' })) === 'full-time', 'emp: Vollzeit → full-time')
ok(classifyEmployment(job({ title: 'Teilzeit Analyst' })) === 'part-time', 'emp: Teilzeit → part-time')
ok(classifyEmployment(job({ description: 'Freelance contract, 6 months, befristet.' })) === 'contract', 'emp: freelance/contract')
ok(classifyEmployment(job({ title: 'Data Scientist' })) === 'other', 'emp: unknown → other')
// Specificity: Werkstudent beats a generic "student" and part-time hint.
ok(classifyEmployment(job({ title: 'Werkstudent (Teilzeit) Analytics' })) === 'werkstudent', 'emp: Werkstudent wins over Teilzeit')

// ===== EMPLOYMENT FILTERING (7) =============================================
{
  const jobs = [
    job({ title: 'Senior DS', employment_type: 'full-time' }),
    job({ title: 'Werkstudent DS' }),
    job({ title: 'Teilzeit Analyst' }),
    job({ title: 'Praktikum DS' }),
    job({ title: 'Mystery role' }), // other
  ]
  ok(filterByEmployment(jobs, []).length === 5, 'filter: empty selection keeps everything')
  ok(filterByEmployment(jobs, ['full-time']).length === 1, 'filter: full-time only')
  ok(filterByEmployment(jobs, ['werkstudent', 'part-time']).length === 2, 'filter: multi-select')
  ok(!filterByEmployment(jobs, ['full-time']).some((j) => j.title === 'Mystery role'), 'filter: other excluded once narrowed')

  const counts = employmentCounts(jobs)
  ok(counts['full-time'] === 1 && counts.werkstudent === 1 && counts.other === 1, 'counts: per-category tallies')
}

// ===== STUDENT MODE (8) =====================================================
{
  const jobs = [
    job({ title: 'Werkstudent DS' }),
    job({ title: 'Teilzeit Analyst' }),
    job({ description: 'Minijob' }),
    job({ title: 'Senior DS', employment_type: 'full-time' }),
    job({ title: 'Praktikum' }),
  ]
  const studenty = filterStudentRoles(jobs)
  ok(studenty.length === 3, 'student: keeps Werkstudent + Teilzeit + Minijob')
  ok(!studenty.some((j) => j.employment_type === 'full-time'), 'student: excludes full-time')
  ok(!studenty.some((j) => /praktikum/i.test(j.title)), 'student: excludes internship')
}

// ===== HAVERSINE (9) ========================================================
{
  const berlin = { lat: 52.52, lng: 13.405 }
  const munich = { lat: 48.1372, lng: 11.5756 }
  const d = haversineKm(berlin, munich)
  ok(d > 480 && d < 520, 'haversine: Berlin↔Munich ≈ 500 km')
  ok(haversineKm(berlin, berlin) < 0.001, 'haversine: zero distance to self')
}

// ===== HIDE-LIST (9) ========================================================
{
  ok(isHidden(job({ company: 'Nachhilfe Berlin GmbH' }), ['nachhilfe']), 'hide: substring, suffix-insensitive')
  ok(isHidden(job({ company: 'Düsseldorf Recruiting' }), ['dusseldorf recruiting']), 'hide: accent-insensitive')
  ok(!isHidden(job({ company: 'DeepL' }), ['nachhilfe']), 'hide: non-match kept')
  ok(!isHidden(job({ company: 'DeepL' }), []), 'hide: empty list hides nothing')
}

// ===== DISTANCE + RECENCY + COMBINED (9) ====================================
{
  const NOW = new Date('2026-07-21T00:00:00Z').getTime()
  const origin = { lat: 52.52, lng: 13.405 } // Berlin
  const near = job({ title: 'Near', lat: 52.5, lng: 13.4, posted_at: '2026-07-20T00:00:00Z' })
  const far = job({ title: 'Far', lat: 48.14, lng: 11.58, posted_at: '2026-07-20T00:00:00Z' })
  const remote = job({ title: 'Remote', remote: true, posted_at: '2026-07-20T00:00:00Z' })
  const nocoord = job({ title: 'NoCoord', posted_at: '2026-07-20T00:00:00Z' })
  const old = job({ title: 'Old', lat: 52.5, lng: 13.4, posted_at: '2026-01-01T00:00:00Z' })

  ok(passesLocalFilters(near, { maxDistanceKm: 50, origin, now: NOW }), 'distance: near kept')
  ok(!passesLocalFilters(far, { maxDistanceKm: 50, origin, now: NOW }), 'distance: far dropped')
  ok(passesLocalFilters(remote, { maxDistanceKm: 50, origin, now: NOW }), 'distance: remote kept regardless')
  ok(passesLocalFilters(nocoord, { maxDistanceKm: 50, origin, now: NOW }), 'distance: unlocatable kept by default')
  ok(!passesLocalFilters(nocoord, { maxDistanceKm: 50, origin, now: NOW, keepUnlocatable: false }), 'distance: unlocatable dropped when strict')

  ok(passesLocalFilters(near, { maxAgeDays: 7, now: NOW }), 'recency: recent kept')
  ok(!passesLocalFilters(old, { maxAgeDays: 7, now: NOW }), 'recency: old dropped')

  const all = [near, far, remote, nocoord, old]
  const filtered = applyLocalFilters(all, { maxDistanceKm: 50, origin, maxAgeDays: 7, now: NOW })
  ok(filtered.length === 3, 'combined: distance + recency together (near, remote, nocoord)')
}

console.log(`\nDiscovery tests: ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)