import { describe, expect, it, vi } from 'vitest'
import { scheduleTones, SFX, soundForMove, type ToneContext } from './sfx'

function fakeContext() {
  const oscillators: { type: string; freq: number[]; starts: number[]; stops: number[] }[] = []
  const gains: number[][] = []
  const ctx: ToneContext = {
    currentTime: 10,
    destination: {} as AudioNode,
    createOscillator() {
      const rec = { type: 'sine', freq: [] as number[], starts: [] as number[], stops: [] as number[] }
      oscillators.push(rec)
      return {
        set type(t: string) {
          rec.type = t
        },
        frequency: { setValueAtTime: (f: number) => rec.freq.push(f) },
        connect: vi.fn(),
        start: (t: number) => rec.starts.push(t),
        stop: (t: number) => rec.stops.push(t),
      } as unknown as OscillatorNode
    },
    createGain() {
      const values: number[] = []
      gains.push(values)
      return {
        gain: {
          setValueAtTime: (v: number) => values.push(v),
          linearRampToValueAtTime: (v: number) => values.push(v),
          exponentialRampToValueAtTime: (v: number) => values.push(v),
        },
        connect: vi.fn(),
      } as unknown as GainNode
    },
  }
  return { ctx, oscillators, gains }
}

describe('SFX recipes', () => {
  it('give every effect at least one tone with sane values', () => {
    for (const tones of Object.values(SFX)) {
      expect(tones.length).toBeGreaterThan(0)
      for (const t of tones) {
        expect(t.freq).toBeGreaterThan(20)
        expect(t.freq).toBeLessThan(5000)
        expect(t.dur).toBeGreaterThan(0)
        expect(t.gain).toBeGreaterThan(0)
        expect(t.gain).toBeLessThanOrEqual(1)
      }
    }
  })

  it('keeps board sounds short and rewards longer', () => {
    const length = (tones: typeof SFX.move) => Math.max(...tones.map((t) => t.at + t.dur))
    expect(length(SFX.move)).toBeLessThan(0.2)
    expect(length(SFX.capture)).toBeLessThan(0.2)
    expect(length(SFX.levelUp)).toBeGreaterThan(length(SFX.solve))
  })
})

describe('scheduleTones', () => {
  it('starts one oscillator per tone at the right time and scales the gain by the volume', () => {
    const { ctx, oscillators, gains } = fakeContext()
    const end = scheduleTones(ctx, SFX.check, 0.5)
    expect(oscillators).toHaveLength(2)
    expect(oscillators[0].starts).toEqual([10])
    expect(oscillators[1].starts[0]).toBeCloseTo(10.1)
    expect(oscillators[0].freq).toEqual([660])
    // attack target = tone gain * volume
    expect(gains[0][1]).toBeCloseTo(0.3 * 0.5)
    expect(end).toBeCloseTo(0.26)
  })

  it('clamps the volume into 0 to 1', () => {
    const { ctx, gains } = fakeContext()
    scheduleTones(ctx, SFX.move, 4)
    expect(gains[0][1]).toBeCloseTo(0.5)
    const silent = fakeContext()
    scheduleTones(silent.ctx, SFX.move, -1)
    expect(silent.gains[0][1]).toBe(0)
  })
})

describe('soundForMove', () => {
  it('ranks check over capture over a quiet move', () => {
    expect(soundForMove({ san: 'Nf3' })).toBe('move')
    expect(soundForMove({ san: 'Nxe5', captured: 'p' })).toBe('capture')
    expect(soundForMove({ san: 'Bxf7+', captured: 'p' })).toBe('check')
    expect(soundForMove({ san: 'Qh7#' })).toBe('check')
  })
})
