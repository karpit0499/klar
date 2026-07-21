// Run with: npx tsx test/crypto.test.ts
// Covers client-side résumé encryption at rest (feature 22).
import {
  encryptString, decryptString, encryptJSON, decryptJSON, isCipherEnvelope, bytesToB64, b64ToBytes,
} from '../src/crypto/resumeCrypto.ts'

let passed = 0, failed = 0
const ok = (c: boolean, m: string) => { c ? passed++ : (failed++, console.error('  ✗', m)) }

async function main() {
  // ---- round trip ----------------------------------------------------------
  const secret = 'Meine sehr geheime Lebenslauf-Passphrase 🔐'
  const env = await encryptString('Kace — Data Scientist, Berlin', secret)
  ok(env.v === 1 && !!env.salt && !!env.iv && !!env.ct, 'encrypt: produces a v1 envelope')
  ok(!env.ct.includes('Kace'), 'encrypt: ciphertext does not leak the plaintext')
  const back = await decryptString(env, secret)
  ok(back === 'Kace — Data Scientist, Berlin', 'decrypt: round-trips exactly (incl. unicode)')

  // ---- wrong passphrase fails (GCM auth) -----------------------------------
  let threw = false
  try { await decryptString(env, 'wrong passphrase') } catch { threw = true }
  ok(threw, 'decrypt: wrong passphrase throws, never returns garbage')

  // ---- unique salt + iv per encryption -------------------------------------
  const e1 = await encryptString('same text', secret)
  const e2 = await encryptString('same text', secret)
  ok(e1.salt !== e2.salt && e1.iv !== e2.iv, 'encrypt: fresh salt + IV each time')
  ok(e1.ct !== e2.ct, 'encrypt: identical plaintext yields different ciphertext')

  // ---- JSON helpers --------------------------------------------------------
  const profile = { summary: 'DS 5y', skills: ['Python', 'SQL'], nested: { a: 1 } }
  const je = await encryptJSON(profile, secret)
  const jd = await decryptJSON<typeof profile>(je, secret)
  ok(JSON.stringify(jd) === JSON.stringify(profile), 'json: encrypt/decrypt preserves structure')

  // ---- envelope detection --------------------------------------------------
  ok(isCipherEnvelope(env), 'detect: recognizes an envelope')
  ok(!isCipherEnvelope({ summary: 'plain' }), 'detect: rejects a plain object')
  ok(!isCipherEnvelope(null) && !isCipherEnvelope('x'), 'detect: rejects null/string')

  // ---- base64 helpers round-trip -------------------------------------------
  const bytes = new Uint8Array([0, 1, 2, 254, 255, 128])
  ok([...b64ToBytes(bytesToB64(bytes))].join(',') === [...bytes].join(','), 'b64: bytes round-trip')

  console.log(`\nCrypto tests: ${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })