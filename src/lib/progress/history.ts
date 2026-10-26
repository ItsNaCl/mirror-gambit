import type { MoveClass } from '../analysis/classify'
import type { ReviewResult, SideCounts } from '../review/review'
import * as kv from '../store/kv'

/** One reviewed game, stored for the progress page. */
export interface GameRecord {
  id: string
  date: string
  moves: number
  white: { accuracy: number; counts: SideCounts }
  black: { accuracy: number; counts: SideCounts }
  /** Average of both sides, since the player plays both. */
  accuracy: number
}

export const HISTORY_KEY = 'mirror-gambit.review-history.v1'

const GOOD: MoveClass[] = ['best', 'great', 'good']

/** Percentage of moves that were best, great or good (loss of 80 cp or less). */
export function accuracyOf(counts: SideCounts): number {
  const total = (Object.keys(counts) as MoveClass[]).reduce((n, k) => n + counts[k], 0)
  if (total === 0) return 0
  const good = GOOD.reduce((n, k) => n + counts[k], 0)
  return Math.round((100 * good) / total)
}

export function recordFromReview(result: ReviewResult, gameKey: string, nowMs: number = Date.now()): GameRecord {
  const w = accuracyOf(result.summary.w)
  const b = accuracyOf(result.summary.b)
  const whiteMoves = result.moves.filter((m) => m.mover === 'w').length
  const blackMoves = result.moves.length - whiteMoves
  const accuracy = whiteMoves + blackMoves > 0 ? Math.round((w * whiteMoves + b * blackMoves) / (whiteMoves + blackMoves)) : 0
  return {
    id: gameKey,
    date: new Date(nowMs).toISOString(),
    moves: result.moves.length,
    white: { accuracy: w, counts: result.summary.w },
    black: { accuracy: b, counts: result.summary.b },
    accuracy,
  }
}

export function loadHistory(): GameRecord[] {
  try {
    const raw = kv.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as GameRecord[]) : []
  } catch {
    return []
  }
}

/** Adds (or replaces, when the same game is reviewed again) a record and persists it. */
export function appendHistory(record: GameRecord): GameRecord[] {
  const list = loadHistory().filter((r) => r.id !== record.id)
  list.push(record)
  try {
    kv.setItem(HISTORY_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
  return list
}
