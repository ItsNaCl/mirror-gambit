import { Chess, DEFAULT_POSITION } from 'chess.js'
import { INITIAL_EASE_FACTOR, INTERVAL_HOURS, sm2Update, type SrsCard } from '../srs/srs'

/**
 * Opening repertoires in the Chessreps style. A repertoire is a set of moves keyed by position,
 * so transpositions land on the same entry. On your side there is one chosen move per position,
 * and each one is a spaced-repetition card; on the opponent's side there can be any number of
 * replies. Drills walk from the start, play the opponent's replies (weighted towards the ones your
 * opponents really play) and ask for your moves.
 */

export type Side = 'w' | 'b'

export interface SrsState {
  ease: number
  intervalHours: number
  reps: number
  /** ISO time the move is next due. */
  due: string
  history: number[]
}

export interface RepMove {
  /** Position before the move, without the move counters (see posKey). */
  pos: string
  uci: string
  san: string
  /** True for the repertoire owner's moves: the ones that are drilled. */
  mine: boolean
  srs?: SrsState
}

export interface Repertoire {
  id: string
  name: string
  color: Side
  moves: RepMove[]
  createdAt: string
}

/** A position without the halfmove and fullmove counters, so move-order transpositions match. */
export function posKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

export const START_POS = posKey(DEFAULT_POSITION)

