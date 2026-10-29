import { useEffect, useRef } from 'react'
import { currentMotion } from '../hooks/useSettings'

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  spin: number
  angle: number
}

/** How much confetti each motion level gets. Reduced motion gets none. */
const COUNT = { rich: 140, snappy: 60, reduced: 0 } as const
const DURATION_MS = 2200

/**
 * A full-screen burst each time `fire` changes to a new non-empty key, never on first render,
 * so a screen that opens on a finished day stays quiet. The canvas never takes clicks.
 */
export function Confetti({ fire }: { fire: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const last = useRef<string | null>(null)

  useEffect(() => {
    const canvas = ref.current
    const first = last.current === null
    const changed = fire !== last.current
    last.current = fire
    if (first || !changed || !fire || !canvas) return
    const count = COUNT[currentMotion()]
    const ctx = canvas.getContext('2d')
    if (!count || !ctx) return
    const style = getComputedStyle(document.documentElement)
    const colors = ['--accent', '--reward', '--gold', '--positive'].map((v) => style.getPropertyValue(v).trim() || '#fff')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    const pieces: Piece[] = Array.from({ length: count }, (_, i) => ({
      x: canvas.width * (0.3 + Math.random() * 0.4),
      y: canvas.height * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -6 - Math.random() * 10,
      size: 5 + Math.random() * 5,
      color: colors[i % colors.length],
      spin: (Math.random() - 0.5) * 0.3,
      angle: Math.random() * Math.PI,
    }))
    const t0 = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const k = (now - t0) / DURATION_MS
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (k >= 1) return
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1
      for (const p of pieces) {
        p.vy += 0.35
        p.vx *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.angle += p.spin
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [fire])

  return <canvas ref={ref} className="confetti" aria-hidden="true" />
}
