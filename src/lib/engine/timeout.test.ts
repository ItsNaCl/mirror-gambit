import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withTimeout } from './timeout'

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('passes a result through', async () => {
    await expect(withTimeout(Promise.resolve(3), 1000)).resolves.toBe(3)
  })

  it('rejects when the promise never settles', async () => {
    const p = withTimeout(new Promise<number>(() => {}), 1000)
    const caught = p.catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(1000)
    await expect(caught).resolves.toMatch(/did not answer/)
  })
})
