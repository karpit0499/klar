import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { db } from '../src/db/db'
import {
  analyzeResume,
  deriveProfile,
  normalizeResume,
} from '../src/resume/canonical'
import {
  loadCanonicalResume,
  loadResumeHistory,
  pruneHistory,
  replaceCanonicalResume,
  restoreSnapshot,
  saveCanonicalResume,
  saveResumeDraft,
} from '../src/resume/store'
import {
  clearOnboardingProgress,
  detectLocalSetupState,
  saveOnboardingProgress,
} from '../src/onboarding/setupState'
import { savePreferences } from '../src/storage/careerData'
import { buildCoverLetterPrompt } from '../src/llm/coverLetter'
import { buildInterviewPrompt } from '../src/llm/interview'
import { runMatching } from '../src/match'
import { makeJob } from '../src/sources/normalize'

await resetDb()

const canonical = normalizeResume({
  contact: { name: 'Ada Example', email: 'ada@example.test', links: [{ label: 'Portfolio', url: 'https://example.test' }] },
  summary: 'Platform engineer.',
  experience: [{
    title: 'Platform Engineer', company: 'Example GmbH', start: '01/2022', current: true,
    bullets: ['Reduced deployment recovery time by 30% using tested rollback automation.'],
  }],
  education: [{ degree: 'MSc', field: 'Computer Science', institution: 'Example University' }],
  skills: [{ group: 'Platform', items: ['TypeScript', 'Kubernetes'] }],
  languages: [{ lang: 'English', level: 'C1' }],
  projects: [{ name: 'Release guard', summary: 'Validated deployment readiness.', tech: ['TypeScript'] }],
  certifications: [{ name: 'Cloud Engineer', issuer: 'Example' }],
}, 'upload')

assert.equal(canonical.schemaVersion, 2)
assert.ok(canonical.experience[0].id)
assert.ok(canonical.experience[0].bullets[0].id)
assert.ok(canonical.skills[0].items[0].evidenceRefs.length > 0)

const profile = deriveProfile(canonical)
assert.deepEqual(profile.titles.map((item) => item.title), ['Platform Engineer'])
assert.deepEqual(profile.skills.map((item) => item.name), ['TypeScript', 'Kubernetes'])
assert.ok((profile.totalYears ?? 0) > 4)

const readiness = analyzeResume(canonical)
assert.equal(readiness.roleCount, 1)
assert.equal(readiness.missingDateCount, 0)
assert.equal(readiness.rolesWithoutAchievements, 0)
assert.match(readiness.summary, /1 role/)

assert.deepEqual(await detectLocalSetupState(), { kind: 'absent', resumeAt: 'welcome', discoveryMode: 'career' })
await saveResumeDraft(canonical)
await saveOnboardingProgress('review')
assert.deepEqual(await detectLocalSetupState(), {
  kind: 'partial', resumeAt: 'review', discoveryMode: 'career',
  hasResume: false, hasDraft: true, hasPreferences: false,
  capabilities: {
    canDiscoverCareer: false, canDiscoverFlexible: false,
    canPrepareApplications: false, canUseResumeMatching: false,
  },
})

await db.matches.put({
  cacheKey: 'stale', jobId: 'j', fitScore: 10, verdict: 'weak', rationale: '',
  matchedSkills: [], missingSkills: [], redFlags: [], scoredAt: new Date().toISOString(), modelVersion: 'old',
})
await saveCanonicalResume(canonical, { snapshotCurrent: false })
assert.equal(await db.matches.count(), 0)
assert.equal(await db.profiles.count(), 0, 'thin profiles are never independently persisted')
await saveOnboardingProgress('preferences')
assert.equal((await detectLocalSetupState()).kind, 'partial')
await savePreferences({
  targetTitles: ['Platform Engineer'], fields: [], seniority: 'mid',
  salary: { currency: 'EUR', period: 'year' }, locations: [], workAuth: {}, languages: [],
  mustHaves: [], dealbreakers: [],
})
await clearOnboardingProgress()
assert.equal((await detectLocalSetupState()).kind, 'complete')

const replacement = normalizeResume({ ...canonical, summary: 'Replacement summary.' })
await replaceCanonicalResume(replacement)
const history = await loadResumeHistory()
assert.equal(history.length, 1)
assert.equal(history[0].reason, 'reupload')
assert.equal(history[0].data.summary, 'Platform engineer.')
await restoreSnapshot(history[0].id)
assert.equal((await loadCanonicalResume())?.data.summary, 'Platform engineer.')

const now = new Date('2026-07-22T00:00:00.000Z')
const many = Array.from({ length: 14 }, (_, index) => ({
  id: `automatic-${index}`, data: canonical,
  createdAt: new Date(now.getTime() - index * 24 * 60 * 60 * 1000).toISOString(),
  reason: 'edit' as const,
}))
many.push({
  id: 'named-old', data: canonical, createdAt: '2020-01-01T00:00:00.000Z',
  reason: 'manual', name: 'Keep forever',
} as typeof many[number] & { name: string })
const pruned = pruneHistory(many, now)
assert.equal(pruned.filter((item) => !item.name).length, 10)
assert.ok(pruned.some((item) => item.id === 'named-old'))

const job = makeJob({
  source: 'arbeitnow', source_id: '1', title: 'Platform Engineer', company: 'Target GmbH',
  location: { country: 'DE', city: 'Berlin', remote: true },
  description: 'TypeScript Kubernetes platform role', url: 'https://example.test/job',
})
const coverPrompt = buildCoverLetterPrompt(canonical, job)
const interviewPrompt = buildInterviewPrompt(canonical, job)
assert.ok(coverPrompt.includes(canonical.experience[0].bullets[0].id))
assert.ok(coverPrompt.includes('Reduced deployment recovery time'))
assert.ok(interviewPrompt.includes(canonical.experience[0].bullets[0].id))

const localMatches = await runMatching([job], profile, {
  targetTitles: ['Platform Engineer'], fields: [], seniority: 'mid',
  salary: { currency: 'EUR', period: 'year' }, locations: [], workAuth: {}, languages: [],
  mustHaves: [], dealbreakers: [],
}, undefined)
assert.equal(localMatches[0].modelVersion, 'local-v2.3')

console.log('v23-canonical.test.ts: all tests passed')

async function resetDb() {
  db.close(); await db.delete(); await db.open()
}