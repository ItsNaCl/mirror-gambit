// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPaidStore, normalisePaid, PAID_KEY, paysSlowGame } from './paid'

describe('paid review ids', () => {
  beforeEach(() => localStorage.clear())

  it('pays an id once, and a reload cannot repay it', () => {
    const first = createPaidStore()
    expect(first.existed).toBe(false)
    expect(first.claim('lichess:a')).toBe(true)
    expect(first.claim('lichess:a')).toBe(false)
    const reloaded = createPaidStore()
    expect(reloaded.existed).toBe(true)
    expect(reloaded.claim('lichess:a')).toBe(false)
    expect(reloaded.claim('lichess:b')).toBe(true)
    expect(JSON.parse(localStorage.getItem(PAID_KEY) ?? '[]')).toEqual(['lichess:a', 'lichess:b'])
  })

  it('seeds ids without paying them', () => {
    const s = createPaidStore()
    s.seed(['x', 'y'])
    expect(s.claim('x')).toBe(false)
    expect(s.claim('z')).toBe(true)
  })

  it('drops junk from a damaged record', () => {
    expect(normalisePaid({ a: 1 })).toEqual([])
    expect(normalisePaid(['a', 3, '', 'a', null, 'b'])).toEqual(['a', 'b'])
  })
})

describe('slow game XP source', () => {
  it('never pays for a game typed in from a scoresheet', () => {
    expect(paysSlowGame({ source: 'otb', timeClass: 'classical' })).toBe(false)
    expect(paysSlowGame({ source: 'lichess', timeClass: 'classical' })).toBe(true)
    expect(paysSlowGame({ source: 'chesscom', timeClass: 'blitz' })).toBe(false)
  })
})
