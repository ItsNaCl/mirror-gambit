import { openingTrapPuzzles, type Puzzle } from '../lib/puzzles/puzzles'

/**
 * Links Chess Rocket's opening-trap puzzles to the openings in this app.
 * The puzzle files carry no opening id, so we match on the opening named in
 * each puzzle's explanation. Puzzles whose position does not actually belong
 * to the named opening are excluded by index.
 */
const KEYWORDS: Record<string, RegExp> = {
  italian: /Italian Game/i,
  'ruy-lopez': /Ruy Lopez/i,
  scotch: /Scotch/i,
  vienna: /Vienna/i,
  'queens-gambit': /Tarrasch Defense \(D32\)|Queen's Gambit/i,
  sicilian: /Sicilian/i,
  french: /French Defense/i,
  'caro-kann': /Caro-Kann/i,
  english: /English Opening/i,
  'nimzo-indian': /Nimzo-Indian/i,
  'fried-liver': /Fried Liver/i,
  'scholars-mate-defense': /Scholar's Mate/i,
}

/**
 * Puzzle #2 is labelled "Fishing Pole Trap in the Ruy Lopez" but its position
 * (1.e4 Nc6 2.Nf3) is not a Ruy Lopez and the suggested ...f5 is not a trap,
 * so it is left out.
 */
const EXCLUDED_INDICES = new Set([2])

export function trapPuzzlesFor(openingId: string): Puzzle[] {
  const re = KEYWORDS[openingId]
  if (!re) return []
  return openingTrapPuzzles().filter((p) => {
    const index = Number(p.id.split('-').pop())
    return !EXCLUDED_INDICES.has(index) && re.test(p.explanation)
  })
}

/** Opening ids that have at least one matching trap puzzle (for tests and the UI). */
export function openingsWithTrapPuzzles(): string[] {
  return Object.keys(KEYWORDS).filter((id) => trapPuzzlesFor(id).length > 0)
}
