// ============================================================================
// Complete encrypted-at-rest boundary (v2.2).
//
// Sensitive career/document content and API credentials are encrypted in two
// separate AES-GCM envelopes. Decrypted data exists only in this module's
// in-memory session. Callers receive typed plaintext or a locked-vault error;
// they never receive CipherEnvelope values.
// ============================================================================
import {
  db,
  getSetting,
  type DashboardRow,
  type JobCacheRow,
  type MatchRow,
  type PreferencesRow,
  type ProfileRow,
  type SavedSearchRow,
  type VaultRow,
  type VectorRow,
} from '../db/db'
import type { TrackedJob } from '../types'
import type { ResumeData } from '../resume/types'
import { decryptJSON, encryptJSON } from './resumeCrypto'
import { AppError, lockedVaultError, toAppError } from '../errors/appError'

const RESUME_DATA_KEY = 'resumeDataV1'
const GROQ_KEY = 'groqKey'
const GROQ_REMEMBER = 'groqKeyRemember'
const ADZUNA_ID = 'adzunaAppId'
const ADZUNA_KEY = 'adzunaAppKey'
const SESSION_GROQ_KEY = 'klar.groqKey'

export type SensitiveContent = {
  version: 1
  profiles: ProfileRow[]
  resumeData?: ResumeData
  preferences: PreferencesRow[]
  jobs: JobCacheRow[]
  matches: MatchRow[]
  dashboard: DashboardRow[]
  tracked: TrackedJob[]
  vectors: VectorRow[]
  savedSearches: SavedSearchRow[]
  /** Reserved now so later packet persistence cannot accidentally bypass the vault. */
  packets: unknown[]
  originalFiles: unknown[]
  knowledgeBase: unknown[]
}

export type VaultCredentials = {
  version: 1
  groqKey?: string
  groqRemember?: boolean
  adzuna?: { appId: string; appKey: string }
}

export type VaultStatus = 'disabled' | 'locked' | 'unlocked'

export type EnableVaultAcknowledgement = {
  unrecoverablePassphrase: boolean
  backupOffered: boolean
}

let unlockedContent: SensitiveContent | null = null
let unlockedCredentials: VaultCredentials | null = null
let sessionPassphrase: string | null = null
let sessionOnlyGroqKey: string | undefined
let mutationQueue: Promise<void> = Promise.resolve()
let sessionEpoch = 0

export async function getVaultStatus(): Promise<VaultStatus> {
  const row = await db.vault.get('primary')
  if (!row) return 'disabled'
  return unlockedContent && sessionPassphrase ? 'unlocked' : 'locked'
}

export async function unlockVault(passphrase: string): Promise<void> {
  const row = await db.vault.get('primary')
  if (!row) throw new AppError({
    category: 'locked',
    message: 'No encrypted vault exists on this device.',
    dataSafe: true,
    available: 'Your plaintext workspace remains available.',
    action: { label: 'Return to Klar', kind: 'none' },
  })
  lockVault()
  try {
    const content = await decryptJSON<SensitiveContent>(row.content, passphrase)
    const credentials = row.credentials
      ? await decryptJSON<VaultCredentials>(row.credentials, passphrase)
      : emptyCredentials()
    assertSensitiveContent(content)
    assertCredentials(credentials)
    // Assign only after BOTH authenticated decryptions and validations succeed.
    unlockedContent = content
    unlockedCredentials = credentials
    sessionPassphrase = passphrase
    await db.vault.update('primary', { updatedAt: new Date().toISOString() })
  } catch (error) {
    // Wrong passphrases and damaged ciphertext never write or replace stored data.
    lockVault()
    throw new AppError({
        category: 'locked',
        message: 'That passphrase did not unlock the vault.',
        dataSafe: true,
        available: 'Your encrypted data is unchanged and you can try unlocking again.',
        action: { label: 'Check the passphrase and try again', kind: 'unlock' },
        technical: error instanceof Error ? error.message : String(error),
      })
  }
}

export function lockVault(): void {
  sessionEpoch += 1
  unlockedContent = null
  unlockedCredentials = null
  sessionPassphrase = null
  sessionOnlyGroqKey = undefined
}

