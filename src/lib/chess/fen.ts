import { Chess, validateFen as chessValidateFen } from 'chess.js'

export interface FenCheck {
  ok: boolean
  error?: string
}

const EXAMPLE_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Validates a FEN with chess.js and adds a couple of checks chess.js does not make. */
export function checkFen(fen: string): FenCheck {
  const trimmed = fen.trim()
  if (!trimmed) return { ok: false, error: 'Paste a FEN string first.' }
  const result = chessValidateFen(trimmed)
  if (!result.ok) return { ok: false, error: friendlyFenError(result.error ?? 'Invalid FEN') }
  let chess: Chess
  try {
    chess = new Chess(trimmed)
  } catch (e) {
    return { ok: false, error: friendlyFenError(e instanceof Error ? e.message : String(e)) }
  }
  // The side that just moved must not still be in check (that would mean the last move was illegal).
  const notToMove = chess.turn() === 'w' ? 'b' : 'w'
  const kingSquare = chess.findPiece({ type: 'k', color: notToMove })[0]
  if (kingSquare && chess.isAttacked(kingSquare, chess.turn())) {
    const side = notToMove === 'w' ? 'white' : 'black'
    return {
      ok: false,
      error: `The ${side} king is in check but it is not ${side}'s turn. That cannot happen in a real game.`,
    }
  }
  const rows = chess.board()
  const pawnOnEdge = [...rows[0], ...rows[7]].some((sq) => sq?.type === 'p')
  if (pawnOnEdge) return { ok: false, error: 'Pawns cannot stand on the first or last rank.' }
  return { ok: true }
}

function friendlyFenError(msg: string): string {
  const m = msg.replace(/^Invalid FEN:\s*/i, '')
  if (/king/i.test(m)) return 'Each side needs exactly one king.'
  if (/6 space|fields/i.test(m)) return `A FEN has six parts separated by spaces, for example: ${EXAMPLE_FEN}`
  if (/8 rows|row/i.test(m)) return 'The board part must describe 8 rows separated by slashes, with 8 squares in each row.'
  return m
}
