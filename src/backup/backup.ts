// ============================================================================
// Versioned, integrity-checked Klar backups (v2.2).
//
// Standard: workspace data, never credentials. If encryption is enabled, its
// sensitive content stays ciphertext. Complete encrypted: the ONLY portable
// format allowed to carry credentials, and only as AES-GCM ciphertext.
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
import type { ResumeData } from '../resume/types'
import { encryptJSON } from '../crypto/resumeCrypto'
import { isCipherEnvelope } from '../crypto/resumeCrypto'
import {
  clearVaultSession,
  getVaultStatus,
  readSensitiveContent,
  type SensitiveContent,
  type VaultCredentials,
} from '../crypto/vault'
import { AppError, toAppError } from '../errors/appError'
import { loadGroqKey } from '../settings/keys'

export const BACKUP_FORMAT = 'klar-backup'
export const BACKUP_SCHEMA_VERSION = 4
export const KLAR_VERSION = '2.2.0'

const SECRET_SETTINGS = new Set(['groqKey', 'groqKeyRemember', 'adzunaAppId', 'adzunaAppKey'])
const RESUME_DATA_KEY = 'resumeDataV1'

export type BackupMode = 'standard' | 'complete-encrypted'

export type BackupWorkspace = {
  settings: Setting[]
  profiles: ProfileRow[]
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
  migration?: { from: 'v1' | 'v2' | 'v2.1' }
}

export async function createStandardBackup(): Promise<BackupEnvelope> {
  try {
    const workspace = await readWorkspace()
    workspace.settings = safeSettings(workspace.settings)
    workspace.profiles = stripRawText(workspace.profiles)
    workspace.vault = workspace.vault.map(({ credentials: _credentials, ...row }) => row)
    return await seal('standard', workspace)
  } catch (error) {
    throw exportError(error)
  }
}

export async function createCompleteEncryptedBackup(passphrase?: string): Promise<BackupEnvelope> {
  try {
    let workspace = await readWorkspace()
    const rawSettings = workspace.settings
    workspace.settings = safeSettings(workspace.settings)
    const vaultStatus = await getVaultStatus()

    if (vaultStatus === 'disabled') {
      if (!passphrase || passphrase.length < 12) {
        throw validationError('Choose a backup password with at least 12 characters.')
      }
      const content = plaintextContent(workspace)
      const credentials = plaintextCredentials(rawSettings, await loadGroqKey())
      const [encryptedContent, encryptedCredentials] = await Promise.all([
        encryptJSON(content, passphrase),
        encryptJSON(credentials, passphrase),
      ])
      const now = new Date().toISOString()
      workspace = {
        ...workspace,
        profiles: [],
        preferences: [],
        jobs: [],
        matches: [],
        tracked: [],
        dashboard: [],
        vectors: [],
        savedSearches: [],
        settings: workspace.settings.filter((row) => row.key !== RESUME_DATA_KEY),
        vault: [{
          id: 'primary',
          version: 1,
          content: encryptedContent,
          credentials: encryptedCredentials,
          createdAt: now,
          updatedAt: now,
        }],
      }
    } else {
      // Already-encrypted ciphertext can be copied while locked. No decrypted
      // credential or career content is written to the backup JSON.
      const row = await db.vault.get('primary')
      workspace.vault = row ? [row] : []
    }
    return await seal('complete-encrypted', workspace)
  } catch (error) {
    throw exportError(error)
  }
}

/** Separate, warning-gated action for a readable export of sensitive content. */
export async function createDecryptedExport(confirmation: string): Promise<BackupEnvelope> {
  try {
    if (confirmation !== 'EXPORT DECRYPTED DATA') {
      throw validationError('Type EXPORT DECRYPTED DATA to confirm the readable export.')
    }
    const status = await getVaultStatus()
    if (status === 'locked') {
      throw new AppError({
        category: 'locked',
        message: 'Unlock the vault before creating a readable export.',
        dataSafe: true,
        available: 'Encrypted and standard backups remain available.',
        action: { label: 'Unlock vault', kind: 'unlock' },
      })
    }
    const workspace = await readWorkspace()
    workspace.settings = safeSettings(workspace.settings)
    workspace.profiles = stripRawText(workspace.profiles)
    if (status === 'unlocked') {
      const content = await readSensitiveContent()
      if (!content) throw new Error('Unlocked vault content is unavailable.')
      workspace.profiles = content.profiles
      workspace.preferences = content.preferences
      workspace.jobs = content.jobs
      workspace.matches = content.matches
      workspace.tracked = content.tracked
      workspace.dashboard = content.dashboard
      workspace.vectors = content.vectors
      workspace.savedSearches = content.savedSearches
      if (content.resumeData) workspace.settings.push({ key: RESUME_DATA_KEY, value: content.resumeData })
      workspace.vault = []
    }
    // Credentials remain excluded even from this readable data export.
    return await seal('standard', workspace)
  } catch (error) {
    throw exportError(error)
  }
}