export async function enableVault(
  passphrase: string,
  acknowledgement: EnableVaultAcknowledgement,
  currentGroqKey?: string,
): Promise<void> {
  if (await db.vault.get('primary')) {
    throw new AppError({
      category: 'validation',
      message: 'Encryption is already enabled.',
      dataSafe: true,
      available: 'Your existing encrypted vault is unchanged.',
      action: { label: 'Unlock the existing vault', kind: 'unlock' },
    })
  }
  if (passphrase.length < 12) {
    throw validationError('Use a passphrase with at least 12 characters.')
  }
  if (!acknowledgement.unrecoverablePassphrase || !acknowledgement.backupOffered) {
    throw validationError('Confirm the unrecoverable-passphrase warning and backup offer first.')
  }

  const [
    profiles,
    preferences,
    jobs,
    matches,
    dashboard,
    tracked,
    vectors,
    savedSearches,
    resumeData,
    storedGroq,
    groqRemember,
    appId,
    appKey,
  ] =
    await Promise.all([
      db.profiles.toArray(),
      db.preferences.toArray(),
      db.jobs.toArray(),
      db.matches.toArray(),
      db.dashboard.toArray(),
      db.tracked.toArray(),
      db.vectors.toArray(),
      db.savedSearches.toArray(),
      getSetting<ResumeData>(RESUME_DATA_KEY),
      getSetting<string>(GROQ_KEY),
      getSetting<boolean>(GROQ_REMEMBER),
      getSetting<string>(ADZUNA_ID),
      getSetting<string>(ADZUNA_KEY),
    ])

  const content: SensitiveContent = {
    version: 1,
    profiles: profiles.map(({ rawText: _rawText, ...profile }) => profile),
    resumeData,
    preferences,
    jobs,
    matches,
    dashboard,
    tracked,
    vectors,
    savedSearches,
    packets: [],
    originalFiles: [],
    knowledgeBase: [],
  }
  const credentials: VaultCredentials = {
    version: 1,
    groqKey: currentGroqKey?.trim() || sessionGroqKey() || storedGroq,
    groqRemember,
    adzuna: appId && appKey ? { appId, appKey } : undefined,
  }

  try {
    const [encryptedContent, encryptedCredentials] = await Promise.all([
      encryptJSON(content, passphrase),
      encryptJSON(credentials, passphrase),
    ])
    // Authenticate the just-created ciphertext before deleting any plaintext.
    assertSensitiveContent(await decryptJSON<SensitiveContent>(encryptedContent, passphrase))
    assertCredentials(await decryptJSON<VaultCredentials>(encryptedCredentials, passphrase))
    const now = new Date().toISOString()
    const row: VaultRow = {
      id: 'primary',
      version: 1,
      content: encryptedContent,
      credentials: encryptedCredentials,
      createdAt: now,
      updatedAt: now,
    }
    await db.transaction(
      'rw',
      [
        db.vault,
        db.profiles,
        db.preferences,
        db.jobs,
        db.matches,
        db.dashboard,
        db.tracked,
        db.vectors,
        db.savedSearches,
        db.settings,
      ],
      async () => {
        await db.vault.put(row)
        await Promise.all([
          db.profiles.clear(),
          db.preferences.clear(),
          db.jobs.clear(),
          db.matches.clear(),
          db.dashboard.clear(),
          db.tracked.clear(),
          db.vectors.clear(),
          db.savedSearches.clear(),
          db.settings.bulkDelete([RESUME_DATA_KEY, GROQ_KEY, GROQ_REMEMBER, ADZUNA_ID, ADZUNA_KEY]),
        ])
      },
    )
    try { sessionStorage.removeItem(SESSION_GROQ_KEY) } catch { /* unavailable in tests/SSR */ }
    unlockedContent = content
    unlockedCredentials = credentials
    sessionPassphrase = passphrase
    sessionEpoch += 1
  } catch (error) {
    throw toAppError(error, {
      category: 'storage',
      message: 'Klar could not enable encryption.',
      dataSafe: true,
      available: 'Your existing plaintext workspace remains unchanged.',
      action: { label: 'Try again', kind: 'retry' },
    })
  }
}

/** Move an unlocked vault back to the existing plaintext stores. */
export async function disableVault(): Promise<void> {
  const content = requireContent()
  const credentials = requireCredentials()
  await db.transaction(
    'rw',
    [
      db.vault,
      db.profiles,
      db.preferences,
      db.jobs,
      db.matches,
      db.dashboard,
      db.tracked,
      db.vectors,
      db.savedSearches,
      db.settings,
    ],
    async () => {
      await Promise.all([
        db.profiles.clear(),
        db.preferences.clear(),
        db.jobs.clear(),
        db.matches.clear(),
        db.dashboard.clear(),
        db.tracked.clear(),
        db.vectors.clear(),
        db.savedSearches.clear(),
      ])
      if (content.profiles.length) await db.profiles.bulkPut(content.profiles)
      if (content.preferences.length) await db.preferences.bulkPut(content.preferences)
      if (content.jobs.length) await db.jobs.bulkPut(content.jobs)
      if (content.matches.length) await db.matches.bulkPut(content.matches)
      if (content.dashboard.length) await db.dashboard.bulkPut(content.dashboard)
      if (content.tracked.length) await db.tracked.bulkPut(content.tracked)
      if (content.vectors.length) await db.vectors.bulkPut(content.vectors)
      if (content.savedSearches.length) await db.savedSearches.bulkPut(content.savedSearches)
      if (content.resumeData) await db.settings.put({ key: RESUME_DATA_KEY, value: content.resumeData })
      if (credentials.groqKey) await db.settings.put({ key: GROQ_KEY, value: credentials.groqKey })
      await db.settings.put({ key: GROQ_REMEMBER, value: credentials.groqRemember ?? true })
      if (credentials.adzuna) {
        await db.settings.bulkPut([
          { key: ADZUNA_ID, value: credentials.adzuna.appId },
          { key: ADZUNA_KEY, value: credentials.adzuna.appKey },
        ])
      }
      await db.vault.delete('primary')
    },
  )
  lockVault()
}

