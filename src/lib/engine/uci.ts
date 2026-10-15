/** Score from White's point of view. cp = centipawns, mate = moves until mate (negative: Black mates). */
export interface Score {
  type: 'cp' | 'mate'
  value: number
}

export interface EngineLine {
  multipv: number
  depth: number
  score: Score
  /** Principal variation in UCI long notation, e.g. ["e2e4", "e7e5"]. */
  pv: string[]
}

/** Parses one "info ..." line. Returns null for lines that carry no usable score (e.g. bounds, currmove). */
export function parseInfoLine(line: string, sideToMove: 'w' | 'b'): EngineLine | null {
  if (!line.startsWith('info ')) return null
  if (!line.includes(' score ') || !line.includes(' pv ')) return null
  if (/\b(lowerbound|upperbound)\b/.test(line)) return null
  const tokens = line.split(/\s+/)
  let depth = 0
  let multipv = 1
  let score: Score | null = null
  let pv: string[] = []
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === 'depth') depth = Number(tokens[++i])
    else if (t === 'multipv') multipv = Number(tokens[++i])
    else if (t === 'score') {
      const kind = tokens[++i]
      const value = Number(tokens[++i])
      if (kind === 'cp' || kind === 'mate') score = { type: kind, value }
    } else if (t === 'pv') {
      pv = tokens.slice(i + 1)
      break
    }
  }
  if (!score || pv.length === 0) return null
  const sign = sideToMove === 'w' ? 1 : -1
  return { multipv, depth, score: { type: score.type, value: score.value * sign }, pv }
}

export function parseBestMove(line: string): string | null {
  const m = /^bestmove\s+(\S+)/.exec(line)
  if (!m || m[1] === '(none)') return null
  return m[1]
}

/** "+0.35", "-1.20", "M3", "-M3", "0.00". */
export function formatScore(score: Score): string {
  if (score.type === 'mate') {
    if (score.value === 0) return '#'
    return score.value > 0 ? `M${score.value}` : `-M${Math.abs(score.value)}`
  }
  const pawns = score.value / 100
  if (Math.abs(pawns) < 0.005) return '0.00'
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`
}

/** Collapses a score to a single number for comparisons. Mates map far beyond any cp value. */
export function scoreToCp(score: Score): number {
  if (score.type === 'cp') return score.value
  const MATE = 100000
  if (score.value === 0) return 0
  return score.value > 0 ? MATE - score.value : -MATE - score.value
}

/** Flips a White-perspective score to the given side's perspective. */
export function scoreFor(score: Score, side: 'w' | 'b'): Score {
  return side === 'w' ? score : { type: score.type, value: -score.value }
}

/** 0..100: how full the White side of the eval bar should be. */
export function scoreToBarPercent(score: Score): number {
  if (score.type === 'mate') return score.value > 0 ? 100 : score.value < 0 ? 0 : 50
  // Logistic curve similar to Lichess' winning-chance formula.
  const chance = 2 / (1 + Math.exp(-0.00368208 * score.value)) - 1
  return Math.max(2, Math.min(98, 50 + 50 * chance))
}
