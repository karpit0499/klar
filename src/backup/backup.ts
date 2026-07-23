// ============================================================================
// Versioned, integrity-checked Klar backups (v2.3).
// Standard backups exclude credentials. Complete backups carry credentials
// only inside authenticated ciphertext. Import validates and decrypts before
// one transaction changes active data.
// ============================================================================
import {
  db,
  type DashboardRow,
  type JobCacheRow,
  type MatchRow,
  type PreferencesRow,
  type ProfileRow,
  type SavedSearchRow,
  type Setting,
  type VaultRow,
  type VectorRow,
} from '../db/db'
import type { TrackedJob } from '../types'
import type { CanonicalResumeRow, ResumeDraftRow, ResumeSnapshotRow } from '../resume/types'
import { normalizeResume, resumeFromLegacyProfile } from '../resume/canonical'
import { decryptJSON, encryptJSON, isCipherEnvelope } from '../crypto/resumeCrypto'
import {
  assertCredentials,
  clearVaultSession,
  getVaultStatus,
  migrateSensitiveContent,
  readSensitiveContent,
  unlockVault,
  type SensitiveContent,
  type VaultCredentials,
} from '../crypto/vault'
import { AppError, toAppError } from '../errors/appError'
import { loadGroqKey } from '../settings/keys'

export const BACKUP_FORMAT = 'klar-backup'
export const BACKUP_SCHEMA_VERSION = 5
export const KLAR_VERSION = '2.3.0'

const SECRET_SETTINGS = new Set(['groqKey', 'groqKeyRemember', 'adzunaAppId', 'adzunaAppKey'])
const LEGACY_RESUME_DATA_KEY = 'resumeDataV1'

export type BackupMode = 'standard' | 'complete-encrypted'

export type BackupWorkspace = {
  settings: Setting[]
  resumes: CanonicalResumeRow[]
  resumeHistory: ResumeSnapshotRow[]
  resumeDrafts: ResumeDraftRow[]
  preferences: PreferencesRow[]
  jobs: JobCacheRow[]
  matches: MatchRow[]
  tracked: TrackedJob[]
  dashboard: DashboardRow[]
  vectors: VectorRow[]
  savedSearches: SavedSearchRow[]
  vault: VaultRow[]
}

export type BackupEnvelope = {
  format: typeof BACKUP_FORMAT
  schemaVersion: typeof BACKUP_SCHEMA_VERSION
  klarVersion: string
  exportedAt: string
  mode: BackupMode
  workspace: BackupWorkspace
  integrity: { algorithm: 'SHA-256'; digest: string }
  migration?: { from: 'v1' | 'v2' | 'v2.1' | 'v2.2' }
}

export type BackupPreview = {
  exportedAt: string
  klarVersion: string
  mode: BackupMode
  passwordRequired: boolean
  categories: string[]
}

export async function createStandardBackup(): Promise<BackupEnvelope> {
  try {
    const workspace = await readWorkspace()
    workspace.settings = safeSettings(workspace.settings)
    workspace.vault = workspace.vault.map(({ credentials: _credentials, ...row }) => row)
    return seal('standard', workspace)
  } catch (error) {
    throw exportError(error)
  }
}

export async function createCompleteEncryptedBackup(passphrase?: string): Promise<BackupEnvelope> {
  try {
    let workspace = await readWorkspace()
    const rawSettings = workspace.settings
    workspace.settings = safeSettings(workspace.settings)
    if (await getVaultStatus() === 'disabled') {
      if (!passphrase || passphrase.length < 12) throw validationError('Choose a backup password with at least 12 characters.')
      const [content, credentials] = await Promise.all([
        encryptJSON(plaintextContent(workspace), passphrase),
        encryptJSON(plaintextCredentials(rawSettings, await loadGroqKey()), passphrase),
      ])
      const now = new Date().toISOString()
      workspace = {
        ...emptyReadableWorkspace(workspace.settings),
        vault: [{ id: 'primary', version: 1, content, credentials, createdAt: now, updatedAt: now }],
      }
    } else {
      const row = await db.vault.get('primary')
      workspace = { ...emptyReadableWorkspace(workspace.settings), vault: row ? [row] : [] }
    }
    return seal('complete-encrypted', workspace)
  } catch (error) {
    throw exportError(error)
  }
}

