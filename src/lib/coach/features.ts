import { Chess, SQUARES, type Color, type PieceSymbol, type Square } from 'chess.js'

/**
 * Reads a position the way a strong player scans it: what each side controls, what is loose,
 * what is pinned, how the pawns stand, how safe each king is. Everything here comes from the
 * board alone (no engine), so it is instant and the same every time. The coach and the board
 * overlays are built on it.
 */

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export const PIECE_NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

export const SIDE_NAME: Record<Color, string> = { w: 'White', b: 'Black' }

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

const FILES = 'abcdefgh'

export function fileOf(sq: Square): number {
  return FILES.indexOf(sq[0])
}

export function rankOf(sq: Square): number {
  return Number(sq[1]) - 1
}

function squareAt(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null
  return `${FILES[file]}${rank + 1}` as Square
}

export interface PlacedPiece {
  square: Square
  type: PieceSymbol
  color: Color
}

/** A piece that can be taken for free, or for less than it is worth. */
export interface LoosePiece extends PlacedPiece {
  attackers: Square[]
  defenders: Square[]
  /** The cheapest enemy piece attacking it. */
  cheapestAttacker: Square
  /** 'hanging': attacked and not defended. 'underdefended': attacked by something cheaper, or by more pieces than defend it. */
  kind: 'hanging' | 'underdefended'
}

/** A line piece pointing through one enemy piece at a more valuable one behind it. */
export interface LineTactic {
  kind: 'pin' | 'skewer'
  /** True when the piece behind is the king, so the pinned piece may not legally move off the line. */
  absolute: boolean
  attacker: Square
  /** The piece in front (pinned, or forced to move in a skewer). */
  front: Square
  /** The piece behind it. */
  back: Square
  /** The side whose pieces are pinned or skewered. */
  victim: Color
}

export interface PawnStructure {
  isolated: Square[]
  doubled: Square[]
  passed: Square[]
  backward: Square[]
  islands: number
}

export interface KingSafety {
  square: Square
  castled: boolean
  /** Own pawns on the three files around the king, one or two ranks in front of it. */
  shield: number
  /** Files next to or on the king's file with no own pawn. */
  openFiles: number
  /** Enemy attacks on the king's square and the squares around it. */
  pressure: number
}

export interface PositionFeatures {
  fen: string
  turn: Color
  /** Material in pawns (king not counted). */
  material: Record<Color, number>
  /** How many pieces of each side attack each square. */
  control: Record<Square, Record<Color, number>>
  loose: LoosePiece[]
  lines: LineTactic[]
  pawns: Record<Color, PawnStructure>
  kings: Record<Color, KingSafety>
  /** Knights and bishops still on their starting squares. */
  undeveloped: Record<Color, Square[]>
  /** Squares in the enemy half that an own pawn protects and no enemy pawn can ever attack. */
  outposts: Record<Color, Square[]>
  /** Squares in the enemy half (ranks 5-8 for White) attacked at least once. */
  space: Record<Color, number>
  inCheck: boolean
}

const START_MINORS: Record<Color, Square[]> = { w: ['b1', 'g1', 'c1', 'f1'], b: ['b8', 'g8', 'c8', 'f8'] }

export function piecesOf(chess: Chess): PlacedPiece[] {
  const out: PlacedPiece[] = []
  for (const row of chess.board()) for (const p of row) if (p) out.push({ square: p.square, type: p.type, color: p.color })
  return out
}

export function analyzePosition(fen: string): PositionFeatures {
  const chess = new Chess(fen)
  const pieces = piecesOf(chess)
  const at = new Map(pieces.map((p) => [p.square, p]))

  const control = {} as Record<Square, Record<Color, number>>
  for (const sq of SQUARES) control[sq] = { w: chess.attackers(sq, 'w').length, b: chess.attackers(sq, 'b').length }

  const material: Record<Color, number> = { w: 0, b: 0 }
  for (const p of pieces) material[p.color] += PIECE_VALUE[p.type]

  return {
    fen,
    turn: chess.turn(),
    material,
    control,
    loose: findLoose(chess, pieces, at),
    lines: findLineTactics(pieces, at),
    pawns: { w: pawnStructure(pieces, 'w'), b: pawnStructure(pieces, 'b') },
    kings: { w: kingSafety(chess, pieces, 'w'), b: kingSafety(chess, pieces, 'b') },
    undeveloped: {
      w: START_MINORS.w.filter((sq) => isStartMinor(at.get(sq), 'w')),
      b: START_MINORS.b.filter((sq) => isStartMinor(at.get(sq), 'b')),
    },
    outposts: { w: outposts(pieces, 'w'), b: outposts(pieces, 'b') },
    space: { w: spaceOf(control, 'w'), b: spaceOf(control, 'b') },
    inCheck: chess.inCheck(),
  }
}

