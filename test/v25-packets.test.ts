// Run with: npx tsx test/v25-packets.test.ts
//
// v2.5 packet persistence, the Dexie v7 upgrade, and the encryption boundary.
//
// The important guarantee proven here: when the vault is enabled, packets live
// INSIDE the ciphertext and the plaintext `packets` table is empty. v2.3
// reserved `packets` in SensitiveContent precisely so this could never be got
// wrong; this test is what keeps it that way.
import 'fake-indexeddb/auto'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { db } from '../src/db/db'
import {
  beginGeneration, deletePacket, endGeneration, listPackets, loadPacket, openPacket,
  pushPacketVersion, recordPacketExport, restorePacketVersion, updatePacket,
} from '../src/packets/store'
import {
  ARTIFACT_GENERATOR_CONTRACTS,
  CURRENT_PACKET_FORMAT_VERSIONS,
  LEGACY_ARTIFACT_PROVENANCE,
  coverLetterProvenanceAfterManualEdit,
  currentArtifactProvenance,
  emptyLanguageState,
  flexibleReadiness,
  isCurrentCoverLetterProvenance,
  isCurrentRecruiterMessageProvenance,
  newPacket,
  packetId,
  packetReadiness,
  recruiterMessageProvenanceAfterManualEdit,
} from '../src/packets/types'
import { disableVault, enableVault, getVaultStatus, lockVault, unlockVault } from '../src/crypto/vault'
import { makeJob } from '../src/sources/normalize'
import { GENERATION } from '../src/lib/config'
import type { ChangeRecord } from '../src/resume/changeSet'

const job = makeJob({
  source: 'greenhouse', source_id: 'p1', title: 'Junior Data Analyst', company: 'Datenhaus',
  location: { country: 'DE', city: 'Berlin', remote: false },
  description: 'SQL and Tableau', url: 'https://example.test/job',
})

const flexJob = makeJob({
  source: 'fabric', source_id: 'f1', title: 'Kassierer (m/w/d)', company: 'REWE Group',
  location: { country: 'DE', city: 'Berlin', remote: false },
  description: 'Aushilfe an der Kasse', url: 'https://jobs.rewe-group.com/1',
})

function blockedChange(id: string): ChangeRecord {
  return {
    id,
    target: { kind: 'bullet', roleIndex: 0, bulletIndex: 0 },
    location: 'Role · Company',
    before: 'Did a thing.',
    after: 'Did a thing 40% faster.',
    reason: 'keywords',
    evidence: ['Did a thing.'],
    keywordEffect: [],
    finding: {
      status: 'blocked', reasons: ['unsupported_number'],
      addedNumbers: ['40%'], addedTerms: [], repeatedTerms: [],
    },
    decision: 'rejected',
  }
}

// --- The store schema actually has the new table -----------------------------
assert.equal(db.verno, 7, 'Dexie is at version 7')
assert.ok(db.tables.some((table) => table.name === 'packets'), 'the packets table exists')

// --- Open / autosave / reload -------------------------------------------------
{
  const packet = await openPacket('career', job)
  assert.equal(packet.id, packetId('career', job.id))
  assert.equal(packet.kind, 'career')
  assert.equal(packet.notes, '')
  assert.deepEqual(packet.formatVersions, CURRENT_PACKET_FORMAT_VERSIONS)

  // Re-opening returns the SAME packet, refreshed with the current job snapshot.
  const again = await openPacket('career', { ...job, title: 'Junior Data Analyst (m/w/d)' })
  assert.equal(again.id, packet.id, 'reopening does not create a second packet')
  assert.equal(again.job.title, 'Junior Data Analyst (m/w/d)', 'the job snapshot is refreshed')

  await updatePacket(packet.id, (row) => {
    row.notes = 'Ask about the reporting stack.'
    row.languages.en = { ...emptyLanguageState(), letter: 'Dear team' }
  })
  const reloaded = await loadPacket(packet.id)
  assert.equal(reloaded?.notes, 'Ask about the reporting stack.', 'notes survive a reload')
  assert.equal(reloaded?.languages.en?.letter, 'Dear team', 'per-language state survives a reload')
  assert.equal(reloaded?.languages.de, undefined, 'the other language stays independent')
}

