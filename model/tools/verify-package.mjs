#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { verifyModelPackage } from '../../desktop/runtime/package-verifier.mjs'

function usage() {
  console.error(
    'Usage: node model/tools/verify-package.mjs <packages-root> <artifact-id> <key-id> <ed25519-public-key.pem>',
  )
  process.exitCode = 2
}

const [packagesRoot, artifactId, keyId, publicKeyFile] = process.argv.slice(2)
if (!packagesRoot || !artifactId || !keyId || !publicKeyFile) {
  usage()
} else {
  const verified = await verifyModelPackage({
    paths: { packagesRoot: path.resolve(packagesRoot) },
    artifactId,
    trustedKeys: {
      [keyId]: await readFile(path.resolve(publicKeyFile), 'utf8'),
    },
  })
  console.log(
    JSON.stringify(
      {
        artifactId: verified.artifactId,
        model: verified.manifest.baseModel.name,
        quantization: verified.manifest.quantization,
        verifiedBytes: verified.verifiedBytes,
        adapters: Object.keys(verified.adapters),
      },
      null,
      2,
    ),
  )
}