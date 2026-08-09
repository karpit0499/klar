#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createPackageMetadata } from './create-package-metadata.mjs'
import { verifyModelPackage } from '../../desktop/runtime/package-verifier.mjs'

const ARTIFACT_ID = 'qwen3.5-9b-q4km-base-validation'
const KEY_ID = 'klar-model-production-1'
const MODEL_NAME = 'qwen3.5-9b-q4_k_m.gguf'
const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

function usage() {
  return [
    'Usage: node model/tools/prepare-base-validation-package.mjs',
    '  <packages-root> <verified-model.gguf> <private-key.pem> <public-key.pem>',
    '',
    'This creates a base-only, validation-only package. It never represents',
    'the two Kaggle adapter artifacts or a production graduation decision.',
  ].join('\n')
}

async function exists(file) {
  try {
    await lstat(file)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function sourceCommit() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    timeout: 5_000,
    maxBuffer: 4_096,
  })
  const commit = stdout.trim()
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('Could not resolve a full Git source commit for package provenance.')
  }
  const { stdout: changes } = await execFileAsync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=normal'],
    { cwd: repositoryRoot, timeout: 5_000, maxBuffer: 4 * 1_024 * 1_024 },
  )
  return changes.length > 0 ? `${commit}-dirty` : commit
}

const [packagesRootValue, sourceModelValue, privateKeyValue, publicKeyValue] =
  process.argv.slice(2)
if (
  !packagesRootValue
  || !sourceModelValue
  || !privateKeyValue
  || !publicKeyValue
  || process.argv.length !== 6
) {
  throw new Error(usage())
}

const packagesRoot = path.resolve(packagesRootValue)
const sourceModel = path.resolve(sourceModelValue)
const privateKeyFile = path.resolve(privateKeyValue)
const publicKeyFile = path.resolve(publicKeyValue)
const destination = path.join(packagesRoot, ARTIFACT_ID)
if (await exists(destination)) {
  throw new Error(`Refusing to replace existing package: ${destination}`)
}

await mkdir(packagesRoot, { recursive: true, mode: 0o700 })
const packageSourceCommit = await sourceCommit()
const stagingRoot = path.join(
  packagesRoot,
  `.staging-${ARTIFACT_ID}-${randomUUID()}`,
)
const packageRoot = path.join(stagingRoot, ARTIFACT_ID)

try {
  const modelDirectory = path.join(packageRoot, 'model')
  await mkdir(modelDirectory, { recursive: true, mode: 0o700 })
  const targetModel = path.join(modelDirectory, MODEL_NAME)
  await copyFile(sourceModel, targetModel, constants.COPYFILE_FICLONE)
  const modelInfo = await stat(targetModel)

  const manifest = {
    schemaVersion: 1,
    artifactId: ARTIFACT_ID,
    version: '0.1.0',
    kind: 'klar-local-model',
    baseModel: {
      name: 'Qwen/Qwen3.5-9B',
      revision: 'c202236235762e1c871ad0ccb60c8ee5ba337b9a',
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
      minimumMemoryBytes: 12 * 1_024 ** 3,
      recommendedMemoryBytes: 24 * 1_024 ** 3,
      expectedPackageBytes: modelInfo.size,
    },
    compatibility: {
      app: '>=2.6.0 <2.7.0',
      runtime: 'b10199',
      promptSchemas: ['klar-generation-v1'],
      adapters: [],
      platforms: ['darwin-arm64', 'darwin-x64', 'win32-x64'],
    },
    artifacts: [{
      role: 'model',
      path: `model/${MODEL_NAME}`,
      mediaType: 'application/vnd.gguf',
    }],
    provenance: {
      createdAt: new Date().toISOString(),
      builder: 'Klar v2.6 local feasibility validation',
      sourceCommit: packageSourceCommit,
      recipe: 'model/tools/prepare-base-validation-package.mjs',
      sourceArtifact: {
        repository: 'bartowski/Qwen_Qwen3.5-9B-GGUF',
        revision: '2dcd842c59ea5eb119267064550a7a4c592b16c3',
        filename: 'Qwen_Qwen3.5-9B-Q4_K_M.gguf',
        source: 'https://huggingface.co/bartowski/Qwen_Qwen3.5-9B-GGUF/blob/2dcd842c59ea5eb119267064550a7a4c592b16c3/Qwen_Qwen3.5-9B-Q4_K_M.gguf',
        bytes: 6_169_341_984,
        sha256: 'd784ce9eda1a5a7b51e8f705a9e6310844bf4f173654d115823c775fdea56d43',
      },
    },
    rollbackArtifactId: null,
  }
  await writeFile(
    path.join(packageRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
  await createPackageMetadata({
    packageDirectory: packageRoot,
    keyId: KEY_ID,
    privateKeyFile,
  })

  const publicKey = await readFile(publicKeyFile, 'utf8')
  const verified = await verifyModelPackage({
    paths: { packagesRoot: stagingRoot },
    artifactId: ARTIFACT_ID,
    trustedKeys: { [KEY_ID]: publicKey },
  })
  await rename(packageRoot, destination)
  console.log(JSON.stringify({
    artifactId: ARTIFACT_ID,
    destination,
    verifiedBytes: verified.verifiedBytes,
    adapters: Object.keys(verified.adapters),
    promotedAtomically: true,
  }, null, 2))
} finally {
  await rm(stagingRoot, { recursive: true, force: true })
}
