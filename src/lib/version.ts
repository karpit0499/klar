import packageJson from '../../package.json'

// npm requires SemVer (three numeric components), while Klar hotfix names use
// a fourth component. Keep package metadata valid and show the exact release.
export const APP_VERSION = packageJson.klarRelease

type ReleaseFile = { version?: unknown }

export async function latestPublishedVersion(
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  const response = await fetcher(`${import.meta.env.BASE_URL}version.json`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return null
  const body = (await response.json().catch(() => null)) as ReleaseFile | null
  return typeof body?.version === 'string' && body.version.trim()
    ? body.version.trim()
    : null
}

export function isNewerRelease(published: string | null): boolean {
  if (!published || published === APP_VERSION) return false
  const next = numericRelease(published)
  const current = numericRelease(APP_VERSION)
  if (!next || !current) return false
  for (let index = 0; index < current.length; index += 1) {
    if (next[index] !== current[index]) return next[index] > current[index]
  }
  return false
}

function numericRelease(version: string): [number, number, number, number] | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:[-+].*)?$/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 0)]
}