function isStartMinor(p: PlacedPiece | undefined, color: Color): boolean {
  return !!p && p.color === color && (p.type === 'n' || p.type === 'b')
}

function findLoose(chess: Chess, pieces: PlacedPiece[], at: Map<Square, PlacedPiece>): LoosePiece[] {
  const out: LoosePiece[] = []
  for (const p of pieces) {
    if (p.type === 'k') continue
    const attackers = chess.attackers(p.square, other(p.color))
    if (attackers.length === 0) continue
    const defenders = chess.attackers(p.square, p.color)
    const cheapest = attackers.reduce((a, b) => (PIECE_VALUE[at.get(a)!.type] <= PIECE_VALUE[at.get(b)!.type] ? a : b))
    const cheapestValue = at.get(cheapest)!.type === 'k' ? 100 : PIECE_VALUE[at.get(cheapest)!.type]
    if (defenders.length === 0) {
      // A piece attacked only by the king, with no defender, is still hanging.
      out.push({ ...p, attackers, defenders, cheapestAttacker: cheapest, kind: 'hanging' })
    } else if (cheapestValue < PIECE_VALUE[p.type] || (attackers.length > defenders.length && PIECE_VALUE[p.type] >= 3)) {
      out.push({ ...p, attackers, defenders, cheapestAttacker: cheapest, kind: 'underdefended' })
    }
  }
  return out
}

const ROOK_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

function findLineTactics(pieces: PlacedPiece[], at: Map<Square, PlacedPiece>): LineTactic[] {
  const out: LineTactic[] = []
  for (const p of pieces) {
    const dirs = p.type === 'r' ? ROOK_DIRS : p.type === 'b' ? BISHOP_DIRS : p.type === 'q' ? [...ROOK_DIRS, ...BISHOP_DIRS] : null
    if (!dirs) continue
    for (const [df, dr] of dirs) {
      let f = fileOf(p.square) + df
      let r = rankOf(p.square) + dr
      let front: PlacedPiece | null = null
      while (true) {
        const sq = squareAt(f, r)
        if (!sq) break
        const q = at.get(sq)
        if (q) {
          if (!front) {
            if (q.color === p.color) break
            front = q
          } else {
            if (q.color === p.color) break
            const frontValue = front.type === 'k' ? 100 : PIECE_VALUE[front.type]
            const backValue = q.type === 'k' ? 100 : PIECE_VALUE[q.type]
            const attackerValue = PIECE_VALUE[p.type]
            // A pin only bites when the piece behind is the king, or is worth more than the attacker:
            // a queen "pinning" a pawn to a queen can simply be traded off.
            if (backValue > frontValue && (q.type === 'k' || backValue > attackerValue)) {
              out.push({ kind: 'pin', absolute: q.type === 'k', attacker: p.square, front: front.square, back: q.square, victim: q.color })
            } else if (frontValue > backValue && frontValue >= 5 && backValue >= 3) {
              out.push({ kind: 'skewer', absolute: front.type === 'k', attacker: p.square, front: front.square, back: q.square, victim: q.color })
            }
            break
          }
        }
        f += df
        r += dr
      }
    }
  }
  return out
}

