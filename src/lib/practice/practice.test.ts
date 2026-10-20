import { describe, expect, it } from 'vitest'
import {
  acceptsAlternative,
  emptyStats,
  hintView,
  movesMatch,
  normalizeStats,
  outcomeOf,
  recordOutcome,
  shouldPulse,
  srsGrade,
  themeForMove,
} from './practice'

const r = (wrongTries: number, maxHintLevel: 0 | 1 | 2 | 3 | 4, gaveUp = false) => ({ wrongTries, maxHintLevel, gaveUp })

describe('scoring', () => {
  it('clean only with no hints and no wrong tries', () => {
    expect(outcomeOf(r(0, 0))).toBe('clean')
  })
  it('assisted with retries or any hint', () => {
    expect(outcomeOf(r(1, 0))).toBe('assisted')
    expect(outcomeOf(r(0, 1))).toBe('assisted')
    expect(outcomeOf(r(7, 4))).toBe('assisted')
  })
  it('failed when giving up, whatever else happened', () => {
    expect(outcomeOf(r(0, 0, true))).toBe('failed')
    expect(outcomeOf(r(3, 2, true))).toBe('failed')
  })
})

describe('SRS grade mapping', () => {
  it('maps results to SM-2 grades', () => {
    expect(srsGrade(r(0, 0))).toBe(5) // clean
    expect(srsGrade(r(1, 0))).toBe(4) // retries only
    expect(srsGrade(r(9, 0))).toBe(4)
    expect(srsGrade(r(0, 1))).toBe(3) // hint level 1
    expect(srsGrade(r(2, 2))).toBe(3) // hint level 2
    expect(srsGrade(r(0, 3))).toBe(2) // hint level 3
    expect(srsGrade(r(4, 4))).toBe(2) // hint level 4
    expect(srsGrade(r(0, 0, true))).toBe(0) // gave up
    expect(srsGrade(r(0, 4, true))).toBe(0)
  })
})

describe('stats and streaks', () => {
  it('counts all three outcomes and keeps the streak on clean and assisted', () => {
    let s = emptyStats()
    s = recordOutcome(s, 'clean', 'a')
    s = recordOutcome(s, 'assisted', 'b')
    expect(s.streak).toBe(2)
    s = recordOutcome(s, 'failed', 'c')
    expect(s).toMatchObject({ clean: 1, assisted: 1, failed: 1, streak: 0, bestStreak: 2, failedIds: ['c'] })
    s = recordOutcome(s, 'assisted', 'c') // retried and solved: no longer in the failed list
    expect(s.failedIds).toEqual([])
    expect(s.streak).toBe(1)
  })
  it('reads stats saved by older versions', () => {
    expect(normalizeStats({ solved: 4, failed: 2, streak: 1, bestStreak: 3 })).toEqual({
      clean: 0,
      assisted: 4,
      failed: 2,
      streak: 1,
      bestStreak: 3,
      failedIds: [],
    })
    expect(normalizeStats(undefined)).toEqual(emptyStats())
  })
})

describe('hint levels', () => {
  const uci = 'g1f3'
  it('shows nothing at level 0', () => {
    expect(hintView(0, uci, 'Theme')).toEqual({ text: null, highlightFrom: null, highlightTo: null, arrow: null })
  })
  it('level 1 is only the theme', () => {
    expect(hintView(1, uci, 'Look for a fork.')).toMatchObject({ text: 'Look for a fork.', highlightFrom: null, highlightTo: null, arrow: null })
  })
  it('level 2 highlights the piece', () => {
    expect(hintView(2, uci, 'T')).toMatchObject({ highlightFrom: 'g1', highlightTo: null, arrow: null })
  })
  it('level 3 adds the target square', () => {
    expect(hintView(3, uci, 'T')).toMatchObject({ highlightFrom: 'g1', highlightTo: 'f3', arrow: null })
  })
  it('level 4 shows the full move as an arrow', () => {
    expect(hintView(4, uci, 'T')).toMatchObject({ arrow: { from: 'g1', to: 'f3' } })
  })
})

describe('auto-offered hint', () => {
  it('only pulses when enabled and the threshold is reached', () => {
    expect(shouldPulse(5, 0, 0)).toBe(false) // off
    expect(shouldPulse(1, 0, 2)).toBe(false)
    expect(shouldPulse(2, 0, 2)).toBe(true)
    expect(shouldPulse(3, 1, 3)).toBe(true)
    expect(shouldPulse(9, 4, 2)).toBe(false) // nothing left to offer
  })
})

describe('move helpers', () => {
  it('matches by UCI or by SAN ignoring check marks', () => {
    expect(movesMatch('e2e4', 'e4', 'e2e4', 'e4')).toBe(true)
    expect(movesMatch('d1h5', 'Qh5', null, 'Qh5+')).toBe(true)
    expect(movesMatch('d2d4', 'd4', 'e2e4', 'e4')).toBe(false)
  })
  it('describes the theme of a move', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(themeForMove(start, 'e2e4')).toMatch(/develops|centre/)
    expect(themeForMove('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'h5f7')).toMatch(/checkmate/)
  })
})

describe('alternative moves', () => {
  const cp = (value: number) => ({ type: 'cp' as const, value })
  const mate = (value: number) => ({ type: 'mate' as const, value })

  it('accepts a move within 30 centipawns of the best one', () => {
    expect(acceptsAlternative(cp(500), cp(480), 'w')).toBe(true)
    expect(acceptsAlternative(cp(-500), cp(-475), 'b')).toBe(true)
  })

  it('rejects a move that throws away a real part of the advantage', () => {
    expect(acceptsAlternative(cp(500), cp(400), 'w')).toBe(false)
    expect(acceptsAlternative(cp(-500), cp(-300), 'b')).toBe(false)
  })

  it('accepts any mate when a mate was available, but not a non-mating move', () => {
    expect(acceptsAlternative(mate(2), mate(3), 'w')).toBe(true)
    expect(acceptsAlternative(mate(2), mate(0), 'w')).toBe(true)
    expect(acceptsAlternative(mate(-2), mate(-4), 'b')).toBe(true)
    expect(acceptsAlternative(mate(2), cp(900), 'w')).toBe(false)
  })
})
