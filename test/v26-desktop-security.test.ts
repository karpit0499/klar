import { strict as assert } from 'node:assert'
import {
  createHash,
  generateKeyPairSync,
  sign,
} from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  contentSecurityPolicy,
  createWindowOptions,
  isAllowedExternalUrl,
  isTrustedRendererUrl,
  validateDevelopmentRendererUrl,
} from '../desktop/security.mjs'
import { DEVELOPMENT_PROFILE_DIRECTORY } from '../desktop/profile.mjs'
import { IPC_CHANNELS } from '../desktop/shared/channels.mjs'
import {
  validateGenerationRequest,
} from '../desktop/shared/validation.mjs'
import {
  buildManagedRuntimeArgs,
  buildRuntimeGenerationBody,
  PINNED_LLAMA_CPP_BUILD,
} from '../desktop/runtime/local-runtime.mjs'
import {
  appVersionSatisfies,
  assertModelCompatibility,
} from '../desktop/runtime/compatibility.mjs'
import {
  ensureWithin,
  packageFile,
} from '../desktop/runtime/managed-paths.mjs'
import { loadTrustedModelKeys } from '../desktop/runtime/trusted-keys.mjs'
import {
  canonicalJson,
  signedPayload,
  verifyModelPackage,
} from '../desktop/runtime/package-verifier.mjs'
import {
  redactDiagnosticValue,
  redactText,
} from '../desktop/diagnostics/redact.mjs'
import { DiagnosticJournal } from '../desktop/diagnostics/journal.mjs'
import { replaceRuntimeDirectory } from '../desktop/tools/install-runtime.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const packageRecipe = await readFile(
  path.join(root, 'model', 'tools', 'prepare-base-validation-package.mjs'),
  'utf8',
)
assert.doesNotMatch(
  packageRecipe,
  /sourceCommit:\s*['"][a-f0-9]{40}['"]/,
  'model-package provenance must never hard-code an earlier release commit',
)
assert.match(packageRecipe, /git['"], \['rev-parse', 'HEAD'\]/)
assert.match(packageRecipe, /-dirty/)

const previewBuilderConfig = await readFile(
  path.join(root, 'desktop', 'electron-builder.yml'),
  'utf8',
)
const productionBuilderConfig = await readFile(
  path.join(root, 'desktop', 'electron-builder.production.yml'),
  'utf8',
)
const signingGuide = await readFile(path.join(root, 'desktop', 'SIGNING.md'), 'utf8')
assert.match(previewBuilderConfig, /^productName: Klar Developer Preview$/m)
assert.match(
  previewBuilderConfig,
  /^artifactName: \$\{productName\}-\$\{version\}-\$\{os\}-\$\{arch\}\.\$\{ext\}$/m,
)
assert.match(productionBuilderConfig, /^productName: Klar$/m)
assert.match(
  productionBuilderConfig,
  /^artifactName: Klar-\$\{version\}-\$\{os\}-\$\{arch\}\.\$\{ext\}$/m,
)
assert.doesNotMatch(productionBuilderConfig, /Klar Developer Preview/)
assert.match(signingGuide, /release\/desktop\/mac-arm64\/Klar\.app/)
assert.match(signingGuide, /release\\desktop\\Klar-2\.6\.0-win-x64\.exe/)
assert.doesNotMatch(signingGuide, /mac-arm64\/Klar Developer Preview\.app/)
assert.doesNotMatch(signingGuide, /Klar Developer Preview\.exe/)

const injectedDevelopmentKey = 'development-public-key-fixture'
assert.deepEqual(
  await loadTrustedModelKeys({
    isPackaged: false,
    resourcesPath: '/not-used-for-unpackaged-development',
    developmentPublicKey: injectedDevelopmentKey,
  }),
  {
    'klar-model-dev-1': injectedDevelopmentKey,
    'klar-model-production-1': injectedDevelopmentKey,
  },
  'the documented unpackaged validation package must trust its explicit PEM',
)
assert.deepEqual(
  await loadTrustedModelKeys({
    isPackaged: false,
    resourcesPath: '/not-used-for-unpackaged-development',
    developmentPublicKey: '',
  }),
  {},
  'an unpackaged process without an explicit PEM trusts no model key',
)

const runtimeReplacementRoot = await mkdtemp(path.join(os.tmpdir(), 'klar-runtime-replace-'))
try {
  const destination = path.join(runtimeReplacementRoot, 'darwin-arm64')
  await mkdir(destination, { recursive: true })
  const readme = Buffer.from('Tracked runtime placeholder.\n')
  await writeFile(path.join(destination, 'README.md'), readme)
  await writeFile(path.join(destination, 'stale-runtime'), 'old')
  await replaceRuntimeDirectory(destination, async () => {
    await writeFile(path.join(destination, 'llama-server'), 'new')
  })
  assert.deepEqual(await readFile(path.join(destination, 'README.md')), readme)
  await assert.rejects(readFile(path.join(destination, 'stale-runtime')), /ENOENT/)
  assert.equal(await readFile(path.join(destination, 'llama-server'), 'utf8'), 'new')
} finally {
  await rm(runtimeReplacementRoot, { recursive: true, force: true })
}
const options = createWindowOptions('/fixed/desktop/preload.cjs')
assert.equal(options.webPreferences.nodeIntegration, false)
assert.equal(options.webPreferences.nodeIntegrationInWorker, false)
assert.equal(options.webPreferences.contextIsolation, true)
assert.equal(options.webPreferences.sandbox, true)
assert.equal(options.webPreferences.webSecurity, true)
assert.equal(options.webPreferences.allowRunningInsecureContent, false)
assert.equal(options.webPreferences.webviewTag, false)
assert.equal(options.webPreferences.navigateOnDragDrop, false)
assert.equal(DEVELOPMENT_PROFILE_DIRECTORY, 'Klar Developer Preview-dev')

const csp = contentSecurityPolicy()
assert.match(csp, /object-src 'none'/)
assert.match(csp, /frame-ancestors 'none'/)
assert.doesNotMatch(csp, /unsafe-eval/)
assert.match(contentSecurityPolicy({ development: true }), /unsafe-eval/)

assert.equal(isAllowedExternalUrl('https://github.com/karpit0499/klar'), true)
assert.equal(isAllowedExternalUrl('http://github.com/karpit0499/klar'), false)
assert.equal(isAllowedExternalUrl('https://127.0.0.1:18080/health'), false)
assert.equal(isAllowedExternalUrl('file:///etc/passwd'), false)
assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false)
assert.equal(
  validateDevelopmentRendererUrl('http://127.0.0.1:5173/'),
  'http://127.0.0.1:5173/',
)
assert.throws(
  () => validateDevelopmentRendererUrl('https://example.com/'),
  /loopback/,
)
assert.equal(
  isTrustedRendererUrl(
    'http://127.0.0.1:5173/search#one',
    'http://127.0.0.1:5173/',
  ),
  true,
)
assert.equal(
  isTrustedRendererUrl(
    'https://example.com/',
    'http://127.0.0.1:5173/',
  ),
  false,
)

assert.deepEqual(IPC_CHANNELS, [
  'klar:system:info',
  'klar:runtime:status',
  'klar:runtime:start',
  'klar:runtime:stop',
  'klar:ai:generate',
  'klar:ai:cancel',
  'klar:diagnostics:report',
])

const schema = {
  type: 'object',
  properties: {
    required_skills: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['required_skills'],
  additionalProperties: false,
}
const request = validateGenerationRequest({
  requestId: 'desktop-request-0001',
  capability: 'structured_job_extraction',
  language: 'en',
  messages: [
    { role: 'system', content: 'Return JSON.' },
    { role: 'user', content: 'SQL required.' },
  ],
  adapter: 'precision',
  maxOutputTokens: 512,
  temperature: 0,
  timeoutMs: 30_000,
  jsonSchema: schema,
})
assert.throws(
  () =>
    validateGenerationRequest({
      ...request,
      executable: '/tmp/evil',
    }),
  /Unexpected field/,
)

const body = buildRuntimeGenerationBody(request, {
  precision: 0,
  writer: 1,
})
assert.deepEqual(body.response_format, {
  type: 'json_object',
  schema,
})
assert.deepEqual(body.lora, [{ id: 0, scale: 1 }])
assert.equal(PINNED_LLAMA_CPP_BUILD, 'b10199')
assert.equal(appVersionSatisfies('2.6.0', '>=2.6.0 <2.7.0'), true)
assert.equal(appVersionSatisfies('2.7.0', '>=2.6.0 <2.7.0'), false)

const runtimeArgs = buildManagedRuntimeArgs({
  launch: {
    modelPath: '/managed/model.gguf',
    contextTokens: 8192,
    adapters: {
      precision: '/managed/precision.gguf',
      writer: '/managed/writer.gguf',
    },
  },
  port: 18080,
  apiKeyFile: '/managed/runtime/api-key',
})
assert.deepEqual(runtimeArgs.slice(0, 4), [
  '--host',
  '127.0.0.1',
  '--port',
  '18080',
])
assert.ok(runtimeArgs.includes('--no-webui'))
assert.ok(runtimeArgs.includes('--offline'))
assert.ok(runtimeArgs.includes('--lora-init-without-apply'))
assert.equal(
  runtimeArgs[runtimeArgs.indexOf('--lora') + 1],
  '/managed/precision.gguf,/managed/writer.gguf',
)
assert.doesNotMatch(runtimeArgs.join(' '), /Bearer|secret-value/)

assert.equal(
  redactText(
    'Bearer secret-value email me@example.com file /Users/klar/resume.docx https://example.com/report?token=abc#private',
  ),
  'Bearer [REDACTED] email [REDACTED_EMAIL] file [REDACTED_PATH] https://example.com/report',
)
assert.equal(
  redactText(
    'paths /private/tmp/report.json /Volumes/External/resume.docx C:\\work\\letter.docx \\\\server\\share\\cv.docx',
  ),
  'paths [REDACTED_PATH] [REDACTED_PATH] [REDACTED_PATH] [REDACTED_PATH]',
)
assert.deepEqual(
  redactDiagnosticValue({
    event: 'generation.failed',
    resume: 'private résumé text',
    apiKey: 'gsk_private',
    detail: 'user at user@example.com',
  }),
  {
    event: 'generation.failed',
    resume: '[REDACTED_CONTENT]',
    apiKey: '[REDACTED_CONTENT]',
    detail: 'user at [REDACTED_EMAIL]',
  },
)
const diagnosticPiiRequestId = 'Kumar_Arpit_Resume_2026_08_01'
const diagnosticPiiArtifactId = 'QXJwaXQtS3VtYXItUHJpdmF0ZS1Nb2RlbA'
const journal = new DiagnosticJournal({
  now: () => new Date('2026-08-01T12:00:00.000Z'),
})
journal.record('runtime.renderer_controlled_ids', {
  requestId: diagnosticPiiRequestId,
  artifactId: diagnosticPiiArtifactId,
  outcome: 'error',
})
const journalReport = journal.report({
  appVersion: '2.6.0',
  platform: 'darwin',
  architecture: 'arm64',
})
const serializedJournal = JSON.stringify(journalReport)
assert.doesNotMatch(serializedJournal, new RegExp(diagnosticPiiRequestId))
assert.doesNotMatch(serializedJournal, new RegExp(diagnosticPiiArtifactId))
assert.deepEqual(journalReport.events[0].detail, {
  requestId: '[REDACTED_CONTENT]',
  artifactId: '[REDACTED_CONTENT]',
  outcome: 'error',
})

const runtimeSource = await readFile(
  path.join(root, 'desktop', 'runtime', 'local-runtime.mjs'),
  'utf8',
)
assert.doesNotMatch(
  runtimeSource,
  /diagnostics\.record\('runtime\.generation_completed', \{\s*requestId:/,
)
assert.doesNotMatch(
  runtimeSource,
  /diagnostics\.record\('runtime\.generation_cancelled', \{\s*requestId:/,
)

const preloadSource = await readFile(
  path.join(root, 'desktop', 'preload.cjs'),
  'utf8',
)
assert.match(preloadSource, /contextBridge\.exposeInMainWorld/)
assert.doesNotMatch(preloadSource, /exposeInMainWorld\([^]*ipcRenderer\s*[),]/)
assert.doesNotMatch(preloadSource, /readFile|writeFile|spawn|exec|shell/)
assert.doesNotMatch(preloadSource, /^\s*import\s/m)

assert.equal(
  ensureWithin('/managed/root', '/managed/root/model/file.gguf'),
  '/managed/root/model/file.gguf',
)
assert.throws(
  () => ensureWithin('/managed/root', '/managed/escape.gguf'),
  /escaped/,
)
assert.throws(
  () =>
    packageFile(
      { packagesRoot: '/managed/packages' },
      'safe-model',
      '../escape.gguf',
    ),
  /Invalid package-relative path/,
)

const temporary = await mkdtemp(path.join(os.tmpdir(), 'klar-v26-package-'))
try {
  const packagesRoot = path.join(temporary, 'packages')
  const artifactId = 'signed-model-lab'
  const packageRoot = path.join(packagesRoot, artifactId)
  await mkdir(path.join(packageRoot, 'model'), { recursive: true })
  await mkdir(path.join(packageRoot, 'adapters'), { recursive: true })
  const artifacts = [
    ['model/model.gguf', 'model', Buffer.from('verified model fixture')],
    [
      'adapters/precision.gguf',
      'adapter_precision',
      Buffer.from('verified precision fixture'),
    ],
  ] as const
  for (const [relative, _role, bytes] of artifacts) {
    await writeFile(path.join(packageRoot, ...relative.split('/')), bytes)
  }
  const manifest = {
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
      expectedPackageBytes: artifacts.reduce(
        (total, artifact) => total + artifact[2].length,
        0,
      ),
    },
    compatibility: {
      app: '>=2.6.0 <2.7.0',
      runtime: 'b10199',
      promptSchemas: ['klar-generation-v1'],
      adapters: ['precision-v1'],
      platforms: ['darwin-arm64'],
    },
    artifacts: artifacts.map(([relative, role]) => ({
      role,
      path: relative,
      mediaType: 'application/vnd.gguf',
    })),
    provenance: {
      createdAt: '2026-07-31T00:00:00.000Z',
      builder: 'unit-test',
      sourceCommit: 'fixture',
      recipe: 'test/v26-desktop-security.test.ts',
      sourceArtifact: {
        repository: 'unit-test/model',
        revision: 'fixture-revision',
        filename: 'model.gguf',
        source: 'https://example.test/unit-test/model.gguf',
        bytes: artifacts[0][2].length,
        sha256: createHash('sha256').update(artifacts[0][2]).digest('hex'),
      },
    },
    rollbackArtifactId: null,
  }
  const checksums = {
    schemaVersion: 1,
    artifactId,
    algorithm: 'sha256',
    files: artifacts.map(([relative, _role, bytes]) => ({
      path: relative,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })),
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const payload = signedPayload(manifest, checksums)
  const signature = {
    schemaVersion: 1,
    artifactId,
    algorithm: 'ed25519',
    keyId: 'unit-test-key',
    payloadSha256: createHash('sha256').update(payload).digest('hex'),
    signature: sign(null, payload, privateKey).toString('base64'),
  }
  await Promise.all([
    writeFile(
      path.join(packageRoot, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    ),
    writeFile(
      path.join(packageRoot, 'checksums.json'),
      `${JSON.stringify(checksums, null, 2)}\n`,
    ),
    writeFile(
      path.join(packageRoot, 'signature.json'),
      `${JSON.stringify(signature, null, 2)}\n`,
    ),
  ])
  const verified = await verifyModelPackage({
    paths: { packagesRoot },
    artifactId,
    trustedKeys: { 'unit-test-key': publicKey },
  })
  assert.equal(verified.verifiedBytes, checksums.files.reduce(
    (total, file) => total + file.bytes,
    0,
  ))
  assert.equal(verified.manifest.runtime.version, 'b10199')
  assert.doesNotThrow(() =>
    assertModelCompatibility(verified.manifest, {
      appVersion: '2.6.0',
      platform: 'darwin-arm64',
      runtimeBuild: 'b10199',
      promptSchema: 'klar-generation-v1',
    }),
  )
  assert.throws(
    () =>
      assertModelCompatibility(verified.manifest, {
        appVersion: '2.7.0',
        platform: 'darwin-arm64',
        runtimeBuild: 'b10199',
        promptSchema: 'klar-generation-v1',
      }),
    (error: unknown) =>
      (error as { code?: string }).code === 'incompatible_app',
  )
  assert.equal(
    canonicalJson({ b: 2, a: 1 }),
    '{"a":1,"b":2}',
  )

  const undeclaredFile = path.join(packageRoot, 'notes.txt')
  await writeFile(undeclaredFile, 'must not be accepted')
  await assert.rejects(
    verifyModelPackage({
      paths: { packagesRoot },
      artifactId,
      trustedKeys: { 'unit-test-key': publicKey },
    }),
    (error: unknown) =>
      (error as { code?: string }).code === 'undeclared_artifact',
  )
  await rm(undeclaredFile, { force: true })

  await writeFile(
    path.join(packageRoot, 'model', 'model.gguf'),
    'tampered model fixture',
  )
  await assert.rejects(
    verifyModelPackage({
      paths: { packagesRoot },
      artifactId,
      trustedKeys: { 'unit-test-key': publicKey },
    }),
    (error: unknown) =>
      (error as { code?: string }).code === 'checksum_mismatch',
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}

console.log('v26-desktop-security.test.ts: all tests passed')
