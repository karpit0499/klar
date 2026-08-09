import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Production builds must package this public key through electron-builder's
 * extraResources. Private signing keys never belong in the application.
 */
export async function loadTrustedModelKeys({
  isPackaged,
  resourcesPath,
  developmentPublicKey = process.env.KLAR_MODEL_PUBLIC_KEY_PEM,
}) {
  if (!isPackaged) {
    if (!developmentPublicKey) return Object.freeze({})
    // An unpackaged developer explicitly injects this trust root. Register it
    // for both supported internal key ids so the documented base-validation
    // recipe (production id) and hand-built dev fixtures use the same PEM.
    // Packaged builds never consult this environment variable.
    return Object.freeze({
      'klar-model-dev-1': developmentPublicKey,
      'klar-model-production-1': developmentPublicKey,
    })
  }
  const publicKeyPath = path.join(
    path.resolve(resourcesPath),
    'trust',
    'model-signing-public.pem',
  )
  let publicKey
  try {
    publicKey = await readFile(publicKeyPath, 'utf8')
  } catch (error) {
    throw new Error(
      'The packaged trusted model-signing public key is missing or unreadable at '
      + `${publicKeyPath}. Generate desktop/resources/trust/model-signing-public.pem `
      + 'before packaging; see desktop/SIGNING.md.',
      { cause: error },
    )
  }
  return Object.freeze({ 'klar-model-production-1': publicKey })
}
