import type { Move } from 'chess.js'

export type PrincipleId = 'queen-early' | 'piece-moved-twice' | 'no-center-pawn' | 'minors-undeveloped' | 'not-castled'

export interface PrincipleReminder {
  id: PrincipleId
  title: string
  /** One short paragraph: what happened, why it matters, one habit to practise. */
  body: string
}

/** Principle reminders only apply during the opening. */
export const OPENING_MOVE_LIMIT = 12

const MINOR_HOME: Record<'w' | 'b', string[]> = {
  w: ['b1', 'g1', 'c1', 'f1'],
  b: ['b8', 'g8', 'c8', 'f8'],
}
const CENTER_PAWN_HOME: Record<'w' | 'b', string[]> = {
  w: ['d2', 'e2'],
  b: ['d7', 'e7'],
}

/** A minimal shape so tests can pass plain objects instead of full chess.js moves. */
export type MoveLike = Pick<Move, 'color' | 'piece' | 'from' | 'to' | 'san'> & { captured?: string }

/**
 * Checks the move at index `index` against beginner opening principles.
 * Returns matching reminders, most important first. Assumes the game started
 * from the normal starting position.
 *
 * Wording follows the "pause, name it, one habit" approach from Chess Rocket's
 * common-mistakes and chess-pedagogy references: short, plain, no blame.
 */
export function checkPrinciples(moves: MoveLike[], index: number): PrincipleReminder[] {
  const move = moves[index]
  if (!move) return []
  const color = move.color
  const moveNumber = Math.floor(index / 2) + 1
  if (moveNumber > OPENING_MOVE_LIMIT) return []

  const own = moves.slice(0, index + 1).filter((m) => m.color === color)
  const earlier = own.slice(0, -1)
  const isCapture = !!move.captured || move.san.includes('x')
  const isCheck = move.san.includes('+') || move.san.includes('#')
  const isCastle = move.san.startsWith('O-O')

  const movedFrom = new Set<string>(own.map((m) => m.from))
  const undevelopedMinors = MINOR_HOME[color].filter((sq) => !movedFrom.has(sq))
  const castled = own.some((m) => m.san.startsWith('O-O'))
  const kingMoved = own.some((m) => m.piece === 'k')
  const centerPawnMoved = own.some((m) => m.piece === 'p' && CENTER_PAWN_HOME[color].includes(m.from))

  const out: PrincipleReminder[] = []

  // 1. Queen out too early (before move 7, still several pieces at home, not winning material).
  if (move.piece === 'q' && moveNumber <= 6 && !isCapture && undevelopedMinors.length >= 2) {
    out.push({
      id: 'queen-early',
      title: 'Queen out early',
      body: 'Your queen is out before your knights and bishops. Small pieces will chase it, and every chase is a free move for your opponent. Habit: knights and bishops first, queen later.',
    })
  }

  // 2. Same piece moved twice in the opening while others still sit at home.
  if (
    (move.piece === 'n' || move.piece === 'b' || move.piece === 'q') &&
    moveNumber <= 8 &&
    !isCapture &&
    !isCheck &&
    earlier.some((m) => m.to === move.from && m.piece === move.piece) &&
    undevelopedMinors.length >= 1
  ) {
    out.push({
      id: 'piece-moved-twice',
      title: 'Same piece moved twice',
      body: 'That piece had already moved, while others are still at home. Each move in the opening should bring out a new piece. Habit: before moving a piece again, ask whether a different piece could come out instead.',
    })
  }

  // 3. No central pawn presence after move 5.
  if (moveNumber >= 5 && !centerPawnMoved) {
    out.push({
      id: 'no-center-pawn',
      title: 'Claim the centre',
      body: 'Neither of your centre pawns (d and e) has moved yet. Pawns in the middle give your pieces room and take squares from your opponent. Habit: push a centre pawn early, then build around it.',
    })
  }

  // 4. Minor pieces still undeveloped after move 7.
  if (moveNumber >= 7 && undevelopedMinors.length >= 2 && !MINOR_HOME[color].includes(move.from)) {
    out.push({
      id: 'minors-undeveloped',
      title: 'Bring out your pieces',
      body: `${undevelopedMinors.length} of your knights and bishops are still on their starting squares. Pieces at home do nothing. Habit: before pushing a pawn or attacking, ask whether a knight or bishop could come out.`,
    })
  }

  // 5. Not castled by move 10 (and castling has not been made impossible by moving the king).
  if (moveNumber >= 10 && !castled && !kingMoved && !isCastle) {
    out.push({
      id: 'not-castled',
      title: 'Castle your king',
      body: 'It is move 10 and your king is still in the middle. A king in the centre gets attacked once the lines open. Habit: castle as soon as the pieces between king and rook are out, usually by move 8.',
    })
  }

  return out
}
