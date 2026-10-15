import type { Chess } from 'chess.js'

export interface GameOverInfo {
  title: string
  detail: string
  result: '1-0' | '0-1' | '1/2-1/2'
}

/** Plain-language explanation of why the game is over, or null if it is still going. */
export function getGameOver(chess: Chess): GameOverInfo | null {
  const mover = chess.turn() === 'w' ? 'White' : 'Black'
  const other = chess.turn() === 'w' ? 'Black' : 'White'
  if (chess.isCheckmate()) {
    return {
      title: `Checkmate. ${other} wins!`,
      detail: `${mover}'s king is attacked and has no way to escape.`,
      result: chess.turn() === 'w' ? '0-1' : '1-0',
    }
  }
  if (chess.isStalemate()) {
    return {
      title: 'Draw by stalemate',
      detail: `${mover} has no legal moves but is not in check, so nobody wins.`,
      result: '1/2-1/2',
    }
  }
  if (chess.isThreefoldRepetition()) {
    return {
      title: 'Draw by repetition',
      detail: 'The same position has appeared three times, which counts as a draw.',
      result: '1/2-1/2',
    }
  }
  if (chess.isInsufficientMaterial()) {
    return {
      title: 'Draw: not enough pieces to checkmate',
      detail: 'Neither side has enough material left to ever deliver checkmate.',
      result: '1/2-1/2',
    }
  }
  if (chess.isDrawByFiftyMoves()) {
    return {
      title: 'Draw by the 50-move rule',
      detail: 'Fifty moves have passed without a capture or a pawn move, so the game is a draw.',
      result: '1/2-1/2',
    }
  }
  return null
}
