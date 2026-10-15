import data from '../../data/lichess-openings.json'

/** One row of the bundled Lichess chess-openings dataset: [eco, name, "e4 e5 Nf3 ..."]. */
export type OpeningRow = [string, string, string]

export interface DetectedOpening {
  eco: string
  name: string
  /** Number of half-moves of the game that matched the book line. */
  ply: number
}

const rows = data as OpeningRow[]
const byMoves = new Map<string, { eco: string; name: string }>()
const byName = new Map<string, OpeningRow[]>()
let longest = 0
for (const row of rows) {
  const [eco, name, moves] = row
  if (!byMoves.has(moves)) byMoves.set(moves, { eco, name })
  const list = byName.get(name) ?? []
  list.push(row)
  byName.set(name, list)
  longest = Math.max(longest, moves.split(' ').length)
}

/**
 * Finds the longest prefix of the game's SAN moves that is a known opening.
 * Because it looks for the longest *prefix*, the name naturally sticks after
 * the game leaves theory.
 */
export function detectOpening(sans: string[]): DetectedOpening | null {
  const max = Math.min(sans.length, longest)
  for (let n = max; n >= 1; n--) {
    const key = sans.slice(0, n).join(' ')
    const hit = byMoves.get(key)
    if (hit) return { eco: hit.eco, name: hit.name, ply: n }
  }
  return null
}

export function openingRowsByName(name: string): OpeningRow[] {
  return byName.get(name) ?? []
}

export function hasOpeningName(name: string): boolean {
  return byName.has(name)
}

export const openingCount = rows.length
