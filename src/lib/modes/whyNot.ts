import { classifyMove, isProblem, type MoveClass } from '../analysis/classify'
import { fenAt, uciLineToSan } from '../chess/game'
import { lineLesson, lineText, type LineLesson } from '../coach/coach'
import { explainMove, type MoveExplanation } from '../coach/explain'
import type { AnalysisResult } from '../engine/engine'
import type { Score } from '../engine/uci'
import { libraryGameState, type LibraryGame } from '../games/sources'
import type { AnalysedGame, MistakeTag, Phase } from '../games/profile'

/**
 * Why not this move: the student plays their idea in a position from one of their own games,
 * the engine answers it, and the two lines sit side by side. Pure pieces here: picking the
 * positions and turning two engine answers into the comparison. The hook owns the engine.
 */

/** How far the engine looks at the student's idea and at the better move. */
export const WHY_NOT_DEPTH = 14
/** Positions per game, so one bad day does not fill the whole set. */
const PER_GAME = 3

export interface WhyNotItem {
  /** `${gameId}:${ply}`. */
  id: string
  gameId: string
  /** The position before the student's move. */
  fen: string
  /** The student's side. */
  side: 'w' | 'b'
  /** What the student played in the game (SAN). */
  played: string
  cls: MoveClass
  lossCp: number
  /** The better move the review found (SAN), if any. */
  better: string | null
  tags: MistakeTag[]
  phase: Phase
  /** Move number as it reads in the game ("14" for White's 14th, "14..." for Black's). */
  moveLabel: string
  /** Who it was against and when. */
  label: string
}

function opponent(g: LibraryGame): string {
  return g.userColor === 'w' ? g.black : g.white
}

function when(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString()
}

/**
 * The student's own mistakes and blunders, newest games first, at most a few per game. Only
 * moves with a known better move count: that is what the comparison is built from.
 */
export function whyNotItems(analysed: AnalysedGame[], limit = 40): WhyNotItem[] {
  const games = [...analysed].sort((a, b) => Date.parse(b.game.date) - Date.parse(a.game.date))
  const out: WhyNotItem[] = []
  for (const { game, analysis } of games) {
    const picks = analysis.mistakes
      .filter((m) => isProblem(m.cls) && m.cls !== 'inaccuracy' && m.better)
      .sort((a, b) => b.lossCp - a.lossCp)
      .slice(0, PER_GAME)
      .sort((a, b) => a.ply - b.ply)
    if (picks.length === 0) continue
    // The game is replayed only once it is known to have something to show.
    const state = libraryGameState(game)
    for (const m of picks) {
      if (m.ply > state.moves.length) continue
      const fen = fenAt(state, m.ply - 1)
      const moveNo = Math.floor((m.ply - 1) / 2) + 1
      out.push({
        id: `${game.id}:${m.ply}`,
        gameId: game.id,
        fen,
        side: game.userColor,
        played: m.san,
        cls: m.cls,
        lossCp: m.lossCp,
        better: m.better,
        tags: m.tags,
        phase: m.phase,
        moveLabel: game.userColor === 'w' ? `${moveNo}` : `${moveNo}...`,
        label: `Against ${opponent(game)}${when(game.date) ? `, ${when(game.date)}` : ''}`,
      })
      if (out.length >= limit) return out
    }
  }
  return out
}

/** One side of the comparison: a move, how the engine rates it, and the line that follows it. */
export interface LineReport {
  uci: string
  san: string
  /** The evaluation after the move, White's point of view. */
  score: Score
  /** Pawns lost against the best move, from the student's side. */
  lossCp: number
  cls: MoveClass
  /** The move and what follows it, playable on the board. */
  lesson: LineLesson
  text: string
}

export interface Comparison {
  tried: LineReport
  /** The engine's choice, or null when the student found it. */
  best: LineReport | null
  /** The student played the same move as in the game. */
  sameAsGame: boolean
  explanation: MoveExplanation | null
}

const sanOf = (fen: string, uci: string): string | null => uciLineToSan(fen, [uci])[0] ?? null

/**
 * Builds the comparison from the engine's view of the position before the move (its best line)
 * and after it (the reply). `tried` is the student's move in UCI.
 */
export function compareMoves(item: WhyNotItem, triedUci: string, before: AnalysisResult, after: AnalysisResult): Comparison | null {
  const bestLine = before.lines[0]
  const replyLine = after.lines[0]
  if (!bestLine || !replyLine) return null
  const bestUci = before.bestMove ?? bestLine.pv[0]
  const triedSan = sanOf(item.fen, triedUci)
  if (!triedSan || !bestUci) return null
  const playedBest = triedUci === bestUci
  const classification = classifyMove({ before: bestLine.score, after: replyLine.score, mover: item.side, playedBestMove: playedBest })
  const triedLesson = lineLesson(item.fen, [triedUci, ...replyLine.pv])
  const tried: LineReport = {
    uci: triedUci,
    san: triedSan,
    score: replyLine.score,
    lossCp: classification.lossCp,
    cls: classification.cls,
    lesson: triedLesson,
    text: lineText(item.fen, triedLesson.steps),
  }
  let best: LineReport | null = null
  if (!playedBest) {
    const bestSan = sanOf(item.fen, bestUci)
    if (bestSan) {
      const lesson = lineLesson(item.fen, bestLine.pv.length ? bestLine.pv : [bestUci])
      best = { uci: bestUci, san: bestSan, score: bestLine.score, lossCp: 0, cls: 'best', lesson, text: lineText(item.fen, lesson.steps) }
    }
  }
  const explanation = explainMove({ beforeFen: item.fen, uci: triedUci, classification, bestUci, replyUci: replyLine.pv[0] ?? null })
  return { tried, best, sameAsGame: triedSan === item.played, explanation }
}

/** The one line the student reads first. */
export function verdict(c: Comparison): string {
  if (!c.best) return c.sameAsGame ? 'That is the move, and it is what you played in the game.' : 'That is the move. In the game you played something else.'
  const same = c.sameAsGame ? ' It is what you played in the game.' : ''
  const pawns = (c.tried.lossCp / 100).toFixed(1)
  if (c.tried.cls === 'great') return `${c.tried.san} is nearly as good as ${c.best.san}, the engine's choice.${same}`
  if (c.tried.cls === 'good') return `${c.tried.san} is fine. ${c.best.san} is a shade better, about ${pawns} pawns.${same}`
  const how = c.tried.cls === 'blunder' ? 'loses' : c.tried.cls === 'mistake' ? 'gives up' : 'costs'
  return `${c.tried.san} ${how} about ${pawns} pawns against ${c.best.san}.${same}`
}