export async function parseAndValidateBackup(value: unknown): Promise<BackupEnvelope> {
  const migrated = isLegacyWorkspace(value) ? await migrateLegacyBackup(value) : value
  if (!migrated || typeof migrated !== 'object') throw invalidBackup('The backup is not a JSON object.')
  const envelope = migrated as Partial<BackupEnvelope>
  if (envelope.format !== BACKUP_FORMAT) throw invalidBackup('This is not a Klar backup file.')
  if (envelope.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw invalidBackup(`Unsupported backup schema ${String(envelope.schemaVersion)}.`)
  }
  if (typeof envelope.klarVersion !== 'string' || !envelope.klarVersion.trim()) {
    throw invalidBackup('The Klar application version is missing.')
  }
  if (envelope.mode !== 'standard' && envelope.mode !== 'complete-encrypted') {
    throw invalidBackup('The backup mode is invalid.')
  }
  if (!isIsoDate(envelope.exportedAt)) throw invalidBackup('The export timestamp is invalid.')
  if (!envelope.workspace) throw invalidBackup('The backup workspace is missing.')
  validateWorkspace(envelope.workspace, envelope.mode)
  if (!envelope.integrity || envelope.integrity.algorithm !== 'SHA-256') {
    throw invalidBackup('The backup integrity record is missing.')
  }
  const expected = await digestEnvelopeWithoutIntegrity(envelope as BackupEnvelope)
  if (expected !== envelope.integrity.digest) {
    throw invalidBackup('The backup integrity check failed. The file may be damaged or edited.')
  }
  return envelope as BackupEnvelope
}

/** Validate first, then replace every store inside one rollback-capable transaction. */
export async function importBackup(value: unknown): Promise<BackupEnvelope> {
  const envelope = await parseAndValidateBackup(value)
  const w = envelope.workspace
  try {
    await db.transaction(
      'rw',
      [
        db.settings,
        db.profiles,
        db.preferences,
        db.jobs,
        db.matches,
        db.tracked,
        db.dashboard,
        db.vectors,
        db.savedSearches,
        db.vault,
      ],
      async () => {
        await Promise.all([
          db.settings.clear(),
          db.profiles.clear(),
          db.preferences.clear(),
          db.jobs.clear(),
          db.matches.clear(),
          db.tracked.clear(),
          db.dashboard.clear(),
          db.vectors.clear(),
          db.savedSearches.clear(),
          db.vault.clear(),
        ])
        if (w.settings.length) await db.settings.bulkPut(w.settings)
        if (w.profiles.length) await db.profiles.bulkPut(stripRawText(w.profiles))
        if (w.preferences.length) await db.preferences.bulkPut(w.preferences)
        if (w.jobs.length) await db.jobs.bulkPut(w.jobs)
        if (w.matches.length) await db.matches.bulkPut(w.matches)
        if (w.tracked.length) await db.tracked.bulkPut(w.tracked)
        if (w.dashboard.length) await db.dashboard.bulkPut(w.dashboard)
        if (w.vectors.length) await db.vectors.bulkPut(w.vectors)
        if (w.savedSearches.length) await db.savedSearches.bulkPut(w.savedSearches)
        if (w.vault.length) await db.vault.bulkPut(w.vault)
      },
    )
    clearVaultSession()
    return envelope
  } catch (error) {
    throw toAppError(error, {
      category: 'import',
      message: 'Klar could not restore this backup.',
      dataSafe: true,
      available: 'The workspace from before the import is unchanged.',
      action: { label: 'Check the file and try again', kind: 'choose_file' },
    })
  }
}

