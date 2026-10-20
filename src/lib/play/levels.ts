import type { EngineLine } from '../engine/uci'
import { scoreToCp } from '../engine/uci'

/**
 * Computer opponent strength. Stockfish's own UCI_Elo floor (about 1320) is far
 * too strong for beginners, so the weaker levels ask for several candidate
 * moves at a shallow depth and pick among them with some randomness: the
 * further a move is behind the best one, the less likely it is to be played.
 */
export interface PlayLevel {
  id: number
  name: string
  blurb: string
  /** Search depth for the computer's move. */
  depth: number
  /** Candidate moves requested from the engine (MultiPV). */
  candidates: number
  /** Centipawn "temperature": higher means worse moves are picked more often. 0 = always the best move. */
  temperature: number
  /** Chance of playing a random legal move instead (beginner-style oversights). */
  randomMoveChance: number
}

export const PLAY_LEVELS: PlayLevel[] = [
  { id: 1, name: 'Beginner', blurb: 'Just learned the moves. Hangs pieces often.', depth: 4, candidates: 10, temperature: 250, randomMoveChance: 0.3 },
  { id: 2, name: 'Novice', blurb: 'Knows the basics, still blunders regularly.', depth: 6, candidates: 8, temperature: 150, randomMoveChance: 0.15 },
  { id: 3, name: 'Casual', blurb: 'Plays sensible moves but misses tactics.', depth: 8, candidates: 6, temperature: 80, randomMoveChance: 0.06 },
  { id: 4, name: 'Club', blurb: 'Solid club player. Punishes loose pieces.', depth: 10, candidates: 4, temperature: 40, randomMoveChance: 0.02 },
  { id: 5, name: 'Advanced', blurb: 'Rarely makes a real mistake.', depth: 14, candidates: 3, temperature: 15, randomMoveChance: 0 },
  { id: 6, name: 'Master', blurb: 'Full-strength Stockfish. Good luck.', depth: 18, candidates: 1, temperature: 0, randomMoveChance: 0 },
]

export function levelById(id: number): PlayLevel {
  return PLAY_LEVELS.find((l) => l.id === id) ?? PLAY_LEVELS[0]
}

/**
 * Chooses the computer's move from the engine's candidate lines.
 * lines: MultiPV output, scores from White's point of view.
 * legalMoves: every legal move in UCI, used for the occasional random move.
 * rng: injectable for tests.
 */
export function pickMove(
  lines: EngineLine[],
  sideToMove: 'w' | 'b',
  level: PlayLevel,
  legalMoves: string[],
  rng: () => number = Math.random,
): string | null {
  const candidates = lines.filter((l) => l.pv[0])
  if (candidates.length === 0) return legalMoves.length ? legalMoves[Math.floor(rng() * legalMoves.length)] : null
  if (legalMoves.length > 0 && level.randomMoveChance > 0 && rng() < level.randomMoveChance) {
    return legalMoves[Math.floor(rng() * legalMoves.length)]
  }
  if (level.temperature <= 0 || candidates.length === 1) return candidates[0].pv[0]
  const sign = sideToMove === 'w' ? 1 : -1
  const values = candidates.map((l) => sign * scoreToCp(l.score))
  const best = Math.max(...values)
  const weights = values.map((v) => Math.exp(-(best - v) / level.temperature))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]
    if (r <= 0) return candidates[i].pv[0]
  }
  return candidates[candidates.length - 1].pv[0]
}
