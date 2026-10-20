import { Chess, type Square } from 'chess.js'
import backRank from '../../data/puzzles/back-rank.json'
import endgames from '../../data/puzzles/beginner-endgames.json'
import checkmates from '../../data/puzzles/checkmate-patterns.json'
import forks from '../../data/puzzles/forks.json'
import lichessLonger from '../../data/puzzles/lichess-longer.json'
import openingMoves from '../../data/puzzles/opening-moves.json'
import openingTraps from '../../data/puzzles/opening-traps.json'
import pins from '../../data/puzzles/pins.json'
import skewers from '../../data/puzzles/skewers.json'

/**
 * Puzzle sets ported from Chess Rocket (GPL-3.0, see README credits), plus multi-move
 * puzzles from the Lichess puzzle database (CC0, scripts/import-lichess-puzzles.mjs).
 * The JSON files live in src/data/puzzles; this module validates them with chess.js
 * and drops anything that is not playable.
 */

export type PuzzleSetId =
  | 'forks'
  | 'pins'
  | 'skewers'
  | 'back-rank'
  | 'checkmate-patterns'
  | 'endgames'
  | 'opening-moves'
  | 'opening-traps'
  | 'longer'

export type PuzzleChoice = PuzzleSetId | 'mixed'

/** Raw shape of a Chess Rocket puzzle entry. */
export interface RawPuzzle {
  fen: string
  solution_moves: string[]
  solution_san?: string[]
  motif?: string
  difficulty?: string
  difficulty_rating?: number
  explanation?: string
  source?: string
}

export interface Puzzle {
  id: string
  set: PuzzleSetId
  fen: string
  /** Solver's side. */
  side: 'w' | 'b'
  /** Full solution in UCI. Even indices are the solver's moves, odd indices the replies. */
  solution: string[]
  solutionSan: string[]
  motif: string
  difficulty: string
  explanation: string
}

export interface DroppedPuzzle {
  set: PuzzleSetId
  index: number
  fen: string
  reason: string
}

export const PUZZLE_SETS: { id: PuzzleSetId; label: string; motifKey: string }[] = [
  { id: 'forks', label: 'Forks', motifKey: 'fork' },
  { id: 'pins', label: 'Pins', motifKey: 'pin' },
  { id: 'skewers', label: 'Skewers', motifKey: 'skewer' },
  { id: 'back-rank', label: 'Back rank', motifKey: 'back_rank_mate' },
  { id: 'checkmate-patterns', label: 'Checkmate patterns', motifKey: 'checkmate' },
  { id: 'endgames', label: 'Endgames', motifKey: 'endgame' },
  { id: 'opening-moves', label: 'Opening moves', motifKey: 'opening' },
  { id: 'opening-traps', label: 'Opening traps', motifKey: 'opening_trap' },
  { id: 'longer', label: 'Longer puzzles', motifKey: 'tactics' },
]

const RAW: Record<PuzzleSetId, RawPuzzle[]> = {
  forks: forks as RawPuzzle[],
  pins: pins as RawPuzzle[],
  skewers: skewers as RawPuzzle[],
  'back-rank': backRank as RawPuzzle[],
  'checkmate-patterns': checkmates as RawPuzzle[],
  endgames: endgames as RawPuzzle[],
  'opening-moves': openingMoves as RawPuzzle[],
  'opening-traps': openingTraps as RawPuzzle[],
  longer: lichessLonger as RawPuzzle[],
}

/** Beginner explanations of each motif, written from Chess Rocket's tactical-patterns reference. */
export interface MotifGuide {
  title: string
  /** Shown before the puzzle: what to look for. */
  before: string
  /** Shown after the puzzle: why it worked. */
  after: string
}

