// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PROGRESSION_KEY, useProgression } from './useProgression'

describe('useProgression', () => {
  beforeEach(() => localStorage.clear())

  it('awards, saves and reports the gain', () => {
    const { result } = renderHook(() => useProgression())
    expect(result.current.rank.id).toBe('pawn')
    act(() => {
      result.current.award({ type: 'block', minutes: 10 }, 1)
    })
    expect(result.current.xp).toBe(20)
    expect(result.current.xpToday).toBe(20)
    expect(result.current.lastGain?.xp).toBe(20)
    expect(result.current.lastGain?.badges.map((b) => b.id)).toEqual(['first-session'])
    expect(result.current.badges.map((b) => b.id)).toEqual(['first-session'])
    expect(JSON.parse(localStorage.getItem(PROGRESSION_KEY)!).xp).toBe(20)
  })

  it('works from the latest value when awarded twice in one tick', () => {
    const { result } = renderHook(() => useProgression())
    act(() => {
      result.current.award({ type: 'review' })
      result.current.award({ type: 'review' })
    })
    expect(result.current.xp).toBe(120)
    expect(result.current.progression.reviews).toBe(2)
  })

  it('reloads what it saved and flags a level up', () => {
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify({ xp: 790, blocks: '3' }))
    const { result } = renderHook(() => useProgression())
    expect(result.current.progression.blocks).toBe(3)
    expect(result.current.levelUp).toBeNull()
    act(() => {
      result.current.award({ type: 'review' })
    })
    expect(result.current.rank.id).toBe('knight')
    expect(result.current.levelUp?.id).toBe('knight')
    expect(result.current.next?.id).toBe('bishop')
    act(() => result.current.dismissLevelUp())
    expect(result.current.levelUp).toBeNull()
  })

  it('pays a promotion only when the band goes up from a known one', () => {
    const { result } = renderHook(() => useProgression())
    act(() => result.current.trackBand('b1'))
    expect(result.current.xp).toBe(0)
    act(() => result.current.trackBand('b1'))
    expect(result.current.xp).toBe(0)
    act(() => result.current.trackBand('b2'))
    expect(result.current.xp).toBe(500)
    expect(result.current.progression.promotions).toBe(1)
    act(() => result.current.trackBand('b1'))
    expect(result.current.xp).toBe(500)
    act(() => result.current.trackBand('b2'))
    expect(result.current.xp).toBe(500)
    act(() => result.current.trackBand('b3'))
    expect(result.current.xp).toBe(1000)
  })
})
