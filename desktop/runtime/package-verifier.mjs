import {
  createHash,
  verify as verifySignature,
} from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  lstat,
  readdir,
  readFile,
  realpath,
} from 'node:fs/promises'
import path from 'node:path'
import {
  packageDirectory,
  packageFile,
} from './managed-paths.mjs'

const SHA256 = /^[a-f0-9]{64}$/
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/
const ROLES = new Set(['model', 'adapter_precision', 'adapter_writer'])
const QUANTIZATIONS = new Set(['F16', 'Q8_0', 'Q6_K', 'Q5_K_M', 'Q4_K_M'])

export class ModelVerificationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ModelVerificationError'
    this.code = code
  }
}

function fail(code, message) {
  throw new ModelVerificationError(code, message)
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, allowed, label) {
  const known = new Set(allowed)
  const unknown = Object.keys(value).find((key) => !known.has(key))
  if (unknown) fail('invalid_metadata', `${label} contains unknown field ${unknown}.`)
}

function requiredString(value, label, maximum = 512) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    /[\u0000-\u001f]/.test(value)
  ) {
    fail('invalid_metadata', `${label} must be non-empty text.`)
  }
  return value
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('invalid_metadata', `${label} must be a non-negative integer.`)
  }
  return value
}

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`
}

export function signedPayload(manifest, checksums) {
  return Buffer.from(canonicalJson({ checksums, manifest }), 'utf8')
}

export function validateManifest(value, expectedArtifactId) {
  if (!isRecord(value)) fail('invalid_manifest', 'manifest.json must be an object.')
  exactKeys(
    value,
    [
      'schemaVersion',
      'artifactId',
      'version',
      'kind',
      'baseModel',
      'quantization',
      'runtime',
      'hardware',
      'compatibility',
      'artifacts',
      'provenance',
      'rollbackArtifactId',
    ],
    'manifest.json',
  )
  if (value.schemaVersion !== 1) fail('incompatible_manifest', 'Unsupported manifest version.')
  if (value.artifactId !== expectedArtifactId) {
    fail('invalid_manifest', 'Artifact id does not match its managed directory.')
  }
  if (!VERSION.test(value.version)) fail('invalid_manifest', 'Invalid package version.')
  if (value.kind !== 'klar-local-model') fail('invalid_manifest', 'Invalid package kind.')
  if (!isRecord(value.baseModel)) fail('invalid_manifest', 'baseModel is required.')
  exactKeys(value.baseModel, ['name', 'revision', 'license', 'source'], 'baseModel')
  requiredString(value.baseModel.name, 'baseModel.name')
  requiredString(value.baseModel.revision, 'baseModel.revision')
  requiredString(value.baseModel.license, 'baseModel.license')
  requiredString(value.baseModel.source, 'baseModel.source')
  try {
    const source = new URL(value.baseModel.source)
    if (source.protocol !== 'https:') fail('invalid_manifest', 'Model source must use HTTPS.')
  } catch {
    fail('invalid_manifest', 'Model source must be a valid HTTPS URL.')
  }
  if (!QUANTIZATIONS.has(value.quantization)) {
    fail('invalid_manifest', 'Unsupported quantization label.')
  }
  if (!isRecord(value.runtime)) fail('invalid_manifest', 'runtime is required.')
  exactKeys(value.runtime, ['engine', 'version', 'contextTokens'], 'runtime')
  if (value.runtime.engine !== 'llama.cpp') fail('invalid_manifest', 'Unsupported runtime.')
  requiredString(value.runtime.version, 'runtime.version')
  if (
    !Number.isSafeInteger(value.runtime.contextTokens) ||
    value.runtime.contextTokens < 1_024 ||
    value.runtime.contextTokens > 32_768
  ) {
    fail('invalid_manifest', 'runtime.contextTokens is outside the managed limit.')
  }
  if (!isRecord(value.hardware)) fail('invalid_manifest', 'hardware is required.')
  exactKeys(
    value.hardware,
    ['minimumMemoryBytes', 'recommendedMemoryBytes', 'expectedPackageBytes'],
    'hardware',
  )
  positiveInteger(value.hardware.minimumMemoryBytes, 'hardware.minimumMemoryBytes')
  positiveInteger(value.hardware.recommendedMemoryBytes, 'hardware.recommendedMemoryBytes')
  positiveInteger(value.hardware.expectedPackageBytes, 'hardware.expectedPackageBytes')
  if (
    value.hardware.recommendedMemoryBytes < value.hardware.minimumMemoryBytes
  ) {
    fail('invalid_manifest', 'Recommended memory cannot be below minimum memory.')
  }
  if (!isRecord(value.compatibility)) fail('invalid_manifest', 'compatibility is required.')
  exactKeys(
    value.compatibility,
    ['app', 'runtime', 'promptSchemas', 'adapters', 'platforms'],
    'compatibility',
  )
  for (const key of ['app', 'runtime']) {
    requiredString(value.compatibility[key], `compatibility.${key}`)
  }
  for (const key of ['promptSchemas', 'adapters', 'platforms']) {
    if (
      !Array.isArray(value.compatibility[key]) ||
      value.compatibility[key].some((item) => typeof item !== 'string' || !item)
    ) {
      fail('invalid_manifest', `compatibility.${key} must be a string array.`)
    }
  }
  if (!Array.isArray(value.artifacts) || value.artifacts.length < 1) {
    fail('invalid_manifest', 'At least one artifact is required.')
  }
  const roles = new Set()
  const paths = new Set()
  for (const [index, artifact] of value.artifacts.entries()) {
    if (!isRecord(artifact)) fail('invalid_manifest', `artifacts[${index}] is invalid.`)
    exactKeys(artifact, ['role', 'path', 'mediaType'], `artifacts[${index}]`)
    if (!ROLES.has(artifact.role) || roles.has(artifact.role)) {
      fail('invalid_manifest', `artifacts[${index}].role is invalid or duplicated.`)
    }
    roles.add(artifact.role)
    requiredString(artifact.path, `artifacts[${index}].path`)
    if (paths.has(artifact.path)) fail('invalid_manifest', 'Artifact paths must be unique.')
    paths.add(artifact.path)
    requiredString(artifact.mediaType, `artifacts[${index}].mediaType`)
  }
  if (!roles.has('model')) fail('invalid_manifest', 'A base model artifact is required.')
  if (!isRecord(value.provenance)) fail('invalid_manifest', 'provenance is required.')
  exactKeys(
    value.provenance,
    ['createdAt', 'builder', 'sourceCommit', 'recipe', 'sourceArtifact'],
    'provenance',
  )
  for (const key of ['createdAt', 'builder', 'sourceCommit', 'recipe']) {
    requiredString(value.provenance[key], `provenance.${key}`)
  }
  if (!isRecord(value.provenance.sourceArtifact)) {
    fail('invalid_manifest', 'provenance.sourceArtifact is required.')
  }
  exactKeys(
    value.provenance.sourceArtifact,
    ['repository', 'revision', 'filename', 'source', 'bytes', 'sha256'],
    'provenance.sourceArtifact',
  )
  for (const key of ['repository', 'revision', 'filename', 'source']) {
    requiredString(
      value.provenance.sourceArtifact[key],
      `provenance.sourceArtifact.${key}`,
    )
  }
  try {
    const source = new URL(value.provenance.sourceArtifact.source)
    if (source.protocol !== 'https:') {
      fail('invalid_manifest', 'Source artifact URL must use HTTPS.')
    }
  } catch {
    fail('invalid_manifest', 'Source artifact URL must be a valid HTTPS URL.')
  }
  positiveInteger(value.provenance.sourceArtifact.bytes, 'provenance.sourceArtifact.bytes')
  if (!SHA256.test(value.provenance.sourceArtifact.sha256)) {
    fail('invalid_manifest', 'provenance.sourceArtifact.sha256 is invalid.')
  }
  if (
    value.rollbackArtifactId !== null &&
    typeof value.rollbackArtifactId !== 'string'
  ) {
    fail('invalid_manifest', 'rollbackArtifactId must be text or null.')
  }
  return value
}

export function validateChecksums(value, artifactId) {
  if (!isRecord(value)) fail('invalid_checksums', 'checksums.json must be an object.')
  exactKeys(value, ['schemaVersion', 'artifactId', 'algorithm', 'files'], 'checksums.json')
  if (value.schemaVersion !== 1 || value.artifactId !== artifactId) {
    fail('invalid_checksums', 'Checksum set does not match the package.')
  }
  if (value.algorithm !== 'sha256') fail('invalid_checksums', 'Only SHA-256 is accepted.')
  if (!Array.isArray(value.files) || value.files.length < 1) {
    fail('invalid_checksums', 'Checksum files are required.')
  }
  const paths = new Set()
  for (const [index, entry] of value.files.entries()) {
    if (!isRecord(entry)) fail('invalid_checksums', `files[${index}] is invalid.`)
    exactKeys(entry, ['path', 'bytes', 'sha256'], `files[${index}]`)
    requiredString(entry.path, `files[${index}].path`)
    if (paths.has(entry.path)) fail('invalid_checksums', 'Checksum paths must be unique.')
    paths.add(entry.path)
    positiveInteger(entry.bytes, `files[${index}].bytes`)
    if (typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256)) {
      fail('invalid_checksums', `files[${index}].sha256 is invalid.`)
    }
  }
  return value
}

export function validateSignature(value, artifactId) {
  if (!isRecord(value)) fail('invalid_signature', 'signature.json must be an object.')
  exactKeys(
    value,
    ['schemaVersion', 'artifactId', 'algorithm', 'keyId', 'payloadSha256', 'signature'],
    'signature.json',
  )
  if (value.schemaVersion !== 1 || value.artifactId !== artifactId) {
    fail('invalid_signature', 'Signature does not match the package.')
  }
  if (value.algorithm !== 'ed25519') fail('invalid_signature', 'Only Ed25519 is accepted.')
  requiredString(value.keyId, 'signature.keyId', 128)
  if (typeof value.payloadSha256 !== 'string' || !SHA256.test(value.payloadSha256)) {
    fail('invalid_signature', 'signature.payloadSha256 is invalid.')
  }
  if (
    typeof value.signature !== 'string' ||
    !/^[A-Za-z0-9+/]{86}==$/.test(value.signature)
  ) {
    fail('invalid_signature', 'signature.signature is invalid.')
  }
  return value
}

async function parseJson(file, label) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    fail('missing_metadata', `${label} could not be read: ${error.code ?? 'unknown'}`)
  }
  try {
    return JSON.parse(raw)
  } catch {
    fail('invalid_metadata', `${label} is not valid JSON.`)
  }
}

async function sha256File(file) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(file)) digest.update(chunk)
  return digest.digest('hex')
}

async function assertRegularManagedFile(root, file) {
  const relativeParts = path.relative(root, file).split(path.sep)
  let current = root
  for (const part of relativeParts) {
    current = path.join(current, part)
    const componentInfo = await lstat(current)
    if (componentInfo.isSymbolicLink()) {
      fail('unsafe_artifact', 'Package paths must not contain symbolic links.')
    }
  }
  const fileInfo = await lstat(file)
  if (!fileInfo.isFile()) {
    fail('unsafe_artifact', 'Package artifacts must be regular files, not links.')
  }
  const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)])
  const relative = path.relative(realRoot, realFile)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('unsafe_artifact', 'Package artifact escaped its managed directory.')
  }
  return fileInfo
}

async function assertNoUndeclaredPackageEntries(root, declaredPaths) {
  const allowed = new Set([
    'manifest.json',
    'checksums.json',
    'signature.json',
    ...declaredPaths,
  ])

  async function walk(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        fail('unsafe_artifact', `Package contains a symbolic link: ${relative}`)
      }
      if (entry.isDirectory()) {
        await walk(absolute, relative)
        continue
      }
      if (!entry.isFile()) {
        fail('unsafe_artifact', `Package contains a special file: ${relative}`)
      }
      if (!allowed.has(relative)) {
        fail('undeclared_artifact', `Package contains an undeclared file: ${relative}`)
      }
    }
  }

  await walk(root)
}

export async function verifyModelPackage({
  paths,
  artifactId,
  trustedKeys,
}) {
  const root = packageDirectory(paths, artifactId)
  let packageInfo
  try {
    packageInfo = await lstat(root)
  } catch {
    fail('missing_artifact', 'The managed model package is unavailable.')
  }
  if (!packageInfo.isDirectory() || packageInfo.isSymbolicLink()) {
    fail('unsafe_artifact', 'The model package must be a real managed directory.')
  }
  const [realPackagesRoot, realPackageRoot] = await Promise.all([
    realpath(paths.packagesRoot),
    realpath(root),
  ])
  const packageRelative = path.relative(realPackagesRoot, realPackageRoot)
  if (
    packageRelative.startsWith('..') ||
    path.isAbsolute(packageRelative)
  ) {
    fail('unsafe_artifact', 'The model package escaped the managed model root.')
  }
  const metadataFiles = [
    path.join(root, 'manifest.json'),
    path.join(root, 'checksums.json'),
    path.join(root, 'signature.json'),
  ]
  try {
    for (const file of metadataFiles) await assertRegularManagedFile(root, file)
  } catch (error) {
    if (error instanceof ModelVerificationError) throw error
    fail('missing_metadata', 'Package metadata is unavailable.')
  }
  const [manifestValue, checksumsValue, signatureValue] = await Promise.all([
    parseJson(metadataFiles[0], 'manifest.json'),
    parseJson(metadataFiles[1], 'checksums.json'),
    parseJson(metadataFiles[2], 'signature.json'),
  ])
  const manifest = validateManifest(manifestValue, artifactId)
  const checksums = validateChecksums(checksumsValue, artifactId)
  const signature = validateSignature(signatureValue, artifactId)
  const expectedPaths = new Set(manifest.artifacts.map((artifact) => artifact.path))
  const checksumPaths = new Set(checksums.files.map((entry) => entry.path))
  if (
    expectedPaths.size !== checksumPaths.size ||
    [...expectedPaths].some((file) => !checksumPaths.has(file))
  ) {
    fail('invalid_checksums', 'Checksums must cover every declared artifact exactly once.')
  }
  const modelArtifact = manifest.artifacts.find((artifact) => artifact.role === 'model')
  const modelChecksum = checksums.files.find((entry) => entry.path === modelArtifact.path)
  if (
    modelChecksum.bytes !== manifest.provenance.sourceArtifact.bytes ||
    modelChecksum.sha256 !== manifest.provenance.sourceArtifact.sha256
  ) {
    fail(
      'invalid_manifest',
      'The packaged model must match the exact source artifact recorded in provenance.',
    )
  }
  await assertNoUndeclaredPackageEntries(root, expectedPaths)

  const payload = signedPayload(manifest, checksums)
  const payloadSha256 = createHash('sha256').update(payload).digest('hex')
  if (payloadSha256 !== signature.payloadSha256) {
    fail('invalid_signature', 'Signed payload digest does not match.')
  }
  // A supplied 'constructor' or 'toString' would otherwise read an inherited
  // property, skip the untrusted-key check and escape the typed error channel.
  const publicKey = Object.hasOwn(trustedKeys, signature.keyId)
    ? trustedKeys[signature.keyId]
    : undefined
  if (!publicKey) fail('untrusted_key', 'Package signing key is not trusted.')
  let signatureBytes
  try {
    signatureBytes = Buffer.from(signature.signature, 'base64')
  } catch {
    fail('invalid_signature', 'Signature is not valid base64.')
  }
  if (!verifySignature(null, payload, publicKey, signatureBytes)) {
    fail('invalid_signature', 'Package signature verification failed.')
  }

  let verifiedBytes = 0
  for (const checksum of checksums.files) {
    const file = packageFile(paths, artifactId, checksum.path)
    let fileInfo
    try {
      fileInfo = await assertRegularManagedFile(root, file)
    } catch (error) {
      if (error instanceof ModelVerificationError) throw error
      fail('missing_artifact', `Artifact is unavailable: ${checksum.path}`)
    }
    if (fileInfo.size !== checksum.bytes) {
      fail('checksum_mismatch', `Artifact size mismatch: ${checksum.path}`)
    }
    if ((await sha256File(file)) !== checksum.sha256) {
      fail('checksum_mismatch', `Artifact checksum mismatch: ${checksum.path}`)
    }
    verifiedBytes += fileInfo.size
  }
  if (verifiedBytes !== manifest.hardware.expectedPackageBytes) {
    fail(
      'invalid_manifest',
      'Verified artifact bytes do not match hardware.expectedPackageBytes.',
    )
  }

  const byRole = Object.fromEntries(
    manifest.artifacts.map((artifact) => [
      artifact.role,
      packageFile(paths, artifactId, artifact.path),
    ]),
  )
  return Object.freeze({
    artifactId,
    manifest,
    verifiedBytes,
    modelPath: byRole.model,
    adapters: Object.freeze({
      ...(byRole.adapter_precision ? { precision: byRole.adapter_precision } : {}),
      ...(byRole.adapter_writer ? { writer: byRole.adapter_writer } : {}),
    }),
  })
}
