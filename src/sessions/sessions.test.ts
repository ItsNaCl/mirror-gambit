import { describe, expect, it } from 'vitest'
import { parseHash } from '../app/routes'
import { sessionFor } from './sessions'

const noPuzzle = { active: false, choice: null }

describe('sessionFor', () => {
  it('gives the free game to the board and review screens', () => {
    expect(sessionFor('board', noPuzzle)).toBe('free')
    expect(sessionFor('review', { active: true, choice: 'forks' as const })).toBe('free')
  })

  it('lets an opening trap puzzle take over the openings screen only while it runs', () => {
    expect(sessionFor('openings', noPuzzle)).toBe('trainer')
    expect(sessionFor('openings', { active: true, choice: 'custom' as const })).toBe('puzzle')
    // A regular puzzle set left running on the puzzles screen does not take over the openings screen.
    expect(sessionFor('openings', { active: true, choice: 'forks' as const })).toBe('trainer')
  })

  it('maps practice screens to their own sessions and pages without a board to none', () => {
    expect(sessionFor('play', noPuzzle)).toBe('play')
    expect(sessionFor('repertoire', noPuzzle)).toBe('rep')
    expect(sessionFor('courses', noPuzzle)).toBe('course')
    expect(sessionFor('puzzles', noPuzzle)).toBe('puzzle')
    expect(sessionFor('cards', noPuzzle)).toBe('srs')
    expect(sessionFor('progress', noPuzzle)).toBeNull()
    expect(sessionFor('settings', noPuzzle)).toBeNull()
  })
})

describe('parseHash', () => {
  it('reads known routes and falls back to the board', () => {
    expect(parseHash('#/puzzles')).toBe('puzzles')
    expect(parseHash('#cards')).toBe('cards')
    expect(parseHash('#/review/12')).toBe('review')
    expect(parseHash('')).toBe('board')
    expect(parseHash('#/nope')).toBe('board')
  })
})
