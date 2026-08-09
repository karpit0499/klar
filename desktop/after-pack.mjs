import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// extraResources filters a directory that also holds a tracked README, so an
// absent trust key would otherwise package silently and surface only as a
// windowless launch on the user's machine.
async function assertPackagedTrustKey(context) {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents',
      'Resources',
    )
    : path.join(context.appOutDir, 'resources')
  const trustKey = path.join(resources, 'trust', 'model-signing-public.pem')
  try {
    await access(trustKey)
  } catch (error) {
    throw new Error(
      `Packaging stopped: the trusted model-signing public key is missing at ${trustKey}. `
      + 'Create desktop/resources/trust/model-signing-public.pem before building; '
      + 'see desktop/SIGNING.md.',
      { cause: error },
    )
  }
}

async function plistBuddy(plist, ...arguments_) {
  await execFileAsync('/usr/libexec/PlistBuddy', [
    '-c',
    arguments_.join(' '),
    plist,
  ])
}

export default async function afterPack(context) {
  await assertPackagedTrustKey(context)
  if (context.electronPlatformName !== 'darwin') return

  const infoPlist = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Info.plist',
  )

  // electron-builder enables arbitrary network loads while adding localhost
  // support. Klar needs localhost HTTP only for its managed llama.cpp process.
  await plistBuddy(
    infoPlist,
    'Set :NSAppTransportSecurity:NSAllowsArbitraryLoads false',
  )

  // The sandboxed renderer never requests these permissions. Removing the
  // generic Electron descriptions keeps the packaged capability claim honest.
  for (const key of [
    'NSAudioCaptureUsageDescription',
    'NSBluetoothAlwaysUsageDescription',
    'NSBluetoothPeripheralUsageDescription',
    'NSCameraUsageDescription',
    'NSMicrophoneUsageDescription',
  ]) {
    await plistBuddy(infoPlist, `Delete :${key}`).catch(() => undefined)
  }
}