export async function readSensitiveContent(): Promise<SensitiveContent | null> {
  if (!(await db.vault.get('primary'))) return null
  return structuredClone(requireContent())
}

export async function readVaultCredentials(): Promise<VaultCredentials | null> {
  if (!(await db.vault.get('primary'))) return null
  return structuredClone(requireCredentials())
}

export async function updateSensitiveContent(
  mutate: (draft: SensitiveContent) => void | Promise<void>,
): Promise<void> {
  const update = async () => {
    const row = await db.vault.get('primary')
    if (!row) throw lockedVaultError('No encrypted vault exists.')
    const passphrase = sessionPassphrase
    if (!passphrase) throw lockedVaultError()
    const epoch = sessionEpoch
    const draft = structuredClone(requireContent())
    await mutate(draft)
    assertSensitiveContent(draft)
    const content = await encryptJSON(draft, passphrase)
    if (sessionEpoch !== epoch || sessionPassphrase !== passphrase) throw lockedVaultError()
    const now = new Date().toISOString()
    await db.vault.update('primary', { content, updatedAt: now })
    if (sessionEpoch !== epoch || sessionPassphrase !== passphrase) throw lockedVaultError()
    unlockedContent = draft
  }
  // A rejected write must not poison the queue. After the caller handles that
  // error, a later valid mutation can still run.
  mutationQueue = mutationQueue.then(update, update)
  return mutationQueue
}

export async function updateVaultCredentials(
  mutate: (draft: VaultCredentials) => void | Promise<void>,
): Promise<void> {
  const update = async () => {
    const row = await db.vault.get('primary')
    if (!row) throw lockedVaultError('No encrypted vault exists.')
    const passphrase = sessionPassphrase
    if (!passphrase) throw lockedVaultError()
    const epoch = sessionEpoch
    const draft = structuredClone(requireCredentials())
    await mutate(draft)
    assertCredentials(draft)
    const credentials = await encryptJSON(draft, passphrase)
    if (sessionEpoch !== epoch || sessionPassphrase !== passphrase) throw lockedVaultError()
    const now = new Date().toISOString()
    await db.vault.update('primary', { credentials, updatedAt: now })
    if (sessionEpoch !== epoch || sessionPassphrase !== passphrase) throw lockedVaultError()
    unlockedCredentials = draft
  }
  mutationQueue = mutationQueue.then(update, update)
  return mutationQueue
}

/** Session-only credentials remain in memory and are erased whenever the vault locks. */
export function setSessionOnlyGroqKey(key: string | undefined): void {
  if (!sessionPassphrase) throw lockedVaultError()
  sessionOnlyGroqKey = key
}

export function readSessionOnlyGroqKey(): string | undefined {
  if (!sessionPassphrase) throw lockedVaultError()
  return sessionOnlyGroqKey
}

/** Called after a restore so old in-memory plaintext can never shadow imported ciphertext. */
export function clearVaultSession(): void {
  lockVault()
}

function requireContent(): SensitiveContent {
  if (!unlockedContent || !sessionPassphrase) throw lockedVaultError()
  return unlockedContent
}

function requireCredentials(): VaultCredentials {
  if (!unlockedCredentials || !sessionPassphrase) throw lockedVaultError()
  return unlockedCredentials
}

function emptyCredentials(): VaultCredentials {
  return { version: 1 }
}

function sessionGroqKey(): string | undefined {
  try { return sessionStorage.getItem(SESSION_GROQ_KEY) || undefined } catch { return undefined }
}

function validationError(message: string): AppError {
  return new AppError({
    category: 'validation',
    message,
    dataSafe: true,
    available: 'Encryption has not been changed.',
    action: { label: 'Review the fields', kind: 'none' },
  })
}

export function assertSensitiveContent(value: unknown): asserts value is SensitiveContent {
  const content = value as Partial<SensitiveContent>
  if (
    !content ||
    content.version !== 1 ||
    !Array.isArray(content.profiles) ||
    !Array.isArray(content.preferences) ||
    !Array.isArray(content.jobs) ||
    !Array.isArray(content.matches) ||
    !Array.isArray(content.dashboard) ||
    !Array.isArray(content.tracked) ||
    !Array.isArray(content.vectors) ||
    !Array.isArray(content.savedSearches) ||
    !Array.isArray(content.packets) ||
    !Array.isArray(content.originalFiles) ||
    !Array.isArray(content.knowledgeBase)
  ) {
    throw new Error('The decrypted content vault has an invalid structure.')
  }
}

export function assertCredentials(value: unknown): asserts value is VaultCredentials {
  const credentials = value as Partial<VaultCredentials>
  if (!credentials || credentials.version !== 1) {
    throw new Error('The decrypted credential vault has an invalid structure.')
  }
  if (credentials.adzuna && (!credentials.adzuna.appId || !credentials.adzuna.appKey)) {
    throw new Error('The credential vault contains a partial Adzuna pair.')
  }
}