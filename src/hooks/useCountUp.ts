import { useEffect, useRef, useState } from 'react'
import { currentMotion } from './useSettings'

/**
 * A number that rolls from its previous value to the new one. Only rich motion animates;
 * snappy and reduced show the target at once.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const [shown, setShown] = useState(target)
  // The value on screen, so a target that changes mid-roll continues from where the number is.
  const current = useRef(target)

  useEffect(() => {
    const start = current.current
    if (start === target || currentMotion() !== 'rich' || typeof requestAnimationFrame === 'undefined') {
      current.current = target
      setShown(target)
      return
    }
    const t0 = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / durationMs)
      const eased = 1 - (1 - k) ** 3
      current.current = Math.round(start + (target - start) * eased)
      setShown(current.current)
      if (k < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])

  return shown
}
