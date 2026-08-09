import path from 'node:path'
import { pathToFileURL } from 'node:url'

export function createWindowOptions(preloadPath) {
  return {
    width: 1_440,
    height: 960,
    minWidth: 960,
    minHeight: 700,
    show: false,
    backgroundColor: '#f6f4ee',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.resolve(preloadPath),
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      spellcheck: true,
    },
  }
}

export function packagedRendererUrl(appPath) {
  return pathToFileURL(path.join(path.resolve(appPath), 'dist', 'index.html')).toString()
}

export function validateDevelopmentRendererUrl(value) {
  const parsed = new URL(value)
  if (
    parsed.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '/' && parsed.pathname !== '/index.html')
  ) {
    throw new Error('Development renderer must be a loopback HTTP URL.')
  }
  return parsed.toString()
}

export function isAllowedExternalUrl(value) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    )
  } catch {
    return false
  }
}

export function isTrustedRendererUrl(candidate, trustedRendererUrl) {
  try {
    const actual = new URL(candidate)
    const trusted = new URL(trustedRendererUrl)
    if (trusted.protocol === 'file:') {
      return actual.protocol === 'file:' && actual.pathname === trusted.pathname
    }
    return actual.origin === trusted.origin
  } catch {
    return false
  }
}

export function assertTrustedIpcSender(event, mainWindow, trustedRendererUrl) {
  if (
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    !isTrustedRendererUrl(event.senderFrame.url, trustedRendererUrl)
  ) {
    const error = new Error('Rejected IPC from an untrusted renderer.')
    error.code = 'untrusted_sender'
    throw error
  }
}

export function contentSecurityPolicy({ development = false } = {}) {
  const script = development
    ? "script-src 'self' 'unsafe-eval'"
    : "script-src 'self'"
  const connect = development
    ? "connect-src 'self' https: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*"
    : "connect-src 'self' https:"
  return [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    connect,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function installContentSecurityPolicy(session, {
  development = false,
  trustedRendererUrl,
} = {}) {
  const policy = contentSecurityPolicy({ development })
  session.webRequest.onHeadersReceived((details, callback) => {
    if (
      details.resourceType !== 'mainFrame' ||
      !isTrustedRendererUrl(details.url, trustedRendererUrl)
    ) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    })
  })
}

export function lockDownSession(session) {
  session.setPermissionCheckHandler(() => false)
  session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}

export function lockDownWindow(mainWindow, {
  shell,
  trustedRendererUrl,
}) {
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!isTrustedRendererUrl(target, trustedRendererUrl)) event.preventDefault()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url, { activate: true })
    }
    return { action: 'deny' }
  })
}
