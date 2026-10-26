import { Chess } from 'chess.js'
import type { Puzzle } from './puzzles'

/**
 * Rated puzzles from the Lichess puzzle database (CC0), built by scripts/build-rated-puzzles.mjs,
 * and the student's puzzle rating. A clean solve is a win, solving after wrong tries or hints
 * is half, giving up is a loss; the rating moves faster in the first 20 puzzles.
 */

/** [lichess id, FEN, solution UCI space-separated, rating, themes space-separated] */
export type RatedEntry = [string, string, string, number, string]

export interface RatedPuzzle {
  id: string
  fen: string
  solution: string[]
  rating: number
  themes: string[]
}

export type ThemeFilter = 'any' | 'mate' | 'fork' | 'pin' | 'discovered' | 'hanging' | 'sacrifice' | 'endgame' | 'defence'

export const THEME_FILTERS: { id: ThemeFilter; label: string; themes: string[] }[] = [
  { id: 'any', label: 'Any theme', themes: [] },
  { id: 'mate', label: 'Checkmates', themes: ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'mate', 'backRankMate', 'smotheredMate'] },
  { id: 'fork', label: 'Forks', themes: ['fork'] },
  { id: 'pin', label: 'Pins and skewers', themes: ['pin', 'skewer', 'xRayAttack'] },
  { id: 'discovered', label: 'Discovered attacks', themes: ['discoveredAttack', 'doubleCheck'] },
  { id: 'hanging', label: 'Loose and trapped pieces', themes: ['hangingPiece', 'trappedPiece', 'capturingDefender'] },
  { id: 'sacrifice', label: 'Sacrifices and deflections', themes: ['sacrifice', 'deflection', 'attraction', 'clearance', 'interference'] },
  { id: 'endgame', label: 'Endgames', themes: ['endgame', 'rookEndgame', 'pawnEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame', 'promotion'] },
  { id: 'defence', label: 'Defence and quiet moves', themes: ['defensiveMove', 'quietMove', 'zugzwang', 'intermezzo'] },
]

export function parseRated(entries: RatedEntry[]): RatedPuzzle[] {
  return entries.map(([id, fen, sol, rating, themes]) => ({ id, fen, solution: sol.split(' '), rating, themes: themes ? themes.split(' ') : [] }))
}

/** The motif key the puzzle screen uses for its theme hint and guide. */
export function motifFor(themes: string[]): string {
  const has = (...t: string[]) => t.some((x) => themes.includes(x))
  if (has('backRankMate')) return 'back_rank_mate'
  if (has('mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'mate', 'smotheredMate')) return 'checkmate'
  if (has('fork')) return 'fork'
  if (has('pin')) return 'pin'
  if (has('skewer', 'xRayAttack')) return 'skewer'
  if (has('discoveredAttack', 'doubleCheck')) return 'discovered_attack'
  if (has('endgame', 'rookEndgame', 'pawnEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame')) return 'endgame'
  return 'tactics'
}

/** The rated puzzle in the shape the puzzle screen plays. */
export function toPuzzle(p: RatedPuzzle): Puzzle {
  const chess = new Chess(p.fen)
  const solutionSan = p.solution.map((uci) => chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san)
  return {
    id: `rated-${p.id}`,
    set: 'rated',
    fen: p.fen,
    side: p.fen.split(' ')[1] === 'b' ? 'b' : 'w',
    solution: p.solution,
    solutionSan,
    motif: motifFor(p.themes),
    difficulty: String(p.rating),
    explanation: `Rated ${p.rating}. From a real game on Lichess (puzzle ${p.id}).`,
  }
}

/**
 * The next puzzle: an unseen one close to the rating (within 75 points, widening if the theme has
 * none there), chosen at random so the same rating does not always give the same puzzle.
 */
export function pickRated(all: RatedPuzzle[], rating: number, seen: Set<string>, theme: ThemeFilter, random: () => number = Math.random): RatedPuzzle | null {
  const filter = THEME_FILTERS.find((t) => t.id === theme)!
  const pool = all.filter((p) => !seen.has(p.id) && (theme === 'any' || p.themes.some((t) => filter.themes.includes(t))))
  for (const width of [75, 150, 300, 600, 3000]) {
    const near = pool.filter((p) => Math.abs(p.rating - rating) <= width)
    if (near.length) return near[Math.floor(random() * near.length)]
  }
  return null
}

export interface PuzzleRating {
  rating: number
  games: number
  /** Rating after each puzzle, oldest first (the last 200). */
  history: number[]
}

export const START_RATING = 1200
export const PROVISIONAL_GAMES = 20

export function newRating(): PuzzleRating {
  return { rating: START_RATING, games: 0, history: [] }
}

/** Elo update: score 1 for a clean solve, 0.5 when solved after wrong tries or hints, 0 for giving up. */
export function updateRating(r: PuzzleRating, puzzleRating: number, score: 0 | 0.5 | 1): { next: PuzzleRating; delta: number } {
  const expected = 1 / (1 + 10 ** ((puzzleRating - r.rating) / 400))
  const k = r.games < PROVISIONAL_GAMES ? 40 : r.games < 60 ? 24 : 16
  const delta = Math.round(k * (score - expected))
  const rating = Math.max(400, Math.min(3200, r.rating + delta))
  return { next: { rating, games: r.games + 1, history: [...r.history, rating].slice(-200) }, delta: rating - r.rating }
}
