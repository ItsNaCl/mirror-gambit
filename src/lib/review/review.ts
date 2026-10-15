import { classifyMove, isProblem, type Classification, type MoveClass } from '../analysis/classify'
import { uciToSan, type GameState } from '../chess/game'
import type { Score } from '../engine/uci'

export const REVIEW_DEPTH = 14

/** What the engine told us about one position of the game. */
export interface PositionEval {
  fen: string
  score: Score
  bestMove: string | null
  depth: number
}

export interface ReviewedMove {
  index: number
  san: string
  mover: 'w' | 'b'
  classification: Classification
  /** Better move in SAN, only for inaccuracies, mistakes and blunders. */
  betterMove: string | null
  /** Evaluation after the move (White's perspective). */
  evalAfter: Score
}

export type SideCounts = Record<MoveClass, number>

export interface ReviewResult {
  moves: ReviewedMove[]
  /** Evaluation of every position, index 0 = start position. */
  evals: Score[]
  summary: { w: SideCounts; b: SideCounts }
}

export function emptyCounts(): SideCounts {
  return { best: 0, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }
}

/**
 * Builds the review from the per-position evaluations. Pure function so it is
 * easy to test; the engine work happens elsewhere.
 * evals[i] must describe the position after i moves (evals.length === moves.length + 1).
 */
export function buildReview(game: GameState, evals: PositionEval[]): ReviewResult {
  if (evals.length !== game.moves.length + 1) throw new Error('need one evaluation per position')
  const moves: ReviewedMove[] = []
  const summary = { w: emptyCounts(), b: emptyCounts() }
  for (let i = 0; i < game.moves.length; i++) {
    const move = game.moves[i]
    const before = evals[i]
    const after = evals[i + 1]
    const uci = move.from + move.to + (move.promotion ?? '')
    const classification = classifyMove({
      before: before.score,
      after: after.score,
      mover: move.color,
      playedBestMove: before.bestMove === uci,
    })
    const betterMove = isProblem(classification.cls) && before.bestMove && before.bestMove !== uci ? uciToSan(before.fen, before.bestMove) : null
    moves.push({ index: i, san: move.san, mover: move.color, classification, betterMove, evalAfter: after.score })
    summary[move.color][classification.cls]++
  }
  return { moves, evals: evals.map((e) => e.score), summary }
}

/** Short PGN comment for a reviewed move, e.g. "Mistake (-1.3). Better was Nf3." */
export function reviewComment(m: ReviewedMove): string | null {
  const { cls, lossCp, reason } = m.classification
  if (!isProblem(cls)) return null
  const label = cls.charAt(0).toUpperCase() + cls.slice(1)
  const why = reason === 'missed-mate' ? 'missed a forced mate' : reason === 'allowed-mate' ? 'allows a forced mate' : `-${(lossCp / 100).toFixed(1)}`
  return `${label} (${why}).${m.betterMove ? ` Better was ${m.betterMove}.` : ''}`
}
