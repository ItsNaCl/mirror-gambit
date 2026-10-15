import { describe, expect, it } from 'vitest'
import {
  createCard,
  dueCards,
  hasDuplicate,
  INTERVAL_HOURS,
  isDue,
  mergeCards,
  MIN_EASE_FACTOR,
  parseCardsJson,
  sm2Update,
  type SrsCard,
} from './srs'
import { srsGrade } from '../practice/practice'

const T0 = Date.parse('2026-10-08T12:00:00Z')
const H = 3600 * 1000

function card(): SrsCard {
  return createCard(
    { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', playerMove: 'a3', bestMove: 'e4', cpLoss: 120, classification: 'inaccuracy', source: 'review' },
    T0,
  )
}

describe('SM-2 scheduling', () => {
  it('new cards are due 4 hours after creation with ease 2.5', () => {
    const c = card()
    expect(c.intervalHours).toBe(4)
    expect(c.easeFactor).toBe(2.5)
    expect(c.repetitions).toBe(0)
    expect(Date.parse(c.nextReview)).toBe(T0 + 4 * H)
    expect(isDue(c, T0 + 3 * H)).toBe(false)
    expect(isDue(c, T0 + 4 * H)).toBe(true)
  })

  it('successful reviews walk through 4h, 1d, 3d, 1w, 2w, 1mo', () => {
    let c = card()
    let now = T0
    const expected = [4, 24, 72, 168, 336, 720]
    for (let i = 0; i < expected.length; i++) {
      now += c.intervalHours * H
      c = sm2Update(c, 5, now)
      expect(c.intervalHours).toBe(expected[i])
      expect(c.repetitions).toBe(i + 1)
      expect(Date.parse(c.nextReview)).toBe(now + expected[i] * H)
    }
    expect(INTERVAL_HOURS).toEqual(expected)
  })

  it('after the fixed sequence the interval grows by the ease factor', () => {
    let c = card()
    for (let i = 0; i < 6; i++) c = sm2Update(c, 4, T0)
    const before = c.intervalHours
    c = sm2Update(c, 4, T0)
    expect(c.intervalHours).toBe(Math.round(before * c.easeFactor))
  })

  it('a failed review (quality below 3) resets to 4 hours and zero repetitions', () => {
    let c = card()
    c = sm2Update(c, 5, T0)
    c = sm2Update(c, 5, T0)
    expect(c.intervalHours).toBe(24) // two passes: 4h again, then 1 day (as in srs.py)
    c = sm2Update(c, 1, T0 + 10 * H)
    expect(c.intervalHours).toBe(4)
    expect(c.repetitions).toBe(0)
    expect(Date.parse(c.nextReview)).toBe(T0 + 14 * H)
    // Passing again starts from the first interval.
    c = sm2Update(c, 4, T0)
    expect(c.intervalHours).toBe(4)
    c = sm2Update(c, 4, T0)
    expect(c.intervalHours).toBe(24)
  })

  it('adjusts the ease factor per card and never goes below 1.3', () => {
    let c = card()
    c = sm2Update(c, 5, T0)
    expect(c.easeFactor).toBeCloseTo(2.6, 4) // +0.1 for a perfect answer
    c = sm2Update(c, 3, T0)
    expect(c.easeFactor).toBeCloseTo(2.46, 4) // -0.14 for a hard pass
    let d = card()
    for (let i = 0; i < 20; i++) d = sm2Update(d, 0, T0)
    expect(d.easeFactor).toBe(MIN_EASE_FACTOR)
    expect(d.qualityHistory).toHaveLength(20)
  })

  it('rejects grades outside 0-5', () => {
    expect(() => sm2Update(card(), 6, T0)).toThrow()
    expect(() => sm2Update(card(), -1, T0)).toThrow()
  })

  it('grades from the practice flow drive the schedule', () => {
    // gave up (0) and hint level 3-4 (2) reset; retries only (4) and clean (5) advance
    let c = card()
    c = sm2Update(c, srsGrade({ wrongTries: 0, maxHintLevel: 0, gaveUp: false }), T0)
    c = sm2Update(c, srsGrade({ wrongTries: 2, maxHintLevel: 0, gaveUp: false }), T0)
    expect(c.repetitions).toBe(2)
    expect(c.intervalHours).toBe(24)
    c = sm2Update(c, srsGrade({ wrongTries: 0, maxHintLevel: 3, gaveUp: false }), T0)
    expect(c.repetitions).toBe(0)
    expect(c.intervalHours).toBe(4)
    c = sm2Update(c, srsGrade({ wrongTries: 0, maxHintLevel: 1, gaveUp: false }), T0)
    expect(c.repetitions).toBe(1) // grade 3 still passes
    c = sm2Update(c, srsGrade({ wrongTries: 0, maxHintLevel: 0, gaveUp: true }), T0)
    expect(c.repetitions).toBe(0)
    expect(c.qualityHistory).toEqual([5, 4, 2, 3, 0])
  })
})

describe('deck helpers', () => {
  it('lists due cards soonest first', () => {
    const a = { ...card(), id: 'a', nextReview: new Date(T0 + 2 * H).toISOString() }
    const b = { ...card(), id: 'b', nextReview: new Date(T0 + 1 * H).toISOString() }
    const c = { ...card(), id: 'c', nextReview: new Date(T0 + 9 * H).toISOString() }
    expect(dueCards([a, b, c], T0 + 3 * H).map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('detects duplicates by position and move', () => {
    const c = card()
    expect(hasDuplicate([c], c.fen, 'a3')).toBe(true)
    expect(hasDuplicate([c], c.fen, 'h3')).toBe(false)
  })

  it('imports and merges cards from JSON, skipping duplicates', () => {
    const existing = [card()]
    const json = JSON.stringify([existing[0], { fen: 'x w - - 0 1', bestMove: 'Nf3', playerMove: 'Nh3' }])
    const imported = parseCardsJson(json)
    expect(imported).toHaveLength(2)
    const merged = mergeCards(existing, imported)
    expect(merged.added).toBe(1)
    expect(merged.cards).toHaveLength(2)
    expect(() => parseCardsJson('nope')).toThrow(/JSON/)
    expect(() => parseCardsJson('[{"fen":"x"}]')).toThrow(/best move/)
  })
})