export const MOTIF_GUIDE: Record<string, MotifGuide> = {
  fork: {
    title: 'Fork',
    before:
      'A fork is one piece attacking two things at once. Your opponent can only save one of them. Knights are the sneakiest forkers because their jump is easy to miss. Look for a square where one of your pieces would hit two enemy pieces, especially the king or queen.',
    after:
      'That was a fork: one move, two targets. The opponent cannot defend both, so you win material. Tip for your own games: keep your king and queen off squares a knight can reach together.',
  },
  pin: {
    title: 'Pin',
    before:
      'A pin is a piece that cannot move because something more valuable sits behind it on the same line. A bishop, rook or queen does the pinning. Look for an enemy piece standing in front of its king or queen on a rank, file or diagonal.',
    after:
      'That was a pin. The pinned piece was frozen, so it could not run away or defend anything. In your own games, treat a pinned piece as if it were not there, and pile more attackers on it.',
  },
  skewer: {
    title: 'Skewer',
    before:
      'A skewer is a pin in reverse: you attack a valuable piece, it has to move, and you capture the less valuable piece hiding behind it. Look for two enemy pieces lined up with the big one in front. Giving check is the strongest way to do it.',
    after:
      'That was a skewer. The front piece had to move and the piece behind it was left for the taking. Watch for enemy pieces lined up on one rank, file or diagonal.',
  },
  back_rank_mate: {
    title: 'Back-rank mate',
    before:
      'A king on its first row with its own pawns in front has no escape squares. A rook or queen landing on that row gives checkmate. Look for a trapped king and an open file for your rook or queen. Sometimes you must first remove or distract the defender of that square.',
    after:
      'That was a back-rank mate: the king was boxed in by its own pawns. In your own games, give your king a breathing hole (a pawn move like h3 or h6) once the rooks come out.',
  },
  checkmate: {
    title: 'Checkmate pattern',
    before:
      'Checkmate means the king is attacked and has nowhere to go. Start by listing every check you can give. For each one ask: can the king move, can the check be blocked, can the checking piece be captured? If the answer is no three times, it is mate.',
    after:
      'That was a checkmate pattern. The checking piece was protected, the king had no free square, and nothing could block. Learn the shape: it will come back in your own games.',
  },
  endgame: {
    title: 'Endgame technique',
    before:
      'With few pieces left, the king becomes a fighting piece and pawns want to promote. Ask: can I push a pawn safely, cut the enemy king off with a rook, or bring my king closer? Precision matters more than speed.',
    after:
      'That was endgame technique: the right piece went to the right square to turn an advantage into a win. The usual recipe is king up, rook cutting off the enemy king, pawn forward.',
  },
  promotion: {
    title: 'Promotion',
    before:
      'A pawn reaching the last rank becomes a queen. Look for a pawn that can run, or a trick that removes the piece guarding the promotion square.',
    after:
      'That won because the pawn promoted (or could not be stopped). Passed pawns must be pushed, and must be stopped when they are the enemy\'s.',
  },
  opening: {
    title: 'Opening moves',
    before:
      'This is a position from a real opening. Find the book move. Think about the opening principles: control the centre, develop a new piece, keep the king safe, and do not move the same piece twice without a reason.',
    after:
      'That was the book move. You do not need to memorise it: it follows from the principles, which is exactly why strong players play it.',
  },
  opening_trap: {
    title: 'Opening trap',
    before:
      'Something in this opening position is about to go wrong for one side. Look for checks, captures and hanging pieces, and for the move that punishes the opponent\'s last mistake or avoids falling into one.',
    after:
      'That was the trap move. Traps work because a natural-looking move leaves something undefended. Before each opening move, ask: what does my opponent\'s last move attack?',
  },
  discovered_attack: {
    title: 'Discovered attack',
    before:
      'Moving one piece can uncover an attack from a piece behind it, giving two threats at once. Look for two of your pieces lined up with an enemy piece beyond them.',
    after:
      'That was a discovered attack: the piece that moved made its own threat while the piece behind it hit something else. Two threats in one move is too much to handle.',
  },
  double_check: {
    title: 'Double check',
    before: 'Two pieces give check at the same time. The only answer is to move the king, so look for a king with nowhere good to go.',
    after: 'Double check is the most forcing move in chess: the king had to move, and that decided the game.',
  },
  tactics: {
    title: 'Tactic',
    before: 'There is a concrete tactic here. Check every check, capture and threat before anything else.',
    after: 'A forcing sequence won material. Checks, captures and threats first, always.',
  },
}

export function motifGuide(motif: string): MotifGuide {
  return MOTIF_GUIDE[motif] ?? MOTIF_GUIDE.tactics
}

function uciToMove(uci: string) {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
  }
}

/** Returns a reason string when the raw puzzle cannot be played, otherwise null. */
export function validatePuzzle(raw: RawPuzzle): string | null {
  if (!raw || typeof raw.fen !== 'string') return 'missing FEN'
  if (!Array.isArray(raw.solution_moves) || raw.solution_moves.length === 0) return 'no solution moves'
  let chess: Chess
  try {
    chess = new Chess(raw.fen)
  } catch (e) {
    return `invalid FEN: ${e instanceof Error ? e.message : String(e)}`
  }
  for (let i = 0; i < raw.solution_moves.length; i++) {
    const uci = raw.solution_moves[i]
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return `malformed move "${uci}" at index ${i}`
    try {
      chess.move(uciToMove(uci))
    } catch {
      return `illegal move "${uci}" at index ${i} in ${chess.fen()}`
    }
  }
  return null
}

let cache: { puzzles: Puzzle[]; dropped: DroppedPuzzle[] } | null = null

/** Loads every set, validating each puzzle. Invalid puzzles are dropped and reported. */
export function loadPuzzles(): { puzzles: Puzzle[]; dropped: DroppedPuzzle[] } {
  if (cache) return cache
  const puzzles: Puzzle[] = []
  const dropped: DroppedPuzzle[] = []
  for (const set of PUZZLE_SETS) {
    RAW[set.id].forEach((raw, index) => {
      const reason = validatePuzzle(raw)
      if (reason) {
        dropped.push({ set: set.id, index, fen: raw?.fen ?? '', reason })
        return
      }
      const chess = new Chess(raw.fen)
      const solutionSan: string[] = []
      for (const uci of raw.solution_moves) solutionSan.push(chess.move(uciToMove(uci)).san)
      puzzles.push({
        id: `${set.id}-${index}`,
        set: set.id,
        fen: raw.fen,
        side: raw.fen.split(' ')[1] === 'b' ? 'b' : 'w',
        solution: raw.solution_moves,
        solutionSan,
        motif: raw.motif ?? set.motifKey,
        difficulty: raw.difficulty ?? 'beginner',
        explanation: raw.explanation ?? '',
      })
    })
  }
  if (dropped.length && typeof console !== 'undefined') {
    for (const d of dropped) console.warn(`[puzzles] dropped ${d.set}#${d.index}: ${d.reason}`)
  }
  cache = { puzzles, dropped }
  return cache
}

export function puzzlesFor(choice: PuzzleChoice): Puzzle[] {
  const all = loadPuzzles().puzzles
  return choice === 'mixed' ? all : all.filter((p) => p.set === choice)
}

/** Opening trap puzzles (used by the opening trainer as a final "Traps" step). */
export function openingTrapPuzzles(): Puzzle[] {
  return puzzlesFor('opening-traps')
}

export function shuffle<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
