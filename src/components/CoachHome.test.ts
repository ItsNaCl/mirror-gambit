// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoachHome } from './CoachHome'
import type { CoachApi } from '../hooks/useCoach'
import type { ProgressionApi } from '../hooks/useProgression'
import { bandFor } from '../lib/coach/curriculum'
import type { SessionPlan } from '../lib/coach/planner'
import { EMPTY_PROGRESSION, RANKS } from '../lib/game/xp'
import { LevelUp } from './LevelUp'

const plan: SessionPlan = {
  date: '2026-10-29',
  band: bandFor(780),
  minutes: 30,
  blocks: [
    { activity: 'cards', minutes: 5, reason: '6 of your own mistakes are due.' },
    { activity: 'tactics', minutes: 25, reason: 'Rated puzzles on the pattern you keep missing: missed a fork, 4 times lately.', theme: 'fork' },
  ],
  habit: { id: 'cct', text: 'Checks, captures and threats.' },
  notes: ['Rated about 780: stop hanging pieces is the job until 1000.'],
  weekRemaining: { play: 60 },
}

function api(over: Partial<CoachApi> = {}): CoachApi {
  return {
    plan,
    metrics: null,
    active: null,
    current: null,
    done: false,
    streak: 3,
    todayMinutes: 0,
    exit: [{ id: 'rating', label: 'Rapid rating', target: 1000, direction: 'atLeast', value: 780, met: false }],
    budget: null,
    setBudget: vi.fn(),
    start: vi.fn(),
    goTo: vi.fn(),
    complete: vi.fn(),
    skip: vi.fn(),
    finish: vi.fn(),
    log: [],
    ...over,
  }
}

function progression(over: Partial<ProgressionApi> = {}): ProgressionApi {
  return {
    progression: EMPTY_PROGRESSION,
    xp: 0,
    rank: RANKS[0],
    next: RANKS[1],
    progress: 0,
    badges: [],
    xpToday: 0,
    lastGain: null,
    levelUp: null,
    dismissLevelUp: vi.fn(),
    award: vi.fn(),
    trackBand: vi.fn(),
    ...over,
  }
}

// Vitest does not clean the DOM between tests on its own, and the quest buttons repeat across them.
afterEach(cleanup)

describe('CoachHome', () => {
  it('shows the plan, the habit, the XP per quest and the exit criteria', () => {
    const coach = api()
    render(createElement(CoachHome, { coach, progression: progression(), onOpenBlock: vi.fn(), onNavigate: vi.fn() }))
    expect(screen.getByText(/stop hanging pieces is the job/)).toBeTruthy()
    expect(screen.getByText('Checks, captures and threats.')).toBeTruthy()
    expect(screen.getByText(/Rapid rating: at least/)).toBeTruthy()
    expect(screen.getByText(/play a slow game 60 min/)).toBeTruthy()
    expect(screen.getByText('+20 XP')).toBeTruthy()
    expect(screen.getByText('+50 XP')).toBeTruthy()
    expect(screen.getByText(/None yet/)).toBeTruthy()
    fireEvent.click(screen.getByText('Start the session'))
    expect(coach.start).toHaveBeenCalled()
  })

  it('opens the current quest, marks it done, and shows what a done quest paid', () => {
    const onOpenBlock = vi.fn()
    const coach = api({
      active: { date: '2026-10-29', blocks: plan.blocks, index: 1, startedAt: 0, credited: [8, 0] },
      current: plan.blocks[1],
    })
    render(createElement(CoachHome, { coach, progression: progression(), onOpenBlock, onNavigate: vi.fn() }))
    fireEvent.click(screen.getByText('Open'))
    expect(onOpenBlock).toHaveBeenCalledWith(plan.blocks[1])
    fireEvent.click(screen.getByText('Done'))
    expect(coach.complete).toHaveBeenCalled()
    expect(screen.getByText('(8 done)')).toBeTruthy()
    // 8 minutes credited pays the 20 XP floor; the planned 5 minutes is not what was paid.
    expect(screen.getByText('+20 XP')).toBeTruthy()
    expect(screen.getByText('+50 XP')).toBeTruthy()
  })

  it('marks a skipped quest instead of showing XP for it', () => {
    const coach = api({
      active: { date: '2026-10-29', blocks: plan.blocks, index: 1, startedAt: 0, credited: [0, 0] },
      current: plan.blocks[1],
    })
    render(createElement(CoachHome, { coach, progression: progression(), onOpenBlock: vi.fn(), onNavigate: vi.fn() }))
    expect(screen.getByText('Skipped')).toBeTruthy()
    expect(screen.queryByText('+20 XP')).toBeNull()
  })

  it('shows earned badges', () => {
    const p = progression({
      badges: [{ id: 'first-session', label: 'First session', how: 'Finish a session block', earned: () => true, earnedAt: '2026-10-29T10:00:00Z' }],
    })
    render(createElement(CoachHome, { coach: api(), progression: p, onOpenBlock: vi.fn(), onNavigate: vi.fn() }))
    expect(screen.getByText('First session')).toBeTruthy()
  })
})

describe('LevelUp', () => {
  it('names the new rank and can be dismissed', () => {
    const onDismiss = vi.fn()
    render(createElement(LevelUp, { rank: RANKS[1], onDismiss }))
    expect(screen.getByText('Knight')).toBeTruthy()
    expect(screen.getByText('Rank 2 of 6')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalled()
  })
})
