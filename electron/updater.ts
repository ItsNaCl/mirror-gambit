import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'

/**
 * In-app updates from GitHub Releases (ItsNaCl/mirror-gambit, configured under
 * `publish` in electron-builder.yml). The app checks shortly after start and every
 * few hours, and the student chooses when to download and when to restart.
 * Only the NSIS install can update itself; dev runs and the portable exe report
 * "unsupported" and the page links to the releases page instead.
 */

type UpdateState = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'unsupported'

interface UpdateStatus {
  state: UpdateState
  current: string
  version?: string
  percent?: number
  message?: string
}

const FIRST_CHECK_DELAY_MS = 10_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export function setupUpdater({ isDev, isPortable, log }: { isDev: boolean; isPortable: boolean; log: (line: string) => void }) {
  const current = app.getVersion()
  let status: UpdateStatus = { state: 'idle', current }
  const supported = !isDev && !isPortable && app.isPackaged

  function publish(next: Omit<UpdateStatus, 'current'>) {
    status = { ...next, current }
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('updates:status', status)
  }

  if (!supported) {
    status = {
      state: 'unsupported',
      current,
      message: isPortable ? 'The portable version cannot update itself. Download the new version from GitHub.' : 'Updates only work in the installed app.',
    }
  } else {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = {
      info: (m: unknown) => log(`[updater] ${String(m)}`),
      warn: (m: unknown) => log(`[updater] warn: ${String(m)}`),
      error: (m: unknown) => log(`[updater] error: ${String(m)}`),
      debug: () => {},
    }
    autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
    autoUpdater.on('update-available', (info: UpdateInfo) => publish({ state: 'available', version: info.version }))
    autoUpdater.on('update-not-available', (info: UpdateInfo) => publish({ state: 'not-available', version: info.version }))
    autoUpdater.on('download-progress', (p: ProgressInfo) =>
      publish({ state: 'downloading', version: status.version, percent: Math.round(p.percent) }),
    )
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => publish({ state: 'downloaded', version: info.version }))
    autoUpdater.on('error', (e: Error) => publish({ state: 'error', version: status.version, message: friendlyError(e) }))
  }

  async function check(): Promise<UpdateStatus> {
    if (!supported) return status
    if (status.state === 'downloading' || status.state === 'downloaded') return status
    try {
      await autoUpdater.checkForUpdates()
    } catch (e) {
      publish({ state: 'error', message: friendlyError(e) })
    }
    return status
  }

  ipcMain.handle('updates:get', () => status)
  ipcMain.handle('updates:check', () => check())
  ipcMain.handle('updates:download', async () => {
    if (!supported || status.state !== 'available') return
    publish({ state: 'downloading', version: status.version, percent: 0 })
    try {
      await autoUpdater.downloadUpdate()
    } catch (e) {
      publish({ state: 'error', version: status.version, message: friendlyError(e) })
    }
  })
  ipcMain.handle('updates:install', () => {
    if (!supported || status.state !== 'downloaded') return
    log(`[updater] restarting to install ${status.version}`)
    // Silent install, then start the new version.
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  })

  if (supported) {
    setTimeout(() => void check(), FIRST_CHECK_DELAY_MS)
    setInterval(() => void check(), CHECK_INTERVAL_MS)
  }
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR_/i.test(msg)) return 'Could not reach GitHub. Check your internet connection and try again.'
  if (/404|Cannot find latest/i.test(msg)) return 'No published release was found on GitHub yet.'
  return msg.split('\n')[0].slice(0, 200)
}