export function pawnStructure(pieces: PlacedPiece[], color: Color): PawnStructure {
  const own = pieces.filter((p) => p.type === 'p' && p.color === color)
  const enemy = pieces.filter((p) => p.type === 'p' && p.color !== color)
  const files = new Map<number, Square[]>()
  for (const p of own) {
    const f = fileOf(p.square)
    files.set(f, [...(files.get(f) ?? []), p.square])
  }
  const forward = color === 'w' ? 1 : -1
  const isolated: Square[] = []
  const doubled: Square[] = []
  const passed: Square[] = []
  const backward: Square[] = []
  for (const p of own) {
    const f = fileOf(p.square)
    const r = rankOf(p.square)
    const neighbours = [f - 1, f + 1].flatMap((nf) => files.get(nf) ?? [])
    if (neighbours.length === 0) isolated.push(p.square)
    if ((files.get(f)?.length ?? 0) > 1) doubled.push(p.square)
    const blockers = enemy.filter((e) => Math.abs(fileOf(e.square) - f) <= 1 && (rankOf(e.square) - r) * forward > 0)
    if (blockers.length === 0) passed.push(p.square)
    // Backward: every neighbouring pawn is further forward, and the square in front is covered by an enemy pawn.
    if (neighbours.length > 0 && neighbours.every((n) => (rankOf(n) - r) * forward > 0)) {
      const stop = squareAt(f, r + forward)
      const coveredByPawn =
        !!stop && enemy.some((e) => rankOf(e.square) === r + 2 * forward && Math.abs(fileOf(e.square) - f) === 1)
      if (coveredByPawn) backward.push(p.square)
    }
  }
  let islands = 0
  for (let f = 0; f < 8; f++) if (files.has(f) && !files.has(f - 1)) islands++
  return { isolated, doubled, passed, backward, islands }
}

function kingSafety(chess: Chess, pieces: PlacedPiece[], color: Color): KingSafety {
  const king = pieces.find((p) => p.type === 'k' && p.color === color)
  const square = king?.square ?? (color === 'w' ? 'e1' : 'e8')
  const f = fileOf(square)
  const r = rankOf(square)
  const forward = color === 'w' ? 1 : -1
  const ownPawns = pieces.filter((p) => p.type === 'p' && p.color === color)
  let shield = 0
  let openFiles = 0
  for (let df = -1; df <= 1; df++) {
    const ff = f + df
    if (ff < 0 || ff > 7) continue
    if (ownPawns.some((p) => fileOf(p.square) === ff && [1, 2].includes((rankOf(p.square) - r) * forward))) shield++
    if (!ownPawns.some((p) => fileOf(p.square) === ff)) openFiles++
  }
  let pressure = 0
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      const sq = squareAt(f + df, r + dr)
      if (sq) pressure += chess.attackers(sq, other(color)).length
    }
  const homeRank = color === 'w' ? 0 : 7
  const castled = r === homeRank && (f >= 6 || f <= 2)
  return { square, castled, shield, openFiles, pressure }
}

function outposts(pieces: PlacedPiece[], color: Color): Square[] {
  const ownPawns = pieces.filter((p) => p.type === 'p' && p.color === color)
  const enemyPawns = pieces.filter((p) => p.type === 'p' && p.color !== color)
  const forward = color === 'w' ? 1 : -1
  const out: Square[] = []
  // Ranks 4-6 from this side's point of view: far enough forward to matter, close enough to hold.
  const ranks = color === 'w' ? [3, 4, 5] : [4, 3, 2]
  for (const r of ranks)
    for (let f = 0; f < 8; f++) {
      const sq = squareAt(f, r)!
      const supported = ownPawns.some((p) => rankOf(p.square) === r - forward && Math.abs(fileOf(p.square) - f) === 1)
      if (!supported) continue
      // No enemy pawn on an adjacent file that could still advance to attack the square.
      const attackable = enemyPawns.some((e) => Math.abs(fileOf(e.square) - f) === 1 && (rankOf(e.square) - r) * forward > 0)
      if (!attackable) out.push(sq)
    }
  return out
}

function spaceOf(control: Record<Square, Record<Color, number>>, color: Color): number {
  let n = 0
  for (const sq of SQUARES) {
    const r = rankOf(sq)
    const enemyHalf = color === 'w' ? r >= 4 : r <= 3
    if (enemyHalf && control[sq][color] > 0) n++
  }
  return n
}

/** "the knight on f3" */
export function describePiece(p: Pick<PlacedPiece, 'type' | 'square'>): string {
  return `the ${PIECE_NAME[p.type]} on ${p.square}`
}
