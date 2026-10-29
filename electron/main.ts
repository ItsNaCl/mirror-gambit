import { app, BrowserWindow, ipcMain, Menu, net, protocol, screen, session, shell, type IpcMainInvokeEvent } from 'electron'
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { setupCoach } from './coach'
import { setupUpdater } from './updater'

/**
 * Mirror Gambit desktop shell.
 *
 * The built Vite app is served through a privileged custom scheme (app://app/)
 * so every response can carry the COOP/COEP headers that make the page
 * cross-origin isolated. That is what gives the multi-threaded Stockfish worker
 * its SharedArrayBuffer. In development the Vite dev server is loaded instead.
 */

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const isDev = !!DEV_SERVER_URL
const APP_SCHEME = 'app'
const APP_HOST = 'app'
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

// Portable build: keep all data next to the exe so progress travels with it.
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
if (portableDir) {
  const dataDir = path.join(portableDir, 'MirrorGambitData')
  mkdirSync(dataDir, { recursive: true })
  app.setPath('userData', dataDir)
  app.setPath('sessionData', dataDir)
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
])

// ---------- logging ----------

function logFile(): string {
  return path.join(app.getPath('userData'), 'mirror-gambit.log')
}

function log(line: string) {
  const text = `${new Date().toISOString()} ${line}`
  console.log(text)
  try {
    appendFileSync(logFile(), text + '\n')
  } catch {
    /* ignore */
  }
}

// ---------- static file serving over app:// ----------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
}

/** Strict CSP: only our own files, WebAssembly, and inline styles (needed by the board library). */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

const distDir = path.join(app.getAppPath(), 'dist')

function isolationHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache',
    ...extra,
  }
}

function handleAppRequest(request: Request): Response {
  const url = new URL(request.url)
  if (url.host !== APP_HOST) return new Response('Not found', { status: 404, headers: isolationHeaders() })
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/' || pathname === '') pathname = '/index.html'
  const file = path.normalize(path.join(distDir, pathname))
  if (!file.startsWith(distDir + path.sep)) return new Response('Forbidden', { status: 403, headers: isolationHeaders() })
  if (!existsSync(file) || statSync(file).isDirectory()) {
    return new Response('Not found', { status: 404, headers: isolationHeaders({ 'Content-Type': 'text/plain' }) })
  }
  const size = statSync(file).size
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
  const body = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream
  return new Response(body, {
    status: 200,
    headers: isolationHeaders({ 'Content-Type': type, 'Content-Length': String(size) }),
  })
}

// ---------- window state ----------

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const DEFAULT_STATE: WindowState = { width: 1400, height: 900, maximized: false }
const MIN_WIDTH = 1000
const MIN_HEIGHT = 700

function stateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState {
  try {
    const raw = JSON.parse(readFileSync(stateFile(), 'utf8')) as Partial<WindowState>
    const state: WindowState = {
      width: Math.max(MIN_WIDTH, Number(raw.width) || DEFAULT_STATE.width),
      height: Math.max(MIN_HEIGHT, Number(raw.height) || DEFAULT_STATE.height),
      maximized: !!raw.maximized,
    }
    if (typeof raw.x === 'number' && typeof raw.y === 'number') {
      // Only restore the position if it is still on a connected display.
      const onScreen = screen.getAllDisplays().some((d) => {
        const b = d.workArea
        return raw.x! + 50 >= b.x && raw.y! + 50 >= b.y && raw.x! + 50 <= b.x + b.width && raw.y! + 50 <= b.y + b.height
      })
      if (onScreen) {
        state.x = raw.x
        state.y = raw.y
      }
    }
    return state
  } catch {
    return { ...DEFAULT_STATE }
  }
}

function saveWindowState(win: BrowserWindow) {
  try {
    const maximized = win.isMaximized()
    const bounds = maximized ? win.getNormalBounds() : win.getBounds()
    const state: WindowState = { ...bounds, maximized }
    writeFileSync(stateFile(), JSON.stringify(state, null, 2))
  } catch {
    /* ignore */
  }
}

