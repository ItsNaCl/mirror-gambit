import { describe, expect, it } from 'vitest'
import type { AnalysisResult } from '../engine/engine'
import type { AnalysedGame } from '../games/profile'
import { compareMoves, verdict, whyNotItems } from './whyNot'

// 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4?? (hangs the e5 pawn to 4. Nxe5) 4. Nxe5 Qg5
const game: AnalysedGame = {
  game: {
    id: 'chesscom:1',
    source: 'chesscom',
    url: '',
    date: '2026-10-20T10:00:00Z',
    white: 'Opp',
    black: 'Me',
    userColor: 'b',
    result: '1-0',
    timeClass: 'rapid',
    sans: 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5',
  },
  analysis: {
    depth: 12,
    accuracy: 60,
    moves: 4,
    mistakes: [
      { ply: 6, san: 'Nd4', cls: 'mistake', lossCp: 180, better: 'Bc5', phase: 'opening', tags: ['hung-piece'] },
      { ply: 8, san: 'Qg5', cls: 'inaccuracy', lossCp: 90, better: 'Nxe5', phase: 'opening', tags: ['other'] },
    ],
  },
}

const older: AnalysedGame = {
  ...game,
  game: { ...game.game, id: 'chesscom:0', date: '2026-10-01T10:00:00Z', userColor: 'w', white: 'Me', black: 'Other' },
  analysis: {
    ...game.analysis,
    mistakes: [
      { ply: 5, san: 'Bc4', cls: 'blunder', lossCp: 400, better: 'Bb5', phase: 'opening', tags: ['other'] },
      { ply: 7, san: 'Nxe5', cls: 'blunder', lossCp: 350, better: null, phase: 'opening', tags: ['other'] },
    ],
  },
}

function result(fen: string, pv: string[], cp: number): AnalysisResult {
  return { id: 1, fen, depth: 14, bestMove: pv[0], done: true, lines: [{ multipv: 1, score: { type: 'cp', value: cp }, depth: 14, pv }] } as AnalysisResult
}

describe('whyNotItems', () => {
  it('keeps mistakes and blunders with a better move, newest game first, with the position before the move', () => {
    const items = whyNotItems([older, game])
    expect(items.map((i) => i.id)).toEqual(['chesscom:1:6', 'chesscom:0:5'])
    const first = items[0]
    expect(first.side).toBe('b')
    expect(first.fen.startsWith('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b')).toBe(true)
    expect(first.moveLabel).toBe('3...')
    expect(first.label).toMatch(/Against Opp/)
    expect(items[1].moveLabel).toBe('3')
  })

  it('respects the limit', () => {
    expect(whyNotItems([older, game], 1)).toHaveLength(1)
  })
})

describe('compareMoves', () => {
  const item = whyNotItems([game])[0]

  it('rates the idea against the best move and lays both lines out', () => {
    const before = result(item.fen, ['f8c5', 'c2c3', 'g8f6'], -20)
    const afterFen = 'r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 1 4'
    const after = result(afterFen, ['f3e5', 'd8g5', 'e5f7'], 160)
    const c = compareMoves(item, 'c6d4', before, after)!
    expect(c.tried.san).toBe('Nd4')
    expect(c.tried.cls).toBe('mistake')
    expect(c.tried.lossCp).toBe(180)
    expect(c.tried.text).toBe('3... Nd4 4. Nxe5 Qg5 5. Nxf7')
    expect(c.best?.san).toBe('Bc5')
    expect(c.best?.text).toBe('3... Bc5 4. c3 Nf6')
    expect(c.sameAsGame).toBe(true)
    expect(c.explanation?.tone).toBe('bad')
    expect(verdict(c)).toMatch(/Nd4 gives up about 1\.8 pawns against Bc5\. It is what you played in the game\./)
  })

  it('has no better side when the student found the engine move', () => {
    const before = result(item.fen, ['f8c5', 'c2c3'], -20)
    const after = result('x', ['c2c3'], -20)
    const c = compareMoves(item, 'f8c5', before, after)!
    expect(c.best).toBeNull()
    expect(c.tried.cls).toBe('best')
    expect(c.sameAsGame).toBe(false)
    expect(verdict(c)).toMatch(/That is the move/)
  })

  it('returns null for an illegal move or an empty engine answer', () => {
    const before = result(item.fen, ['f8c5'], 0)
    expect(compareMoves(item, 'a1a8', before, result('x', ['c2c3'], 0))).toBeNull()
    expect(compareMoves(item, 'c6d4', { ...before, lines: [] }, result('x', ['c2c3'], 0))).toBeNull()
  })
})
