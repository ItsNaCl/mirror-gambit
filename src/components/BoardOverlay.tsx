import { useMemo } from 'react'
import { SQUARES, type Square } from 'chess.js'
import { analyzePosition, fileOf, rankOf } from '../lib/coach/features'

export interface OverlayLayers {
  /** Each square tinted by the side that attacks it more often. */
  control: boolean
  /** Pins and skewers as a line from the attacker through the piece in front. */
  lines: boolean
  /** Pieces that can be taken for free (red) or are not defended enough (amber). */
  loose: boolean
}

export const NO_LAYERS: OverlayLayers = { control: false, lines: false, loose: false }

const S = 100 // one square in viewBox units
const RED = 'rgba(239, 107, 126, 0.95)'
const AMBER = 'rgba(229, 169, 59, 0.95)'

/**
 * Teaching layers drawn over the board in one SVG, from the same board reading the coach uses.
 * It never takes clicks, so the pieces still move underneath.
 */
export function BoardOverlay({ fen, orientation, layers }: { fen: string; orientation: 'white' | 'black'; layers: OverlayLayers }) {
  const f = useMemo(() => analyzePosition(fen), [fen])
  if (!layers.control && !layers.lines && !layers.loose) return null

  const flip = orientation === 'black'
  const x = (sq: Square) => (flip ? 7 - fileOf(sq) : fileOf(sq)) * S
  const y = (sq: Square) => (flip ? rankOf(sq) : 7 - rankOf(sq)) * S
  const cx = (sq: Square) => x(sq) + S / 2
  const cy = (sq: Square) => y(sq) + S / 2

  return (
    <svg className="board-overlay" viewBox="0 0 800 800" aria-hidden="true">
      {layers.control &&
        SQUARES.map((sq) => {
          const net = f.control[sq].w - f.control[sq].b
          if (net === 0) return null
          const strength = Math.min(3, Math.abs(net))
          return (
            <rect
              key={sq}
              x={x(sq)}
              y={y(sq)}
              width={S}
              height={S}
              fill={net > 0 ? '#ffffff' : '#09090b'}
              opacity={[0, 0.22, 0.36, 0.5][strength]}
            />
          )
        })}

      {layers.lines &&
        f.lines.map((t) => (
          <g key={`${t.attacker}-${t.front}-${t.back}`}>
            <line x1={cx(t.attacker)} y1={cy(t.attacker)} x2={cx(t.back)} y2={cy(t.back)} stroke={RED} strokeWidth={7} strokeLinecap="round" opacity={0.85} />
            <circle cx={cx(t.front)} cy={cy(t.front)} r={42} fill="none" stroke={RED} strokeWidth={6} />
          </g>
        ))}

      {layers.loose &&
        f.loose.map((l) => (
          <g key={l.square}>
            <line
              x1={cx(l.cheapestAttacker)}
              y1={cy(l.cheapestAttacker)}
              x2={cx(l.square)}
              y2={cy(l.square)}
              stroke={l.kind === 'hanging' ? RED : AMBER}
              strokeWidth={5}
              strokeDasharray="12 10"
              opacity={0.7}
            />
            <circle cx={cx(l.square)} cy={cy(l.square)} r={44} fill="none" stroke={l.kind === 'hanging' ? RED : AMBER} strokeWidth={6} />
          </g>
        ))}
    </svg>
  )
}