// ---------- window ----------

function isAllowedUrl(url: string): boolean {
  if (url.startsWith(APP_ORIGIN + '/')) return true
  if (isDev && DEV_SERVER_URL) {
    try {
      return new URL(url).origin === new URL(DEV_SERVER_URL).origin
    } catch {
      return false
    }
  }
  return false
}

/** Only the app's own page may call into the main process. Every handler checks its caller. */
export function fromApp(e: IpcMainInvokeEvent): boolean {
  return isAllowedUrl(e.senderFrame?.url ?? '')
}

/** The largest answer a game site may send; anything bigger is refused, not read. */
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024
/** Games read from one chess.com month. */
const MAX_MONTH_GAMES = 500

/** Reads a response body, refusing one that is too large to hold. */
async function readBody(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error('The answer was too large to read.')
  const text = await res.text()
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('The answer was too large to read.')
  return text
}

function openExternal(url: string) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
}

function createWindow() {
  const state = loadWindowState()
  const win = new BrowserWindow({
    title: 'Mirror Gambit',
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: '#121419',
    icon: path.join(app.getAppPath(), 'build', 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })
  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())

  // Keep the title fixed even if the page tries to change it.
  win.on('page-title-updated', (e) => e.preventDefault())

  let saveTimer: NodeJS.Timeout | null = null
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveWindowState(win), 300)
  }
  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)
  win.on('close', () => saveWindowState(win))

  // No navigation away from the app and no new windows; external links go to the default browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAllowedUrl(url)) {
      e.preventDefault()
      openExternal(url)
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })

  // Mirror renderer console output into the log file (this is how we confirm the engine build).
  win.webContents.on('console-message', (event: unknown, ...rest: unknown[]) => {
    const ev = event as { message?: string; level?: string | number }
    const message = typeof rest[1] === 'string' ? rest[1] : ev.message
    const level = typeof rest[0] === 'number' ? rest[0] : ev.level
    if (typeof message === 'string' && (message.startsWith('[engine]') || level === 3 || level === 'error')) log(`[renderer] ${message}`)
  })

  win.webContents.on('did-finish-load', () => {
    void win.webContents
      .executeJavaScript('({ isolated: self.crossOriginIsolated, sab: typeof SharedArrayBuffer !== "undefined" })', true)
      .then((r: { isolated: boolean; sab: boolean }) => log(`crossOriginIsolated=${r.isolated} SharedArrayBuffer=${r.sab}`))
      .catch((e: unknown) => log(`isolation check failed: ${String(e)}`))
  })

  if (isDev) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.key === 'F12' && input.type === 'keyDown') win.webContents.toggleDevTools()
    })
    void win.loadURL(DEV_SERVER_URL!)
  } else {
    void win.loadURL(`${APP_ORIGIN}/index.html`)
  }
  return win
}

// ---------- chess.com game import ----------

// The page cannot call chess.com itself (CORS and the strict CSP), so the main process
// fetches exactly one kind of URL for it: a game's public JSON by numeric id.
function setupChessComImport() {
  ipcMain.handle('chesscom:fetch', async (e, kind: unknown, id: unknown) => {
    if (!fromApp(e)) throw new Error('Not allowed')
    if ((kind !== 'live' && kind !== 'daily') || typeof id !== 'string' || !/^\d{1,15}$/.test(id)) throw new Error('Invalid chess.com game')
    // No redirects: the host is fixed here and the answer must come from it.
    const res = await net.fetch(`https://www.chess.com/callback/${kind}/game/${id}`, { headers: { Accept: 'application/json' }, redirect: 'error' })
    if (!res.ok) throw new Error(res.status === 404 ? 'chess.com could not find that game.' : `chess.com answered ${res.status}.`)
    return readBody(res)
  })
}

