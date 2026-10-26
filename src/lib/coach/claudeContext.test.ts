import { describe, expect, it } from 'vitest'
import { buildCoachContext, numberedMoves } from './claudeContext'
import { addUsage, costOf, formatDollars } from './usage'

const AFTER_QC4 = 'rnb1kbnr/ppp1pppp/8/8/2q5/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 4'

describe('numberedMoves', () => {
  it('numbers moves from the start and from a black-to-move position', () => {
    expect(numberedMoves(['e4', 'd5', 'exd5', 'Qxd5'])).toBe('1. e4 d5 2. exd5 Qxd5')
    expect(numberedMoves(['Kd7', 'Ke2'], '8/8/8/8/8/8/8/k6K b - - 0 40')).toBe('40... Kd7 41. Ke2')
  })
})

describe('buildCoachContext', () => {
  const text = buildCoachContext(
    {
      fen: AFTER_QC4,
      sanMoves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qc4'],
      opening: 'B01 Scandinavian Defense',
      lines: [{ multipv: 1, depth: 18, score: { type: 'cp', value: 880 }, pv: ['f1c4', 'e7e6'] }],
      depth: 18,
      lastMove: { san: 'Qc4', mover: 'b', classification: { cls: 'blunder', lossCp: 900 }, betterMove: 'Qa5', bestReply: 'Bxc4' },
    },
    'move',
  )

  it('states the facts Claude must stick to', () => {
    expect(text).toContain('Side to move: White')
    expect(text).toContain('1. e4 d5 2. exd5 Qxd5 3. Nc3 Qc4')
    expect(text).toContain('1. +8.80: Bxc4 e6')
    expect(text).toContain('The queen on c4 is loose')
    expect(text).toContain('graded Blunder (lost about 9.0 pawns). The engine preferred Qa5.')
    expect(text).toMatch(/Task: Explain the last move/)
  })

  it('says so when the engine has no lines yet', () => {
    expect(buildCoachContext({ fen: AFTER_QC4, sanMoves: [], lines: [] }, 'position')).toContain('Engine: no lines yet')
  })
})

describe('usage', () => {
  it('prices an answer and keeps a monthly total', () => {
    const u = { input: 3000, output: 600, cacheRead: 2000, cacheWrite: 0 }
    // Opus 5.5: 3000*4 + 600*20 + 2000*0.2 = 24,400 per million = $0.0244
    expect(costOf('claude-opus-5-5', u)).toBeCloseTo(0.0244, 6)
    const oct = addUsage(null, 'claude-opus-5-5', u, Date.parse('2026-10-26T12:00:00Z'))
    const oct2 = addUsage(oct, 'claude-haiku-5-5', u, Date.parse('2026-10-30T12:00:00Z'))
    expect(oct2.questions).toBe(2)
    const nov = addUsage(oct2, 'claude-opus-5-5', u, Date.parse('2026-11-01T12:00:00Z'))
    expect(nov).toMatchObject({ month: '2026-11', questions: 1 })
    expect(formatDollars(0.004)).toBe('<$0.01')
    expect(formatDollars(0.0244)).toBe('$0.02')
  })
})
