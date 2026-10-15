import { describe, expect, it } from 'vitest'
import { openings } from './index'
import { openingsWithTrapPuzzles, trapPuzzlesFor } from './trapPuzzles'

describe('opening trap puzzles', () => {
  it('attaches trap puzzles to the matching openings only', () => {
    const withTraps = openingsWithTrapPuzzles()
    expect(withTraps).toEqual(
      expect.arrayContaining([
        'italian',
        'ruy-lopez',
        'scotch',
        'vienna',
        'queens-gambit',
        'sicilian',
        'french',
        'caro-kann',
        'english',
        'nimzo-indian',
        'fried-liver',
        'scholars-mate-defense',
      ]),
    )
    for (const id of withTraps) expect(openings.some((o) => o.id === id), `unknown opening id ${id}`).toBe(true)
    expect(trapPuzzlesFor('slav')).toEqual([])
    expect(trapPuzzlesFor('dutch')).toEqual([])
  })

  it('excludes the mislabelled "Fishing Pole" puzzle from the Ruy Lopez', () => {
    expect(trapPuzzlesFor('ruy-lopez').some((p) => /Fishing Pole Trap setup/.test(p.explanation))).toBe(false)
    expect(trapPuzzlesFor('ruy-lopez').length).toBeGreaterThanOrEqual(2)
  })
})
