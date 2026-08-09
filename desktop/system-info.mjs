import os from 'node:os'
import { statfs } from 'node:fs/promises'

const GIB = 1_024 ** 3

export function memoryTier(totalMemoryBytes) {
  if (totalMemoryBytes < 12 * GIB) return 'unsupported'
  if (totalMemoryBytes < 24 * GIB) return 'minimum'
  return 'recommended'
}

export async function availableDiskBytes(directory) {
  try {
    const info = await statfs(directory)
    return Number(info.bavail) * Number(info.bsize)
  } catch {
    return undefined
  }
}

export async function collectSystemInfo({
  app,
  runtime,
  userData,
}) {
  const totalMemoryBytes = os.totalmem()
  const disk = await availableDiskBytes(userData)
  return {
    desktop: true,
    appVersion: app.getVersion(),
    productName: 'Klar Developer Preview',
    platform: process.platform,
    architecture: process.arch,
    totalMemoryBytes,
    freeMemoryBytes: os.freemem(),
    memoryTier: memoryTier(totalMemoryBytes),
    ...(disk === undefined ? {} : { availableDiskBytes: disk }),
    runtime: runtime.status(),
  }
}
