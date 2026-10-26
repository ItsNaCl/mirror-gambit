import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import ratedData from '../../data/puzzles/rated.json'
import { motifFor, newRating, parseRated, pickRated, toPuzzle, updateRating, type RatedEntry } from './rated'

const all = parseRated(ratedData as RatedEntry[])

describe('rated puzzle data', () => {
  it('has puzzles across the whole rating range', () => {
    expect(all.length).toBeGreaterThan(2000)
    expect(Math.min(...all.map((p) => p.rating))).toBeLessThan(700)
    expect(Math.max(...all.map((p) => p.rating))).toBeGreaterThan(2500)
  })

  it('replays every solution legally and ends with a sensible position', () => {
    for (const p of all) {
      const chess = new Chess(p.fen)
      for (const uci of p.solution) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
      // The solver moves first and last.
      expect(p.solution.length % 2).toBe(1)
    }
  })

  it('converts to the shape the puzzle screen plays', () => {
    const p = toPuzzle(all[0])
    expect(p.set).toBe('rated')
    expect(p.solutionSan).toHaveLength(p.solution.length)
    expect(motifFor(['mateIn2', 'fork'])).toBe('checkmate')
    expect(motifFor(['quietMove'])).toBe('tactics')
  })
})

describe('pickRated', () => {
  it('picks an unseen puzzle near the rating and honours the theme', () => {
    const p = pickRated(all, 1500, new Set(), 'fork', () => 0)!
    expect(Math.abs(p.rating - 1500)).toBeLessThanOrEqual(75)
    expect(p.themes).toContain('fork')
    expect(pickRated(all, 1500, new Set([p.id]), 'fork', () => 0)?.id).not.toBe(p.id)
  })

  it('widens the search when nothing is close', () => {
    expect(pickRated(all, 100, new Set(), 'any', () => 0)).not.toBeNull()
  })
})

describe('updateRating', () => {
  it('gains for a clean solve, loses for giving up, and moves less once settled', () => {
    const r = newRating()
    const win = updateRating(r, 1200, 1)
    expect(win.delta).toBe(20) // K 40, expected 0.5
    expect(updateRating(r, 1200, 0).delta).toBe(-20)
    expect(updateRating(r, 1200, 0.5).delta).toBe(0)
    const settled = { ...r, games: 100 }
    expect(updateRating(settled, 1200, 1).delta).toBe(8)
    // Beating a much harder puzzle is worth more than an easy one.
    expect(updateRating(r, 1600, 1).delta).toBeGreaterThan(updateRating(r, 800, 1).delta)
    expect(win.next).toMatchObject({ rating: 1220, games: 1, history: [1220] })
  })
})
