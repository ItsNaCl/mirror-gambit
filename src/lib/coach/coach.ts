import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import { CLASS_LABEL, isProblem } from '../analysis/classify'
import { formatScore } from '../engine/uci'
import type { ReviewedMove } from '../review/review'
import { positionalReasons } from './explain'

/**
 * The review coach: turns the engine's lines into plain-language lessons.
 * It walks a few moves of a line and spots what a beginner should notice:
 * checkmates, forks, pieces left undefended, and how much material changes hands.
 * Pure functions so they can be tested without the engine.
 */

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const SIDE: Record<Color, string> = { w: 'White', b: 'Black' }

/** How many plies of a line the coach plays on the board. */
export const COACH_PLIES = 6

export interface LineStep {
  uci: string
  san: string
  mover: Color
  fenBefore: string
  fenAfter: string
  from: Square
  to: Square
}

export type InsightKind = 'mate' | 'fork' | 'hanging' | 'promotion'

export interface Insight {
  kind: InsightKind
  /** Index into the steps where it happens. */
  ply: number
  text: string
}

export interface LineLesson {
  steps: LineStep[]
  insights: Insight[]
  /** Material won over the shown steps by the side to move at the start (pawns; negative = lost). */
  materialSwing: number
}

/** Plays a UCI line from a position, stopping at the first illegal move or after maxPlies. */
export function expandLine(fen: string, uciLine: string[], maxPlies = COACH_PLIES): LineStep[] {
  const chess = new Chess(fen)
  const steps: LineStep[] = []
  for (const uci of uciLine.slice(0, maxPlies)) {
    const fenBefore = chess.fen()
    let mv: Move
    try {
      mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      break
    }
    steps.push({ uci, san: mv.san, mover: mv.color, fenBefore, fenAfter: chess.fen(), from: mv.from, to: mv.to })
    if (chess.isGameOver()) break
  }
  return steps
}

function other(c: Color): Color {
  return c === 'w' ? 'b' : 'w'
}

/** Enemy pieces the piece on `from` attacks that are worth forking: the king, anything worth more, or anything undefended. */
function forkTargets(chess: Chess, from: Square): { square: Square; type: PieceSymbol }[] {
  const attacker = chess.get(from)
  if (!attacker) return []
  const enemy = other(attacker.color)
  const out: { square: Square; type: PieceSymbol }[] = []
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== enemy || cell.type === 'p') continue
      if (!chess.attackers(cell.square, attacker.color).includes(from)) continue
      const defended = chess.attackers(cell.square, enemy).length > 0
      if (cell.type === 'k' || VALUE[cell.type] > VALUE[attacker.type] || !defended) out.push({ square: cell.square, type: cell.type })
    }
  }
  // King first, then the most valuable: "forks the king and rook".
  const rank = (t: PieceSymbol) => (t === 'k' ? 100 : VALUE[t])
  return out.sort((a, b) => rank(b.type) - rank(a.type))
}

