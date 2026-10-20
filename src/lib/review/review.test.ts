import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { newGame } from '../chess/game'
import { buildReview, reviewComment, type PositionEval } from './review'

function gameFrom(sans: string[]) {
  const chess = new Chess()
  for (const san of sans) chess.move(san)
  const moves = chess.history({ verbose: true })
  return { ...newGame(), moves, ply: moves.length }
}

describe('buildReview', () => {
  it('classifies each move from the mover perspective and counts per side', () => {
    // 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#
    const game = gameFrom(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])
    const fens = [game.startFen, ...game.moves.map((m) => m.after)]
    const evals: PositionEval[] = [
      { fen: fens[0], score: { type: 'cp', value: 30 }, bestMove: 'e2e4', depth: 14 },
      { fen: fens[1], score: { type: 'cp', value: 30 }, bestMove: 'e7e5', depth: 14 },
      { fen: fens[2], score: { type: 'cp', value: 30 }, bestMove: 'g1f3', depth: 14 },
      { fen: fens[3], score: { type: 'cp', value: -60 }, bestMove: 'b8c6', depth: 14 }, // Qh5 lost 90 -> inaccuracy
      { fen: fens[4], score: { type: 'cp', value: -60 }, bestMove: 'f1c4', depth: 14 },
      { fen: fens[5], score: { type: 'cp', value: -60 }, bestMove: 'g7g6', depth: 14 },
      { fen: fens[6], score: { type: 'mate', value: 1 }, bestMove: 'h5f7', depth: 14 }, // Nf6 allowed mate
      { fen: fens[7], score: { type: 'mate', value: 0 }, bestMove: null, depth: 14 },
    ]
    const review = buildReview(game, evals)
    expect(review.moves.map((m) => m.classification.cls)).toEqual([
      'best', // e4 was the best move
      'best', // e5
      'inaccuracy', // Qh5
      'best', // Nc6
      'best', // Bc4
      'blunder', // Nf6 allows mate
      'best', // Qxf7# delivers mate: played best move
    ])
    expect(review.moves[2].betterMove).toBe('Nf3')
    expect(review.moves[5].betterMove).toBe('g6')
    expect(review.moves[5].classification.reason).toBe('allowed-mate')
    expect(review.summary.w).toEqual({ best: 3, great: 0, good: 0, inaccuracy: 1, mistake: 0, blunder: 0 })
    expect(review.summary.b).toEqual({ best: 2, great: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 1 })
    expect(review.evals).toHaveLength(8)
  })

  it('rejects mismatched evaluation lists', () => {
    const game = gameFrom(['e4'])
    expect(() => buildReview(game, [])).toThrow()
  })

  it('writes PGN comments only for problem moves', () => {
    expect(
      reviewComment({
        index: 0,
        san: 'Qh5',
        mover: 'w',
        classification: { cls: 'mistake', lossCp: 230 },
        betterMove: 'Nf3',
        evalAfter: { type: 'cp', value: -100 },
        bestLine: [],
        replyLine: [],
      }),
    ).toBe('Mistake (-2.3). Better was Nf3.')
    expect(
      reviewComment({
        index: 0,
        san: 'e4',
        mover: 'w',
        classification: { cls: 'good', lossCp: 20 },
        betterMove: null,
        evalAfter: { type: 'cp', value: 10 },
        bestLine: [],
        replyLine: [],
      }),
    ).toBeNull()
  })
})