export async function createDecryptedExport(confirmation: string): Promise<BackupEnvelope> {
  try {
    if (confirmation !== 'EXPORT DECRYPTED DATA') throw validationError('Type EXPORT DECRYPTED DATA to confirm the readable export.')
    const status = await getVaultStatus()
    if (status === 'locked') throw new AppError({
      category: 'locked', message: 'Unlock the vault before creating a readable export.', dataSafe: true,
      available: 'Encrypted and standard backups remain available.', action: { label: 'Unlock vault', kind: 'unlock' },
    })
    const workspace = await readWorkspace()
    workspace.settings = safeSettings(workspace.settings)
    if (status === 'unlocked') {
      const content = await readSensitiveContent()
      if (!content) throw new Error('Unlocked vault content is unavailable.')
      workspace.resumes = content.canonicalResume ? [content.canonicalResume] : []
      workspace.resumeHistory = content.resumeHistory
      workspace.resumeDrafts = content.resumeDraft ? [content.resumeDraft] : []
      workspace.preferences = content.preferences
      workspace.jobs = content.jobs
      workspace.matches = content.matches
      workspace.tracked = content.tracked
      workspace.dashboard = content.dashboard
      workspace.vectors = content.vectors
      workspace.savedSearches = content.savedSearches
      workspace.vault = []
    }
    return seal('standard', workspace)
  } catch (error) {
    throw exportError(error)
  }
}

export async function parseAndValidateBackup(value: unknown): Promise<BackupEnvelope> {
  let candidate: unknown = value
  if (isLegacyWorkspace(candidate)) candidate = await migrateLegacyBackup(candidate)
  else if (isV22Envelope(candidate)) candidate = await migrateV22Envelope(candidate)
  if (!candidate || typeof candidate !== 'object') throw invalidBackup('The backup is not a JSON object.')
  const envelope = candidate as Partial<BackupEnvelope>
  if (envelope.format !== BACKUP_FORMAT) throw invalidBackup('This is not a Klar backup file.')
  if (envelope.schemaVersion !== BACKUP_SCHEMA_VERSION) throw invalidBackup(`Unsupported backup schema ${String(envelope.schemaVersion)}.`)
  if (typeof envelope.klarVersion !== 'string' || !envelope.klarVersion.trim()) throw invalidBackup('The Klar application version is missing.')
  if (envelope.mode !== 'standard' && envelope.mode !== 'complete-encrypted') throw invalidBackup('The backup mode is invalid.')
  if (!isIsoDate(envelope.exportedAt)) throw invalidBackup('The export timestamp is invalid.')
  if (!envelope.workspace) throw invalidBackup('The backup workspace is missing.')
  validateWorkspace(envelope.workspace, envelope.mode)
  if (!envelope.integrity || envelope.integrity.algorithm !== 'SHA-256') throw invalidBackup('The backup integrity record is missing.')
  if (await digestWithoutIntegrity(envelope) !== envelope.integrity.digest) throw invalidBackup('The backup integrity check failed. The file may be damaged or edited.')
  return envelope as BackupEnvelope
}

export async function inspectBackup(value: unknown): Promise<BackupPreview> {
  const envelope = await parseAndValidateBackup(value)
  const workspace = envelope.workspace
  const hasCareerPreferences = workspace.preferences.some((row) => row.targetTitles.length > 0 || row.fields.length > 0)
  const hasFlexiblePreferences = workspace.preferences.some((row) => Boolean(row.flexibleWork))
  const categories = [
    workspace.resumes.length && 'career profile',
    hasCareerPreferences && 'career preferences',
    hasFlexiblePreferences && 'Flexible Work preferences',
    workspace.jobs.length && 'job cache',
    workspace.tracked.length && 'applications',
    workspace.dashboard.length && 'dashboard',
    workspace.savedSearches.length && 'saved searches',
    workspace.vault.length && 'encrypted workspace',
  ].filter(Boolean) as string[]
  return {
    exportedAt: envelope.exportedAt, klarVersion: envelope.klarVersion,
    mode: envelope.mode, passwordRequired: envelope.workspace.vault.length > 0, categories,
  }
}

