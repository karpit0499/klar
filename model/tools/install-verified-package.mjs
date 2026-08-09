#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { installVerifiedPackage } from '../../desktop/runtime/package-installer.mjs'

function usage() {
  return [
    'Usage: node model/tools/install-verified-package.mjs',
    '  <packages-root> <downloaded-package-dir> <artifact-id>',
    '  <key-id> <ed25519-public-key.pem>',
  ].join('\n')
}

const [packagesRootValue, sourceValue, artifactId, keyId, publicKeyValue] =
  process.argv.slice(2)

if (
  !packagesRootValue
  || !sourceValue
  || !artifactId
  || !keyId
  || !publicKeyValue
  || process.argv.length !== 7
) {
  throw new Error(usage())
}

const installed = await installVerifiedPackage({
  sourcePackageRoot: path.resolve(sourceValue),
  paths: { packagesRoot: path.resolve(packagesRootValue) },
  artifactId,
  trustedKeys: {
    [keyId]: await readFile(path.resolve(publicKeyValue), 'utf8'),
  },
})

console.log(JSON.stringify({
  artifactId: installed.artifactId,
  destination: installed.packageRoot,
  verifiedBytes: installed.verifiedBytes,
  adapters: Object.keys(installed.adapters),
  promotedAtomically: installed.promotedAtomically,
}, null, 2))
