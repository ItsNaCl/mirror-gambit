import { Chess, type Color, type Move, type Square } from 'chess.js'
import { isProblem, type Classification } from '../analysis/classify'
import { scoreFor, scoreToCp, type Score } from '../engine/uci'
import {
  analyzePosition,
  describePiece,
  other,
  PIECE_NAME,
  PIECE_VALUE,
  SIDE_NAME,
  type LineTactic,
  type PositionFeatures,
} from './features'

/**
 * Turns a move (and what the engine thinks of it) into coaching in plain words: what the move
 * does, what it allows, and what was better. Every sentence is built from something on the
 * board: a piece left loose, a pin, a pawn that became weak, a king that lost its cover.
 */

export interface MoveExplanation {
  /** One line: the verdict on the move in words. */
  headline: string
  /** Up to three concrete reasons, most important first. */
  points: string[]
  tone: 'good' | 'neutral' | 'warn' | 'bad'
}

export interface ExplainInput {
  beforeFen: string
  /** The move played, in UCI ("g1f3"). */
  uci: string
  classification: Classification
  /** The engine's best move in the position before (UCI), if known. */
  bestUci: string | null
  /** The engine's best reply in the position after (UCI), if known: the refutation of a bad move. */
  replyUci: string | null
}

function play(fen: string, uci: string): { chess: Chess; move: Move } | null {
  const chess = new Chess(fen)
  try {
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return { chess, move }
  } catch {
    return null
  }
}

const sameLine = (a: LineTactic, b: LineTactic) => a.attacker === b.attacker && a.front === b.front && a.back === b.back

function pieceAt(f: PositionFeatures, sq: Square) {
  const chess = new Chess(f.fen)
  return chess.get(sq)
}

/** What a single move achieves for the side that played it, best first. */
export function moveIdeas(before: PositionFeatures, after: PositionFeatures, move: Move): string[] {
  const me = move.color
  const ideas: string[] = []
  const name = PIECE_NAME[move.piece]

  if (move.san.includes('#')) return ['Checkmate.']
  if (move.isKingsideCastle() || move.isQueensideCastle())
    ideas.push('Castling tucks the king behind its pawns and brings the rook towards the centre.')
  if (move.captured) {
    const lost = PIECE_NAME[move.captured]
    const wasLoose = before.loose.some((l) => l.square === move.to && l.kind === 'hanging')
    if (wasLoose) ideas.push(`Wins the ${lost} on ${move.to}, which nothing was guarding.`)
    else if (PIECE_VALUE[move.captured] > PIECE_VALUE[move.piece]) ideas.push(`Takes a ${lost} with a ${name}: a good trade.`)
    else if (PIECE_VALUE[move.captured] === PIECE_VALUE[move.piece] && move.piece !== 'p') ideas.push(`Trades ${name}s.`)
  }

  // New pins and skewers made by the move.
  for (const t of after.lines) {
    if (t.victim === me || before.lines.some((b) => sameLine(b, t))) continue
    const front = pieceAt(after, t.front)
    const back = pieceAt(after, t.back)
    if (!front || !back) continue
    if (t.kind === 'pin')
      ideas.push(
        t.absolute
          ? `Pins the ${PIECE_NAME[front.type]} on ${t.front} to the king: it cannot legally move.`
          : `Pins the ${PIECE_NAME[front.type]} on ${t.front} to the ${PIECE_NAME[back.type]} behind it.`,
      )
    else ideas.push(`Skewers the ${PIECE_NAME[front.type]} on ${t.front}: when it moves, the ${PIECE_NAME[back.type]} on ${t.back} falls.`)
  }

  // Attacks on enemy pieces that are loose after the move.
  const targets = after.loose.filter((l) => l.color !== me && l.attackers.includes(move.to) && !before.loose.some((b) => b.square === l.square))
  if (targets.length >= 2) {
    const [a, b] = targets
    ideas.push(`A double attack: ${describePiece(a)} and ${describePiece(b)} are both hit, and only one can be saved.`)
  } else if (targets.length === 1) {
    const t = targets[0]
    ideas.push(`Attacks ${describePiece(t)}, which is ${t.kind === 'hanging' ? 'not defended' : 'not defended well enough'}.`)
  }

  if (move.san.includes('+') && ideas.length === 0) ideas.push('Check, so the reply is forced.')

  // Development and outposts.
  if ((move.piece === 'n' || move.piece === 'b') && before.undeveloped[me].includes(move.from))
    ideas.push(`Develops the ${name} off the back rank.`)
  if ((move.piece === 'n' || move.piece === 'b') && after.outposts[me].includes(move.to))
    ideas.push(`The ${name} lands on ${move.to}, an outpost: no ${SIDE_NAME[other(me)].toLowerCase()} pawn can ever chase it away.`)

  // Pawn play.
  if (move.piece === 'p') {
    if (after.pawns[me].passed.includes(move.to) && !before.pawns[me].passed.includes(move.from))
      ideas.push(`Creates a passed pawn on ${move.to}: nothing can stop it but pieces.`)
    else if (['d4', 'e4', 'd5', 'e5'].includes(move.to)) ideas.push('Claims the centre with a pawn.')
  }

  if (ideas.length === 0 && after.space[me] > before.space[me] + 2) ideas.push('Gains space and gives the pieces more room.')
  return ideas
}

