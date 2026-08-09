import { strict as assert } from 'node:assert'
import {
  createHash,
  generateKeyPairSync,
} from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { installVerifiedPackage } from '../desktop/runtime/package-installer.mjs'
import { createPackageMetadata } from '../model/tools/create-package-metadata.mjs'

const temporary = await mkdtemp(path.join(os.tmpdir(), 'klar-v26-install-'))

async function createSignedFixture(
  root: string,
  artifactId: string,
  privateKeyFile: string,
) {
  await mkdir(path.join(root, 'model'), { recursive: true })
  const modelBytes = Buffer.from('small signed model installation fixture')
  await writeFile(path.join(root, 'model', 'model.gguf'), modelBytes)
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 1,
    artifactId,
    version: '0.1.0',
    kind: 'klar-local-model',
    baseModel: {
      name: 'Qwen/Qwen3.5-9B',
      revision: 'fixture-revision',
      license: 'Apache-2.0',
      source: 'https://huggingface.co/Qwen/Qwen3.5-9B',
    },
    quantization: 'Q4_K_M',
    runtime: {
      engine: 'llama.cpp',
      version: 'b10199',
      contextTokens: 8192,
    },
    hardware: {
      minimumMemoryBytes: 1,
      recommendedMemoryBytes: 2,
      expectedPackageBytes: modelBytes.length,
    },
    compatibility: {
      app: '>=2.6.0 <2.7.0',
      runtime: 'b10199',
      promptSchemas: ['klar-generation-v1'],
      adapters: [],
      platforms: ['darwin-arm64'],
    },
    artifacts: [{
      role: 'model',
      path: 'model/model.gguf',
      mediaType: 'application/vnd.gguf',
    }],
    provenance: {
      createdAt: '2026-07-31T00:00:00.000Z',
      builder: 'unit-test',
      sourceCommit: 'fixture',
      recipe: 'test/v26-package-installer.test.ts',
      sourceArtifact: {
        repository: 'unit-test/model',
        revision: 'fixture-revision',
        filename: 'model.gguf',
        source: 'https://example.test/unit-test/model.gguf',
        bytes: modelBytes.length,
        sha256: createHash('sha256').update(modelBytes).digest('hex'),
      },
    },
    rollbackArtifactId: null,
  }, null, 2)}\n`)
  await createPackageMetadata({
    packageDirectory: root,
    keyId: 'unit-install-key',
    privateKeyFile,
  })
}

try {
  const sourceRoot = path.join(temporary, 'downloaded')
  const packagesRoot = path.join(temporary, 'managed-packages')
  const privateKeyFile = path.join(temporary, 'private.pem')
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  await writeFile(
    privateKeyFile,
    privateKey.export({ format: 'pem', type: 'pkcs8' }),
    { mode: 0o600 },
  )
  await createSignedFixture(sourceRoot, 'atomic-model-fixture', privateKeyFile)

  const installed = await installVerifiedPackage({
    sourcePackageRoot: sourceRoot,
    paths: { packagesRoot },
    artifactId: 'atomic-model-fixture',
    trustedKeys: { 'unit-install-key': publicKey },
  })
  assert.equal(installed.promotedAtomically, true)
  assert.equal(
    await readFile(path.join(installed.packageRoot, 'model', 'model.gguf'), 'utf8'),
    'small signed model installation fixture',
  )
  assert.equal(
    (await readdir(packagesRoot)).some((name) => name.startsWith('.staging-')),
    false,
  )
  await assert.rejects(
    () => installVerifiedPackage({
      sourcePackageRoot: sourceRoot,
      paths: { packagesRoot },
      artifactId: 'atomic-model-fixture',
      trustedKeys: { 'unit-install-key': publicKey },
    }),
    /Refusing to replace/,
  )

  const damagedRoot = path.join(temporary, 'damaged')
  await createSignedFixture(damagedRoot, 'damaged-model-fixture', privateKeyFile)
  await writeFile(
    path.join(damagedRoot, 'model', 'model.gguf'),
    'tampered after signing',
  )
  await assert.rejects(
    () => installVerifiedPackage({
      sourcePackageRoot: damagedRoot,
      paths: { packagesRoot },
      artifactId: 'damaged-model-fixture',
      trustedKeys: { 'unit-install-key': publicKey },
    }),
    (error: unknown) =>
      (error as { code?: string }).code === 'checksum_mismatch',
  )
  await assert.rejects(
    () => readFile(path.join(packagesRoot, 'damaged-model-fixture', 'manifest.json')),
    (error: unknown) => (error as { code?: string }).code === 'ENOENT',
  )

  const linkedRoot = path.join(temporary, 'linked')
  await createSignedFixture(linkedRoot, 'linked-model-fixture', privateKeyFile)
  await symlink(
    path.join(linkedRoot, 'model', 'model.gguf'),
    path.join(linkedRoot, 'undeclared-link'),
  )
  await assert.rejects(
    () => installVerifiedPackage({
      sourcePackageRoot: linkedRoot,
      paths: { packagesRoot },
      artifactId: 'linked-model-fixture',
      trustedKeys: { 'unit-install-key': publicKey },
    }),
    /symbolic link/,
  )
  assert.equal(
    (await readdir(packagesRoot)).some((name) => name.startsWith('.staging-')),
    false,
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}

console.log('v26-package-installer.test.ts: all tests passed')
