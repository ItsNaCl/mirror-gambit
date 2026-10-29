// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BadgesPanel } from './BadgesPanel'
import { RankCard } from '../app/Shell'
import type { ProgressionApi } from '../hooks/useProgression'
import { EMPTY_PROGRESSION, RANKS } from '../lib/game/xp'

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

afterEach(cleanup)

describe('BadgesPanel', () => {
  it('shows the rank, the XP to the next one and every badge with its progress', () => {
    const p = progression({
      progression: { ...EMPTY_PROGRESSION, xp: 300, cleanSolves: 4, badges: { 'first-session': '2026-10-29T10:00:00Z' } },
      badges: [{ id: 'first-session', label: 'First session', how: 'Finish a session block', progress: () => ({ value: 1, target: 1 }), earnedAt: '2026-10-29T10:00:00Z' }],
      xp: 300,
      progress: 300 / 800,
    })
    render(createElement(BadgesPanel, { progression: p, streak: 2 }))
    expect(screen.getAllByText('Pawn').length).toBeGreaterThan(0)
    expect(screen.getByText(/XP to Knight/)).toBeTruthy()
    expect(screen.getByText('500')).toBeTruthy()
    expect(screen.getByText('1 of 10')).toBeTruthy()
    expect(screen.getByText('First session')).toBeTruthy()
    expect(screen.getByText(/^Earned \d/)).toBeTruthy()
    // Clean ten and clean hundred both stand at 4 clean solves.
    expect(screen.getAllByText('4')).toHaveLength(2)
    expect(screen.getAllByText('Not yet').length).toBeGreaterThan(0)
  })

  it('tells the top rank there is nothing above it', () => {
    const top = RANKS[RANKS.length - 1]
    const p = progression({ progression: { ...EMPTY_PROGRESSION, xp: top.xp }, xp: top.xp, rank: top, next: null, progress: 1 })
    render(createElement(BadgesPanel, { progression: p, streak: 0 }))
    expect(screen.getByText(/The top rank/)).toBeTruthy()
  })
})

describe('RankCard', () => {
  it('names the rank and its place and opens the badges screen', () => {
    const onOpen = vi.fn()
    render(createElement(RankCard, { rank: { rank: RANKS[1], next: RANKS[2], progress: 0.5, xp: 1500 }, current: false, onOpen }))
    expect(screen.getByText('Knight')).toBeTruthy()
    expect(screen.getByText('Rank 2 of 6')).toBeTruthy()
    expect(screen.getByText('1500 / 2200 XP')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalled()
  })
})