// ---------- recent games by username (My games) ----------

const USERNAME_RE = /^[A-Za-z0-9_-]{2,30}$/
const API_HEADERS = { 'User-Agent': 'Mirror Gambit (open-source chess study app; github.com/ItsNaCl/mirror-gambit)' }

/**
 * Fetches a player's most recent games for the page: Lichess as NDJSON, chess.com as the
 * newest games from the monthly archives (as a JSON array). Only these two public APIs, only a
 * username and a count from the page, both checked here.
 */
function setupGameImport() {
  ipcMain.handle('games:fetch', async (e, source: unknown, username: unknown, max: unknown) => {
    if (!fromApp(e)) throw new Error('Not allowed')
    if ((source !== 'lichess' && source !== 'chesscom') || typeof username !== 'string' || !USERNAME_RE.test(username)) throw new Error('Invalid username')
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > 100) throw new Error('Invalid number of games')
    const user = encodeURIComponent(username)

    if (source === 'lichess') {
      const res = await net.fetch(`https://lichess.org/api/games/user/${user}?max=${max}&moves=true&opening=true&perfType=bullet,blitz,rapid,classical,correspondence`, {
        headers: { ...API_HEADERS, Accept: 'application/x-ndjson' },
        redirect: 'error',
      })
      if (res.status === 404) throw new Error('Lichess has no player with that name.')
      if (!res.ok) throw new Error(`Lichess answered ${res.status}.`)
      return readBody(res)
    }

    const list = await net.fetch(`https://api.chess.com/pub/player/${user.toLowerCase()}/games/archives`, { headers: API_HEADERS, redirect: 'error' })
    if (list.status === 404) throw new Error('chess.com has no player with that name.')
    if (!list.ok) throw new Error(`chess.com answered ${list.status}.`)
    const archives = (JSON.parse(await readBody(list)) as { archives?: unknown }).archives
    const months = Array.isArray(archives) ? archives.filter((u): u is string => typeof u === 'string' && u.startsWith('https://api.chess.com/pub/player/')) : []
    let games: unknown[] = []
    // Newest month first, until there are enough games (at most six months back).
    for (const url of months.reverse().slice(0, 6)) {
      const res = await net.fetch(url, { headers: API_HEADERS, redirect: 'error' })
      if (!res.ok) continue
      const monthGames = (JSON.parse(await readBody(res)) as { games?: unknown }).games
      if (!Array.isArray(monthGames)) continue
      games = monthGames.slice(0, MAX_MONTH_GAMES).concat(games)
      if (games.length >= max) break
    }
    return JSON.stringify(games.slice(-max))
  })
}

// ---------- app lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    log(`Mirror Gambit ${app.getVersion()} starting (${isDev ? 'dev' : 'packaged'}${portableDir ? ', portable' : ''}); userData=${app.getPath('userData')}`)

    protocol.handle(APP_SCHEME, (request) => {
      try {
        return handleAppRequest(request)
      } catch (e) {
        log(`app:// error for ${request.url}: ${String(e)}`)
        return new Response('Error', { status: 500, headers: isolationHeaders() })
      }
    })

    // Deny every permission request (camera, notifications, ...): the app needs none.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)

    // Downloads (the review-card JSON export) always go through a save dialog.
    session.defaultSession.on('will-download', (_e, item) => {
      item.setSaveDialogOptions({
        title: 'Save file',
        defaultPath: path.join(app.getPath('documents'), item.getFilename()),
        filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'PGN', extensions: ['pgn'] }, { name: 'All files', extensions: ['*'] }],
      })
    })

    app.on('web-contents-created', (_e, contents) => {
      contents.on('will-attach-webview', (e) => e.preventDefault())
    })

    setupUpdater({ isDev, isPortable: !!portableDir, log, fromApp })
    setupCoach(log, fromApp)
    setupGameImport()
    setupChessComImport()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
