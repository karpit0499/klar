#!/usr/bin/env node
import {
  createHash,
  sign,
} from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  canonicalJson,
  signedPayload,
  validateManifest,
} from '../../desktop/runtime/package-verifier.mjs'

function usage() {
  console.error(
    'Usage: node model/tools/create-package-metadata.mjs <package-dir> <key-id> <ed25519-private-key.pem>',
  )
  process.exitCode = 2
}

async function sha256(file) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(file)) digest.update(chunk)
  return digest.digest('hex')
}

async function atomicJson(file, value) {
  const temporary = `${file}.tmp-${process.pid}`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  })
  await rename(temporary, file)
}

export async function createPackageMetadata({
  packageDirectory,
  keyId,
  privateKeyFile,
}) {
  const root = path.resolve(packageDirectory)
  const manifest = JSON.parse(
    await readFile(path.join(root, 'manifest.json'), 'utf8'),
  )
  validateManifest(manifest, manifest.artifactId)
  const files = []
  for (const artifact of manifest.artifacts) {
    const file = path.resolve(root, ...artifact.path.split('/'))
    const relative = path.relative(root, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Artifact escapes package root: ${artifact.path}`)
    }
    const info = await stat(file)
    if (!info.isFile()) throw new Error(`Artifact is not a file: ${artifact.path}`)
    files.push({
      path: artifact.path,
      bytes: info.size,
      sha256: await sha256(file),
    })
  }
  const checksums = {
    schemaVersion: 1,
    artifactId: manifest.artifactId,
    algorithm: 'sha256',
    files,
  }
  const payload = signedPayload(manifest, checksums)
  const privateKey = await readFile(path.resolve(privateKeyFile), 'utf8')
  const signature = {
    schemaVersion: 1,
    artifactId: manifest.artifactId,
    algorithm: 'ed25519',
    keyId,
    payloadSha256: createHash('sha256').update(payload).digest('hex'),
    signature: sign(null, payload, privateKey).toString('base64'),
  }
  await atomicJson(path.join(root, 'checksums.json'), checksums)
  await atomicJson(path.join(root, 'signature.json'), signature)
  console.log(
    canonicalJson({
      artifactId: manifest.artifactId,
      files: files.length,
      keyId,
    }),
  )
}

if (
  process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const [packageDirectory, keyId, privateKeyFile] = process.argv.slice(2)
  if (!packageDirectory || !keyId || !privateKeyFile) {
    usage()
  } else {
    await createPackageMetadata({
      packageDirectory,
      keyId,
      privateKeyFile,
    })
  }
}
