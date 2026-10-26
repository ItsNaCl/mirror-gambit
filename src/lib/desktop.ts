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
  return source === 'lichess' ? parseLichessNdjson(raw, username) : parseChessComGames(JSON.parse(raw) as unknown[], username)
}

async function fetchFromBrowser(source: GameSource, username: string, max: number): Promise<string> {
  if (source === 'lichess') {
    const res = await fetch(`https://lichess.org/api/games/user/${username}?max=${max}&moves=true&opening=true`, { headers: { Accept: 'application/x-ndjson' } })
    if (!res.ok) throw new Error(res.status === 404 ? 'Lichess has no player with that name.' : `Lichess answered ${res.status}.`)
    return res.text()
  }
  const list = await fetch(`https://api.chess.com/pub/player/${username.toLowerCase()}/games/archives`)
  if (list.status === 403) throw new Error('chess.com turned the request away. Try again later, or import from Lichess.')
  if (!list.ok) throw new Error(list.status === 404 ? 'chess.com has no player with that name.' : `chess.com answered ${list.status}.`)
  const months = (((await list.json()) as { archives?: string[] }).archives ?? [])
    .filter((u) => u.startsWith('https://api.chess.com/'))
    .reverse()
    .slice(0, 6)
  const games: unknown[] = []
  for (const url of months) {
    const res = await fetch(url)
    if (!res.ok) continue
    games.unshift(...((((await res.json()) as { games?: unknown[] }).games) ?? []))
    if (games.length >= max) break
  }
  return JSON.stringify(games.slice(-max))
}

/** Errors from the desktop shell arrive as "Error invoking remote method 'x': Error: message". */
export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