/** What a move gives away: the problems that appear after it for the side that played it. */
export function moveDamage(before: PositionFeatures, after: PositionFeatures, move: Move): string[] {
  const me = move.color
  const damage: string[] = []

  const newLoose = after.loose.filter(
    (l) => l.color === me && PIECE_VALUE[l.type] >= 3 && !before.loose.some((b) => b.square === l.square && b.kind === l.kind),
  )
  for (const l of newLoose.slice(0, 1)) {
    damage.push(
      l.kind === 'hanging'
        ? `It leaves ${describePiece(l)} with no defender.`
        : `${capitalise(describePiece(l))} is now attacked more times than it is defended.`,
    )
  }

  for (const t of after.lines) {
    if (t.victim !== me || before.lines.some((b) => sameLine(b, t))) continue
    const front = pieceAt(after, t.front)
    if (!front) continue
    damage.push(
      t.kind === 'pin'
        ? `It walks into a pin: ${describePiece({ type: front.type, square: t.front })} is stuck in front of ${t.absolute ? 'your king' : 'a bigger piece'}.`
        : `It allows a skewer along the line from ${t.attacker}.`,
    )
  }

  const kb = before.kings[me]
  const ka = after.kings[me]
  if (ka.castled && ka.shield < kb.shield && move.piece === 'p')
    damage.push('It loosens the pawns in front of your own king; those squares will never be covered by a pawn again.')
  if (!kb.castled && move.piece === 'k' && !move.isKingsideCastle() && !move.isQueensideCastle())
    damage.push('The king steps off its square and gives up the right to castle.')

  if (move.piece === 'p') {
    const newIsolated = after.pawns[me].isolated.filter((s) => !before.pawns[me].isolated.includes(s))
    const newDoubled = after.pawns[me].doubled.length > before.pawns[me].doubled.length
    if (newDoubled) damage.push('It doubles your pawns, so one file has two pawns that cannot protect each other.')
    else if (newIsolated.length) damage.push(`It leaves an isolated pawn on ${newIsolated[0]}: no pawn can ever defend it.`)
  }
  return damage
}

/** What the opponent's best reply does, in words ("Bxf3 wins the knight"). */
export function describeReply(afterFen: string, replyUci: string): string | null {
  const r = play(afterFen, replyUci)
  if (!r) return null
  const { move, chess } = r
  const them = SIDE_NAME[move.color]
  if (move.san.includes('#')) return `${them} mates with ${move.san}.`
  if (move.captured) return `${them} answers ${move.san} and wins the ${PIECE_NAME[move.captured]}.`
  // A fork: the replying piece now hits two valuable targets.
  const replyFeatures = analyzePosition(chess.fen())
  const hit = replyFeatures.loose.filter((l) => l.color !== move.color && l.attackers.includes(move.to) && PIECE_VALUE[l.type] >= 3)
  const checks = move.san.includes('+')
  if (hit.length >= 2 || (checks && hit.length >= 1)) {
    const what = hit.map((h) => `the ${PIECE_NAME[h.type]}`)
    return `${them} has ${move.san}, ${checks ? 'a check that also hits ' : 'hitting '}${checks ? what[0] : `${what[0]} and ${what[1]}`} at once.`
  }
  if (checks) return `${them} replies ${move.san} with check and takes the initiative.`
  const pin = replyFeatures.lines.find((t) => t.attacker === move.to && t.victim !== move.color)
  if (pin) return `${them} replies ${move.san}, pinning the piece on ${pin.front}.`
  return `${them}'s best answer is ${move.san}.`
}

