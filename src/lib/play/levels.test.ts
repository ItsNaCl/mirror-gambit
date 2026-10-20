import { describe, expect, it } from 'vitest'
import type { EngineLine } from '../engine/uci'
import { levelById, pickMove, PLAY_LEVELS } from './levels'

function line(multipv: number, uci: string, cp: number | null, mate?: number): EngineLine {
  return { multipv, depth: 10, score: mate !== undefined ? { type: 'mate', value: mate } : { type: 'cp', value: cp ?? 0 }, pv: [uci] }
}

const LEGAL = ['e2e4', 'd2d4', 'g1f3', 'a2a3']

describe('play levels', () => {
  it('get stronger level by level', () => {
    for (let i = 1; i < PLAY_LEVELS.length; i++) {
      const a = PLAY_LEVELS[i - 1]
      const b = PLAY_LEVELS[i]
      expect(b.depth).toBeGreaterThanOrEqual(a.depth)
      expect(b.temperature).toBeLessThanOrEqual(a.temperature)
      expect(b.randomMoveChance).toBeLessThanOrEqual(a.randomMoveChance)
    }
  })

  it('falls back to the first level for an unknown id', () => {
    expect(levelById(99).id).toBe(1)
    expect(levelById(4).name).toBe('Club')
  })
})

describe('pickMove', () => {
  const lines = [line(1, 'e2e4', 40), line(2, 'd2d4', 30), line(3, 'a2a3', -300)]

  it('always plays the best move at full strength', () => {
    const master = levelById(6)
    for (let i = 0; i < 20; i++) expect(pickMove(lines, 'w', master, LEGAL, Math.random)).toBe('e2e4')
  })

  it('rarely picks a move far behind the best one', () => {
    const club = levelById(4)
    let bad = 0
    let seed = 1
    const rng = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 2000; i++) if (pickMove(lines, 'w', club, LEGAL, rng) === 'a2a3') bad++
    expect(bad).toBeLessThan(2000 * 0.05)
  })

  it('reads scores from the side to move', () => {
    // Scores are from White's view: -300 is the best line for Black.
    const blackLines = [line(1, 'e7e5', 40), line(2, 'c7c5', -300)]
    const sharp = { ...levelById(5), temperature: 1 }
    expect(pickMove(blackLines, 'b', sharp, [], () => 0.5)).toBe('c7c5')
    expect(pickMove(blackLines, 'w', sharp, [], () => 0.5)).toBe('e7e5')
  })

  it('makes a random legal move when the dice say so', () => {
    const beginner = levelById(1)
    const rolls = [0.01, 0.99] // first roll triggers the random move, second picks the last legal move
    let i = 0
    expect(pickMove(lines, 'w', beginner, LEGAL, () => rolls[i++])).toBe('a2a3')
  })

  it('never chooses a non-mating move over a mate at strong levels', () => {
    const mating = [line(1, 'd1h5', null, 1), line(2, 'e2e4', 900)]
    expect(pickMove(mating, 'w', levelById(4), LEGAL, () => 0.999)).toBe('d1h5')
  })

  it('handles no engine lines', () => {
    expect(pickMove([], 'w', levelById(3), LEGAL, () => 0)).toBe('e2e4')
    expect(pickMove([], 'w', levelById(3), [], () => 0)).toBeNull()
  })
})