// --- Readiness is honest ------------------------------------------------------
{
  const id = packetId('career', job.id)
  let ready = packetReadiness(await loadPacket(id), 'en')
  assert.equal(ready.resume, false, 'no résumé yet → not ready')
  assert.equal(ready.letter, true, 'the letter is detected')

  await updatePacket(id, (row) => {
    row.languages.en = {
      ...emptyLanguageState(),
      baseline: { schemaVersion: 2, contact: { name: 'A', links: [] }, experience: [], education: [], skills: [], languages: [], projects: [], certifications: [], evidence: [] },
      source: { schemaVersion: 2, contact: { name: 'A', links: [] }, experience: [], education: [], skills: [], languages: [], projects: [], certifications: [], evidence: [] },
      changes: [blockedChange('bullet-0-0')],
    }
  })
  ready = packetReadiness(await loadPacket(id), 'en')
  assert.equal(ready.resume, true, 'a baseline means a résumé exists')
  assert.equal(ready.blocked, 1, 'the blocked change is counted')
  assert.equal(ready.ready, true, 'a REJECTED blocked change does not stop an export')

  // If a blocked change were ever accepted, the packet must refuse to be ready.
  await updatePacket(id, (row) => {
    const state = row.languages.en!
    state.changes = state.changes.map((change) => ({ ...change, decision: 'accepted' as const }))
  })
  ready = packetReadiness(await loadPacket(id), 'en')
  assert.equal(ready.ready, false, 'an accepted blocked change blocks the export')
}

// --- Export history, version history, interrupted generation -----------------
{
  const id = packetId('career', job.id)
  await recordPacketExport(id, {
    at: new Date().toISOString(),
    format: 'docx',
    artifact: 'resume',
    filename: 'a.docx',
  })
  await recordPacketExport(id, { at: new Date().toISOString(), format: 'pdf', artifact: 'resume' })
  const withHistory = await loadPacket(id)
  assert.equal(withHistory?.exportHistory.length, 2, 'exports are recorded')
  assert.equal(withHistory?.exportHistory[0].format, 'pdf', 'newest export first')
  assert.deepEqual(
    withHistory?.exportHistory[0].formatVersions,
    CURRENT_PACKET_FORMAT_VERSIONS,
    'every new export pins the packet/content/prompt/exporter contract',
  )
  assert.equal(
    withHistory?.exportHistory[0].exporterContract,
    'klar-resume-browser-print-v2.6.0',
    'a PDF records the exact browser-print exporter instead of claiming DOCX provenance',
  )
  assert.equal(
    'recruiterMessage' in (withHistory?.exportHistory[0].sourceArtifactProvenance ?? {}),
    false,
    'workspace-only recruiter text is not falsely claimed as part of a résumé export',
  )
  await updatePacket(id, (row) => {
    const previous = row.languages.en ?? emptyLanguageState()
    row.languages.en = {
      ...previous,
      shortMessage: 'Hello — test-only reviewed recruiter text.',
      artifactProvenance: {
        ...previous.artifactProvenance,
        recruiterMessage: currentArtifactProvenance(
          ARTIFACT_GENERATOR_CONTRACTS.reviewedRecruiterMessage,
        ),
      },
    }
  })
  await recordPacketExport(id, {
    at: new Date().toISOString(),
    format: 'zip',
    artifact: 'packet',
    language: 'en',
    filename: 'application-packet.zip',
  })
  const packetExportState = await loadPacket(id)
  assert.equal(
    packetExportState?.languages.en?.artifactProvenance?.recruiterMessage
      ?.generatorContract,
    ARTIFACT_GENERATOR_CONTRACTS.reviewedRecruiterMessage,
    'reviewed recruiter provenance stays in the saved packet workspace',
  )
  assert.equal(
    'recruiterMessage' in
      (packetExportState?.exportHistory[0].sourceArtifactProvenance ?? {}),
    false,
    'the DOCX-only packet ZIP does not claim that workspace-only recruiter text was exported',
  )

  for (let index = 0; index < GENERATION.packetVersionLimit + 3; index += 1) {
    await pushPacketVersion(id, `v${index}`)
  }
  const bounded = await loadPacket(id)
  assert.equal(
    bounded?.versions.length,
    GENERATION.packetVersionLimit,
    'version history is bounded by config',
  )
  assert.equal(bounded?.versions[0].label, `v${GENERATION.packetVersionLimit + 2}`, 'newest version first')

  await updatePacket(id, (row) => { row.notes = 'changed after the snapshot' })
  const restored = await restorePacketVersion(id, bounded!.versions[0].at)
  assert.notEqual(restored?.notes, 'changed after the snapshot', 'restoring a version restores its notes')

  await beginGeneration(id, { stage: 'resume', language: 'en', startedAt: new Date().toISOString() })
  assert.equal((await loadPacket(id))?.generation?.stage, 'resume', 'an in-flight stage is recorded')
  assert.deepEqual((await loadPacket(id))?.formatVersions, CURRENT_PACKET_FORMAT_VERSIONS)
  await endGeneration(id)
  assert.equal((await loadPacket(id))?.generation, undefined, 'finishing clears the stage')
}