/** Validate and authenticate first, then replace every store atomically. */
export async function importBackup(value: unknown, passphrase?: string): Promise<BackupEnvelope> {
  const envelope = await parseAndValidateBackup(value)
  const vault = envelope.workspace.vault[0]
  if (vault) await verifyVault(vault, envelope.mode, passphrase)
  const workspace = envelope.workspace
  try {
    await db.transaction('rw', [
      db.settings, db.profiles, db.resumes, db.resumeHistory, db.resumeDrafts,
      db.preferences, db.jobs, db.matches, db.tracked, db.dashboard, db.vectors,
      db.savedSearches, db.vault,
    ], async () => {
      await Promise.all([
        db.settings.clear(), db.profiles.clear(), db.resumes.clear(), db.resumeHistory.clear(),
        db.resumeDrafts.clear(), db.preferences.clear(), db.jobs.clear(), db.matches.clear(),
        db.tracked.clear(), db.dashboard.clear(), db.vectors.clear(), db.savedSearches.clear(), db.vault.clear(),
      ])
      if (workspace.settings.length) await db.settings.bulkPut(workspace.settings)
      if (workspace.resumes.length) await db.resumes.bulkPut(workspace.resumes)
      if (workspace.resumeHistory.length) await db.resumeHistory.bulkPut(workspace.resumeHistory)
      if (workspace.resumeDrafts.length) await db.resumeDrafts.bulkPut(workspace.resumeDrafts)
      if (workspace.preferences.length) await db.preferences.bulkPut(workspace.preferences)
      if (workspace.jobs.length) await db.jobs.bulkPut(workspace.jobs)
      if (workspace.matches.length) await db.matches.bulkPut(workspace.matches)
      if (workspace.tracked.length) await db.tracked.bulkPut(workspace.tracked)
      if (workspace.dashboard.length) await db.dashboard.bulkPut(workspace.dashboard)
      if (workspace.vectors.length) await db.vectors.bulkPut(workspace.vectors)
      if (workspace.savedSearches.length) await db.savedSearches.bulkPut(workspace.savedSearches)
      if (workspace.vault.length) await db.vault.bulkPut(workspace.vault)
    })
    clearVaultSession()
    if (vault && passphrase) await unlockVault(passphrase)
    return envelope
  } catch (error) {
    throw toAppError(error, {
      category: 'import', message: 'Klar could not restore this backup.', dataSafe: true,
      available: 'The workspace from before the import is unchanged.',
      action: { label: 'Check the file and try again', kind: 'choose_file' },
    })
  }
}

export async function migrateLegacyBackup(value: Record<string, unknown>): Promise<BackupEnvelope> {
  const from: 'v1' | 'v2' | 'v2.1' = Array.isArray(value.savedSearches)
    ? 'v2.1' : Array.isArray(value.dashboard) || Array.isArray(value.vectors) ? 'v2' : 'v1'
  const getArray = <T>(key: string): T[] => Array.isArray(value[key]) ? value[key] as T[] : []
  const settings = safeSettings(getArray<Setting>('settings'))
  const profiles = getArray<ProfileRow>('profiles').map(({ rawText: _rawText, ...profile }) => profile as ProfileRow)
  const oldResume = settings.find((row) => row.key === LEGACY_RESUME_DATA_KEY)?.value
  const latest = [...profiles].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const data = oldResume ? normalizeResume(oldResume, 'migration') : latest ? resumeFromLegacyProfile(latest) : undefined
  const now = new Date().toISOString()
  const workspace: BackupWorkspace = {
    settings: settings.filter((row) => row.key !== LEGACY_RESUME_DATA_KEY),
    resumes: data ? [{ id: 'current', data, createdAt: latest?.createdAt ?? now, updatedAt: now, revision: 1 }] : [],
    resumeHistory: data ? [{ id: `migration-${Date.now()}`, data: structuredClone(data), createdAt: now, reason: 'migration', name: 'Imported legacy profile' }] : [],
    resumeDrafts: [], preferences: getArray('preferences'), jobs: getArray('jobs'), matches: [],
    tracked: getArray('tracked'), dashboard: getArray('dashboard'), vectors: [],
    savedSearches: getArray('savedSearches'), vault: [],
  }
  const envelope = await seal('standard', workspace)
  envelope.migration = { from }
  envelope.integrity.digest = await digestWithoutIntegrity(envelope)
  return envelope
}

