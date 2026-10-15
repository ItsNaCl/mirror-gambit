import { Chess, DEFAULT_POSITION, type Move, type Square } from 'chess.js'

/**
 * The game is a start position plus a list of moves and a cursor ("ply")
 * pointing at the position currently shown on the board. ply = 0 is the
 * start position, ply = moves.length is the latest position.
 * Moves after the cursor are kept so they can be redone, and are thrown
 * away when a new move is played from an earlier position.
 */
export interface GameState {
  startFen: string
  moves: Move[]
  ply: number
}

export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

export function newGame(startFen: string = DEFAULT_POSITION): GameState {
  return { startFen, moves: [], ply: 0 }
}

export function fenAt(state: GameState, ply: number): string {
  return ply <= 0 ? state.startFen : state.moves[ply - 1].after
}

export function currentFen(state: GameState): string {
  return fenAt(state, state.ply)
}

export function isAtEnd(state: GameState): boolean {
  return state.ply === state.moves.length
}

/** Rebuilds a chess.js instance with full history up to the given ply (needed for repetition rules). */
export function chessAt(state: GameState, ply: number = state.ply): Chess {
  const chess = new Chess(state.startFen)
  for (let i = 0; i < ply; i++) chess.move(state.moves[i].san)
  return chess
}

export function turnOf(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}

export function turnAt(state: GameState, ply: number = state.ply): 'w' | 'b' {
  return turnOf(fenAt(state, ply))
}

export function legalMovesFrom(fen: string, square: Square): Move[] {
  const chess = new Chess(fen)
  return chess.moves({ square, verbose: true })
}

export function needsPromotion(fen: string, from: Square, to: Square): boolean {
  return legalMovesFrom(fen, from).some((m) => m.to === to && m.promotion)
}

export function isLegalMove(fen: string, from: Square, to: Square): boolean {
  return legalMovesFrom(fen, from).some((m) => m.to === to)
}

function appendMove(state: GameState, move: Move): GameState {
  return { ...state, moves: [...state.moves.slice(0, state.ply), move], ply: state.ply + 1 }
}

/** Plays a move from the current position. Returns null if it is illegal. */
export function playMove(state: GameState, from: Square, to: Square, promotion?: PromotionPiece): GameState | null {
  const chess = new Chess(currentFen(state))
  try {
    return appendMove(state, chess.move({ from, to, promotion }))
  } catch {
    return null
  }
}

/** Plays a move given in SAN (used by the opening trainer). Returns null if illegal. */
export function playSan(state: GameState, san: string): GameState | null {
  const chess = new Chess(currentFen(state))
  try {
    return appendMove(state, chess.move(san))
  } catch {
    return null
  }
}

/** Plays a move given in UCI long notation, e.g. "e2e4" or "e7e8q". */
export function playUci(state: GameState, uci: string): GameState | null {
  const from = uci.slice(0, 2) as Square
  const to = uci.slice(2, 4) as Square
  const promotion = (uci[4] as PromotionPiece | undefined) ?? undefined
  return playMove(state, from, to, promotion)
}

export function undo(state: GameState): GameState {
  return state.ply > 0 ? { ...state, ply: state.ply - 1 } : state
}

export function redo(state: GameState): GameState {
  return state.ply < state.moves.length ? { ...state, ply: state.ply + 1 } : state
}

export function jumpTo(state: GameState, ply: number): GameState {
  const clamped = Math.max(0, Math.min(state.moves.length, ply))
  return clamped === state.ply ? state : { ...state, ply: clamped }
}

/** The square of the side-to-move's king if it is in check, else null. */
export function checkedKingSquare(fen: string): Square | null {
  const chess = new Chess(fen)
  if (!chess.inCheck()) return null
  return chess.findPiece({ type: 'k', color: chess.turn() })[0] ?? null
}

export function lastMoveAt(state: GameState, ply: number = state.ply): Move | null {
  return ply > 0 ? state.moves[ply - 1] : null
}

/** Move number and colour for the move at index plyIndex (0-based) in a game starting from startFen. */
export function moveLabel(startFen: string, plyIndex: number): { number: number; isWhite: boolean } {
  const parts = startFen.split(' ')
  const startTurn = parts[1] === 'b' ? 'b' : 'w'
  const startNumber = Number(parts[5] ?? '1') || 1
  const half = startTurn === 'w' ? plyIndex : plyIndex + 1
  return { number: startNumber + Math.floor(half / 2), isWhite: half % 2 === 0 }
}

/** Converts a list of UCI moves starting from fen into SAN. Stops at the first illegal move. */
export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const uci of uciMoves) {
    try {
      const mv = chess.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: (uci[4] as PromotionPiece | undefined) ?? undefined,
      })
      out.push(mv.san)
    } catch {
      break
    }
  }
  return out
}

/** SAN for a single UCI move in a position, or the raw UCI if it is not legal there. */
export function uciToSan(fen: string, uci: string): string {
  return uciLineToSan(fen, [uci])[0] ?? uci
}

export const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}
