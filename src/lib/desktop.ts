import { parseChessComGames, parseLichessNdjson, USERNAME_RE, type GameSource, type LibraryGame } from './games/sources'

/**
 * Bridge to the Electron shell (electron/preload.ts). Undefined in the browser build,
 * so every caller must handle the web case.
 */

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

export interface UpdateStatus {
  state: UpdateState
  /** Version currently running. */
  current: string
  /** Version offered by the latest release, when known. */
  version?: string
  /** Download progress 0..100 while downloading. */
  percent?: number
  message?: string
}

export interface DesktopBridge {
  desktop: true
  updates: {
    get(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    download(): Promise<void>
    install(): Promise<void>
    onStatus(listener: (status: UpdateStatus) => void): () => void
  }
  chessCom: {
    /** Raw JSON text of chess.com's game endpoint, fetched by the main process (no CORS there). */
    fetchGame(kind: 'live' | 'daily', id: string): Promise<string>
  }
  /** A player's recent games: Lichess NDJSON, or a JSON array of chess.com archive games. */
  games: {
    fetch(source: 'lichess' | 'chesscom', username: string, max: number): Promise<string>
  }
  /** The optional Claude coach (electron/coach.ts). */
  coach: {
    status(): Promise<CoachStatus>
    setKey(key: string): Promise<{ ok: boolean; error?: string }>
    clearKey(): Promise<{ ok: boolean }>
    setModel(model: CoachModel): Promise<{ ok: boolean; error?: string }>
    ask(request: CoachRequest): Promise<CoachAnswer | { ok: false; error: string }>
  }
}

export type CoachModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5'

export interface CoachStatus {
  /** False when the operating system offers no secure key store. */
  canStoreKey: boolean
  hasKey: boolean
  model: CoachModel
  models: CoachModel[]
}

export interface CoachRequest {
  mode: 'position' | 'move' | 'question' | 'game'
  /** The position in words and numbers (src/lib/coach/claudeContext.ts). */
  context: string
  question?: string
  history?: { role: 'user' | 'assistant'; text: string }[]
}

export interface CoachAnswer {
  ok: true
  text: string
  model: string
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number }
}

export function desktop(): DesktopBridge | undefined {
  return (globalThis as { mirrorGambit?: DesktopBridge }).mirrorGambit
}

/** Where the installers live, for the browser build and the portable exe. */
export const RELEASES_URL = 'https://github.com/ItsNaCl/mirror-gambit/releases/latest'

/**
 * chess.com game JSON: through the desktop shell, or the Vite dev proxy in development.
 * The production browser build has no way around CORS, so it explains how to paste the PGN instead.
 */
export async function fetchChessComJson(kind: 'live' | 'daily', id: string): Promise<string> {
  const bridge = desktop()
  if (bridge) return bridge.chessCom.fetchGame(kind, id)
  if (import.meta.env.DEV) {
    const res = await fetch(`/chesscom/${kind}/game/${id}`)
    if (!res.ok) throw new Error(res.status === 404 ? 'chess.com could not find that game.' : `chess.com answered ${res.status}.`)
    return res.text()
  }
  throw new Error('Loading chess.com links works in the desktop app. Here, open the game on chess.com, choose Share, copy the PGN and use Import PGN.')
}

/**
 * A player's most recent standard games from Lichess or chess.com, through the desktop shell or
 * straight from the browser (both APIs allow cross-origin requests). Throws a readable Error.
 */
export async function fetchRecentGames(source: GameSource, username: string, max: number): Promise<LibraryGame[]> {
  if (!USERNAME_RE.test(username)) throw new Error('That does not look like a username.')
  const bridge = desktop()
  let raw: string
  try {
    if (bridge) raw = await bridge.games.fetch(source, username, max)
    else raw = await fetchFromBrowser(source, username, max)
  } catch (e) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('You are offline. Importing games needs an internet connection.')
    throw new Error(cleanError(e))
  }
  if (source === 'lichess') return parseLichessNdjson(raw, username)
  let list: unknown
  try {
    list = JSON.parse(raw)
  } catch {
    throw new Error('chess.com sent something that is not a game list.')
  }
  return parseChessComGames(Array.isArray(list) ? list : [], username)
}

/** The largest answer a game site may send to the browser build. */
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024
const MAX_MONTH_GAMES = 500

async function readBody(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error('The answer was too large to read.')
  const text = await res.text()
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('The answer was too large to read.')
  return text
}

async function fetchFromBrowser(source: GameSource, username: string, max: number): Promise<string> {
  const count = Math.min(100, Math.max(1, Math.floor(max) || 1))
  // No redirects: the hosts are fixed here and the answers must come from them.
  if (source === 'lichess') {
    const res = await fetch(`https://lichess.org/api/games/user/${username}?max=${count}&moves=true&opening=true`, { headers: { Accept: 'application/x-ndjson' }, redirect: 'error' })
    if (!res.ok) throw new Error(res.status === 404 ? 'Lichess has no player with that name.' : `Lichess answered ${res.status}.`)
    return readBody(res)
  }
  const list = await fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`, { redirect: 'error' })
  if (list.status === 403) throw new Error('chess.com turned the request away. Try again later, or import from Lichess.')
  if (!list.ok) throw new Error(list.status === 404 ? 'chess.com has no player with that name.' : `chess.com answered ${list.status}.`)
  const archives = (JSON.parse(await readBody(list)) as { archives?: unknown }).archives
  const months = (Array.isArray(archives) ? archives : [])
    .filter((u): u is string => typeof u === 'string' && u.startsWith('https://api.chess.com/pub/player/'))
    .reverse()
    .slice(0, 6)
  let games: unknown[] = []
  for (const url of months) {
    const res = await fetch(url, { redirect: 'error' })
    if (!res.ok) continue
    const monthGames = (JSON.parse(await readBody(res)) as { games?: unknown }).games
    if (!Array.isArray(monthGames)) continue
    games = monthGames.slice(0, MAX_MONTH_GAMES).concat(games)
    if (games.length >= count) break
  }
  return JSON.stringify(games.slice(-count))
}

/** Errors from the desktop shell arrive as "Error invoking remote method 'x': Error: message". */
export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
