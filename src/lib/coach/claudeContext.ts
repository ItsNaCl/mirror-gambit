import { CLASS_LABEL, type Classification } from '../analysis/classify'
import { uciLineToSan } from '../chess/game'
import { formatScore, type EngineLine } from '../engine/uci'
import { describePosition } from './explain'
import { analyzePosition, SIDE_NAME } from './features'

/**
 * Writes the position as text for the Claude coach. Everything Claude is told comes from the
 * engine or the board reading, so its explanation stays tied to facts it can check against.
 */

export type CoachMode = 'position' | 'move' | 'question' | 'game'

export interface ContextInput {
  fen: string
  /** Moves played so far, in SAN, from the start of the game. */
  sanMoves: string[]
  /** FEN the game started from, when it is not the normal starting position. */
  startFen?: string | null
  opening?: string | null
  lines: EngineLine[]
  depth?: number
  lastMove?: {
    san: string
    mover: 'w' | 'b'
    classification: Classification
    betterMove: string | null
    /** The opponent's best reply after it, in SAN. */
    bestReply: string | null
  } | null
}

const TASK: Record<CoachMode, string> = {
  position: 'Explain this position: who stands better and why, and the plan for the side to move.',
  move: 'Explain the last move: what it does, and if it was a mistake, what it allowed and what was better.',
  question: 'Answer the question below about this position.',
  game: 'Summarise this game for the student: the two or three moments where it turned, and one lesson to take into the next game.',
}

/** "1. e4 d5 2. exd5 Qxd5" from a SAN list. */
export function numberedMoves(sanMoves: string[], startFen?: string | null): string {
  const parts = (startFen ?? '').split(' ')
  let moveNo = Number(parts[5]) || 1
  const blackFirst = parts[1] === 'b'
  const out: string[] = []
  sanMoves.forEach((san, i) => {
    const white = blackFirst ? i % 2 === 1 : i % 2 === 0
    if (white) out.push(`${moveNo}. ${san}`)
    else {
      out.push(i === 0 ? `${moveNo}... ${san}` : san)
      moveNo++
    }
  })
  return out.join(' ')
}

export function buildCoachContext(input: ContextInput, mode: CoachMode): string {
  const f = analyzePosition(input.fen)
  const out: string[] = []
  out.push(`Position (FEN): ${input.fen}`)
  out.push(`Side to move: ${SIDE_NAME[f.turn]}`)
  out.push(`Moves so far: ${input.sanMoves.length ? numberedMoves(input.sanMoves.slice(-60), input.startFen) : 'none (starting position)'}`)
  if (input.opening) out.push(`Opening: ${input.opening}`)

  if (input.lines.length) {
    out.push(`Engine (Stockfish 19${input.depth ? `, depth ${input.depth}` : ''}), scores from White's side in pawns:`)
    input.lines.slice(0, 3).forEach((l, i) => {
      const san = uciLineToSan(input.fen, l.pv.slice(0, 8)).join(' ')
      out.push(`${i + 1}. ${formatScore(l.score)}: ${san}`)
    })
  } else {
    out.push('Engine: no lines yet for this position.')
  }

  out.push('Board reading:')
  out.push(`- Material (pawn units): White ${f.material.w}, Black ${f.material.b}`)
  for (const c of ['w', 'b'] as const) {
    const k = f.kings[c]
    const p = f.pawns[c]
    const pawnNotes = [
      p.isolated.length && `isolated ${p.isolated.join(', ')}`,
      p.doubled.length && `doubled ${p.doubled.join(', ')}`,
      p.backward.length && `backward ${p.backward.join(', ')}`,
      p.passed.length && `passed ${p.passed.join(', ')}`,
    ].filter(Boolean)
    out.push(
      `- ${SIDE_NAME[c]} king on ${k.square}, ${k.castled ? 'castled' : 'not castled'}, ${k.shield} shield pawns, ${k.pressure} enemy attacks around it.` +
        ` Pawns: ${p.islands} island${p.islands === 1 ? '' : 's'}${pawnNotes.length ? `; ${pawnNotes.join('; ')}` : ''}.` +
        (f.undeveloped[c].length ? ` Minor pieces still at home: ${f.undeveloped[c].join(', ')}.` : ''),
    )
  }
  for (const note of describePosition(f)) out.push(`- ${note}`)

  if (input.lastMove) {
    const m = input.lastMove
    out.push(
      `Last move: ${m.san} by ${SIDE_NAME[m.mover]}, graded ${CLASS_LABEL[m.classification.cls]}` +
        (m.classification.lossCp > 0 ? ` (lost about ${(m.classification.lossCp / 100).toFixed(1)} pawns)` : '') +
        '.' +
        (m.betterMove ? ` The engine preferred ${m.betterMove}.` : '') +
        (m.bestReply ? ` The opponent's best reply is ${m.bestReply}.` : ''),
    )
  }
  out.push('')
  out.push(`Task: ${TASK[mode]}`)
  return out.join('\n')
}
