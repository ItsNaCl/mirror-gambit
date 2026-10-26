import type { CoachModel } from '../desktop'

/** Claude prices in US dollars per million tokens (Anthropic's list prices, October 2026). */
export const PRICES: Record<CoachModel, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
}

export const MODEL_LABEL: Record<CoachModel, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5 (deepest)',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5 (balanced)',
  'claude-haiku-5-5': 'Claude Haiku 5.5 (cheapest)',
}

export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** Estimated cost of one answer. Unknown models (a fallback answered) are priced as Opus. */
export function costOf(model: string, u: TokenUsage): number {
  const p = PRICES[model as CoachModel] ?? PRICES['claude-opus-5-5']
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1_000_000
}

export interface MonthUsage {
  /** "2026-10" */
  month: string
  questions: number
  dollars: number
}

export function monthOf(ms: number = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 7)
}

/** Adds one answer to the running total, starting a new total when the month changes. */
export function addUsage(prev: MonthUsage | null, model: string, u: TokenUsage, nowMs: number = Date.now()): MonthUsage {
  const month = monthOf(nowMs)
  const base = prev && prev.month === month ? prev : { month, questions: 0, dollars: 0 }
  return { month, questions: base.questions + 1, dollars: base.dollars + costOf(model, u) }
}

/** "$0.02", "<$0.01" */
export function formatDollars(d: number): string {
  if (d > 0 && d < 0.01) return '<$0.01'
  return `$${d.toFixed(2)}`
}
