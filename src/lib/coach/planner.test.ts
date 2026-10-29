import { describe, expect, it } from 'vitest'
import type { AnalysedGame, TaggedMistake } from '../games/profile'
import { BANDS, bandFor, nextBand } from './curriculum'
import { buildMetrics, describeMetrics, worstPhase } from './metrics'
import { buildPlan, exitProgress, sessionMinutes, streak, weekOf, type PlannerInput, type SessionRecord } from './planner'

const mistake = (over: Partial<TaggedMistake>): TaggedMistake => ({
  ply: 20,
  san: 'Nf3',
  cls: 'blunder',
  lossCp: 350,
  better: 'Bb5',
  phase: 'middlegame',
  tags: ['hung-piece'],
  ...over,
})

function game(i: number, over: { result?: '1-0' | '0-1' | '1/2-1/2'; timeClass?: string; rating?: number; mistakes?: TaggedMistake[] } = {}): AnalysedGame {
  return {
    game: {
      id: `chesscom:${i}`,
      source: 'chesscom',
      url: '',
      date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
      white: 'me',
      black: 'them',
      userColor: 'w',
      result: over.result ?? '0-1',
      timeClass: over.timeClass ?? 'blitz',
      sans: 'e4 e5',
      userRating: over.rating,
    },
    analysis: { depth: 12, accuracy: 60, moves: 30, mistakes: over.mistakes ?? [mistake({})] },
  }
}

describe('curriculum', () => {
  it('maps ratings to bands with the top band open ended', () => {
    expect(bandFor(null).id).toBe('b1')
    expect(bandFor(999).id).toBe('b1')
    expect(bandFor(1000).id).toBe('b2')
    expect(bandFor(1599).id).toBe('b3')
    expect(bandFor(2300).id).toBe('b4')
    expect(nextBand(BANDS[3])).toBeNull()
  })

  it('splits sum to one in every band', () => {
    for (const b of BANDS) expect(Object.values(b.split).reduce((s, x) => s + x, 0)).toBeCloseTo(1)
  })
})

describe('metrics', () => {
  it('counts hung pieces per game and repeats over the last ten games', () => {
    const games = Array.from({ length: 12 }, (_, i) => game(i))
    const m = buildMetrics(games)!
    expect(m.games).toBe(12)
    expect(m.hungPerGame).toBe(1)
    expect(m.repeats[0]).toMatchObject({ tag: 'hung-piece', count: 10 })
    expect(m.slowShare).toBe(0)
    expect(describeMetrics(m)[0]).toMatch(/hanging/)
  })

  it('compares hung pieces in the newer half of the games with the older half', () => {
    const games = [...Array.from({ length: 3 }, (_, i) => game(i)), ...Array.from({ length: 3 }, (_, i) => game(10 + i, { mistakes: [] }))]
    expect(buildMetrics(games)!.hungTrend).toBe(-1)
    expect(buildMetrics(games.slice(0, 5))!.hungTrend).toBeNull()
  })

  it('takes the rating from the newest rapid game first', () => {
    const games = [game(5, { timeClass: 'blitz', rating: 900 }), game(2, { timeClass: 'rapid', rating: 750 })]
    expect(buildMetrics(games)).toMatchObject({ rating: 750, ratingClass: 'rapid' })
  })

  it('finds the phase lost games turn in', () => {
    const games = [
      game(1, { mistakes: [mistake({ phase: 'endgame', lossCp: 900 }), mistake({ phase: 'opening', lossCp: 100 })] }),
      game(2, { mistakes: [mistake({ phase: 'endgame' })] }),
      game(3, { result: '1-0', mistakes: [mistake({ phase: 'opening' })] }),
    ]
    const m = buildMetrics(games)!
    expect(m.lossPhase).toEqual({ opening: 0, middlegame: 0, endgame: 2 })
    expect(worstPhase(m)).toBe('endgame')
  })

  it('returns null with no games', () => {
    expect(buildMetrics([])).toBeNull()
  })
})