async function migrateV22Envelope(value: Record<string, unknown>): Promise<BackupEnvelope> {
  const integrity = object(value.integrity)
  if (integrity.algorithm !== 'SHA-256' || typeof integrity.digest !== 'string') throw invalidBackup('The v2.2 integrity record is missing.')
  if (await digestWithoutIntegrity(value) !== integrity.digest) throw invalidBackup('The v2.2 backup integrity check failed.')
  const old = object(value.workspace)
  const arrays = ['settings', 'profiles', 'preferences', 'jobs', 'matches', 'tracked', 'dashboard', 'vectors', 'savedSearches', 'vault']
  for (const key of arrays) if (!Array.isArray(old[key])) throw invalidBackup(`The v2.2 workspace field ${key} is invalid.`)
  const oldVault = old.vault as VaultRow[]
  if (oldVault.length > 1) throw invalidBackup('The v2.2 backup contains more than one vault.')
  if (oldVault[0] && (!isCipherEnvelope(oldVault[0].content) || (oldVault[0].credentials && !isCipherEnvelope(oldVault[0].credentials)))) {
    throw invalidBackup('The v2.2 encrypted vault structure is invalid.')
  }
  const oldMode = value.mode === 'complete-encrypted' ? 'complete-encrypted' : 'standard'
  if (oldMode === 'standard' && oldVault[0]?.credentials) throw invalidBackup('A v2.2 standard backup cannot contain credentials.')
  if (oldMode === 'complete-encrypted' && (!oldVault[0] || !oldVault[0].credentials)) throw invalidBackup('The v2.2 complete backup is missing credential ciphertext.')
  const oldHasReadable = ['profiles', 'preferences', 'jobs', 'matches', 'tracked', 'dashboard', 'vectors', 'savedSearches']
    .some((key) => (old[key] as unknown[]).length > 0) || (old.settings as Setting[]).some((row) => row.key === LEGACY_RESUME_DATA_KEY)
  if (oldVault.length && oldHasReadable) throw invalidBackup('Encrypted and readable career data cannot be mixed in a v2.2 backup.')
  const settings = safeSettings(old.settings as Setting[])
  const profiles = old.profiles as ProfileRow[]
  const oldResume = settings.find((row) => row.key === LEGACY_RESUME_DATA_KEY)?.value
  const latest = [...profiles].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const data = oldResume ? normalizeResume(oldResume, 'migration') : latest ? resumeFromLegacyProfile(latest) : undefined
  const now = new Date().toISOString()
  const workspace: BackupWorkspace = {
    settings: settings.filter((row) => row.key !== LEGACY_RESUME_DATA_KEY),
    resumes: data ? [{ id: 'current', data, createdAt: latest?.createdAt ?? now, updatedAt: now, revision: 1 }] : [],
    resumeHistory: data ? [{ id: `migration-${Date.now()}`, data: structuredClone(data), createdAt: now, reason: 'migration', name: 'Imported v2.2 profile' }] : [],
    resumeDrafts: [], preferences: old.preferences as PreferencesRow[], jobs: old.jobs as JobCacheRow[],
    matches: old.matches as MatchRow[], tracked: old.tracked as TrackedJob[], dashboard: old.dashboard as DashboardRow[],
    vectors: old.vectors as VectorRow[], savedSearches: old.savedSearches as SavedSearchRow[], vault: old.vault as VaultRow[],
  }
  if (workspace.vault.length) {
    workspace.resumes = []; workspace.resumeHistory = []; workspace.resumeDrafts = []
    workspace.preferences = []; workspace.jobs = []; workspace.matches = []; workspace.tracked = []
    workspace.dashboard = []; workspace.vectors = []; workspace.savedSearches = []
  }
  const envelope = await seal(oldMode, workspace)
  envelope.migration = { from: 'v2.2' }
  envelope.klarVersion = typeof value.klarVersion === 'string' ? value.klarVersion : '2.2.0'
  envelope.exportedAt = typeof value.exportedAt === 'string' ? value.exportedAt : now
  envelope.integrity.digest = await digestWithoutIntegrity(envelope)
  return envelope
}