function listNames(types: PieceSymbol[]): string {
  const names = types.map((t) => NAME[t])
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Walks a line and collects what is worth pointing out. */
export function lineLesson(fen: string, uciLine: string[], maxPlies = COACH_PLIES): LineLesson {
  const steps = expandLine(fen, uciLine, maxPlies)
  const insights: Insight[] = []
  const hero = new Chess(fen).turn()
  let swing = 0
  steps.forEach((step, i) => {
    const before = new Chess(step.fenBefore)
    const after = new Chess(step.fenAfter)
    const piece = after.get(step.to)
    const captured = before.get(step.to)
    const sign = step.mover === hero ? 1 : -1
    if (captured) swing += sign * VALUE[captured.type]
    // En passant: the captured pawn is not on the target square.
    else if (piece?.type === 'p' && step.from[0] !== step.to[0]) swing += sign
    if (step.uci.length === 5) {
      swing += sign * (VALUE[step.uci[4] as PieceSymbol] - 1)
      insights.push({ kind: 'promotion', ply: i, text: `${step.san}: the pawn promotes.` })
    }
    if (after.isCheckmate()) {
      insights.push({ kind: 'mate', ply: i, text: `${step.san} is checkmate.` })
      return
    }
    // A recapture on the square the opponent just captured on is a trade, not a free piece.
    const recapture = i > 0 && steps[i - 1].to === step.to
    if (captured && captured.type !== 'p' && !recapture && before.attackers(step.to, captured.color).length === 0) {
      insights.push({ kind: 'hanging', ply: i, text: `${step.san} takes the undefended ${NAME[captured.type]} on ${step.to}.` })
    }
    if (piece) {
      const targets = forkTargets(after, step.to)
      if (targets.length >= 2) {
        insights.push({
          kind: 'fork',
          ply: i,
          text: `${step.san}: the ${NAME[piece.type]} on ${step.to} forks the ${listNames(targets.map((t) => t.type))}.`,
        })
      }
    }
  })
  return { steps, insights, materialSwing: swing }
}

/** "1. Nf3 Nc6 2. Bb5" style text for a line starting at fen. */
export function lineText(fen: string, steps: LineStep[]): string {
  const parts = fen.split(' ')
  let moveNo = Number(parts[5]) || 1
  let out = ''
  steps.forEach((s, i) => {
    if (s.mover === 'w') out += `${moveNo}. ${s.san} `
    else out += i === 0 ? `${moveNo}... ${s.san} ` : `${s.san} `
    if (s.mover === 'b') moveNo++
  })
  return out.trim()
}

function materialText(swing: number, side: Color): string {
  if (swing >= 2) return `${SIDE[side]} comes out ${swing} points of material ahead.`
  if (swing <= -2) return `${SIDE[side]} gives up ${-swing} points of material, for a reason the engine likes.`
  return ''
}

export interface CoachNote {
  headline: string
  /** Plain-language explanation, one or more sentences. */
  body: string[]
  /** The better line for the mover, from the position before the move (empty when the move was best). */
  better: LineLesson | null
  /** What the move allowed: the opponent's best line from the position after it. */
  allowed: LineLesson | null
}

/** The coach's comment on one reviewed move. */
export function coachNote(move: ReviewedMove, fenBefore: string, fenAfter: string): CoachNote {
  const { cls, reason } = move.classification
  const side = SIDE[move.mover]
  const headline = `${CLASS_LABEL[cls]}: ${move.san}`
  const body: string[] = []
  const playedBest = move.bestLine[0] !== undefined && isSameMove(fenBefore, move.bestLine[0], move.san)
  const better = !playedBest && move.bestLine.length ? lineLesson(fenBefore, move.bestLine) : null
  const allowed = move.replyLine.length ? lineLesson(fenAfter, move.replyLine) : null

  if (playedBest || cls === 'best') body.push(`${side} found the engine's top move.`)
  else if (cls === 'great') body.push('Almost as good as the best move. Nothing important was lost.')
  else if (cls === 'good') body.push('A reasonable move, but there was something a little stronger.')
  else if (reason === 'missed-mate') body.push(`${side} had a forced checkmate here and missed it.`)
  else if (reason === 'allowed-mate') body.push('This move lets the opponent force checkmate.')
  else body.push(`${side} lost about ${(move.classification.lossCp / 100).toFixed(1)} pawns of advantage with this move.`)

  if (better && (isProblem(cls) || cls === 'good')) {
    const key = keyInsight(better)
    const shown = better.steps.slice(0, 4)
    body.push(
      `Better was ${better.steps[0]?.san ?? move.betterMove}.` +
        (key ? ` Follow the line: ${key.text}` : shown.length > 1 ? ` The line: ${lineText(fenBefore, shown)}.` : ''),
    )
    const m = materialText(better.materialSwing, move.mover)
    if (m && !better.insights.some((x) => x.kind === 'mate')) body.push(m)
  }
  if (allowed && isProblem(cls)) {
    const opp = other(move.mover)
    const key = keyInsight(allowed)
    if (key) body.push(`The danger: ${key.text}`)
    else {
      const m = materialText(allowed.materialSwing, opp)
      if (m) body.push(`The danger: after ${allowed.steps[0]?.san}, ${m.charAt(0).toLowerCase()}${m.slice(1)}`)
    }
  }
  // The reasons a line cannot show: structure, pins and king cover.
  body.push(...positionalReasons(fenBefore, move.san, !playedBest && isProblem(cls)))
  body.push(`Evaluation after the move: ${formatScore(move.evalAfter)}.`)
  return { headline, body, better, allowed }
}

/** The insight worth telling: any mate, otherwise a tactic by the side that starts the line (even plies). */
function keyInsight(lesson: LineLesson): Insight | undefined {
  return (
    lesson.insights.find((x) => x.kind === 'mate') ??
    lesson.insights.find((x) => x.ply % 2 === 0 && x.kind !== 'promotion') ??
    lesson.insights.find((x) => x.ply % 2 === 0)
  )
}

function isSameMove(fen: string, uci: string, san: string): boolean {
  const step = expandLine(fen, [uci], 1)[0]
  return !!step && step.san.replace(/[+#]/g, '') === san.replace(/[+#]/g, '')
}
