/**
 * Sound effects synthesised with WebAudio, so the app ships no audio files. Each effect is a
 * short list of tones; `scheduleTones` turns them into oscillators on whatever context the
 * hook hands it. The recipes are plain data, so the tests can check them without a browser.
 */

export type SfxName = 'move' | 'capture' | 'check' | 'solve' | 'levelUp' | 'streak'

export interface Tone {
  /** Hz. */
  freq: number
  /** Seconds after the effect starts. */
  at: number
  /** Seconds the tone lasts, including its fade. */
  dur: number
  /** 0 to 1, before the master volume. */
  gain: number
  type: OscillatorType
}

const tone = (freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine'): Tone => ({ freq, at, dur, gain, type })

/** Quick and quiet for the board, brighter and longer for rewards. */
export const SFX: Record<SfxName, Tone[]> = {
  // A soft knock: a low sine with a short click of noise-like triangle on top.
  move: [tone(180, 0, 0.08, 0.5, 'triangle'), tone(90, 0, 0.1, 0.35)],
  // A harder knock with a lower body.
  capture: [tone(140, 0, 0.1, 0.6, 'square'), tone(70, 0, 0.14, 0.45)],
  // Two rising notes, so a check sounds like a question.
  check: [tone(660, 0, 0.12, 0.3), tone(880, 0.1, 0.16, 0.3)],
  // A major arpeggio: C E G.
  solve: [tone(523.25, 0, 0.14, 0.3), tone(659.25, 0.1, 0.14, 0.3), tone(783.99, 0.2, 0.26, 0.3)],
  // The arpeggio again with the octave on top and a long tail.
  levelUp: [tone(523.25, 0, 0.16, 0.3), tone(659.25, 0.12, 0.16, 0.3), tone(783.99, 0.24, 0.16, 0.3), tone(1046.5, 0.36, 0.6, 0.35)],
  // Two quick notes a fifth apart.
  streak: [tone(587.33, 0, 0.1, 0.3), tone(880, 0.1, 0.22, 0.3)],
}

/** The part of AudioContext the scheduler uses, so a test can pass a stand-in. */
export interface ToneContext {
  currentTime: number
  destination: AudioNode
  createOscillator(): OscillatorNode
  createGain(): GainNode
}

/** Plays one effect at `volume` (0 to 1). Returns when the last tone ends, in seconds from now. */
export function scheduleTones(ctx: ToneContext, tones: Tone[], volume: number): number {
  const v = Math.max(0, Math.min(1, volume))
  let end = 0
  for (const t of tones) {
    const start = ctx.currentTime + t.at
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = t.type
    osc.frequency.setValueAtTime(t.freq, start)
    // A short attack and an exponential fade keep the tones from clicking.
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(t.gain * v, start + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + t.dur + 0.02)
    end = Math.max(end, t.at + t.dur)
  }
  return end
}

/** Which board sound a move gets: check beats capture, capture beats a quiet move. */
export function soundForMove(move: { san: string; captured?: string | null }): SfxName {
  if (/[+#]$/.test(move.san)) return 'check'
  if (move.captured) return 'capture'
  return 'move'
}
