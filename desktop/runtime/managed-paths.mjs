import path from 'node:path'

const ARTIFACT_ID = /^[a-z0-9][a-z0-9._-]{2,95}$/

export function assertArtifactId(value) {
  if (typeof value !== 'string' || !ARTIFACT_ID.test(value)) {
    throw new Error('Invalid managed artifact id.')
  }
  return value
}

export function ensureWithin(root, candidate) {
  const absoluteRoot = path.resolve(root)
  const absoluteCandidate = path.resolve(candidate)
  const relative = path.relative(absoluteRoot, absoluteCandidate)
  if (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  ) {
    return absoluteCandidate
  }
  throw new Error('Managed path escaped its root.')
}

export function resolveManagedPaths({
  userData,
  resourcesPath,
  platform = process.platform,
  arch = process.arch,
}) {
  const root = path.resolve(userData)
  const modelsRoot = path.join(root, 'models')
  const packagesRoot = path.join(modelsRoot, 'packages')
  const runtimeStateRoot = path.join(root, 'runtime')
  const diagnosticsRoot = path.join(root, 'diagnostics')
  const runtimeExecutableName =
    platform === 'win32' ? 'llama-server.exe' : 'llama-server'
  const runtimeExecutable = path.join(
    path.resolve(resourcesPath),
    'runtime',
    `${platform}-${arch}`,
    runtimeExecutableName,
  )
  return Object.freeze({
    userData: root,
    modelsRoot,
    packagesRoot,
    runtimeStateRoot,
    diagnosticsRoot,
    runtimeExecutable,
  })
}

export function packageDirectory(paths, artifactId) {
  return ensureWithin(
    paths.packagesRoot,
    path.join(paths.packagesRoot, assertArtifactId(artifactId)),
  )
}

export function packageFile(paths, artifactId, relativeFile) {
  if (
    typeof relativeFile !== 'string' ||
    !relativeFile ||
    path.isAbsolute(relativeFile) ||
    relativeFile.includes('\\') ||
    relativeFile.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Invalid package-relative path.')
  }
  return ensureWithin(packageDirectory(paths, artifactId), path.join(
    packageDirectory(paths, artifactId),
    ...relativeFile.split('/'),
  ))
}