// --- Unversioned historical rows are labelled, never silently called v2.6 ---
{
  const legacy = newPacket('career', { ...job, source_id: 'legacy-packet', id: 'legacy-packet' })
  delete (legacy as Partial<typeof legacy>).formatVersions
  legacy.exportHistory = [{
    at: '2026-01-01T00:00:00.000Z',
    format: 'docx',
  } as typeof legacy.exportHistory[number]]
  await db.packets.put(legacy)
  const normalized = await loadPacket(legacy.id)
  assert.equal(normalized?.formatVersions.packetSchema, 'historical:unversioned')
  assert.equal(
    normalized?.exportHistory[0].formatVersions.coverLetterExporter,
    'historical:unversioned',
  )
  assert.equal(normalized?.exportHistory[0].exporterContract, 'historical:unversioned')
  assert.equal(
    isCurrentCoverLetterProvenance(normalized?.languages.en?.artifactProvenance?.coverLetter),
    false,
    'loading a historical saved letter never silently graduates its export provenance',
  )
  assert.equal(
    isCurrentCoverLetterProvenance(
      currentArtifactProvenance(ARTIFACT_GENERATOR_CONTRACTS.reviewedCoverLetter),
    ),
    true,
    'an explicit body-only review creates current export provenance without rewriting the text',
  )
  const aiLetterProvenance = currentArtifactProvenance(
    ARTIFACT_GENERATOR_CONTRACTS.coverLetter,
  )
  assert.equal(
    coverLetterProvenanceAfterManualEdit(aiLetterProvenance)?.generatorContract,
    ARTIFACT_GENERATOR_CONTRACTS.reviewedCoverLetter,
    'editing a current AI letter records human-reviewed provenance',
  )
  assert.deepEqual(
    coverLetterProvenanceAfterManualEdit(LEGACY_ARTIFACT_PROVENANCE),
    LEGACY_ARTIFACT_PROVENANCE,
    'editing legacy text does not silently upgrade it before explicit confirmation',
  )
  const aiRecruiterProvenance = currentArtifactProvenance(
    ARTIFACT_GENERATOR_CONTRACTS.recruiterMessage,
  )
  const reviewedRecruiterProvenance =
    recruiterMessageProvenanceAfterManualEdit(aiRecruiterProvenance)
  assert.equal(
    reviewedRecruiterProvenance?.generatorContract,
    ARTIFACT_GENERATOR_CONTRACTS.reviewedRecruiterMessage,
    'editing a current AI recruiter message records explicit human-reviewed provenance',
  )
  assert.equal(
    isCurrentRecruiterMessageProvenance(reviewedRecruiterProvenance),
    true,
    'the reviewed recruiter-message contract remains a current packet artifact',
  )
  assert.deepEqual(
    recruiterMessageProvenanceAfterManualEdit(LEGACY_ARTIFACT_PROVENANCE),
    LEGACY_ARTIFACT_PROVENANCE,
    'editing a historical recruiter message does not silently relabel its origin',
  )

  await beginGeneration(legacy.id, {
    stage: 'resume',
    language: 'en',
    startedAt: '2026-08-01T00:00:00.000Z',
  })
  assert.equal(
    (await loadPacket(legacy.id))?.formatVersions.packetSchema,
    'historical:unversioned',
    'starting work must not relabel untouched historical artifacts',
  )
  await pushPacketVersion(legacy.id, 'before-regeneration')
  assert.equal(
    (await loadPacket(legacy.id))?.versions[0].snapshot.formatVersions?.packetSchema,
    'historical:unversioned',
    'the pre-generation snapshot keeps its historical provenance',
  )
  await updatePacket(legacy.id, (row) => {
    const previous = row.languages.en ?? emptyLanguageState()
    row.languages.en = {
      ...previous,
      artifactProvenance: {
        ...previous.artifactProvenance,
        resume: currentArtifactProvenance(
          ARTIFACT_GENERATOR_CONTRACTS.deterministicResume,
        ),
      },
    }
    delete row.generation
  })

  await recordPacketExport(legacy.id, {
    at: '2026-08-01T00:00:00.000Z',
    format: 'docx',
    artifact: 'resume',
    language: 'en',
    filename: 'legacy-resume.docx',
  })
  const legacyAfterExport = await loadPacket(legacy.id)
  assert.equal(
    legacyAfterExport?.formatVersions.packetSchema,
    'historical:unversioned',
    'exporting does not relabel the source packet as current',
  )
  assert.equal(
    legacyAfterExport?.exportHistory[0].formatVersions.packetSchema,
    'historical:unversioned',
    'the export preserves historical packet/content/prompt provenance',
  )
  assert.equal(
    legacyAfterExport?.exportHistory[0].formatVersions.resumeExporter,
    CURRENT_PACKET_FORMAT_VERSIONS.resumeExporter,
    'only the exporter actually used is graduated to the current contract',
  )
  assert.equal(
    legacyAfterExport?.exportHistory[0].formatVersions.coverLetterExporter,
    'historical:unversioned',
    'unused exporters are not mislabelled as current',
  )
  assert.equal(
    legacyAfterExport?.exportHistory[0].sourceArtifactProvenance.resume?.generatorContract,
    ARTIFACT_GENERATOR_CONTRACTS.deterministicResume,
    'a newly generated artifact records its own exact contract inside a mixed historical packet',
  )
}

