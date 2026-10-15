import { describe, expect, it } from 'vitest'
import { formatScore, parseBestMove, parseInfoLine, scoreToBarPercent, scoreToCp } from './uci'

describe('parseInfoLine', () => {
  it('parses depth, multipv, cp score and pv', () => {
    const line = 'info depth 18 seldepth 24 multipv 2 score cp 35 nodes 12345 nps 100 time 10 pv e2e4 e7e5 g1f3'
    expect(parseInfoLine(line, 'w')).toEqual({
      multipv: 2,
      depth: 18,
      score: { type: 'cp', value: 35 },
      pv: ['e2e4', 'e7e5', 'g1f3'],
    })
  })

  it('converts scores to White perspective when Black is to move', () => {
    const cp = parseInfoLine('info depth 10 multipv 1 score cp 50 pv e7e5', 'b')
    expect(cp?.score).toEqual({ type: 'cp', value: -50 })
    const mate = parseInfoLine('info depth 10 multipv 1 score mate 3 pv e7e5', 'b')
    expect(mate?.score).toEqual({ type: 'mate', value: -3 })
  })

  it('ignores bound scores and lines without a pv', () => {
    expect(parseInfoLine('info depth 10 multipv 1 score cp 50 lowerbound pv e2e4', 'w')).toBeNull()
    expect(parseInfoLine('info depth 10 currmove e2e4 currmovenumber 1', 'w')).toBeNull()
    expect(parseInfoLine('info string NNUE evaluation using nn.nnue', 'w')).toBeNull()
  })
})

describe('parseBestMove', () => {
  it('reads the move and handles (none)', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4')
    expect(parseBestMove('bestmove (none)')).toBeNull()
  })
})

describe('formatScore', () => {
  it('formats centipawns and mates', () => {
    expect(formatScore({ type: 'cp', value: 35 })).toBe('+0.35')
    expect(formatScore({ type: 'cp', value: -120 })).toBe('-1.20')
    expect(formatScore({ type: 'cp', value: 0 })).toBe('0.00')
    expect(formatScore({ type: 'mate', value: 3 })).toBe('M3')
    expect(formatScore({ type: 'mate', value: -2 })).toBe('-M2')
  })
})

describe('scoreToCp / scoreToBarPercent', () => {
  it('orders mates beyond any cp score, shorter mates being better', () => {
    expect(scoreToCp({ type: 'mate', value: 1 })).toBeGreaterThan(scoreToCp({ type: 'mate', value: 5 }))
    expect(scoreToCp({ type: 'mate', value: 5 })).toBeGreaterThan(scoreToCp({ type: 'cp', value: 5000 }))
    expect(scoreToCp({ type: 'mate', value: -1 })).toBeLessThan(scoreToCp({ type: 'cp', value: -5000 }))
  })

  it('maps scores onto the eval bar', () => {
    expect(scoreToBarPercent({ type: 'cp', value: 0 })).toBeCloseTo(50)
    expect(scoreToBarPercent({ type: 'cp', value: 300 })).toBeGreaterThan(70)
    expect(scoreToBarPercent({ type: 'cp', value: -300 })).toBeLessThan(30)
    expect(scoreToBarPercent({ type: 'mate', value: 2 })).toBe(100)
    expect(scoreToBarPercent({ type: 'mate', value: -2 })).toBe(0)
  })
})
