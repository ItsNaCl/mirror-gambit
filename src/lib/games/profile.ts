import { Chess } from 'chess.js'
import { isProblem, type MoveClass } from '../analysis/classify'
import { lineLesson } from '../coach/coach'
import { positionalReasons } from '../coach/explain'
import { PIECE_VALUE } from '../coach/features'
import { accuracyOf } from '../progress/history'
import type { ReviewResult } from '../review/review'
import type { LibraryGame } from './sources'

/**
 * The weakness profile: every mistake in the student's own games gets a phase and a reason,
 * and the reasons are added up so the patterns show (where the points go, which tactics are
 * missed, which openings go badly).
 */

export type Phase = 'opening' | 'middlegame' | 'endgame'

export type MistakeTag =
  | 'missed-mate'
  | 'missed-fork'
  | 'missed-free-piece'
  | 'allowed-mate'
  | 'allowed-fork'
  | 'hung-piece'
  | 'walked-into-pin'
  | 'weakened-king'
  | 'pawn-damage'
  | 'other'

export const TAG_LABEL: Record<MistakeTag, string> = {
  'missed-mate': 'Missed a checkmate',
  'missed-fork': 'Missed a fork',
  'missed-free-piece': 'Missed a free piece',
  'allowed-mate': 'Allowed a checkmate',
  'allowed-fork': 'Allowed a fork',
  'hung-piece': 'Left a piece hanging',
  'walked-into-pin': 'Walked into a pin',
  'weakened-king': "Weakened the king's cover",
  'pawn-damage': 'Damaged the pawns',
  other: 'Other inaccuracies',
}

/** One of the student's own inaccuracies, mistakes or blunders, kept small for storage. */
export interface TaggedMistake {
  ply: number
  san: string
  cls: MoveClass
  lossCp: number
  better: string | null
  phase: Phase
  tags: MistakeTag[]
}

/** What the batch review keeps about one game. */
export interface GameAnalysis {
  depth: number
  /** The student's accuracy in this game (best, great or good moves). */
  accuracy: number
  /** How many moves the student made. */
  moves: number
  mistakes: TaggedMistake[]
}

/** Opening up to move 12 (unless queens and most pieces are already off), endgame once little material is left. */
export function phaseOf(fen: string, ply: number): Phase {
  const chess = new Chess(fen)
  let nonPawn = 0
  for (const row of chess.board()) for (const p of row) if (p && p.type !== 'p' && p.type !== 'k') nonPawn += PIECE_VALUE[p.type]
  if (nonPawn <= 26) return 'endgame'
  if (ply < 24) return 'opening'
  return 'middlegame'
}

/** Why a move went wrong, from the engine lines (tactics) and the board (structure). */
export function tagMistake(fenBefore: string, fenAfter: string, san: string, bestLine: string[], replyLine: string[]): MistakeTag[] {
  const tags = new Set<MistakeTag>()
  if (bestLine.length) {
    const missed = lineLesson(fenBefore, bestLine, 4).insights.filter((i) => i.ply % 2 === 0)
    if (missed.some((i) => i.kind === 'mate')) tags.add('missed-mate')
    else if (missed.some((i) => i.kind === 'fork')) tags.add('missed-fork')
    else if (missed.some((i) => i.kind === 'hanging')) tags.add('missed-free-piece')
  }
  if (replyLine.length) {
    const allowed = lineLesson(fenAfter, replyLine, 4).insights.filter((i) => i.ply % 2 === 0)
    if (allowed.some((i) => i.kind === 'mate')) tags.add('allowed-mate')
    else if (allowed.some((i) => i.kind === 'fork')) tags.add('allowed-fork')
    else if (allowed.some((i) => i.kind === 'hanging')) tags.add('hung-piece')
  }
  for (const reason of positionalReasons(fenBefore, san, true)) {
    if (/pin/.test(reason)) tags.add('walked-into-pin')
    else if (/king/.test(reason)) tags.add('weakened-king')
    else if (/pawn/.test(reason)) tags.add('pawn-damage')
  }
  if (tags.size === 0) tags.add('other')
  return [...tags]
}

/** Keeps the student's side of a full review: accuracy and each tagged mistake. */
export function analyseForUser(result: ReviewResult, fens: string[], userColor: 'w' | 'b', depth: number): GameAnalysis {
  const mine = result.moves.filter((m) => m.mover === userColor)
  const mistakes: TaggedMistake[] = mine
    .filter((m) => isProblem(m.classification.cls))
    .map((m) => ({
      ply: m.index + 1,
      san: m.san,
      cls: m.classification.cls,
      lossCp: Math.round(m.classification.lossCp),
      better: m.betterMove,
      phase: phaseOf(fens[m.index], m.index),
      tags: tagMistake(fens[m.index], fens[m.index + 1], m.san, m.bestLine, m.replyLine),
    }))
  return { depth, accuracy: accuracyOf(result.summary[userColor]), moves: mine.length, mistakes }
}

export interface AnalysedGame {
  game: LibraryGame
  analysis: GameAnalysis
}

