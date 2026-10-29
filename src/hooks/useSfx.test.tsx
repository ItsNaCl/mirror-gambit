// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsProvider } from './useSettings'
import { useSfx } from './useSfx'

describe('useSfx', () => {
  const resume = vi.fn(() => Promise.resolve())
  const created = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    resume.mockClear()
    created.mockClear()
    class FakeContext {
      state = 'suspended'
      resume = resume
      close = () => Promise.resolve()
      constructor() {
        created()
      }
    }
    vi.stubGlobal('AudioContext', FakeContext)
  })
  afterEach(() => vi.unstubAllGlobals())

  const wrapper = ({ children }: { children: ReactNode }) => <SettingsProvider>{children}</SettingsProvider>

  it('creates and resumes the context on the first pointerdown, once', () => {
    renderHook(() => useSfx(), { wrapper })
    expect(created).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('pointerdown'))
    expect(created).toHaveBeenCalledTimes(1)
    expect(resume).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('keydown'))
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('unlocks on a key press too, and stops listening when unmounted', () => {
    const first = renderHook(() => useSfx(), { wrapper })
    first.unmount()
    window.dispatchEvent(new Event('keydown'))
    expect(created).not.toHaveBeenCalled()
    renderHook(() => useSfx(), { wrapper })
    window.dispatchEvent(new Event('keydown'))
    expect(resume).toHaveBeenCalledTimes(1)
  })
})
