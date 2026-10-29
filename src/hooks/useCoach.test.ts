// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCoach, type BlockDone, type CoachInput } from './useCoach'

const input = (onBlockDone: (d: BlockDone) => void): CoachInput => ({
  analysed: [],
  dueCards: 0,
  pendingGames: 0,
  puzzleRating: null,
  weeklyHours: 5,
  ratingOverride: 900,
  onBlockDone,
})

describe('useCoach.complete', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T10:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('pays nothing for a block finished within a minute', () => {
    const done = vi.fn()
    const { result } = renderHook(() => useCoach(input(done)))
    act(() => result.current.start())
    act(() => {
      vi.advanceTimersByTime(20_000)
      result.current.complete()
    })
    expect(done).not.toHaveBeenCalled()
    expect(result.current.todayMinutes).toBe(0)
    expect(result.current.active?.index).toBe(1)
  })

  it('credits the real minutes, capped at double the plan', () => {
    const done = vi.fn()
    const { result } = renderHook(() => useCoach(input(done)))
    act(() => result.current.start())
    const planned = result.current.plan.blocks[0].minutes
    act(() => {
      vi.advanceTimersByTime(3 * 60_000)
      result.current.complete()
    })
    expect(done.mock.calls[0][0].minutes).toBe(Math.min(3, planned * 2))
    expect(done.mock.calls[0][0].firstToday).toBe(true)
  })

  it('does not pay a block twice after Redo then Done', () => {
    const done = vi.fn()
    const { result } = renderHook(() => useCoach(input(done)))
    act(() => result.current.start())
    act(() => {
      vi.advanceTimersByTime(4 * 60_000)
      result.current.complete()
    })
    const minutes = result.current.todayMinutes
    expect(done).toHaveBeenCalledTimes(1)
    act(() => result.current.goTo(0))
    act(() => {
      vi.advanceTimersByTime(4 * 60_000)
      result.current.complete()
    })
    expect(done).toHaveBeenCalledTimes(1)
    expect(result.current.todayMinutes).toBe(minutes)
    expect(result.current.active?.index).toBe(1)
  })

  it('pays a redone block that earlier paid nothing', () => {
    const done = vi.fn()
    const { result } = renderHook(() => useCoach(input(done)))
    act(() => result.current.start())
    act(() => result.current.complete())
    expect(done).not.toHaveBeenCalled()
    act(() => result.current.goTo(0))
    act(() => {
      vi.advanceTimersByTime(2 * 60_000)
      result.current.complete()
    })
    expect(done).toHaveBeenCalledTimes(1)
  })
})
