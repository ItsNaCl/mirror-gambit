import { describe, expect, it } from 'vitest'
import { accuracyOf, recordFromReview } from './history'
import { emptyCounts, type ReviewResult } from '../review/review'

describe('progress history', () => {
  it('accuracy counts best, great and good moves', () => {
    const counts = { ...emptyCounts(), best: 5, great: 2, good: 1, inaccuracy: 1, mistake: 0, blunder: 1 }
    expect(accuracyOf(counts)).toBe(80)
    expect(accuracyOf(emptyCounts())).toBe(0)
  })

  it('builds a game record with per-side and overall accuracy', () => {
    const result: ReviewResult = {
      moves: [
        { index: 0, san: 'e4', mover: 'w', classification: { cls: 'best', lossCp: 0 }, betterMove: null, evalAfter: { type: 'cp', value: 0 }, bestLine: [], replyLine: [] },
        { index: 1, san: 'a6', mover: 'b', classification: { cls: 'blunder', lossCp: 400 }, betterMove: 'e5', evalAfter: { type: 'cp', value: 0 }, bestLine: [], replyLine: [] },
      ],
      evals: [],
      summary: { w: { ...emptyCounts(), best: 1 }, b: { ...emptyCounts(), blunder: 1 } },
    }
    const rec = recordFromReview(result, 'key', Date.parse('2026-10-08T00:00:00Z'))
    expect(rec.white.accuracy).toBe(100)
    expect(rec.black.accuracy).toBe(0)
    expect(rec.accuracy).toBe(50)
    expect(rec.moves).toBe(2)
    expect(rec.date).toBe('2026-10-08T00:00:00.000Z')
  })
})
