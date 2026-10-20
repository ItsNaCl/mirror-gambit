import type { CSSProperties } from 'react'
import { CLASS_SYMBOL, type MoveClass } from '../lib/analysis/classify'

const COLOR: Record<MoveClass, string> = {
  best: '#58a6ff',
  great: '#7ad0ff',
  good: '#4fc48a',
  inaccuracy: '#f2b942',
  mistake: '#f09a3e',
  blunder: '#ef6b6b',
}

/**
 * Square style that marks the destination of a reviewed move: a tint and a round
 * badge with the class symbol in the top-right corner (like chess.com's review).
 */
export function moveBadgeStyle(cls: MoveClass): CSSProperties {
  const color = COLOR[cls]
  const symbol = CLASS_SYMBOL[cls].replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="80" cy="20" r="18" fill="${color}" stroke="white" stroke-width="3"/><text x="80" y="27" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="white" text-anchor="middle">${symbol}</text></svg>`
  return {
    backgroundColor: `${color}55`,
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: '100% 100%',
  }
}