export async function migrateLegacyBackup(value: Record<string, unknown>): Promise<BackupEnvelope> {
  const from: 'v1' | 'v2' | 'v2.1' = Array.isArray(value.savedSearches)
    ? 'v2.1'
    : Array.isArray(value.dashboard) || Array.isArray(value.vectors)
      ? 'v2'
      : 'v1'
  const array = <T>(key: string): T[] => Array.isArray(value[key]) ? value[key] as T[] : []
  const workspace: BackupWorkspace = {
    settings: safeSettings(array<Setting>('settings')),
    profiles: stripRawText(array<ProfileRow>('profiles')),
    preferences: array<PreferencesRow>('preferences'),
    jobs: array<JobCacheRow>('jobs'),
    matches: array<MatchRow>('matches'),
    tracked: array<TrackedJob>('tracked'),
    dashboard: array<DashboardRow>('dashboard'),
    vectors: array<VectorRow>('vectors'),
    savedSearches: array<SavedSearchRow>('savedSearches'),
    // Legacy exports did not have a valid v2.2 vault. Never trust a readable
    // `vault` property smuggled into an old-format object.
    vault: [],
  }
  const envelope = await seal('standard', workspace)
  envelope.migration = { from }
  envelope.integrity.digest = await digestEnvelopeWithoutIntegrity(envelope)
  return envelope
}

async function readWorkspace(): Promise<BackupWorkspace> {
  return db.transaction(
    'r',
    [
      db.settings,
      db.profiles,
      db.preferences,
      db.jobs,
      db.matches,
      db.tracked,
      db.dashboard,
      db.vectors,
      db.savedSearches,
      db.vault,
    ],
    async () => {
      const [settings, profiles, preferences, jobs, matches, tracked, dashboard, vectors, savedSearches, vault] =
        await Promise.all([
          db.settings.toArray(),
          db.profiles.toArray(),
          db.preferences.toArray(),
          db.jobs.toArray(),
          db.matches.toArray(),
          db.tracked.toArray(),
          db.dashboard.toArray(),
          db.vectors.toArray(),
          db.savedSearches.toArray(),
          db.vault.toArray(),
        ])
      return { settings, profiles, preferences, jobs, matches, tracked, dashboard, vectors, savedSearches, vault }
    },
  )
}

function plaintextContent(workspace: BackupWorkspace): SensitiveContent {
  const resumeData = workspace.settings.find((row) => row.key === RESUME_DATA_KEY)?.value as ResumeData | undefined
  return {
    version: 1,
    profiles: stripRawText(workspace.profiles),
    resumeData,
    preferences: workspace.preferences,
    jobs: workspace.jobs,
    matches: workspace.matches,
    dashboard: workspace.dashboard,
    tracked: workspace.tracked,
    vectors: workspace.vectors,
    savedSearches: workspace.savedSearches,
    packets: [],
    originalFiles: [],
    knowledgeBase: [],
  }
}

function plaintextCredentials(settings: Setting[], currentGroqKey?: string): VaultCredentials {
  const get = <T>(key: string) => settings.find((row) => row.key === key)?.value as T | undefined
  const appId = get<string>('adzunaAppId')
  const appKey = get<string>('adzunaAppKey')
  return {
    version: 1,
    groqKey: currentGroqKey ?? get<string>('groqKey'),
    groqRemember: get<boolean>('groqKeyRemember'),
    adzuna: appId && appKey ? { appId, appKey } : undefined,
  }
}

function safeSettings(settings: Setting[]): Setting[] {
  return settings.filter((row) => !SECRET_SETTINGS.has(row.key))
}

function stripRawText(profiles: ProfileRow[]): ProfileRow[] {
  return profiles.map(({ rawText: _rawText, ...profile }) => profile)
}

async function seal(mode: BackupMode, workspace: BackupWorkspace): Promise<BackupEnvelope> {
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    klarVersion: KLAR_VERSION,
    exportedAt: new Date().toISOString(),
    mode,
    workspace,
    integrity: { algorithm: 'SHA-256', digest: '' },
  }
  envelope.integrity.digest = await digestEnvelopeWithoutIntegrity(envelope)
  return envelope
}

