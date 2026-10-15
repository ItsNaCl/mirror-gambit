import { Chess, type Square } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { loadPuzzles, MOTIF_GUIDE, PUZZLE_SETS, puzzlesFor, validatePuzzle } from './puzzles'

describe('puzzle validation', () => {
  const { puzzles, dropped } = loadPuzzles()

  it('loads the eight playable sets and reports anything dropped', () => {
    for (const d of dropped) console.log(`DROPPED puzzle ${d.set}#${d.index} (${d.fen}): ${d.reason}`)
    console.log(`puzzles kept: ${puzzles.length}, dropped: ${dropped.length}`)
    expect(puzzles.length).toBeGreaterThan(200)
    for (const set of PUZZLE_SETS) expect(puzzlesFor(set.id).length, `set ${set.id} is empty`).toBeGreaterThan(0)
  })

  it('every kept puzzle has a valid FEN and a legal solution sequence', () => {
    for (const p of puzzles) {
      const chess = new Chess(p.fen)
      expect(chess.turn()).toBe(p.side)
      for (let i = 0; i < p.solution.length; i++) {
        const uci = p.solution[i]
        const mv = chess.move({
          from: uci.slice(0, 2) as Square,
          to: uci.slice(2, 4) as Square,
          promotion: (uci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
        })
        expect(mv.san, `${p.id} move ${i}`).toBe(p.solutionSan[i])
      }
    }
  })

  it('every motif used by a puzzle has a beginner explanation', () => {
    const motifs = new Set(puzzles.map((p) => p.motif))
    for (const m of motifs) expect(MOTIF_GUIDE[m], `no guide for motif "${m}"`).toBeDefined()
  })

  it('rejects broken puzzles with a reason', () => {
    expect(validatePuzzle({ fen: 'not a fen', solution_moves: ['e2e4'] })).toMatch(/invalid FEN/)
    expect(validatePuzzle({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', solution_moves: ['e2e5'] })).toMatch(
      /illegal move/,
    )
    expect(validatePuzzle({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', solution_moves: [] })).toMatch(
      /no solution/,
    )
    expect(validatePuzzle({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', solution_moves: ['e2e4'] })).toBeNull()
  })
})