/** Why the engine's move was better, in words. */
export function describeBetter(beforeFen: string, bestUci: string): string | null {
  const r = play(beforeFen, bestUci)
  if (!r) return null
  const before = analyzePosition(beforeFen)
  const after = analyzePosition(r.chess.fen())
  const ideas = moveIdeas(before, after, r.move)
  return ideas.length ? `${r.move.san} was the move: ${lowerFirst(ideas[0])}` : `${r.move.san} was stronger.`
}

export function explainMove(input: ExplainInput): MoveExplanation | null {
  const played = play(input.beforeFen, input.uci)
  if (!played) return null
  const { move, chess } = played
  const before = analyzePosition(input.beforeFen)
  const after = analyzePosition(chess.fen())
  const cls = input.classification.cls
  const ideas = moveIdeas(before, after, move)

  if (!isProblem(cls)) {
    const headline =
      cls === 'best' ? `${move.san} is the move I would play.` : cls === 'great' ? `${move.san} is a strong choice.` : `${move.san} is fine.`
    const points = ideas.slice(0, 2)
    if (cls === 'good' && input.bestUci && input.bestUci !== input.uci) {
      const better = describeBetter(input.beforeFen, input.bestUci)
      if (better) points.push(`Slightly better: ${lowerFirst(better)}`)
    }
    if (points.length === 0) points.push(quietMoveNote(after, move.color))
    return { headline, points: points.slice(0, 3), tone: cls === 'good' ? 'neutral' : 'good' }
  }

  const points: string[] = []
  if (input.classification.reason === 'missed-mate') points.push('There was a forced checkmate on the board.')
  if (input.classification.reason === 'allowed-mate') points.push('This lets the opponent force checkmate.')
  const reply = input.replyUci ? describeReply(chess.fen(), input.replyUci) : null
  // When the reply already wins the loose piece, saying it is undefended again adds nothing.
  const damage = moveDamage(before, after, move).filter((d) => !(reply?.includes(' wins the ') && /no defender|attacked more times/.test(d)))
  if (reply) points.push(reply)
  points.push(...damage.slice(0, reply ? 1 : 2))
  if (input.bestUci && input.bestUci !== input.uci) {
    const better = describeBetter(input.beforeFen, input.bestUci)
    if (better) points.push(better)
  }
  const headline =
    cls === 'blunder'
      ? `${move.san} is a serious mistake.`
      : cls === 'mistake'
        ? `${move.san} lets the advantage slip.`
        : `${move.san} is a little imprecise.`
  return { headline, points: dedupe(points).slice(0, 3), tone: cls === 'inaccuracy' ? 'warn' : 'bad' }
}

/**
 * The board-only reasons behind a move, for the review coach to add to its line-based note:
 * what a weak move gave away (pins, pawn damage, king cover) or what a good one achieved
 * (outposts, pins, development). Tactics found by walking the engine line (forks, free
 * pieces, mates) are left to the review coach, so the two never say the same thing twice.
 */
export function positionalReasons(beforeFen: string, san: string, problem: boolean): string[] {
  const chess = new Chess(beforeFen)
  let move: Move
  try {
    move = chess.move(san)
  } catch {
    return []
  }
  const before = analyzePosition(beforeFen)
  const after = analyzePosition(chess.fen())
  if (problem) return moveDamage(before, after, move).filter((d) => !/no defender|attacked more times/.test(d)).slice(0, 2)
  return moveIdeas(before, after, move)
    .filter((i) => !/^(Wins the|Takes a|Checkmate|Check, so|A double attack|Attacks )/.test(i))
    .slice(0, 1)
}

/** A short note for a sensible move that changes nothing concrete. */
function quietMoveNote(after: PositionFeatures, me: Color): string {
  if (after.undeveloped[me].length > 0) return `A quiet move. ${capitalise(describeList(after.undeveloped[me].map((s) => `${s}`)))} still wait to be developed.`
  return 'A useful waiting move that keeps everything protected.'
}

// ---------- the position in words ----------

export interface PositionVerdict {
  /** "White is better", "Equal", "Black is winning", "White mates in 3". */
  label: string
  /** The side that stands better, or null when level. */
  side: Color | null
}

