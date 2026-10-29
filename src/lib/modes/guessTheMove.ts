import { Chess } from 'chess.js'
import { classifyMove } from '../analysis/classify'
import { newGame, playSan, type GameState } from '../chess/game'
import { describeBetter, explainMove } from '../coach/explain'
import type { Score } from '../engine/uci'

/**
 * Guess the move: the student plays one side of a model game, move by move, and each guess is
 * scored by how much it gives away against the move the strong player found. Pure pieces here:
 * the game set, picking a game, scoring a guess and the words that go with it.
 */

export interface ModelGame {
  /** Lichess game id. */
  id: string
  url: string
  white: string
  black: string
  whiteElo: number
  blackElo: number
  /** YYYY-MM-DD. */
  date: string
  eco: string
  opening: string
  timeControl: string
  result: '1-0' | '0-1'
  /** The side the student guesses for: the winner. */
  side: 'w' | 'b'
  bucket: string
  /** The moves in SAN, separated by spaces. */
  sans: string
  /** Engine evaluation after each ply, White's view in centipawns; index 0 is the start position. */
  evals: number[]
}

export interface ModelGameBucket {
  id: string
  side: 'w' | 'b'
  label: string
}

export interface ModelGameSet {
  source: string
  built: string
  /** The depth the evaluations were made at; the guess is evaluated at the same depth. */
  depth: number
  buckets: ModelGameBucket[]
  games: ModelGame[]
}

/** Guessing starts here (move 6): the first moves are book, not a test. */
export const GUESS_START_PLY = 10

/** Keeps only games whose moves replay; a bad entry is dropped and logged, never shown. */
export function parseModelGames(raw: unknown): ModelGameSet {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ModelGameSet>
  const games: ModelGame[] = []
  for (const g of Array.isArray(r.games) ? r.games : []) {
    const state = modelGameState(g)
    const plies = g.sans.split(' ').filter(Boolean).length
    if (state.moves.length !== plies || plies <= GUESS_START_PLY || !Array.isArray(g.evals) || g.evals.length < plies + 1) {
      console.warn(`[model games] dropped ${g.id}: the moves or the evaluations do not line up`)
      continue
    }
    games.push(g)
  }
  return {
    source: r.source ?? '',
    built: r.built ?? '',
    depth: typeof r.depth === 'number' ? r.depth : 10,
    buckets: Array.isArray(r.buckets) ? r.buckets : [],
    games,
  }
}

/** The whole game as a GameState, stopping at the first move that does not parse. */
export function modelGameState(g: Pick<ModelGame, 'sans'>): GameState {
  let state = newGame()
  for (const san of g.sans.split(' ').filter(Boolean)) {
    const next = playSan(state, san)
    if (!next) break
    state = next
  }
  return state
}

/** A game from the bucket (or any), preferring ones not seen; deterministic for a given seed. */
export function pickModelGame(set: ModelGameSet, bucket: string | 'any', seen: Set<string>, seed = 0): ModelGame | null {
  const pool = set.games.filter((g) => bucket === 'any' || g.bucket === bucket)
  if (pool.length === 0) return null
  const fresh = pool.filter((g) => !seen.has(g.id))
  const from = fresh.length ? fresh : pool
  return from[Math.abs(seed) % from.length]
}

/** The plies (positions, counted from the start) at which the student is asked to move. */
export function guessPlies(g: ModelGame): number[] {
  const plies = g.sans.split(' ').filter(Boolean).length
  const out: number[] = []
  for (let p = GUESS_START_PLY; p < plies; p++) if ((p % 2 === 0 ? 'w' : 'b') === g.side) out.push(p)
  return out
}

export type GuessGrade = 'match' | 'equal' | 'close' | 'off' | 'bad'

export const GRADE_LABEL: Record<GuessGrade, string> = {
  match: 'The move',
  equal: 'As good',
  close: 'Close',
  off: 'Off',
  bad: 'A mistake',
}

export const GRADE_POINTS: Record<GuessGrade, number> = { match: 3, equal: 3, close: 2, off: 1, bad: 0 }

/**
 * Grades a guess by how much more it gives away than the master's move did (centipawns, from the
 * student's side). A different move that keeps the evaluation is as good as the master's.
 */