export interface PhaseRow {
  phase: Phase
  /** Mistakes per game in this phase. */
  perGame: number
  blunders: number
  /** Average pawns lost per mistake. */
  avgLoss: number
}

export interface TagRow {
  tag: MistakeTag
  count: number
  /** Up to five games and moves where it happened, newest first. */
  examples: { gameId: string; ply: number; san: string }[]
}

export interface OpeningRow {
  name: string
  color: 'w' | 'b'
  games: number
  /** Points scored per game: win 1, draw 0.5. */
  score: number
  accuracy: number
}

export interface Profile {
  games: number
  wins: number
  draws: number
  losses: number
  accuracy: number
  blundersPerGame: number
  phases: PhaseRow[]
  tags: TagRow[]
  openings: OpeningRow[]
  /** The one sentence worth reading first. */
  finding: string
}

/** The opening family, without the variation: "Sicilian Defense: Najdorf" -> "Sicilian Defense". */
export function openingFamily(name: string | undefined): string {
  if (!name) return 'Unknown opening'
  return name.replace(/^[A-E]\d\d\s+/, '').split(/[:,]/)[0].trim()
}

export function outcome(g: LibraryGame): 'win' | 'draw' | 'loss' {
  if (g.result === '1/2-1/2') return 'draw'
  return (g.result === '1-0') === (g.userColor === 'w') ? 'win' : 'loss'
}

const round1 = (x: number) => Math.round(x * 10) / 10
const PHASE_WORD: Record<Phase, string> = { opening: 'the opening', middlegame: 'the middlegame', endgame: 'the endgame' }

export function buildProfile(analysed: AnalysedGame[]): Profile | null {
  const n = analysed.length
  if (n === 0) return null
  const results = analysed.map((a) => outcome(a.game))
  const wins = results.filter((r) => r === 'win').length
  const draws = results.filter((r) => r === 'draw').length
  const allMistakes = analysed.flatMap((a) => a.analysis.mistakes.map((m) => ({ ...m, gameId: a.game.id, date: a.game.date })))

  const phases: PhaseRow[] = (['opening', 'middlegame', 'endgame'] as Phase[]).map((phase) => {
    const ms = allMistakes.filter((m) => m.phase === phase)
    return {
      phase,
      perGame: round1(ms.length / n),
      blunders: ms.filter((m) => m.cls === 'blunder').length,
      avgLoss: ms.length ? round1(ms.reduce((s, m) => s + Math.min(m.lossCp, 1000), 0) / ms.length / 100) : 0,
    }
  })

  const tagMap = new Map<MistakeTag, TagRow>()
  for (const m of [...allMistakes].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))) {
    for (const tag of m.tags) {
      const row = tagMap.get(tag) ?? { tag, count: 0, examples: [] }
      row.count++
      if (row.examples.length < 5) row.examples.push({ gameId: m.gameId, ply: m.ply, san: m.san })
      tagMap.set(tag, row)
    }
  }
  const tags = [...tagMap.values()].sort((a, b) => (a.tag === 'other' ? 1 : b.tag === 'other' ? -1 : b.count - a.count))

  const openingMap = new Map<string, { name: string; color: 'w' | 'b'; games: number; points: number; acc: number }>()
  for (const a of analysed) {
    const name = openingFamily(a.game.opening)
    const key = `${name}|${a.game.userColor}`
    const row = openingMap.get(key) ?? { name, color: a.game.userColor, games: 0, points: 0, acc: 0 }
    const r = outcome(a.game)
    row.games++
    row.points += r === 'win' ? 1 : r === 'draw' ? 0.5 : 0
    row.acc += a.analysis.accuracy
    openingMap.set(key, row)
  }
  const openings = [...openingMap.values()]
    .map((o) => ({ name: o.name, color: o.color, games: o.games, score: Math.round((100 * o.points) / o.games), accuracy: Math.round(o.acc / o.games) }))
    .sort((a, b) => b.games - a.games || a.score - b.score)

  const accuracy = Math.round(analysed.reduce((s, a) => s + a.analysis.accuracy, 0) / n)
  const blundersPerGame = round1(allMistakes.filter((m) => m.cls === 'blunder').length / n)

  // The finding: the worst phase, and the most common named mistake.
  const worst = [...phases].sort((a, b) => b.perGame - a.perGame)[0]
  const best = [...phases].sort((a, b) => a.perGame - b.perGame)[0]
  const topTag = tags.find((t) => t.tag !== 'other')
  const parts: string[] = []
  if (worst.perGame > 0 && worst.phase !== best.phase)
    parts.push(`Most of your mistakes come in ${PHASE_WORD[worst.phase]}: ${worst.perGame} a game, against ${best.perGame} in ${PHASE_WORD[best.phase]}.`)
  if (topTag && topTag.count >= 2) parts.push(`The most common one: ${TAG_LABEL[topTag.tag].toLowerCase()}, ${topTag.count} times in ${n} games.`)
  const finding = parts.join(' ') || `${accuracy}% accuracy over ${n} game${n === 1 ? '' : 's'}. Review more games to see your patterns.`

  return { games: n, wins, draws, losses: n - wins - draws, accuracy, blundersPerGame, phases, tags, openings, finding }
}
