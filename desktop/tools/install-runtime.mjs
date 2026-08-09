#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'

const LLAMA_CPP_TAG = 'b10199'
const LLAMA_CPP_COMMIT = 'b4ca032ae3729516943884786de4ae39fba0bbca'
const RELEASE_ROOT =
  `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_TAG}`

const ARTIFACTS = Object.freeze({
  'darwin-arm64': {
    archive: 'llama-b10199-bin-macos-arm64.tar.gz',
    sha256: 'a7bc124584fbed7e848f7d95987a6c537399a7398682f45fa32b66852269ae6c',
    executable: 'llama-server',
    extraction: ['-xzf'],
  },
  'darwin-x64': {
    archive: 'llama-b10199-bin-macos-x64.tar.gz',
    sha256: 'df24f71388941f030cf4f0f716584f0c5fdeb4465ff67a036d37575d809b4799',
    executable: 'llama-server',
    extraction: ['-xzf'],
  },
  'win32-x64': {
    archive: 'llama-b10199-bin-win-cpu-x64.zip',
    sha256: 'b10b8cbcc0fef99771daf13cfea426d1dde4baf36618a9b4c4c30a6f79115650',
    executable: 'llama-server.exe',
    extraction: ['-xf'],
  },
})

const here = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(here, '..', '..')

function usage() {
  return [
    'Usage: node desktop/tools/install-runtime.mjs <platform>',
    `Platforms: ${Object.keys(ARTIFACTS).join(', ')}`,
  ].join('\n')
}

async function sha256(file) {
  const digest = createHash('sha256')
  digest.update(await readFile(file))
  return digest.digest('hex')
}

async function copyRuntimeFile(sourceRoot, destinationRoot, entry) {
  const source = path.join(sourceRoot, entry.name)
  const destination = path.join(destinationRoot, entry.name)
  if (entry.isSymbolicLink()) {
    const target = await readlink(source)
    if (
      path.isAbsolute(target) ||
      target.includes('/') ||
      target.includes('\\') ||
      target === '.' ||
      target === '..'
    ) {
      throw new Error(`Unsafe runtime symlink: ${entry.name}`)
    }
    await symlink(target, destination)
    return
  }
  const info = await lstat(source)
  if (!info.isFile()) return
  await copyFile(source, destination)
}

/** Replace downloaded files without deleting the tracked platform README. */
export async function replaceRuntimeDirectory(destinationRoot, populate) {
  const readmePath = path.join(destinationRoot, 'README.md')
  let preservedReadme = null
  let preservedMode = 0o644
  try {
    const info = await lstat(readmePath)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Runtime placeholder is not a regular file: ${readmePath}`)
    }
    preservedReadme = await readFile(readmePath)
    preservedMode = info.mode & 0o777
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === 'ENOENT')) throw error
  }

  await rm(destinationRoot, { recursive: true, force: true })
  await mkdir(destinationRoot, { recursive: true })
  if (preservedReadme) {
    await writeFile(readmePath, preservedReadme, { mode: preservedMode })
  }
  await populate()
}

async function main() {
  const platform = process.argv[2]
  const artifact = ARTIFACTS[platform]
  if (!artifact || process.argv.length !== 3) throw new Error(usage())

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'klar-llama-runtime-'))
  try {
    const archive = path.join(temporaryRoot, artifact.archive)
    const extractionRoot = path.join(temporaryRoot, 'extracted')
    await mkdir(extractionRoot, { recursive: true })

    const response = await fetch(`${RELEASE_ROOT}/${artifact.archive}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok || !response.body) {
      throw new Error(`Runtime download failed with HTTP ${response.status}.`)
    }
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(archive, { flags: 'wx', mode: 0o600 }),
    )
    const actualSha256 = await sha256(archive)
    if (actualSha256 !== artifact.sha256) {
      throw new Error(
        `Runtime checksum mismatch: expected ${artifact.sha256}, received ${actualSha256}.`,
      )
    }

    const extraction = spawnSync(
      'tar',
      [...artifact.extraction, archive, '-C', extractionRoot],
      { stdio: 'inherit', shell: false },
    )
    if (extraction.status !== 0) {
      throw new Error(`Runtime extraction failed with status ${extraction.status}.`)
    }

    const sourceRoot = path.join(extractionRoot, `llama-${LLAMA_CPP_TAG}`)
    const entries = await readdir(sourceRoot, { withFileTypes: true })
    const selected = entries.filter((entry) =>
      entry.name === artifact.executable ||
      entry.name === 'LICENSE' ||
      entry.name.endsWith('.dylib') ||
      entry.name.toLowerCase().endsWith('.dll'))
    if (!selected.some((entry) => entry.name === artifact.executable)) {
      throw new Error('The verified archive did not contain llama-server.')
    }

    const destinationRoot = path.join(
      repositoryRoot,
      'desktop',
      'vendor',
      platform,
    )
    await replaceRuntimeDirectory(destinationRoot, async () => {
      for (const entry of selected) {
        await copyRuntimeFile(sourceRoot, destinationRoot, entry)
      }
      if (platform !== 'win32-x64') {
        await chmod(path.join(destinationRoot, artifact.executable), 0o755)
      }
      await writeFile(
        path.join(destinationRoot, 'PROVENANCE.json'),
        `${JSON.stringify({
          schemaVersion: 1,
          project: 'ggml-org/llama.cpp',
          tag: LLAMA_CPP_TAG,
          commit: LLAMA_CPP_COMMIT,
          archive: artifact.archive,
          archiveBytes: Number(response.headers.get('content-length')) || null,
          archiveSha256: artifact.sha256,
          source: `${RELEASE_ROOT}/${artifact.archive}`,
          installedFor: platform,
        }, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      )
    })
    console.log(`Installed verified ${LLAMA_CPP_TAG} runtime for ${platform}.`)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main()
}