const base: PlannerInput = {
  metrics: null,
  ratingOverride: null,
  dueCards: 0,
  pendingGames: 0,
  puzzleRating: null,
  weeklyMinutes: 420,
  budget: null,
  log: [],
  today: '2026-10-29',
}

describe('planner', () => {
  it('builds a Monday to Sunday week', () => {
    expect(weekOf('2026-10-29')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
  })

  it('counts a streak through today or yesterday', () => {
    const log: SessionRecord[] = [
      { date: '2026-10-28', blocks: [{ activity: 'tactics', minutes: 10 }] },
      { date: '2026-10-27', blocks: [{ activity: 'tactics', minutes: 10 }] },
      { date: '2026-10-25', blocks: [{ activity: 'tactics', minutes: 10 }] },
    ]
    expect(streak(log, '2026-10-29')).toBe(2)
    expect(streak(log, '2026-10-30')).toBe(0)
  })

  it('sizes the session from the weekly hours and respects a budget', () => {
    expect(sessionMinutes(base)).toBe(60)
    expect(sessionMinutes({ ...base, weeklyMinutes: 150 })).toBe(30)
    expect(sessionMinutes({ ...base, budget: 25 })).toBe(25)
    expect(sessionMinutes({ ...base, budget: 5 })).toBe(20)
  })

  it('shortens the session after a missed day', () => {
    const log: SessionRecord[] = [{ date: '2026-10-20', blocks: [{ activity: 'tactics', minutes: 10 }] }]
    expect(sessionMinutes({ ...base, log })).toBe(30)
  })

  it('puts cards first, then review, then a slow game in a long session', () => {
    const plan = buildPlan({ ...base, dueCards: 8, pendingGames: 2 })
    expect(plan.blocks.map((b) => b.activity).slice(0, 3)).toEqual(['cards', 'review', 'play'])
    expect(plan.blocks[0].minutes).toBe(5)
    expect(plan.minutes).toBe(60)
    expect(plan.band.id).toBe('b1')
  })

  it('aims tactics at the repeat offender and picks the matching habit', () => {
    const games = Array.from({ length: 12 }, (_, i) => game(i, { rating: 780, mistakes: [mistake({ tags: ['missed-fork'] })] }))
    const plan = buildPlan({ ...base, metrics: buildMetrics(games), budget: 30 })
    const tactics = plan.blocks.find((b) => b.activity === 'tactics')!
    expect(tactics.theme).toBe('fork')
    expect(tactics.reason).toMatch(/fork/i)
    expect(plan.blocks.some((b) => b.activity === 'play')).toBe(false)
    expect(plan.notes[0]).toMatch(/780/)
  })

  it('does not schedule what the week already covered', () => {
    const log: SessionRecord[] = [
      { date: '2026-10-28', blocks: [{ activity: 'play', minutes: 120 }, { activity: 'endgames', minutes: 60 }, { activity: 'openings', minutes: 60 }] },
    ]
    const plan = buildPlan({ ...base, log })
    const kinds = plan.blocks.map((b) => b.activity)
    expect(kinds).not.toContain('play')
    expect(kinds).not.toContain('endgames')
    expect(kinds).toContain('tactics')
    expect(plan.minutes).toBe(60)
  })

  it('is deterministic', () => {
    const input = { ...base, dueCards: 3, metrics: buildMetrics([game(1, { rating: 700 })]) }
    expect(buildPlan(input)).toEqual(buildPlan(input))
  })

  it('reports exit progress against real numbers', () => {
    const m = buildMetrics([game(1, { rating: 1050, timeClass: 'rapid', mistakes: [] })])
    const rows = exitProgress(bandFor(1050), m, null, 1250)
    expect(rows.find((r) => r.id === 'rating')).toMatchObject({ value: 1050, met: false })
    expect(rows.find((r) => r.id === 'hung')).toMatchObject({ value: 0, met: true })
    expect(rows.find((r) => r.id === 'puzzles')).toMatchObject({ value: 1250, met: false })
  })
})
