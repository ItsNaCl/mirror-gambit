import { useEffect, useRef, useState } from 'react'
import { scheduleTones, SFX, type SfxName } from '../lib/sound/sfx'
import { useLatest } from './useLatest'
import { useSettings } from './useSettings'

/**
 * Plays the app's sounds through one AudioContext, created on the first sound so browsers
 * that want a user gesture first are satisfied (the first sound always follows a click or a
 * move). Reads the master switch and the volume from Settings on every call, so a change
 * there takes effect at once.
 */
export function useSfx() {
  const { settings } = useSettings()
  const latest = useLatest(settings)
  const ctx = useRef<AudioContext | null>(null)

  // iOS only lets audio start inside a touch or key event. The first one of either creates the
  // context and resumes it there, so the sounds that follow (a move made by the computer, a
  // timer) are not blocked. The listeners remove themselves after that.
  useEffect(() => {
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
      try {
        const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
        if (!Ctor) return
        if (!ctx.current) ctx.current = new Ctor()
        void ctx.current.resume().catch(() => {})
      } catch {
        // No audio device: nothing to unlock.
      }
    }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
    return () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
  }, [])

  useEffect(
    () => () => {
      void ctx.current?.close().catch(() => {})
      ctx.current = null
    },
    [],
  )

  // One function for the life of the hook: it reads the refs when called, so it never needs to change.
  const [play] = useState(() => (name: SfxName) => {
    const { sound, soundVolume: volume } = latest.current
    if (!sound || volume <= 0) return
    try {
      const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
      if (!Ctor) return
      if (!ctx.current) ctx.current = new Ctor()
      const c = ctx.current
      // A tab left in the background suspends the context; resuming is async and harmless when it is already running.
      if (c.state === 'suspended') void c.resume().catch(() => {})
      scheduleTones(c, SFX[name], volume)
    } catch {
      // No audio device, or the browser refused: the app stays silent.
    }
  })
  return play
}

export type PlaySfx = ReturnType<typeof useSfx>
