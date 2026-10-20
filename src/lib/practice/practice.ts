import { Chess, type Square } from 'chess.js'
import { classifyMove } from '../analysis/classify'
import type { Score } from '../engine/uci'

/**
 * Shared rules for "find the move" practice: puzzles, opening drills and
 * review cards all use the same attempts, hints, scoring and SRS grading.
 */

/** 0 = no hint, 1 = theme, 2 = piece highlighted, 3 = target square highlighted, 4 = full move arrow. */
export type HintLevel = 0 | 1 | 2 | 3 | 4
export const MAX_HINT_LEVEL: HintLevel = 4

export type Outcome = 'clean' | 'assisted' | 'failed'

export interface AttemptRecord {
  /** Wrong moves across the whole exercise. */
  wrongTries: number
  /** Deepest hint level used on any move of the exercise. */
  maxHintLevel: HintLevel
  gaveUp: boolean
}

export function outcomeOf(r: AttemptRecord): Outcome {
  if (r.gaveUp) return 'failed'
  if (r.wrongTries === 0 && r.maxHintLevel === 0) return 'clean'
  return 'assisted'
}

/**
 * SM-2 grade for a spaced-repetition exercise:
 * clean 5, retries only 4, hint level 1-2 is 3, hint level 3-4 is 2, gave up 0.
 */
export function srsGrade(r: AttemptRecord): number {
  if (r.gaveUp) return 0
  if (r.maxHintLevel >= 3) return 2
  if (r.maxHintLevel >= 1) return 3
  if (r.wrongTries > 0) return 4
  return 5
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  clean: 'Clean',
  assisted: 'Assisted',
  failed: 'Failed',
}

// ---------- stats ----------

export interface SetStats {
  clean: number
  assisted: number
  failed: number
  streak: number
  bestStreak: number
  /** Puzzle ids whose most recent result was a fail (for "Retry failed puzzles"). */
  failedIds: string[]
}

export function emptyStats(): SetStats {
  return { clean: 0, assisted: 0, failed: 0, streak: 0, bestStreak: 0, failedIds: [] }
}

/** Reads stats saved by older versions ({ solved, failed, streak, bestStreak }) without losing them. */
export function normalizeStats(raw: unknown): SetStats {
  const r = (raw ?? {}) as Partial<SetStats> & { solved?: number }
  return {
    clean: typeof r.clean === 'number' ? r.clean : 0,
    assisted: typeof r.assisted === 'number' ? r.assisted : typeof r.solved === 'number' ? r.solved : 0,
    failed: typeof r.failed === 'number' ? r.failed : 0,
    streak: typeof r.streak === 'number' ? r.streak : 0,
    bestStreak: typeof r.bestStreak === 'number' ? r.bestStreak : 0,
    failedIds: Array.isArray(r.failedIds) ? r.failedIds.filter((x): x is string => typeof x === 'string') : [],
  }
}

/** Adds one result. The streak continues on clean or assisted and resets on failed. */
export function recordOutcome(prev: SetStats, outcome: Outcome, id?: string): SetStats {
  const streak = outcome === 'failed' ? 0 : prev.streak + 1
  let failedIds = prev.failedIds
  if (id) {
    failedIds = failedIds.filter((x) => x !== id)
    if (outcome === 'failed') failedIds = [...failedIds, id]
  }
  return {
    clean: prev.clean + (outcome === 'clean' ? 1 : 0),
    assisted: prev.assisted + (outcome === 'assisted' ? 1 : 0),
    failed: prev.failed + (outcome === 'failed' ? 1 : 0),
    streak,
    bestStreak: Math.max(prev.bestStreak, streak),
    failedIds,
  }
}

export function solvedCount(s: SetStats): number {
  return s.clean + s.assisted
}

// ---------- hints ----------

export interface HintView {
  /** Text shown in the panel (level 1 and up). */
  text: string | null
  highlightFrom: Square | null
  highlightTo: Square | null
  arrow: { from: Square; to: Square } | null
}

export function parseUci(uci: string): { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
  }
}

const PIECE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

/**
 * A plain-language theme for a move when no puzzle motif is known
 * (used by opening drills and review cards).
 */
export function themeForMove(fen: string, uci: string): string {
  try {
    const chess = new Chess(fen)
    const mv = chess.move(parseUci(uci))
    if (mv.san.includes('#')) return 'There is a checkmate here. Look at every check.'
    if (mv.isKingsideCastle() || mv.isQueensideCastle()) return 'Think about king safety.'
    if (mv.san.includes('+')) return 'Look for a check.'
    if (mv.isCapture()) return 'Look for a capture.'
    if (mv.promotion) return 'A pawn is close to promoting.'
    return 'No capture or check this time. Look for a move that develops a piece, claims the centre, or stops a threat.'
  } catch {
    return 'Look for checks, captures and threats first.'
  }
}

/** What each hint level shows. Levels accumulate: level 3 also shows the piece highlight. */
export function hintView(level: HintLevel, uci: string | null, theme: string): HintView {
  if (level === 0 || !uci) return { text: null, highlightFrom: null, highlightTo: null, arrow: null }
  const { from, to } = parseUci(uci)
  const lines = [theme]
  if (level >= 2) lines.push(`Move the highlighted piece on ${from}.`)
  if (level >= 3) lines.push(`It goes to the highlighted square ${to}.`)
  if (level >= 4) lines.push('The arrow shows the whole move.')
  return {
    text: lines.join(' '),
    highlightFrom: level >= 2 ? from : null,
    highlightTo: level >= 3 ? to : null,
    arrow: level >= 4 ? { from, to } : null,
  }
}

/** Piece name for a UCI move in a position, e.g. "knight". */
export function pieceNameFor(fen: string, uci: string): string {
  try {
    const p = new Chess(fen).get(parseUci(uci).from)
    return p ? PIECE[p.type] : 'piece'
  } catch {
    return 'piece'
  }
}

/** Whether the Hint button should pulse: auto-offer is on and the wrong tries on this move reached it. */
export function shouldPulse(wrongOnThisMove: number, hintLevel: HintLevel, autoOfferAfter: number): boolean {
  return autoOfferAfter > 0 && wrongOnThisMove >= autoOfferAfter && hintLevel < MAX_HINT_LEVEL
}

/** True when a played move matches the expected one (UCI match, or same SAN ignoring check marks). */
export function movesMatch(playedUci: string, playedSan: string, expectedUci: string | null, expectedSan: string): boolean {
  if (expectedUci && playedUci === expectedUci) return true
  const norm = (s: string) => s.replace(/[+#!?]/g, '')
  return norm(playedSan) === norm(expectedSan)
}

/**
 * Whether a move that differs from the expected one is still good enough to count as
 * correct: the engine rates it Best or Great (at most 30 centipawns worse, or a mate when
 * a mate was available). Scores are from White's point of view.
 */
export function acceptsAlternative(bestBefore: Score, after: Score, mover: 'w' | 'b'): boolean {
  const { cls } = classifyMove({ before: bestBefore, after, mover })
  return cls === 'best' || cls === 'great'
}
