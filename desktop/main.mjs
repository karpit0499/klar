import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
} from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DiagnosticJournal } from './diagnostics/journal.mjs'
import { registerDesktopIpc } from './ipc.mjs'
import { configureDesktopProfile } from './profile.mjs'
import {
  createWindowOptions,
  installContentSecurityPolicy,
  lockDownSession,
  lockDownWindow,
  packagedRendererUrl,
  validateDevelopmentRendererUrl,
} from './security.mjs'
import {
  LocalRuntimeManager,
  PINNED_LLAMA_CPP_BUILD,
} from './runtime/local-runtime.mjs'
import { assertModelCompatibility } from './runtime/compatibility.mjs'
import { resolveManagedPaths } from './runtime/managed-paths.mjs'
import { verifyModelPackage } from './runtime/package-verifier.mjs'
import { loadTrustedModelKeys } from './runtime/trusted-keys.mjs'
import { WindowRuntimeOwner } from './runtime/window-runtime-owner.mjs'

const DESKTOP_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const PRELOAD_PATH = path.join(DESKTOP_DIRECTORY, 'preload.cjs')
const userData = configureDesktopProfile(app)

app.enableSandbox()

let mainWindow = null
let removeIpc = null
const runtimeOwner = new WindowRuntimeOwner()
let allowQuit = false
let quitInProgress = false

function resolveRendererUrl() {
  if (app.isPackaged) return packagedRendererUrl(app.getAppPath())
  return validateDevelopmentRendererUrl(
    process.env.KLAR_DESKTOP_RENDERER_URL ?? 'http://127.0.0.1:5173/',
  )
}

async function createMainWindow() {
  const trustedRendererUrl = resolveRendererUrl()
  const paths = resolveManagedPaths({
    userData,
    resourcesPath: process.resourcesPath,
  })
  const trustedKeys = await loadTrustedModelKeys({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  })
  const diagnostics = new DiagnosticJournal()
  const runtime = await runtimeOwner.create(
    () => new LocalRuntimeManager({
      paths,
      diagnostics,
      resolveLaunch: async (artifactId) => {
        const verified = await verifyModelPackage({
          paths,
          artifactId,
          trustedKeys,
        })
        assertModelCompatibility(verified.manifest, {
          appVersion: app.getVersion(),
          platform: `${process.platform}-${process.arch}`,
          runtimeBuild: PINNED_LLAMA_CPP_BUILD,
          promptSchema: 'klar-generation-v1',
        })
        return {
          artifactId,
          modelId: verified.manifest.baseModel.name,
          runtimeVersion: verified.manifest.runtime.version,
          modelPath: verified.modelPath,
          adapters: verified.adapters,
          contextTokens: verified.manifest.runtime.contextTokens,
        }
      },
    }),
  )

  const window = new BrowserWindow(createWindowOptions(PRELOAD_PATH))
  mainWindow = window
  lockDownSession(session.defaultSession)
  installContentSecurityPolicy(session.defaultSession, {
    development: !app.isPackaged,
    trustedRendererUrl,
  })
  lockDownWindow(window, { shell, trustedRendererUrl })
  removeIpc = registerDesktopIpc({
    ipcMain,
    mainWindow: window,
    trustedRendererUrl,
    app,
    runtime,
    diagnostics,
    userData,
  })
  window.once('ready-to-show', () => window.show())
  window.once('closed', () => {
    removeIpc?.()
    removeIpc = null
    mainWindow = null
    void runtimeOwner.release(runtime).catch((error) => {
      console.error('Failed to stop the managed runtime after window close.', error)
    })
  })
  if (app.isPackaged) await window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  else await window.loadURL(trustedRendererUrl)
}

// An unhandled rejection here would terminate the packaged process with no
// window and no message. Every startup failure must name itself and exit
// deliberately instead.
function reportFatalStartupFailure(error) {
  console.error('Klar could not open its main window.', error)
  const detail = error instanceof Error ? error.message : String(error)
  try {
    dialog.showErrorBox(
      'Klar could not start',
      `Klar could not open its main window and will now close.\n\n${detail}`,
    )
  } catch (dialogError) {
    console.error('Klar could not display the startup failure dialog.', dialogError)
  }
  allowQuit = true
  app.exit(1)
}

app.whenReady().then(async () => {
  await createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow().catch(reportFatalStartupFailure)
    }
  })
}).catch(reportFatalStartupFailure)

app.on('before-quit', (event) => {
  if (allowQuit) return
  event.preventDefault()
  if (quitInProgress) return
  quitInProgress = true
  void runtimeOwner.shutdown()
    .catch((error) => {
      console.error('Failed to stop the managed runtime before quit.', error)
    })
    .finally(() => {
      allowQuit = true
      app.quit()
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
