// ============================================================================
// Client-side encryption for the stored résumé/profile at rest (feature 22).
//
// HONEST THREAT MODEL: this protects the data-at-rest in IndexedDB against a
// casual look at the browser's storage, NOT against an attacker who controls
// the device while it's unlocked (they can read the decrypted state in memory).
// It's a trust signal, not a vault — we say so plainly in the UI.
//
// Design: a user passphrase → AES-GCM key via PBKDF2 (SHA-256, high iteration
// count). We never store the passphrase or the derived key; we store only the
// salt, a per-record IV, and the ciphertext. Everything uses the Web Crypto
// API (crypto.subtle), which runs in the browser and in Node ≥ 20 via
// globalThis.crypto — so this module is unit-testable with no DOM.
// ============================================================================

/** PBKDF2 iterations. High enough to be a real speed bump, fine on modern HW. */
export const PBKDF2_ITERATIONS = 210_000

/** An encrypted blob, all fields base64 so it survives JSON export/import. */
export type CipherEnvelope = {
  v: 1
  /** base64 PBKDF2 salt (16 bytes). */
  salt: string
  /** base64 AES-GCM IV (12 bytes). */
  iv: string
  /** base64 ciphertext (includes the GCM auth tag). */
  ct: string
}

/** The crypto implementation, from the browser or Node's global. */
function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (!c || !c.subtle) throw new Error('Web Crypto API is unavailable in this environment.')
  return c.subtle
}
function randomBytes(n: number): Uint8Array {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (!c || !c.getRandomValues) throw new Error('Secure RNG unavailable.')
  return c.getRandomValues(new Uint8Array(n))
}

// --- base64 helpers that work in both the browser and Node --------------------
export function bytesToB64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  }
  return Buffer.from(bytes).toString('base64')
}
export function b64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

/** Derive an AES-GCM key from a passphrase + salt via PBKDF2. */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const s = subtle()
  const baseKey = await s.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return s.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypt a UTF-8 string under a passphrase. Returns a self-describing envelope. */
export async function encryptString(plaintext: string, passphrase: string): Promise<CipherEnvelope> {
  if (!passphrase) throw new Error('A passphrase is required to encrypt.')
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await deriveKey(passphrase, salt)
  const ctBuf = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  )
  return { v: 1, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ctBuf)) }
}

/** Decrypt an envelope back to the original string. Throws on a wrong passphrase. */
export async function decryptString(env: CipherEnvelope, passphrase: string): Promise<string> {
  if (!env || env.v !== 1) throw new Error('Unrecognized encrypted format.')
  const salt = b64ToBytes(env.salt)
  const iv = b64ToBytes(env.iv)
  const ct = b64ToBytes(env.ct)
  const key = await deriveKey(passphrase, salt)
  try {
    const buf = await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource)
    return new TextDecoder().decode(buf)
  } catch {
    // GCM authentication failed → wrong passphrase or tampered data.
    throw new Error('Wrong passphrase, or the data could not be decrypted.')
  }
}

/** Convenience: encrypt any JSON-serializable value. */
export async function encryptJSON(value: unknown, passphrase: string): Promise<CipherEnvelope> {
  return encryptString(JSON.stringify(value), passphrase)
}
/** Convenience: decrypt an envelope produced by encryptJSON. */
export async function decryptJSON<T>(env: CipherEnvelope, passphrase: string): Promise<T> {
  return JSON.parse(await decryptString(env, passphrase)) as T
}

/** True if a value looks like one of our envelopes (used to detect locked state). */
export function isCipherEnvelope(v: unknown): v is CipherEnvelope {
  const e = v as CipherEnvelope
  return !!e && e.v === 1 && typeof e.salt === 'string' && typeof e.iv === 'string' && typeof e.ct === 'string'
}