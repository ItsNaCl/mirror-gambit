import { Chess, type Move } from 'chess.js'
import { uciLineToSan } from '../chess/game'
import { moveDamage, moveIdeas } from '../coach/explain'
import { analyzePosition, describePiece, PIECE_NAME, SIDE_NAME } from '../coach/features'
import { scoreToCp, type EngineLine } from '../engine/uci'

/**
 * The narrated game: the coach plays against the computer and says what it is thinking, in the
 * voice the student chose. The student predicts each coach move first. Everything said here is
 * built from the board (features and move ideas) and the engine's lines, never from a guess.
 */

export type Voice = 'direct' | 'playful' | 'calm'

export const VOICE_LABEL: Record<Voice, string> = { direct: 'Direct', playful: 'Playful', calm: 'Calm' }

interface VoiceLines {
  intro: (side: string, level: string) => string
  predict: string
  match: string
  close: (san: string) => string
  miss: (san: string, pawns: string) => string
  iPlay: (san: string) => string
  quiet: string
  alsoGood: (san: string) => string
  rejected: (san: string, pawns: string) => string
  theyPlay: (san: string) => string
  gift: string
  win: string
  loss: string
  draw: string
}

const VOICES: Record<Voice, VoiceLines> = {
  direct: {
    intro: (side, level) => `I play ${side} against the ${level} level. Before each of my moves, play the move you expect. Then I tell you what I chose and why.`,
    predict: 'Your prediction. Play the move you think I should make.',
    match: 'That is my move too.',
    close: (san) => `${san} is close to it. Mine is a little more precise.`,
    miss: (san, pawns) => `${san} is not it. It gives away about ${pawns} pawns compared with my move.`,
    iPlay: (san) => `I play ${san}.`,
    quiet: 'A quiet move: nothing is hanging, so I improve my worst placed piece.',
    alsoGood: (san) => `${san} was about as good.`,
    rejected: (san, pawns) => `I rejected ${san}: it loses about ${pawns} pawns.`,
    theyPlay: (san) => `They play ${san}.`,
    gift: 'That is a gift. Watch what I do with it.',
    win: 'Game over, I won. Count how many of my moves you predicted.',
    loss: 'Game over, I lost. It happens. The review will show where.',
    draw: 'A draw. Look back at the moments you predicted wrong.',
  },
  playful: {
    intro: (side, level) => `I have ${side} against the ${level} level. Read my mind before each move, then see if we agree.`,
    predict: 'Your turn to read my mind. What would I play?',
    match: 'You read my mind.',
    close: (san) => `${san}, nice try. Mine is a notch better.`,
    miss: (san, pawns) => `${san}? That would cost about ${pawns} pawns. Here is mine instead.`,
    iPlay: (san) => `${san} it is.`,
    quiet: 'Nothing to grab, so I tidy up: my worst piece gets a better home.',
    alsoGood: (san) => `${san} was tempting too.`,
    rejected: (san, pawns) => `${san} looked fun but drops about ${pawns} pawns. No thanks.`,
    theyPlay: (san) => `They go ${san}.`,
    gift: 'Oh, a present. Unwrapping it now.',
    win: 'Won it. How many of my moves did you see coming?',
    loss: 'Lost that one. Even coaches blunder. The review will tell the story.',
    draw: 'A draw. Fair enough. Which of my moves surprised you?',
  },
  calm: {
    intro: (side, level) => `I will play ${side} against the ${level} level. Take your time before each of my moves and play what you expect. Then I explain my choice.`,
    predict: 'When you are ready, play the move you expect from me.',
    match: 'That is the move I had in mind too.',
    close: (san) => `${san} is a reasonable idea. I prefer something slightly more precise.`,
    miss: (san, pawns) => `${san} is not what I would choose. It gives away about ${pawns} pawns.`,
    iPlay: (san) => `I choose ${san}.`,
    quiet: 'There is nothing to win here, so I improve my least active piece.',
    alsoGood: (san) => `${san} was also fine.`,
    rejected: (san, pawns) => `I set ${san} aside: it loses about ${pawns} pawns.`,
    theyPlay: (san) => `The reply is ${san}.`,
    gift: 'That gives me something. Let me show you.',
    win: 'The game is over and I won. Notice which of my moves you saw coming.',
    loss: 'The game is over and I lost. We will learn from it in the review.',
    draw: 'A draw. Look back at the predictions that differed from my moves.',
  },
}

export interface Narration {
  title: string
  lines: string[]
}

const pawns = (cp: number) => (cp / 100).toFixed(1)
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function play(fen: string, uci: string): { chess: Chess; move: Move } | null {
  const chess = new Chess(fen)
  try {
    return { chess, move: chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }) }
  } catch {
    return null
  }
}

