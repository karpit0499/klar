export class RuntimeCompatibilityError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RuntimeCompatibilityError'
    this.code = code
  }
}

function fail(code, message) {
  throw new RuntimeCompatibilityError(code, message)
}

function semver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value)
  if (!match) fail('incompatible_app', 'Application version is not semantic.')
  return match.slice(1, 4).map(Number)
}

function compare(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] < right[index]) return -1
    if (left[index] > right[index]) return 1
  }
  return 0
}

/**
 * v1 manifests intentionally accept only one auditable range shape:
 * ">=x.y.z <a.b.c". A broader semver parser would add dependency surface to
 * the privileged main process.
 */
export function appVersionSatisfies(version, range) {
  const match = /^>=(\d+\.\d+\.\d+)\s+<(\d+\.\d+\.\d+)$/.exec(range)
  if (!match) return false
  const actual = semver(version)
  return compare(actual, semver(match[1])) >= 0 &&
    compare(actual, semver(match[2])) < 0
}

export function assertModelCompatibility(manifest, {
  appVersion,
  platform,
  runtimeBuild,
  promptSchema,
}) {
  if (!appVersionSatisfies(appVersion, manifest.compatibility.app)) {
    fail('incompatible_app', 'The model package is not compatible with this Klar version.')
  }
  if (!manifest.compatibility.platforms.includes(platform)) {
    fail('incompatible_platform', 'The model package does not support this device.')
  }
  if (
    manifest.runtime.version !== runtimeBuild ||
    manifest.compatibility.runtime !== runtimeBuild
  ) {
    fail('incompatible_runtime', 'The model package targets a different local runtime.')
  }
  if (!manifest.compatibility.promptSchemas.includes(promptSchema)) {
    fail('incompatible_prompt_schema', 'The model package targets a different prompt schema.')
  }
  const artifactRoles = new Set(
    manifest.artifacts.map((artifact) => artifact.role),
  )
  const declaredAdapters = new Set(manifest.compatibility.adapters)
  if (
    artifactRoles.has('adapter_precision') !==
    declaredAdapters.has('precision-v1')
  ) {
    fail('incompatible_adapter', 'Precision adapter metadata is inconsistent.')
  }
  if (
    artifactRoles.has('adapter_writer') !== declaredAdapters.has('writer-v1')
  ) {
    fail('incompatible_adapter', 'Writer adapter metadata is inconsistent.')
  }
}