async function readWorkspace(): Promise<BackupWorkspace> {
  return db.transaction('r', [
    db.settings, db.resumes, db.resumeHistory, db.resumeDrafts, db.preferences,
    db.jobs, db.matches, db.tracked, db.dashboard, db.vectors, db.savedSearches, db.vault,
  ], async () => {
    const [settings, resumes, resumeHistory, resumeDrafts, preferences, jobs, matches, tracked, dashboard, vectors, savedSearches, vault] = await Promise.all([
      db.settings.toArray(), db.resumes.toArray(), db.resumeHistory.toArray(), db.resumeDrafts.toArray(),
      db.preferences.toArray(), db.jobs.toArray(), db.matches.toArray(), db.tracked.toArray(),
      db.dashboard.toArray(), db.vectors.toArray(), db.savedSearches.toArray(), db.vault.toArray(),
    ])
    return { settings, resumes, resumeHistory, resumeDrafts, preferences, jobs, matches, tracked, dashboard, vectors, savedSearches, vault }
  })
}

function plaintextContent(workspace: BackupWorkspace): SensitiveContent {
  return {
    version: 2, canonicalResume: workspace.resumes[0], resumeHistory: workspace.resumeHistory,
    resumeDraft: workspace.resumeDrafts[0], preferences: workspace.preferences, jobs: workspace.jobs,
    matches: workspace.matches, dashboard: workspace.dashboard, tracked: workspace.tracked,
    vectors: workspace.vectors, savedSearches: workspace.savedSearches,
    packets: [], originalFiles: [], knowledgeBase: [],
  }
}

function plaintextCredentials(settings: Setting[], currentGroqKey?: string): VaultCredentials {
  const get = <T>(key: string) => settings.find((row) => row.key === key)?.value as T | undefined
  const appId = get<string>('adzunaAppId'); const appKey = get<string>('adzunaAppKey')
  return {
    version: 1, groqKey: currentGroqKey ?? get<string>('groqKey'), groqRemember: get<boolean>('groqKeyRemember'),
    adzuna: appId && appKey ? { appId, appKey } : undefined,
  }
}

function emptyReadableWorkspace(settings: Setting[]): BackupWorkspace {
  return {
    settings, resumes: [], resumeHistory: [], resumeDrafts: [], preferences: [], jobs: [], matches: [],
    tracked: [], dashboard: [], vectors: [], savedSearches: [], vault: [],
  }
}

function safeSettings(settings: Setting[]): Setting[] { return settings.filter((row) => !SECRET_SETTINGS.has(row.key)) }

async function seal(mode: BackupMode, workspace: BackupWorkspace): Promise<BackupEnvelope> {
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, klarVersion: KLAR_VERSION,
    exportedAt: new Date().toISOString(), mode, workspace,
    integrity: { algorithm: 'SHA-256', digest: '' },
  }
  envelope.integrity.digest = await digestWithoutIntegrity(envelope)
  return envelope
}

