import path from 'node:path'

export const DEVELOPMENT_PROFILE_DIRECTORY = 'Klar Developer Preview-dev'

/**
 * Must run before app.whenReady(). The development shell never reuses a
 * packaged Klar profile or browser/PWA storage directory.
 */
export function configureDesktopProfile(app, {
  isPackaged = app.isPackaged,
} = {}) {
  if (!isPackaged) {
    app.setPath(
      'userData',
      path.join(app.getPath('appData'), DEVELOPMENT_PROFILE_DIRECTORY),
    )
  }
  return app.getPath('userData')
}
