// @vitest-environment jsdom
import { createElement } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CoachHome } from './CoachHome'
import type { CoachApi } from '../hooks/useCoach'
import { bandFor } from '../lib/coach/curriculum'
import type { SessionPlan } from '../lib/coach/planner'

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

describe('CoachHome', () => {
  it('shows the plan, the habit and the exit criteria', () => {
    const coach = api()
    render(createElement(CoachHome, { coach, onOpenBlock: vi.fn(), onNavigate: vi.fn() }))
    expect(screen.getByText(/stop hanging pieces is the job/)).toBeTruthy()
    expect(screen.getByText('Checks, captures and threats.')).toBeTruthy()
    expect(screen.getByText(/Rapid rating: at least/)).toBeTruthy()
    expect(screen.getByText(/play a slow game 60 min/)).toBeTruthy()
    fireEvent.click(screen.getByText('Start the session'))
    expect(coach.start).toHaveBeenCalled()
  })

  it('opens the current block and marks it done', () => {
    const onOpenBlock = vi.fn()
    const coach = api({
      active: { date: '2026-10-29', blocks: plan.blocks, index: 1, startedAt: 0, credited: [5, 0] },
      current: plan.blocks[1],
    })
    render(createElement(CoachHome, { coach, onOpenBlock, onNavigate: vi.fn() }))
    fireEvent.click(screen.getByText('Open'))
    expect(onOpenBlock).toHaveBeenCalledWith(plan.blocks[1])
    fireEvent.click(screen.getByText('Done'))
    expect(coach.complete).toHaveBeenCalled()
    expect(screen.getByText('(5 done)')).toBeTruthy()
  })
})
