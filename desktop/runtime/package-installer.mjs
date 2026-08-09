import { randomUUID } from 'node:crypto'
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  readdir,
  rename,
  rm,
} from 'node:fs/promises'
import path from 'node:path'
import {
  assertArtifactId,
  packageDirectory,
} from './managed-paths.mjs'
import { verifyModelPackage } from './package-verifier.mjs'

async function exists(candidate) {
  try {
    await lstat(candidate)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function copySafeTree(source, destination) {
  const sourceInfo = await lstat(source)
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) {
    throw new Error('The downloaded model package must be a real directory.')
  }
  await mkdir(destination, { mode: 0o700 })
  const entries = await readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    const sourceEntry = path.join(source, entry.name)
    const destinationEntry = path.join(destination, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`Model package contains a symbolic link: ${entry.name}`)
    }
    if (entry.isDirectory()) {
      await copySafeTree(sourceEntry, destinationEntry)
      continue
    }
    if (!entry.isFile()) {
      throw new Error(`Model package contains a special file: ${entry.name}`)
    }
    await copyFile(sourceEntry, destinationEntry, constants.COPYFILE_FICLONE)
  }
}

/**
 * Copy an already-downloaded package onto Klar's managed filesystem, verify
 * every checksum and the Ed25519 signature, then make it visible in one rename.
 * A failed or interrupted verification leaves no partially installed package.
 */
export async function installVerifiedPackage({
  sourcePackageRoot,
  paths,
  artifactId,
  trustedKeys,
}) {
  const safeArtifactId = assertArtifactId(artifactId)
  const source = path.resolve(sourcePackageRoot)
  const destination = packageDirectory(paths, safeArtifactId)
  await mkdir(paths.packagesRoot, { recursive: true, mode: 0o700 })
  if (await exists(destination)) {
    throw new Error(`Refusing to replace installed package: ${safeArtifactId}`)
  }

  const stagingRoot = path.join(
    paths.packagesRoot,
    `.staging-${safeArtifactId}-${randomUUID()}`,
  )
  const stagedPackage = path.join(stagingRoot, safeArtifactId)
  try {
    await mkdir(stagingRoot, { mode: 0o700 })
    await copySafeTree(source, stagedPackage)
    const verified = await verifyModelPackage({
      paths: { ...paths, packagesRoot: stagingRoot },
      artifactId: safeArtifactId,
      trustedKeys,
    })
    if (await exists(destination)) {
      throw new Error(`Refusing to replace installed package: ${safeArtifactId}`)
    }
    await rename(stagedPackage, destination)
    return Object.freeze({
      ...verified,
      packageRoot: destination,
      promotedAtomically: true,
    })
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
}
