import { IPC } from './shared/channels.mjs'
import {
  validateArtifactId,
  validateGenerationRequest,
  validateNoArguments,
  validateRequestId,
} from './shared/validation.mjs'
import { assertTrustedIpcSender } from './security.mjs'
import { collectSystemInfo } from './system-info.mjs'

function safeHandler({
  mainWindow,
  trustedRendererUrl,
  validate,
  run,
}) {
  return async (event, payload) => {
    assertTrustedIpcSender(event, mainWindow, trustedRendererUrl)
    const value = validate(payload)
    return run(value)
  }
}

export function registerDesktopIpc({
  ipcMain,
  mainWindow,
  trustedRendererUrl,
  app,
  runtime,
  diagnostics,
  userData,
}) {
  const registrations = [
    [
      IPC.systemInfo,
      safeHandler({
        mainWindow,
        trustedRendererUrl,
        validate: validateNoArguments,
        run: () => collectSystemInfo({ app, runtime, userData }),
      }),
    ],
    [
      IPC.runtimeStatus,
      safeHandler({
        mainWindow,
        trustedRendererUrl,
        validate: validateNoArguments,
        run: () => runtime.status(),
      }),
    ],
    [
      IPC.runtimeStart,
      safeHandler({
        mainWindow,
        trustedRendererUrl,
        validate: validateArtifactId,
        run: (artifactId) => runtime.start(artifactId),
      }),
    ],
    [
      IPC.runtimeStop,
      safeHandler({
        mainWindow,
        trustedRendererUrl,
        validate: validateNoArguments,
        run: () => runtime.stop(),
      }),
    ],
    [
      IPC.aiGenerate,
      safeHandler({
        mainWindow,
        trustedRendererUrl,
        validate: validateGenerationRequest,
        run: (request) => runtime.generate(request),
      }),
    ],
    [
      IPC.aiCancel,
      safeHandler({
        mainWindow,
        trustedRendererUrl,
        validate: validateRequestId,
        run: (requestId) => runtime.cancel(requestId),
      }),
    ],
    [
      IPC.diagnosticsReport,
      safeHandler({
        mainWindow,
        trustedRendererUrl,
        validate: validateNoArguments,
        run: () =>
          diagnostics.report({
            appVersion: app.getVersion(),
            platform: process.platform,
            architecture: process.arch,
          }),
      }),
    ],
  ]
  for (const [channel, handler] of registrations) ipcMain.handle(channel, handler)
  return () => {
    for (const [channel] of registrations) ipcMain.removeHandler(channel)
  }
}
