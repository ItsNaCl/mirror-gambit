import { Chess, DEFAULT_POSITION } from 'chess.js'
import { getGameOver } from './gameOver'
import { newGame, type GameState } from './game'

export interface PgnOptions {
  /** Comment to attach after move i (0-based index into state.moves). */
  comments?: Record<number, string>
  /** Extra or replacement PGN headers (e.g. player names, a resignation result). */
  headers?: Record<string, string>
}

export function exportPgn(state: GameState, options: PgnOptions = {}): string {
  const chess = new Chess(state.startFen)
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  chess.setHeader('Event', 'Mirror Gambit session')
  chess.setHeader('Site', 'Local')
  chess.setHeader('Date', `${today.getFullYear()}.${pad(today.getMonth() + 1)}.${pad(today.getDate())}`)
  chess.setHeader('White', 'Me (White)')
  chess.setHeader('Black', 'Me (Black)')
  for (let i = 0; i < state.moves.length; i++) {
    chess.move(state.moves[i].san)
    const comment = options.comments?.[i]
    if (comment) chess.setComment(comment)
  }
  const over = getGameOver(chess)
  chess.setHeader('Result', over?.result ?? '*')
  for (const [k, v] of Object.entries(options.headers ?? {})) chess.setHeader(k, v)
  return chess.pgn()
}

/** Parses a PGN. Throws an Error with a readable message if it cannot be read. */
export function importPgn(text: string): GameState {
  const chess = new Chess()
  try {
    chess.loadPgn(text.trim())
  } catch (e) {
    throw new Error('Could not read that PGN. ' + (e instanceof Error ? e.message : ''))
  }
  const headers = chess.getHeaders()
  const startFen = headers.FEN && headers.FEN.trim() ? headers.FEN.trim() : DEFAULT_POSITION
  const moves = chess.history({ verbose: true })
  return { ...newGame(startFen), moves, ply: moves.length }
}