async function digestEnvelopeWithoutIntegrity(envelope: BackupEnvelope): Promise<string> {
  const { integrity: _integrity, ...payload } = envelope
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function validateWorkspace(workspace: BackupWorkspace, mode: BackupMode): void {
  const keys: (keyof BackupWorkspace)[] = [
    'settings', 'profiles', 'preferences', 'jobs', 'matches', 'tracked',
    'dashboard', 'vectors', 'savedSearches', 'vault',
  ]
  for (const key of keys) if (!Array.isArray(workspace[key])) throw invalidBackup(`Workspace field ${key} is invalid.`)
  if (workspace.settings.some((row) => !row || typeof row.key !== 'string')) {
    throw invalidBackup('A settings row is invalid.')
  }
  if (workspace.settings.some((row) => SECRET_SETTINGS.has(row.key))) {
    throw invalidBackup('Readable API credentials are not allowed in a Klar backup.')
  }
  validatePrimaryKeys(workspace)
  if (workspace.vault.length > 1) throw invalidBackup('The backup contains more than one vault.')
  const vault = workspace.vault[0]
  if (vault && (vault.id !== 'primary' || vault.version !== 1 || !isCipherEnvelope(vault.content))) {
    throw invalidBackup('The encrypted vault structure is invalid.')
  }
  if (vault?.credentials && !isCipherEnvelope(vault.credentials)) {
    throw invalidBackup('The encrypted credential vault structure is invalid.')
  }
  if (mode === 'standard' && vault?.credentials) {
    throw invalidBackup('A standard backup must not contain the credential vault.')
  }
  if (mode === 'complete-encrypted' && (!vault || !vault.credentials)) {
    throw invalidBackup('A complete backup is missing its encrypted credential vault.')
  }
  if (vault && hasReadableSensitiveContent(workspace)) {
    throw invalidBackup('Encrypted and readable career data cannot be mixed in one backup.')
  }
}

function validatePrimaryKeys(workspace: BackupWorkspace): void {
  const valid = (rows: unknown[], key: string) => rows.every((row) => (
    !!row && typeof row === 'object' && typeof (row as Record<string, unknown>)[key] === 'string'
  ))
  const checks: [unknown[], string, string][] = [
    [workspace.profiles, 'id', 'profiles'],
    [workspace.preferences, 'id', 'preferences'],
    [workspace.jobs, 'queryKey', 'jobs'],
    [workspace.matches, 'cacheKey', 'matches'],
    [workspace.tracked, 'jobId', 'tracked'],
    [workspace.dashboard, 'id', 'dashboard'],
    [workspace.vectors, 'jobId', 'vectors'],
    [workspace.savedSearches, 'id', 'saved searches'],
  ]
  for (const [rows, key, label] of checks) {
    if (!valid(rows, key)) throw invalidBackup(`One or more ${label} rows are invalid.`)
  }
}

function hasReadableSensitiveContent(workspace: BackupWorkspace): boolean {
  return (
    workspace.profiles.length > 0 ||
    workspace.preferences.length > 0 ||
    workspace.jobs.length > 0 ||
    workspace.matches.length > 0 ||
    workspace.tracked.length > 0 ||
    workspace.dashboard.length > 0 ||
    workspace.vectors.length > 0 ||
    workspace.savedSearches.length > 0 ||
    workspace.settings.some((row) => row.key === RESUME_DATA_KEY)
  )
}

function isLegacyWorkspace(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || 'format' in value) return false
  const candidate = value as Record<string, unknown>
  const recognized = [
    'settings', 'profiles', 'preferences', 'jobs', 'matches', 'tracked',
    'dashboard', 'vectors', 'savedSearches',
  ]
  if (!recognized.some((key) => key in candidate)) return false
  for (const key of recognized) {
    if (key in candidate && !Array.isArray(candidate[key])) {
      throw invalidBackup(`Legacy backup field ${key} is invalid.`)
    }
  }
  return true
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  )
}

function invalidBackup(message: string): AppError {
  return new AppError({
    category: 'import',
    message,
    dataSafe: true,
    available: 'Your current workspace has not been changed.',
    action: { label: 'Choose a valid Klar backup', kind: 'choose_file' },
  })
}

function validationError(message: string): AppError {
  return new AppError({
    category: 'validation',
    message,
    dataSafe: true,
    available: 'No backup or workspace data has been changed.',
    action: { label: 'Review the requirement', kind: 'none' },
  })
}

function exportError(error: unknown): AppError {
  return toAppError(error, {
    category: 'export',
    message: 'Klar could not create this export.',
    dataSafe: true,
    available: 'Your workspace is unchanged and remains available.',
    action: { label: 'Try the export again', kind: 'retry' },
  })
}