// --- The flexible packet never needs a résumé --------------------------------
{
  const packet = await openPacket('flexible', flexJob)
  assert.equal(packet.kind, 'flexible')
  assert.equal(flexibleReadiness(packet).ready, false, 'an empty flexible packet is not ready')
  await updatePacket(packet.id, (row) => {
    row.flexible = { message: 'Guten Tag, …', availability: 'Ich kann Samstag arbeiten.' }
  })
  assert.equal(flexibleReadiness(await loadPacket(packet.id)).ready, true, 'message + availability = ready')
  assert.equal((await loadPacket(packet.id))?.languages.en, undefined, 'no résumé state is created')

  const all = await listPackets()
  assert.ok(all.length >= 2, 'both packets are listed')
  assert.ok(all.some((row) => row.kind === 'flexible'), 'the flexible packet is listed')
}

// --- THE ENCRYPTION BOUNDARY -------------------------------------------------
{
  const passphrase = 'a-very-long-passphrase'
  const careerId = packetId('career', job.id)
  const before = await loadPacket(careerId)
  assert.ok(before, 'a plaintext packet exists before encryption')

  await enableVault(passphrase, { unrecoverablePassphrase: true, backupOffered: true })
  assert.equal(await getVaultStatus(), 'unlocked', 'the vault is unlocked after enabling')
  assert.equal(await db.packets.count(), 0, 'the plaintext packets table is emptied')

  const inVault = await loadPacket(careerId)
  assert.ok(inVault, 'the packet is readable through the unlocked vault')
  assert.equal(inVault?.notes, before?.notes, 'nothing was lost moving into the vault')

  await updatePacket(careerId, (row) => { row.notes = 'written while encrypted' })
  assert.equal(await db.packets.count(), 0, 'writing while encrypted never touches plaintext')

  lockVault()
  assert.equal(await getVaultStatus(), 'locked')
  await assert.rejects(loadPacket(careerId), /locked/i, 'a locked vault refuses to hand over a packet')

  await unlockVault(passphrase)
  assert.equal((await loadPacket(careerId))?.notes, 'written while encrypted', 'the encrypted write survived a lock cycle')

  await disableVault()
  assert.equal(await getVaultStatus(), 'disabled')
  assert.equal((await db.packets.get(careerId))?.notes, 'written while encrypted', 'disabling restores packets to plaintext')
}