async function digestWithoutIntegrity(value: object): Promise<string> {
  const { integrity: _integrity, ...payload } = value as Record<string, unknown>
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function validateWorkspace(workspace: BackupWorkspace, mode: BackupMode): void {
  const keys: (keyof BackupWorkspace)[] = [
    'settings', 'resumes', 'resumeHistory', 'resumeDrafts', 'preferences', 'jobs', 'matches',
    'tracked', 'dashboard', 'vectors', 'savedSearches', 'vault',
  ]
  for (const key of keys) if (!Array.isArray(workspace[key])) throw invalidBackup(`Workspace field ${key} is invalid.`)
  if (workspace.settings.some((row) => !row || typeof row.key !== 'string' || SECRET_SETTINGS.has(row.key))) throw invalidBackup('Readable API credentials are not allowed in a Klar backup.')
  if (workspace.resumes.length > 1 || workspace.resumes.some((row) => row.id !== 'current')) throw invalidBackup('The canonical résumé row is invalid.')
  for (const preferences of workspace.preferences) validateFlexiblePreferences(preferences)
  validatePrimaryKeys(workspace)
  if (workspace.vault.length > 1) throw invalidBackup('The backup contains more than one vault.')
  const vault = workspace.vault[0]
  if (vault && (vault.id !== 'primary' || vault.version !== 1 || !isCipherEnvelope(vault.content))) throw invalidBackup('The encrypted vault structure is invalid.')
  if (vault?.credentials && !isCipherEnvelope(vault.credentials)) throw invalidBackup('The encrypted credential vault structure is invalid.')
  if (mode === 'standard' && vault?.credentials) throw invalidBackup('A standard backup must not contain the credential vault.')
  if (mode === 'complete-encrypted' && (!vault || !vault.credentials)) throw invalidBackup('A complete backup is missing its encrypted credential vault.')
  if (vault && hasReadableSensitiveContent(workspace)) throw invalidBackup('Encrypted and readable career data cannot be mixed in one backup.')
}

function validateFlexiblePreferences(preferences: PreferencesRow): void {
  if (!preferences || typeof preferences !== 'object') throw invalidBackup('The preferences row is invalid.')
  if (preferences.discoveryMode !== undefined && !['career', 'flexible', 'both'].includes(preferences.discoveryMode)) {
    throw invalidBackup('The discovery mode is invalid.')
  }
  const flexible = preferences.flexibleWork
  if (flexible === undefined) return
  if (!flexible || typeof flexible !== 'object') throw invalidBackup('Flexible Work preferences are invalid.')
  const safeStringArray = (value: unknown) =>
    Array.isArray(value)
    && value.length <= 100
    && value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 64)
  if (!safeStringArray(flexible.employment) || !safeStringArray(flexible.roleFamilies) || !safeStringArray(flexible.workplaces)) {
    throw invalidBackup('Flexible Work preference options are invalid.')
  }
  if (!Array.isArray(flexible.locations) || flexible.locations.length > 20 || flexible.locations.some((location) =>
    !location
    || typeof location.city !== 'string'
    || location.city.trim().length === 0
    || location.city.length > 120
    || !Number.isFinite(location.radius_km)
    || location.radius_km < 1
    || location.radius_km > 500
  )) {
    throw invalidBackup('Flexible Work locations are invalid.')
  }
  const schedule = flexible.schedule
  if (schedule !== undefined && (
    !schedule
    || typeof schedule !== 'object'
    || (schedule.days !== undefined && !safeStringArray(schedule.days))
    || (schedule.periods !== undefined && !safeStringArray(schedule.periods))
    || (schedule.maxHoursPerWeek !== undefined && (
      !Number.isFinite(schedule.maxHoursPerWeek)
      || schedule.maxHoursPerWeek < 1
      || schedule.maxHoursPerWeek > 168
    ))
  )) {
    throw invalidBackup('Flexible Work schedule preferences are invalid.')
  }
  const languageComfort = flexible.languageComfort
  const safeOptionalString = (value: unknown, maxLength = 120) =>
    value === undefined || (typeof value === 'string' && value.length <= maxLength)
  if (languageComfort !== undefined && (
    !languageComfort
    || typeof languageComfort !== 'object'
    || !safeOptionalString(languageComfort.german, 64)
    || !safeOptionalString(languageComfort.english, 64)
  )) {
    throw invalidBackup('Flexible Work language preferences are invalid.')
  }
  if (!safeOptionalString(flexible.physicalWork, 64)) throw invalidBackup('Flexible Work physical preferences are invalid.')
  if (flexible.hasDrivingLicence !== undefined && typeof flexible.hasDrivingLicence !== 'boolean') {
    throw invalidBackup('Flexible Work driving-licence preference is invalid.')
  }
  if (flexible.hasBike !== undefined && typeof flexible.hasBike !== 'boolean') {
    throw invalidBackup('Flexible Work bike preference is invalid.')
  }
  if (!safeOptionalString(flexible.earliestStart, 32)) throw invalidBackup('Flexible Work start date is invalid.')
}

