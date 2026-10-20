import { Chess, DEFAULT_POSITION } from 'chess.js'
import { newGame, type GameState } from '../chess/game'

/**
 * Loading a chess.com game from its URL. chess.com's public game JSON
 * (www.chess.com/callback/{live|daily}/game/{id}) stores the moves in its compact
 * "TCN" encoding: two characters per move, one for each square, with promotions
 * folded into the second character. The desktop shell fetches the JSON (the page
 * cannot, because of CORS); everything else happens here.
 */

export interface ChessComRef {
  kind: 'live' | 'daily'
  id: string
}

/**
 * Accepts the URLs chess.com shows for a game or its review, for example
 *   https://www.chess.com/game/live/97872578329
 *   https://www.chess.com/game/daily/123456
 *   https://www.chess.com/analysis/game/live/97872578329/review
 *   https://www.chess.com/live/game/97872578329
 *   https://www.chess.com/game/97872578329   (treated as live)
 */
export function parseChessComUrl(text: string): ChessComRef | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (!/(^|\.)chess\.com$/i.test(url.hostname)) return null
  const parts = url.pathname.split('/').filter(Boolean).map((p) => p.toLowerCase())
  const id = parts.find((p) => /^\d{4,15}$/.test(p))
  if (!id) return null
  const kind = parts.includes('daily') ? 'daily' : 'live'
  return { kind, id }
}

const TCN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++='
const PROMO = 'qnrb'

function squareName(index: number): string {
  return 'abcdefgh'[index % 8] + (Math.floor(index / 8) + 1)
}

/** Decodes a TCN move list into UCI moves ("e2e4", "e7e8q"). Throws on characters it does not know. */
export function decodeTcn(tcn: string): string[] {
  const out: string[] = []
  for (let i = 0; i + 1 < tcn.length; i += 2) {
    const from = TCN.indexOf(tcn[i])
    let to = TCN.indexOf(tcn[i + 1])
    if (from < 0 || to < 0 || from > 63) throw new Error(`Unreadable move code "${tcn.slice(i, i + 2)}"`)
    let promotion = ''
    if (to > 63) {
      promotion = PROMO[Math.floor((to - 64) / 3)] ?? 'q'
      // The second character encodes the piece and the direction (left, straight, right).
      to = from + (from < 16 ? -8 : 8) + ((to - 1) % 3) - 1
    }
    out.push(squareName(from) + squareName(to) + promotion)
  }
  return out
}

/** Inverse of decodeTcn, used by the tests. */
export function encodeTcn(uciMoves: string[]): string {
  const idx = (sq: string) => 'abcdefgh'.indexOf(sq[0]) + (Number(sq[1]) - 1) * 8
  return uciMoves
    .map((uci) => {
      const from = idx(uci.slice(0, 2))
      const to = idx(uci.slice(2, 4))
      if (uci.length === 5) {
        const dir = (to % 8) - (from % 8)
        return TCN[from] + TCN[64 + PROMO.indexOf(uci[4]) * 3 + dir + 1]
      }
      return TCN[from] + TCN[to]
    })
    .join('')
}

export interface ChessComGame {
  state: GameState
  white: string
  black: string
  result: string
  date: string
  /** e.g. "Hikaru won by resignation". */
  termination: string
}

interface CallbackJson {
  game?: {
    moveList?: string
    initialSetup?: string
    pgnHeaders?: Record<string, string | number>
  }
}

/** Builds a game from chess.com's callback JSON text. Throws a readable Error if it cannot. */
export function gameFromChessComJson(text: string): ChessComGame {
  let data: CallbackJson
  try {
    data = JSON.parse(text) as CallbackJson
  } catch {
    throw new Error('chess.com sent something that is not a game.')
  }
  const g = data.game
  if (!g || typeof g.moveList !== 'string') throw new Error('chess.com did not include the moves for that game.')
  const headers = g.pgnHeaders ?? {}
  const startFen = (typeof g.initialSetup === 'string' && g.initialSetup.trim()) || String(headers.FEN ?? '') || DEFAULT_POSITION
  const chess = new Chess(startFen)
  for (const uci of decodeTcn(g.moveList)) {
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      throw new Error(`The game has a move that does not fit the position (${uci}). It may be a chess variant.`)
    }
  }
  const moves = chess.history({ verbose: true })
  return {
    state: { ...newGame(startFen), moves, ply: moves.length },
    white: String(headers.White ?? 'White'),
    black: String(headers.Black ?? 'Black'),
    result: String(headers.Result ?? '*'),
    date: String(headers.Date ?? ''),
    termination: String(headers.Termination ?? ''),
  }
}
