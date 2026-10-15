/** One move of a study line with a plain-language explanation. */
export interface LineMove {
  san: string
  comment: string
}

/** The main line, given in full from move 1. */
export interface MainLine {
  name: string
  moves: LineMove[]
}

/**
 * A sideline that shares the first `from` half-moves with the main line and
 * then continues with its own moves. (Keeping only the different part avoids
 * repeating commentary for the shared moves.)
 */
export interface Branch {
  name: string
  from: number
  moves: LineMove[]
}

export interface Trap extends Branch {
  /** Who springs the trap and why it matters, in a sentence or two. */
  description: string
}

export type OpeningGroup = 'white' | 'black-vs-e4' | 'black-vs-d4' | 'trap-line'

export interface Opening {
  id: string
  name: string
  /** Exact name as it appears in the Lichess chess-openings dataset. */
  lichessName: string
  /** The side the student plays in this opening. */
  side: 'white' | 'black'
  group: OpeningGroup
  summary: string
  mainLine: MainLine
  sidelines: Branch[]
  keyIdeas: string[]
  trap: Trap
}

/** Expands a branch into a complete move list from move 1. */
export function fullLine(opening: Opening, branch: Branch): LineMove[] {
  return [...opening.mainLine.moves.slice(0, branch.from), ...branch.moves]
}

/** Every line of an opening (main line first, then sidelines, then the trap) as full move lists. */
export function allLines(opening: Opening): { key: string; name: string; moves: LineMove[]; isTrap: boolean }[] {
  return [
    { key: 'main', name: opening.mainLine.name, moves: opening.mainLine.moves, isTrap: false },
    ...opening.sidelines.map((s, i) => ({ key: `side-${i}`, name: s.name, moves: fullLine(opening, s), isTrap: false })),
    { key: 'trap', name: opening.trap.name, moves: fullLine(opening, opening.trap), isTrap: true },
  ]
}