function validatePrimaryKeys(workspace: BackupWorkspace): void {
  const valid = (rows: unknown[], key: string) => rows.every((row) => Boolean(row) && typeof row === 'object' && typeof (row as Record<string, unknown>)[key] === 'string')
  const checks: [unknown[], string, string][] = [
    [workspace.resumes, 'id', 'résumé'], [workspace.resumeHistory, 'id', 'résumé history'],
    [workspace.resumeDrafts, 'id', 'résumé drafts'], [workspace.preferences, 'id', 'preferences'],
    [workspace.jobs, 'queryKey', 'jobs'], [workspace.matches, 'cacheKey', 'matches'],
    [workspace.tracked, 'jobId', 'tracked jobs'], [workspace.dashboard, 'id', 'dashboard'],
    [workspace.vectors, 'jobId', 'vectors'], [workspace.savedSearches, 'id', 'saved searches'],
  ]
  for (const [rows, key, label] of checks) if (!valid(rows, key)) throw invalidBackup(`One or more ${label} rows are invalid.`)
}

function hasReadableSensitiveContent(workspace: BackupWorkspace): boolean {
  return workspace.resumes.length > 0 || workspace.resumeHistory.length > 0 || workspace.resumeDrafts.length > 0 ||
    workspace.preferences.length > 0 || workspace.jobs.length > 0 || workspace.matches.length > 0 ||
    workspace.tracked.length > 0 || workspace.dashboard.length > 0 || workspace.vectors.length > 0 || workspace.savedSearches.length > 0
}

async function verifyVault(vault: VaultRow, mode: BackupMode, passphrase?: string): Promise<void> {
  if (!passphrase) throw validationError('Enter the backup password before restoring encrypted content.')
  try {
    migrateSensitiveContent(await decryptJSON<unknown>(vault.content, passphrase))
    if (mode === 'complete-encrypted') {
      if (!vault.credentials) throw new Error('Credential ciphertext is missing.')
      const credentials = await decryptJSON<VaultCredentials>(vault.credentials, passphrase)
      assertCredentials(credentials)
    }
  } catch (error) {
    throw new AppError({
      category: 'import', message: 'That password could not open this backup.', dataSafe: true,
      available: 'Your current workspace is unchanged.', action: { label: 'Check the password and try again', kind: 'retry' },
      technical: error instanceof Error ? error.message : String(error),
    })
  }
}

function isLegacyWorkspace(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || 'format' in value) return false
  const candidate = value as Record<string, unknown>
  const recognized = ['settings', 'profiles', 'preferences', 'jobs', 'matches', 'tracked', 'dashboard', 'vectors', 'savedSearches']
  if (!recognized.some((key) => key in candidate)) return false
  for (const key of recognized) if (key in candidate && !Array.isArray(candidate[key])) throw invalidBackup(`Legacy backup field ${key} is invalid.`)
  return true
}

function isV22Envelope(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.format === BACKUP_FORMAT && candidate.schemaVersion === 4
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(new Date(value).getTime())
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {} }

function invalidBackup(message: string): AppError {
  return new AppError({ category: 'import', message, dataSafe: true, available: 'Your current workspace has not been changed.', action: { label: 'Choose a valid Klar backup', kind: 'choose_file' } })
}
function validationError(message: string): AppError {
  return new AppError({ category: 'validation', message, dataSafe: true, available: 'No backup or workspace data has been changed.', action: { label: 'Review the requirement', kind: 'none' } })
}
function exportError(error: unknown): AppError {
  return toAppError(error, { category: 'export', message: 'Klar could not create this export.', dataSafe: true, available: 'Your workspace is unchanged and remains available.', action: { label: 'Try the export again', kind: 'retry' } })
}