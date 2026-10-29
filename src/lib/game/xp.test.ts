import { describe, expect, it } from 'vitest'
import { award, EMPTY_PROGRESSION, normaliseProgression, rankFor, rankProgress, xpFor } from './xp'

describe('xp', () => {
  it('values events', () => {
    expect(xpFor({ type: 'block', minutes: 5 })).toBe(20)
    expect(xpFor({ type: 'block', minutes: 40 })).toBe(80)
    expect(xpFor({ type: 'solve', outcome: 'clean', rating: 1100 })).toBe(20)
    expect(xpFor({ type: 'solve', outcome: 'assisted', rating: 1100 })).toBe(10)
    expect(xpFor({ type: 'streak', days: 12 })).toBe(70)
    expect(xpFor({ type: 'slowGame', result: 'win' })).toBe(150)
  })

  it('ranks by thresholds', () => {
    expect(rankFor(0).id).toBe('pawn')
    expect(rankFor(799).id).toBe('pawn')
    expect(rankFor(800).id).toBe('knight')
    expect(rankFor(99999).id).toBe('king')
    expect(rankProgress(400)).toBe(0.5)
    expect(rankProgress(99999)).toBe(1)
  })

  it('awards, promotes and earns badges', () => {
    let p = EMPTY_PROGRESSION
    const a = award(p, { type: 'block', minutes: 10 }, 1, '2026-10-29T00:00:00Z')
    expect(a.gained).toBe(20)
    expect(a.newBadges.map((b) => b.id)).toEqual(['first-session'])
    p = a.next
    const b = award({ ...p, xp: 790 }, { type: 'review' }, 1)
    expect(b.newRank?.id).toBe('knight')
    expect(b.next.reviews).toBe(1)
    const c = award(p, { type: 'card', grade: 5 }, 7)
    expect(c.newBadges.map((x) => x.id)).toContain('streak-7')
    expect(c.next.bestStreak).toBe(7)
  })

  it('normalises old shapes', () => {
    expect(normaliseProgression(null).xp).toBe(0)
    expect(normaliseProgression({ xp: '12', badges: null }).xp).toBe(12)
  })
})