export function intro(voice: Voice, coachSide: 'w' | 'b', levelName: string): string {
  return VOICES[voice].intro(SIDE_NAME[coachSide], levelName)
}

export function predictPrompt(voice: Voice): string {
  return VOICES[voice].predict
}

export function gameOverLine(voice: Voice, outcome: 'win' | 'loss' | 'draw'): string {
  return VOICES[voice][outcome]
}

/** How much a predicted move gives away against the best line, from the MultiPV lines; null when it is not among them. */
export function predictionLoss(lines: EngineLine[], predictionUci: string, side: 'w' | 'b'): number | null {
  const best = lines[0]
  const mine = lines.find((l) => l.pv[0] === predictionUci)
  if (!best || !mine) return null
  const sign = side === 'w' ? 1 : -1
  return Math.max(0, sign * (scoreToCp(best.score) - scoreToCp(mine.score)))
}

export interface CoachMoveInput {
  fenBefore: string
  /** The coach's move, UCI. */
  uci: string
  voice: Voice
  /** The engine's candidate lines in the position, best first, White's view. */
  lines: EngineLine[]
  /** The student's prediction and what it gives away against the coach's move. */
  prediction?: { uci: string; lossCp: number } | null
}

/** What the coach says about its own move: the verdict on the prediction, the move, the reason, the alternative it weighed. */
export function narrateCoachMove(input: CoachMoveInput): Narration {
  const v = VOICES[input.voice]
  const played = play(input.fenBefore, input.uci)
  if (!played) return { title: 'My move', lines: [] }
  const { chess, move } = played
  const lines: string[] = []
  if (input.prediction) {
    const predSan = uciLineToSan(input.fenBefore, [input.prediction.uci])[0] ?? input.prediction.uci
    if (input.prediction.uci === input.uci) lines.push(v.match)
    else if (input.prediction.lossCp <= 30) lines.push(v.close(predSan))
    else lines.push(v.miss(predSan, pawns(input.prediction.lossCp)))
  }
  const before = analyzePosition(input.fenBefore)
  const after = analyzePosition(chess.fen())
  const ideas = moveIdeas(before, after, move)
  lines.push(ideas.length ? `${v.iPlay(move.san)} ${ideas[0]}` : `${v.iPlay(move.san)} ${v.quiet}`)
  if (ideas[1]) lines.push(ideas[1])
  // The alternative the engine weighed: as good, or rejected for a reason the student can see in numbers.
  const alt = input.lines.find((l) => l.pv[0] && l.pv[0] !== input.uci)
  const best = input.lines[0]
  if (alt && best) {
    const sign = move.color === 'w' ? 1 : -1
    const gap = Math.max(0, sign * (scoreToCp(best.score) - scoreToCp(alt.score)))
    const altSan = uciLineToSan(input.fenBefore, [alt.pv[0]])[0]
    if (altSan && gap <= 20) lines.push(v.alsoGood(altSan))
    else if (altSan && gap >= 60) lines.push(v.rejected(altSan, pawns(gap)))
  }
  return { title: `${move.san}`, lines: lines.slice(0, 4) }
}

/** What the coach says about the opponent's move: what it does, what it threatens, what it gave away. */
export function narrateOpponentMove(fenBefore: string, uci: string, voice: Voice): Narration {
  const v = VOICES[voice]
  const played = play(fenBefore, uci)
  if (!played) return { title: 'Their move', lines: [] }
  const { chess, move } = played
  const before = analyzePosition(fenBefore)
  const after = analyzePosition(chess.fen())
  const lines: string[] = []
  const ideas = moveIdeas(before, after, move)
  lines.push(ideas.length ? `${v.theyPlay(move.san)} ${ideas[0]}` : v.theyPlay(move.san))
  // Threats against the coach's pieces that the move created.
  const me = move.color === 'w' ? 'b' : 'w'
  const threatened = after.loose.filter((l) => l.color === me && l.attackers.includes(move.to) && !before.loose.some((b) => b.square === l.square))
  if (threatened.length && !ideas[0]?.startsWith('Attacks') && !ideas[0]?.startsWith('A double')) {
    const t = threatened[0]
    lines.push(`It attacks my ${PIECE_NAME[t.type]} on ${t.square}. I must deal with that first.`)
  }
  const damage = moveDamage(before, after, move)
  if (damage.length) lines.push(`${v.gift} ${lower(damage[0])}`)
  return { title: move.san, lines: lines.slice(0, 3) }
}

/** The pieces of the coach's side that stand loose after a move, for the "what hangs" note. */
export function looseFor(fen: string, side: 'w' | 'b'): string[] {
  return analyzePosition(fen)
    .loose.filter((l) => l.color === side && l.kind === 'hanging')
    .map((l) => describePiece(l))
}
