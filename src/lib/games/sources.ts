import { DEFAULT_POSITION } from 'chess.js'
import { newGame, playSan, type GameState } from '../chess/game'
import { importPgn } from '../chess/pgn'

/**
 * Turns what Lichess and chess.com send for a player's recent games into one shape. Only
 * standard chess from the normal starting position is kept: variants and custom starts
 * would make the opening and phase statistics meaningless.
 */

export type GameSource = 'lichess' | 'chesscom'

export interface LibraryGame {
  /** "lichess:AbCd1234" or "chesscom:123456789". */
  id: string
  /** Imported from a site, or typed in from a scoresheet. */
  source: GameSource | 'otb'
  url: string
  /** ISO date the game was played. */
  date: string
  white: string
  black: string
  /** The side the imported username played. */
  userColor: 'w' | 'b'
  result: '1-0' | '0-1' | '1/2-1/2'
  /** bullet, blitz, rapid, classical, daily, correspondence */
  timeClass: string
  /** The moves in SAN, separated by spaces. */
  sans: string
  /** Opening name as the site reported it, when it did. */
  opening?: string
  /** The player's rating in this game's pool at the time, when the site sent it. */
  userRating?: number
}

export const USERNAME_RE = /^[A-Za-z0-9_-]{2,30}$/

/** Rebuilds the game from its SAN moves; stops at the first move that does not parse. */
export function libraryGameState(g: LibraryGame): GameState {
  let state = newGame()
  for (const san of g.sans.split(' ').filter(Boolean)) {
    const next = playSan(state, san)
    if (!next) break
    state = next
  }
  return state
}

interface LichessPlayer {
  user?: { name?: string; id?: string }
  rating?: number
}

interface LichessGameJson {
  id?: string
  variant?: string
  speed?: string
  createdAt?: number
  initialFen?: string
  players?: { white?: LichessPlayer; black?: LichessPlayer }
  winner?: 'white' | 'black'
  status?: string
  moves?: string
  opening?: { eco?: string; name?: string }
}

const sameName = (a: string | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase()
/** A remote field is used only when it is the string it should be. */
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)
const isoDate = (ms: unknown): string => {
  const n = typeof ms === 'number' && Number.isFinite(ms) ? ms : 0
  try {
    return new Date(n).toISOString()
  } catch {
    return new Date(0).toISOString()
  }
}
const ratingOf = (r: unknown): number | undefined => (typeof r === 'number' && r > 0 ? Math.round(r) : undefined)

/** Lichess /api/games/user/{name} as NDJSON (one game per line). */
export function parseLichessNdjson(text: string, username: string): LibraryGame[] {
  const out: LibraryGame[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let g: LichessGameJson
    try {
      g = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof g.id !== 'string' || !/^[A-Za-z0-9]+$/.test(g.id) || typeof g.moves !== 'string' || (g.variant && g.variant !== 'standard') || (g.initialFen && g.initialFen !== DEFAULT_POSITION)) continue
    const white = str(g.players?.white?.user?.name, 'Anonymous')
    const black = str(g.players?.black?.user?.name, 'Anonymous')
    const userColor = sameName(white, username) ? 'w' : sameName(black, username) ? 'b' : null
    if (!userColor) continue
    out.push({
      id: `lichess:${g.id}`,
      source: 'lichess',
      url: `https://lichess.org/${g.id}`,
      date: isoDate(g.createdAt),
      white,
      black,
      userColor,
      result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2',
      timeClass: str(g.speed, 'unknown'),
      sans: g.moves.trim(),
      opening: typeof g.opening?.name === 'string' ? `${typeof g.opening.eco === 'string' ? g.opening.eco + ' ' : ''}${g.opening.name}` : undefined,
      userRating: ratingOf(userColor === 'w' ? g.players?.white?.rating : g.players?.black?.rating),
    })
  }
  return out
}

interface ChessComPlayer {
  username?: string
  result?: string
  rating?: number
}

interface ChessComArchiveGame {
  url?: string
  pgn?: string
  time_class?: string
  rules?: string
  end_time?: number
  initial_setup?: string
  white?: ChessComPlayer
  black?: ChessComPlayer
}

/** chess.com /pub/player/{name}/games/{yyyy}/{mm}: the "games" array of one or more months. */
export function parseChessComGames(games: unknown[], username: string): LibraryGame[] {
  const out: LibraryGame[] = []
  for (const raw of games as ChessComArchiveGame[]) {
    if (typeof raw?.url !== 'string' || !raw.url.startsWith('https://www.chess.com/') || typeof raw.pgn !== 'string' || (raw.rules && raw.rules !== 'chess')) continue
    if (raw.initial_setup && raw.initial_setup !== DEFAULT_POSITION) continue
    const white = str(raw.white?.username, 'Anonymous')
    const black = str(raw.black?.username, 'Anonymous')
    const userColor = sameName(white, username) ? 'w' : sameName(black, username) ? 'b' : null
    if (!userColor) continue
    let sans: string
    try {
      const state = importPgn(raw.pgn)
      if (state.startFen !== DEFAULT_POSITION || state.moves.length === 0) continue
      sans = state.moves.map((m) => m.san).join(' ')
    } catch {
      continue
    }
    const wr = raw.white?.result
    const br = raw.black?.result
    // chess.com marks the winner "win"; every other ending (agreed, repetition, stalemate...) is a draw.
    const result = wr === 'win' ? '1-0' : br === 'win' ? '0-1' : '1/2-1/2'
    const id = raw.url.split('/').pop() || raw.url
    if (!/^[A-Za-z0-9_-]+$/.test(id)) continue
    const opening = /\[ECOUrl "https:\/\/www\.chess\.com\/openings\/([^"]+)"\]/.exec(raw.pgn)?.[1]
    let openingName: string | undefined
    try {
      openingName = opening ? decodeURIComponent(opening).replace(/-/g, ' ').replace(/\.\.\./g, '') : undefined
    } catch {
      openingName = undefined
    }
    out.push({
      id: `chesscom:${id}`,
      source: 'chesscom',
      url: raw.url,
      date: isoDate(typeof raw.end_time === 'number' ? raw.end_time * 1000 : 0),
      white,
      black,
      userColor,
      result,
      timeClass: str(raw.time_class, 'unknown'),
      sans,
      opening: openingName,
      userRating: ratingOf(userColor === 'w' ? raw.white?.rating : raw.black?.rating),
    })
  }
  return out
}

/** Adds newly imported games to the library: newest first, no duplicates, capped. */
export function mergeLibrary(existing: LibraryGame[], incoming: LibraryGame[], cap = 500): LibraryGame[] {
  const byId = new Map(existing.map((g) => [g.id, g]))
  for (const g of incoming) if (!byId.has(g.id)) byId.set(g.id, g)
  return [...byId.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, cap)
}
