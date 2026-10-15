import { scoreFor, scoreToCp, type Score } from '../engine/uci'

/**
 * Six-level beginner scale (centipawn loss), ported from Chess Rocket:
 * 0 best, 1-30 great, 31-80 good, 81-150 inaccuracy, 151-300 mistake, over 300 blunder.
 */
export type MoveClass = 'best' | 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export const MOVE_CLASSES: MoveClass[] = ['best', 'great', 'good', 'inaccuracy', 'mistake', 'blunder']

export interface ClassifyInput {
  /** Evaluation of the position before the move, from White's perspective. */
  before: Score
  /** Evaluation of the position after the move, from White's perspective. */
  after: Score
  mover: 'w' | 'b'
  /** True when the played move equals the engine's best move in the position before. */
  playedBestMove?: boolean
}

export interface Classification {
  cls: MoveClass
  /** Centipawns lost from the mover's point of view (0 when nothing was lost). */
  lossCp: number
  reason?: 'missed-mate' | 'allowed-mate'
}

/** Upper bound of centipawn loss for each class (inclusive). Blunder is anything above `mistake`. */
export const THRESHOLDS = {
  best: 0,
  great: 30,
  good: 80,
  inaccuracy: 150,
  mistake: 300,
}

export function classForLoss(lossCp: number): MoveClass {
  const loss = Math.max(0, Math.round(lossCp))
  if (loss <= THRESHOLDS.best) return 'best'
  if (loss <= THRESHOLDS.great) return 'great'
  if (loss <= THRESHOLDS.good) return 'good'
  if (loss <= THRESHOLDS.inaccuracy) return 'inaccuracy'
  if (loss <= THRESHOLDS.mistake) return 'mistake'
  return 'blunder'
}

/** True for inaccuracy, mistake and blunder: the moves worth a lesson. */
export function isProblem(cls: MoveClass): boolean {
  return cls === 'inaccuracy' || cls === 'mistake' || cls === 'blunder'
}

export function classifyMove({ before, after, mover, playedBestMove }: ClassifyInput): Classification {
  const b = scoreFor(before, mover)
  const a = scoreFor(after, mover)
  const bMateFor = b.type === 'mate' && b.value > 0
  // A "mate in 0" after the move means the mover just delivered checkmate.
  const aMateFor = a.type === 'mate' && a.value >= 0
  const bMateAgainst = b.type === 'mate' && b.value < 0
  const aMateAgainst = a.type === 'mate' && a.value < 0

  if (playedBestMove) return { cls: 'best', lossCp: 0 }
  if (bMateFor && !aMateFor) return { cls: 'blunder', lossCp: Math.max(0, scoreToCp(b) - scoreToCp(a)), reason: 'missed-mate' }
  if (!bMateAgainst && aMateAgainst) return { cls: 'blunder', lossCp: Math.max(0, scoreToCp(b) - scoreToCp(a)), reason: 'allowed-mate' }
  if (bMateFor && aMateFor) return { cls: a.value <= b.value ? 'best' : 'great', lossCp: 0 }
  if (bMateAgainst) return { cls: 'good', lossCp: 0 } // already lost; nothing to blame

  const loss = Math.max(0, scoreToCp(b) - scoreToCp(a))
  return { cls: classForLoss(loss), lossCp: loss }
}

export const CLASS_LABEL: Record<MoveClass, string> = {
  best: 'Best move',
  great: 'Great move',
  good: 'Good move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
}

export const CLASS_SYMBOL: Record<MoveClass, string> = {
  best: '★',
  great: '!',
  good: '✓',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

/**
 * Short, plain-language alert text. One idea, a better move, and (for bigger
 * errors) one habit to practise, following the "pause, name it, fix it" approach.
 */
export function describeClassification(c: Classification, betterMoveSan: string | null): string {
  const better = betterMoveSan ? ` ${betterMoveSan} was the move.` : ''
  if (c.reason === 'missed-mate') return `You had a forced checkmate and missed it.${better} Before each move, look for checks first.`
  if (c.reason === 'allowed-mate') return `Your opponent can now force checkmate.${better} After every move, ask: what can they do to my king?`
  const pawns = (c.lossCp / 100).toFixed(1)
  switch (c.cls) {
    case 'inaccuracy':
      return `A small slip, about ${pawns} pawns.${better}`
    case 'mistake':
      return `That costs about ${pawns} pawns.${better} Ask: what was my opponent threatening?`
    case 'blunder':
      return `Ouch, that gives away about ${pawns} pawns.${better} Check: is a piece hanging, and do they have a check or capture?`
    case 'great':
      return 'Nearly the best move. Keep going.'
    case 'good':
      return betterMoveSan ? `Fine. ${betterMoveSan} was a little stronger.` : 'Fine.'
    default:
      return ''
  }
}