export function verdictFor(score: Score): PositionVerdict {
  if (score.type === 'mate') {
    if (score.value === 0) return { label: 'Checkmate', side: null }
    const side: Color = score.value > 0 ? 'w' : 'b'
    return { label: `${SIDE_NAME[side]} mates in ${Math.abs(score.value)}`, side }
  }
  const cp = score.value
  const side: Color = cp > 0 ? 'w' : 'b'
  const a = Math.abs(cp)
  if (a <= 30) return { label: 'Equal', side: null }
  if (a <= 80) return { label: `${SIDE_NAME[side]} is slightly better`, side }
  if (a <= 200) return { label: `${SIDE_NAME[side]} is better`, side }
  if (a <= 500) return { label: `${SIDE_NAME[side]} is clearly better`, side }
  return { label: `${SIDE_NAME[side]} is winning`, side }
}

/**
 * The two or three things about the position a coach would point at first, for the side to move
 * and their opponent. Built from the board only, so it is safe to show while analysis is hidden.
 */
export function describePosition(f: PositionFeatures): string[] {
  const out: string[] = []
  const me = f.turn
  const them = other(me)
  const diff = f.material.w - f.material.b
  if (Math.abs(diff) >= 1) {
    const up: Color = diff > 0 ? 'w' : 'b'
    out.push(`${SIDE_NAME[up]} is ${Math.abs(diff)} pawn${Math.abs(diff) === 1 ? '' : 's'} up in material.`)
  }

  const myLoose = f.loose.filter((l) => l.color === me && l.type !== 'p')
  const theirLoose = f.loose.filter((l) => l.color === them && l.type !== 'p')
  if (theirLoose.length) out.push(`${capitalise(describePiece(theirLoose[0]))} is loose. Can you win it?`)
  if (myLoose.length) out.push(`Careful: ${describePiece(myLoose[0])} is under attack and not safely defended.`)

  for (const t of f.lines.slice(0, 1)) {
    const victimSide = SIDE_NAME[t.victim]
    out.push(
      t.kind === 'pin'
        ? `${victimSide}'s piece on ${t.front} is pinned${t.absolute ? ' to the king' : ''} by the piece on ${t.attacker}.`
        : `There is a skewer along the line from ${t.attacker} through ${t.front}.`,
    )
  }

  for (const c of [me, them]) {
    const k = f.kings[c]
    if (k.castled && k.shield <= 1 && k.pressure >= 3) out.push(`${SIDE_NAME[c]}'s king has lost its pawn cover and is under fire.`)
    else if (!k.castled && f.undeveloped[c].length <= 1 && k.square === (c === 'w' ? 'e1' : 'e8') && f.material[c] > 20)
      out.push(`${SIDE_NAME[c]}'s king is still in the centre. Castling soon would help.`)
  }

  for (const c of [me, them]) {
    const p = f.pawns[c]
    const passed = p.passed.filter((s) => (c === 'w' ? Number(s[1]) >= 5 : Number(s[1]) <= 4))
    if (passed.length) out.push(`${SIDE_NAME[c]} has an advanced passed pawn on ${passed[0]}.`)
    else if (p.islands >= 3) out.push(`${SIDE_NAME[c]}'s pawns are split into ${p.islands} islands, which are hard to defend.`)
  }

  const knightOnOutpost = [me, them].flatMap((c) =>
    f.outposts[c].filter((sq) => {
      const p = pieceAt(f, sq)
      return p && p.color === c && (p.type === 'n' || p.type === 'b')
    }).map((sq) => ({ c, sq })),
  )
  if (knightOnOutpost.length) {
    const { c, sq } = knightOnOutpost[0]
    out.push(`${SIDE_NAME[c]}'s piece on ${sq} sits on an outpost that no pawn can attack.`)
  }

  if (out.length < 2) {
    const ds = f.space.w - f.space.b
    if (Math.abs(ds) >= 4) out.push(`${SIDE_NAME[ds > 0 ? 'w' : 'b']} has more space.`)
  }
  if (out.length < 2 && f.undeveloped[me].length >= 2) out.push(`${SIDE_NAME[me]} still has ${f.undeveloped[me].length} minor pieces at home.`)
  return dedupe(out).slice(0, 4)
}

/** Centipawn swing of the mover, used to decide when a coach comment is worth showing. */
export function swing(before: Score, after: Score, mover: Color): number {
  return scoreToCp(scoreFor(after, mover)) - scoreToCp(scoreFor(before, mover))
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

function describeList(squares: string[]): string {
  const words = squares.map((s) => `the piece on ${s}`)
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)]
}