// --- Deleting -----------------------------------------------------------------
{
  const id = packetId('career', job.id)
  await deletePacket(id)
  assert.equal(await loadPacket(id), null, 'a deleted packet is gone')
  const fresh = newPacket('career', job)
  assert.equal(fresh.versions.length, 0)
  assert.equal(fresh.exportHistory.length, 0)
}

// --- Export enforcement exists at both the button and handler boundaries ----
{
  const bundleSource = readFileSync('src/ui/ApplicationBundle.tsx', 'utf8')
  assert.match(
    bundleSource,
    /async function downloadResume\(\) \{\s+if \(!tailored \|\| !readiness\.ready\) return/,
  )
  assert.match(
    bundleSource,
    /async function downloadResumePdf\(\) \{\s+if \(!tailored \|\| !readiness\.ready\) return/,
  )
  assert.match(
    bundleSource,
    /async function downloadLetter\(\) \{\s+if \(!letterModel \|\| !letterExportReady \|\| !isCurrentCoverLetterProvenance\(letterProvenance\)\) return/,
    'the standalone cover-letter handler independently enforces document checks and current provenance',
  )
  assert.match(
    bundleSource,
    /async function downloadAll\(\) \{[\s\S]*?!isCurrentCoverLetterProvenance\(letterProvenance\)[\s\S]*?!readiness\.ready[\s\S]*?exportBusy[\s\S]*?\) return/,
    'the packet handler independently enforces résumé evidence, cover-letter checks, and current provenance',
  )
  assert.ok(
    (bundleSource.match(/disabled=\{!readiness\.ready\}/g) ?? []).length >= 2,
    'both standalone résumé export controls are disabled while evidence is blocked',
  )
  assert.match(
    bundleSource,
    /disabled=\{exportBusy \|\| !letterExportReady \|\| !readiness\.ready\}/,
    'the packet ZIP control enforces the same evidence gate',
  )
  assert.match(
    bundleSource,
    /Confirm reviewed body-only text/,
    'historical text stays editable and offers an explicit, free review migration',
  )
  assert.match(
    bundleSource,
    /coverLetterProvenanceAfterManualEdit\(\s+previous\.artifactProvenance\?\.coverLetter/,
    'manual edits change current AI provenance to human-reviewed without graduating legacy text',
  )
  assert.match(
    bundleSource,
    /recruiterMessageProvenanceAfterManualEdit\(\s+previous\.artifactProvenance\?\.recruiterMessage/,
    'manual recruiter-message edits record reviewed provenance without graduating legacy text',
  )
  assert.match(
    bundleSource,
    /async function makeLetter\(\) \{\s+if \(!packet\) return/,
    'cover-letter generation independently requires an opened packet',
  )
  assert.match(
    bundleSource,
    /async function makeShortMessage\(\) \{\s+if \(!packet\) return/,
    'short-message generation independently requires an opened packet',
  )
  assert.match(bundleSource, /disabled=\{letterBusy \|\| !packet\}/)
  assert.match(
    bundleSource,
    /disabled=\{messageBusy \|\| !messagePrerequisitesReady \|\| !packet\}/,
  )
}

console.log('v25-packets.test.ts: all tests passed')