export function newRepertoire(name: string, color: Side, nowMs = Date.now()): Repertoire {
  const id = `rep-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return { id, name, color, moves: [], createdAt: new Date(nowMs).toISOString() }
}

function newSrs(nowMs: number): SrsState {
  // A new move is due straight away, so it is learned in the next drill.
  return { ease: INITIAL_EASE_FACTOR, intervalHours: INTERVAL_HOURS[0], reps: 0, due: new Date(nowMs).toISOString(), history: [] }
}

export function movesAt(rep: Repertoire, pos: string): RepMove[] {
  return rep.moves.filter((m) => m.pos === pos)
}

export function myMoveAt(rep: Repertoire, pos: string): RepMove | undefined {
  return rep.moves.find((m) => m.pos === pos && m.mine)
}

export interface AddResult {
  rep: Repertoire
  added: number
  /** Positions where your move was different before and has been replaced. */
  replaced: { pos: string; old: string; now: string }[]
  /** True when the line was left out because it would change one of your moves (onConflict 'skip'). */
  skipped: boolean
}

/**
 * Adds a line of SAN moves from a start position. Your side keeps one move per position: with
 * onConflict 'replace' a different move replaces the old one (and anything only reachable through
 * it is dropped); with 'skip' the whole line is left out instead. Stops at the first illegal move.
 */
export function addLine(
  rep: Repertoire,
  sans: string[],
  startFen: string = DEFAULT_POSITION,
  nowMs = Date.now(),
  onConflict: 'replace' | 'skip' = 'replace',
): AddResult {
  const chess = new Chess(startFen)
  let moves = [...rep.moves]
  let added = 0
  const replaced: AddResult['replaced'] = []
  for (const san of sans) {
    const pos = posKey(chess.fen())
    const mine = chess.turn() === rep.color
    let mv
    try {
      mv = chess.move(san)
    } catch {
      break
    }
    const uci = mv.from + mv.to + (mv.promotion ?? '')
    const existing = moves.find((m) => m.pos === pos && m.uci === uci)
    if (existing) continue
    if (mine) {
      const old = moves.find((m) => m.pos === pos && m.mine)
      if (old) {
        if (onConflict === 'skip') return { rep, added: 0, replaced: [], skipped: true }
        replaced.push({ pos, old: old.san, now: mv.san })
        moves = moves.filter((m) => m !== old)
      }
    }
    moves.push({ pos, uci, san: mv.san, mine, srs: mine ? newSrs(nowMs) : undefined })
    added++
  }
  return { rep: prune({ ...rep, moves }), added, replaced, skipped: false }
}

/** Removes a move and everything that is only reachable through it. */
export function removeMove(rep: Repertoire, pos: string, uci: string): Repertoire {
  return prune({ ...rep, moves: rep.moves.filter((m) => !(m.pos === pos && m.uci === uci)) })
}

/** Keeps only the moves reachable from the starting position. */
export function prune(rep: Repertoire): Repertoire {
  const reachable = new Set<string>([START_POS])
  const queue = [START_POS]
  const keep = new Set<RepMove>()
  while (queue.length) {
    const pos = queue.shift()!
    for (const m of rep.moves) {
      if (m.pos !== pos) continue
      keep.add(m)
      const next = positionAfter(pos, m.uci)
      if (next && !reachable.has(next)) {
        reachable.add(next)
        queue.push(next)
      }
    }
  }
  return keep.size === rep.moves.length ? rep : { ...rep, moves: rep.moves.filter((m) => keep.has(m)) }
}

const afterCache = new Map<string, string | null>()

/** The position key after a UCI move from a position key. */
export function positionAfter(pos: string, uci: string): string | null {
  const k = `${pos}|${uci}`
  const hit = afterCache.get(k)
  if (hit !== undefined) return hit
  let out: string | null = null
  try {
    const chess = new Chess(`${pos} 0 1`)
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    out = posKey(chess.fen())
  } catch {
    out = null
  }
  if (afterCache.size > 20000) afterCache.clear()
  afterCache.set(k, out)
  return out
}

export function isDue(m: RepMove, nowMs = Date.now()): boolean {
  return !!m.mine && !!m.srs && Date.parse(m.srs.due) <= nowMs
}

export interface RepStats {
  myMoves: number
  due: number
  /** Moves answered well at least twice in a row. */
  learned: number
}

export function repStats(rep: Repertoire, nowMs = Date.now()): RepStats {
  const mine = rep.moves.filter((m) => m.mine)
  return { myMoves: mine.length, due: mine.filter((m) => isDue(m, nowMs)).length, learned: mine.filter((m) => (m.srs?.reps ?? 0) >= 2).length }
}

/** Records a drill answer (grade 0-5 from srsGrade) with the same SM-2 rules as the mistake cards. */
export function reviewMove(rep: Repertoire, pos: string, uci: string, grade: number, nowMs = Date.now()): Repertoire {
  return {
    ...rep,
    moves: rep.moves.map((m) => {
      if (m.pos !== pos || m.uci !== uci || !m.mine) return m
      const s = m.srs ?? newSrs(nowMs)
      const card = sm2Update(
        { easeFactor: s.ease, intervalHours: s.intervalHours, repetitions: s.reps, qualityHistory: s.history, nextReview: s.due } as SrsCard,
        grade,
        nowMs,
      )
      return { ...m, srs: { ease: card.easeFactor, intervalHours: card.intervalHours, reps: card.repetitions, due: card.nextReview, history: card.qualityHistory.slice(-20) } }
    }),
  }
}

export interface DrillStep {
  pos: string
  /** Full FEN before the move, for the board. */
  fen: string
  uci: string
  san: string
  mine: boolean
}

/** How often each opponent reply was played in a position, from the student's own games. */
export type ReplyCounts = Map<string, Map<string, number>>

/**
 * Chooses the next line to drill: from the start, your move where it is your turn, and on the
 * opponent's turn a reply that leads to moves that are due, weighted by how often opponents
 * play it. The line ends once nothing below it is due. With `all`, every move counts as due
 * (practice outside the schedule).
 */
export function pickDrillLine(rep: Repertoire, opts: { nowMs?: number; all?: boolean; replyCounts?: ReplyCounts; random?: () => number } = {}): DrillStep[] {
  const now = opts.nowMs ?? Date.now()
  const rand = opts.random ?? Math.random
  const due = (m: RepMove) => m.mine && (opts.all || isDue(m, now))
  const memo = new Map<string, number>()
  // Due moves at or below a position (depth-limited; repertoires are trees of a few hundred moves).
  const dueBelow = (pos: string, depth: number, seen: Set<string>): number => {
    if (depth > 60 || seen.has(pos)) return 0
    const cached = memo.get(pos)
    if (cached !== undefined) return cached
    seen.add(pos)
    let n = 0
    for (const m of movesAt(rep, pos)) {
      if (due(m)) n++
      const next = positionAfter(pos, m.uci)
      if (next) n += dueBelow(next, depth + 1, seen)
    }
    seen.delete(pos)
    memo.set(pos, n)
    return n
  }

  const steps: DrillStep[] = []
  const chess = new Chess()
  const visited = new Set<string>()
  for (let guard = 0; guard < 80; guard++) {
    const pos = posKey(chess.fen())
    if (visited.has(pos) || dueBelow(pos, 0, new Set()) === 0) break
    visited.add(pos)
    const here = movesAt(rep, pos)
    let pick: RepMove | undefined
    if (chess.turn() === rep.color) {
      pick = here.find((m) => m.mine)
    } else {
      const options = here
        .map((m) => {
          const next = positionAfter(pos, m.uci)
          const weight = next ? dueBelow(next, 0, new Set()) : 0
          const played = opts.replyCounts?.get(pos)?.get(m.uci) ?? 0
          return { m, weight: weight > 0 ? weight * (1 + played) : 0 }
        })
        .filter((o) => o.weight > 0)
      const total = options.reduce((s, o) => s + o.weight, 0)
      let r = rand() * total
      pick = options.find((o) => (r -= o.weight) <= 0)?.m ?? options[0]?.m
    }
    if (!pick) break
    steps.push({ pos, fen: chess.fen(), uci: pick.uci, san: pick.san, mine: pick.mine })
    chess.move({ from: pick.uci.slice(0, 2), to: pick.uci.slice(2, 4), promotion: pick.uci[4] })
  }
  // Never end on an opponent move: the drill finishes with your last answer.
  while (steps.length && !steps[steps.length - 1].mine) steps.pop()
  return steps
}

/** Counts the opponents' replies in the student's games, for the side the repertoire is for. */
export function opponentReplies(games: { sans: string; userColor: Side }[], color: Side, maxPlies = 30): ReplyCounts {
  const counts: ReplyCounts = new Map()
  for (const g of games) {
    if (g.userColor !== color) continue
    const chess = new Chess()
    for (const san of g.sans.split(' ').slice(0, maxPlies)) {
      const pos = posKey(chess.fen())
      const theirs = chess.turn() !== color
      let mv
      try {
        mv = chess.move(san)
      } catch {
        break
      }
      if (!theirs) continue
      const uci = mv.from + mv.to + (mv.promotion ?? '')
      const row = counts.get(pos) ?? new Map<string, number>()
      row.set(uci, (row.get(uci) ?? 0) + 1)
      counts.set(pos, row)
    }
  }
  return counts
}

export interface Gap {
  pos: string
  fen: string
  /** The moves that lead here, in SAN from the start. */
  line: string[]
  uci: string
  san: string
  /** Times your opponents played it, when known. */
  played: number
}

/**
 * Opponent replies with no prepared answer: in every repertoire position where it is the
 * opponent's turn, replies your opponents played (or the engine expects) that the repertoire
 * does not cover. Most-played first.
 */
export function findGaps(rep: Repertoire, replyCounts: ReplyCounts, engineReplies: Map<string, string[]> = new Map()): Gap[] {
  const gaps: Gap[] = []
  const seen = new Set<string>()
  const walk = (chess: Chess, line: string[]) => {
    const pos = posKey(chess.fen())
    if (seen.has(pos) || line.length > 40) return
    seen.add(pos)
    const here = movesAt(rep, pos)
    if (chess.turn() !== rep.color && line.length > 0) {
      const covered = new Set(here.map((m) => m.uci))
      const candidates = new Map<string, number>()
      for (const [uci, n] of replyCounts.get(pos) ?? []) candidates.set(uci, n)
      for (const uci of engineReplies.get(pos) ?? []) if (!candidates.has(uci)) candidates.set(uci, 0)
      for (const [uci, played] of candidates) {
        if (covered.has(uci)) continue
        const probe = new Chess(chess.fen())
        try {
          const mv = probe.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
          gaps.push({ pos, fen: chess.fen(), line: [...line], uci, san: mv.san, played })
        } catch {
          /* not legal here */
        }
      }
    }
    for (const m of here) {
      const next = new Chess(chess.fen())
      try {
        next.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] })
      } catch {
        continue
      }
      walk(next, [...line, m.san])
    }
  }
  walk(new Chess(), [])
  return gaps.sort((a, b) => b.played - a.played || a.line.length - b.line.length)
}

/** Positions in the repertoire where it is the opponent's turn (for asking the engine about likely replies). */
export function opponentPositions(rep: Repertoire): { pos: string; fen: string }[] {
  const out: { pos: string; fen: string }[] = []
  const seen = new Set<string>()
  const walk = (chess: Chess, depth: number) => {
    const pos = posKey(chess.fen())
    if (seen.has(pos) || depth > 40) return
    seen.add(pos)
    if (chess.turn() !== rep.color && depth > 0) out.push({ pos, fen: chess.fen() })
    for (const m of movesAt(rep, pos)) {
      const next = new Chess(chess.fen())
      try {
        next.move({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci[4] })
      } catch {
        continue
      }
      walk(next, depth + 1)
    }
  }
  walk(new Chess(), 0)
  return out
}