export function gradeGuess(guessLossCp: number, masterLossCp: number, matched: boolean): GuessGrade {
  if (matched) return 'match'
  const extra = guessLossCp - masterLossCp
  if (extra <= 15) return 'equal'
  if (extra <= 60) return 'close'
  if (extra <= 150) return 'off'
  return 'bad'
}

const cp = (value: number): Score => (Math.abs(value) >= 9000 ? { type: 'mate', value: value > 0 ? 10000 - value : -10000 - value } : { type: 'cp', value })

export interface GuessFeedback {
  grade: GuessGrade
  points: number
  /** The master's move in SAN and UCI. */
  master: string
  masterUci: string
  /** The guess in SAN and UCI. */
  guess: string
  guessUci: string
  headline: string
  /** Why the master's move, or what the guess gave away. */
  reasons: string[]
  guessLossCp: number
  masterLossCp: number
}

export interface GuessInput {
  /** The position before the move. */
  fen: string
  side: 'w' | 'b'
  guessUci: string
  masterSan: string
  /** White-view centipawns before the move, after the master's move and after the guess. */
  evalBefore: number
  evalMaster: number
  evalGuess: number
}

function uciOf(fen: string, san: string): string | null {
  try {
    const m = new Chess(fen).move(san)
    return m.from + m.to + (m.promotion ?? '')
  } catch {
    return null
  }
}

function sanOf(fen: string, uci: string): string | null {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
  } catch {
    return null
  }
}

/** Scores one guess against the master's move and puts the difference into words. */
export function judgeGuess(input: GuessInput): GuessFeedback | null {
  const masterUci = uciOf(input.fen, input.masterSan)
  const guessSan = sanOf(input.fen, input.guessUci)
  if (!masterUci || !guessSan) return null
  const sign = input.side === 'w' ? 1 : -1
  const masterLossCp = Math.max(0, sign * (input.evalBefore - input.evalMaster))
  const guessLossCp = Math.max(0, sign * (input.evalBefore - input.evalGuess))
  const matched = masterUci === input.guessUci
  const grade = gradeGuess(guessLossCp, masterLossCp, matched)
  const reasons: string[] = []
  let headline: string
  if (grade === 'match') headline = `${guessSan} is what the master played.`
  else if (grade === 'equal') headline = `${guessSan} is as good as ${input.masterSan}, the master's choice.`
  else {
    const pawns = ((guessLossCp - masterLossCp) / 100).toFixed(1)
    headline = grade === 'close' ? `${guessSan} is close. ${input.masterSan} was a little better.` : `${input.masterSan} was the move. ${guessSan} gives away about ${pawns} pawns.`
    const classification = classifyMove({ before: cp(input.evalBefore), after: cp(input.evalGuess), mover: input.side, playedBestMove: false })
    const why = explainMove({ beforeFen: input.fen, uci: input.guessUci, classification, bestUci: masterUci, replyUci: null })
    if (why) reasons.push(...why.points.filter((p) => !p.startsWith(input.masterSan)))
  }
  if (grade !== 'match') {
    const better = describeBetter(input.fen, masterUci)
    if (better && !reasons.includes(better)) reasons.push(better)
  }
  return {
    grade,
    points: GRADE_POINTS[grade],
    master: input.masterSan,
    masterUci,
    guess: guessSan,
    guessUci: input.guessUci,
    headline,
    reasons: reasons.slice(0, 3),
    guessLossCp,
    masterLossCp,
  }
}

export interface GuessSummary {
  points: number
  max: number
  /** 0 to 100. */
  percent: number
  matches: number
  guesses: number
}

export function summarise(grades: GuessGrade[]): GuessSummary {
  const points = grades.reduce((s, g) => s + GRADE_POINTS[g], 0)
  const max = grades.length * GRADE_POINTS.match
  return { points, max, percent: max ? Math.round((points / max) * 100) : 0, matches: grades.filter((g) => g === 'match').length, guesses: grades.length }
}

/** "White: Name (2450)" style line for the panel. */
export function playerLine(g: ModelGame, side: 'w' | 'b'): string {
  return side === 'w' ? `${g.white} (${g.whiteElo})` : `${g.black} (${g.blackElo})`
}
