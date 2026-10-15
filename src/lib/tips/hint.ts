import { Chess, type Square } from 'chess.js'
import { PIECE_NAMES, turnOf } from '../chess/game'
import { scoreFor, scoreToCp, type EngineLine } from '../engine/uci'

/** A tactic exists when the best move beats the second best by this much (mover's perspective). */
export const TACTIC_GAP_CP = 150
/** Minimum search depth before we trust the lines enough to give a hint. */
export const HINT_MIN_DEPTH = 10

export type HintResult =
  | { kind: 'thinking' }
  | { kind: 'none'; text: string }
  | { kind: 'tactic'; levels: [string, string, string]; move: string }

/** Works out whether the position holds a tactic and the three hint levels for it. */
export function computeHint(fen: string, lines: EngineLine[], depth: number): HintResult {
  if (lines.length === 0 || depth < HINT_MIN_DEPTH) return { kind: 'thinking' }
  const mover = turnOf(fen)
  const chess = new Chess(fen)
  const legal = chess.moves({ verbose: true })
  if (legal.length === 1) return { kind: 'none', text: 'Only one legal move here, so there is nothing to find.' }
  if (lines.length < 2) return { kind: 'thinking' }

  const best = lines[0]
  const second = lines[1]
  const gap = scoreToCp(scoreFor(best.score, mover)) - scoreToCp(scoreFor(second.score, mover))
  if (gap < TACTIC_GAP_CP) {
    return {
      kind: 'none',
      text: 'No clear tactic here. Several moves are about equally good, so pick a sensible developing or improving move.',
    }
  }

  const uci = best.pv[0]
  const from = uci.slice(0, 2) as Square
  const to = uci.slice(2, 4) as Square
  const piece = chess.get(from)
  const move = legal.find((m) => m.from === from && m.to === to && (!uci[4] || m.promotion === uci[4]))
  const pieceName = piece ? PIECE_NAMES[piece.type] : 'piece'
  const san = move?.san ?? uci

  let why = ''
  if (move?.isCapture()) {
    const captured = chess.get(to)
    why = captured ? ` It captures the ${PIECE_NAMES[captured.type]} on ${to}.` : ' It captures a pawn en passant.'
  } else if (san.includes('#')) why = ' It is checkmate!'
  else if (san.includes('+')) why = ' It gives check and your opponent must deal with it first.'
  else if (move?.promotion) why = ' The pawn promotes.'
  const bestIsMate = best.score.type === 'mate' && scoreFor(best.score, mover).value > 0
  const level1 = bestIsMate
    ? 'There is a forced checkmate here! Look for checks first.'
    : 'There is a tactic here. Look for checks, captures and threats before anything else.'
  return {
    kind: 'tactic',
    levels: [level1, `Look at your ${pieceName} on ${from}. Where can it go that creates a threat?`, `The move is ${san}.${why}`],
    move: san,
  }
}
