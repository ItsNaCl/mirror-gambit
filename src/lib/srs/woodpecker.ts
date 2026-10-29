import type { Outcome } from '../practice/practice'
import type { SrsCard } from './srs'

/**
 * Woodpecker cycles: one fixed set of the student's own mistakes, solved from start to finish
 * several times, each pass faster than the last. The set does not change between cycles; that
 * is the point, the patterns are meant to become automatic.
 */

export const WOODPECKER_SIZE = 30
export const WOODPECKER_MIN = 8
/** The method's usual run: four passes of the same set. */
export const WOODPECKER_CYCLES = 4

export interface WoodpeckerCycle {
  startedAt: string
  finishedAt: string | null
  /** Card id to the outcome of the solve in this cycle. */
  results: Record<string, Outcome>
  /** Seconds spent solving, summed over the sittings. */
  seconds: number
}

export interface WoodpeckerSet {
  id: string
  createdAt: string
  cardIds: string[]
  cycles: WoodpeckerCycle[]
}

/** Builds the set from the student's own mistakes, newest first. Null when there are too few. */
export function buildWoodpeckerSet(cards: SrsCard[], nowIso: string = new Date().toISOString(), size = WOODPECKER_SIZE): WoodpeckerSet | null {
  const own = cards.filter((c) => c.source === 'review' || c.source === 'alert').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  if (own.length < WOODPECKER_MIN) return null
  return { id: `wp-${Date.parse(nowIso).toString(36)}`, createdAt: nowIso, cardIds: own.slice(0, size).map((c) => c.id), cycles: [] }
}

const OUTCOMES = new Set<Outcome>(['clean', 'assisted', 'failed'])

/** An older or damaged stored set is read field by field; nothing usable gives null. */
export function normaliseWoodpecker(raw: unknown): WoodpeckerSet | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<WoodpeckerSet>
  if (!Array.isArray(r.cardIds) || typeof r.id !== 'string') return null
  const cardIds = r.cardIds.filter((x): x is string => typeof x === 'string')
  if (cardIds.length === 0) return null
  const cycles: WoodpeckerCycle[] = []
  for (const c of Array.isArray(r.cycles) ? r.cycles : []) {
    if (!c || typeof c !== 'object') continue
    const cc = c as Partial<WoodpeckerCycle>
    const results: Record<string, Outcome> = {}
    if (cc.results && typeof cc.results === 'object')
      for (const [id, o] of Object.entries(cc.results as Record<string, unknown>)) if (typeof o === 'string' && OUTCOMES.has(o as Outcome)) results[id] = o as Outcome
    cycles.push({
      startedAt: typeof cc.startedAt === 'string' ? cc.startedAt : new Date(0).toISOString(),
      finishedAt: typeof cc.finishedAt === 'string' ? cc.finishedAt : null,
      results,
      seconds: Math.max(0, Number(cc.seconds) || 0),
    })
  }
  return { id: r.id, createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(), cardIds, cycles }
}

/** Cards of the set that still exist, in set order. Deleted cards simply drop out. */
export function setCards(set: WoodpeckerSet, cards: SrsCard[]): SrsCard[] {
  const byId = new Map(cards.map((c) => [c.id, c]))
  return set.cardIds.map((id) => byId.get(id)).filter((c): c is SrsCard => !!c)
}

export function currentCycle(set: WoodpeckerSet): WoodpeckerCycle | null {
  const last = set.cycles[set.cycles.length - 1]
  return last && !last.finishedAt ? last : null
}

/** Opens the next pass. A pass still running is kept. */
export function startCycle(set: WoodpeckerSet, nowIso: string = new Date().toISOString()): WoodpeckerSet {
  if (currentCycle(set)) return set
  return { ...set, cycles: [...set.cycles, { startedAt: nowIso, finishedAt: null, results: {}, seconds: 0 }] }
}

/** The cards of the current pass not yet solved, in set order. */
export function remaining(set: WoodpeckerSet, cards: SrsCard[]): string[] {
  const cycle = currentCycle(set)
  if (!cycle) return []
  return setCards(set, cards)
    .map((c) => c.id)
    .filter((id) => !cycle.results[id])
}

/** Records one solve in the current pass and closes the pass when the set is done. */
export function recordWoodpecker(set: WoodpeckerSet, cards: SrsCard[], cardId: string, outcome: Outcome, seconds: number, nowIso: string = new Date().toISOString()): WoodpeckerSet {
  const cycle = currentCycle(set)
  if (!cycle || !set.cardIds.includes(cardId)) return set
  const results = { ...cycle.results, [cardId]: outcome }
  const left = setCards(set, cards).filter((c) => !results[c.id]).length
  const updated: WoodpeckerCycle = { ...cycle, results, seconds: cycle.seconds + Math.max(0, seconds), finishedAt: left === 0 ? nowIso : null }
  return { ...set, cycles: [...set.cycles.slice(0, -1), updated] }
}

export interface CycleSummary {
  cycle: number
  clean: number
  assisted: number
  failed: number
  seconds: number
  finished: boolean
}

export function summariseCycles(set: WoodpeckerSet): CycleSummary[] {
  return set.cycles.map((c, i) => {
    const outcomes = Object.values(c.results)
    return {
      cycle: i + 1,
      clean: outcomes.filter((o) => o === 'clean').length,
      assisted: outcomes.filter((o) => o === 'assisted').length,
      failed: outcomes.filter((o) => o === 'failed').length,
      seconds: c.seconds,
      finished: c.finishedAt !== null,
    }
  })
}

/** One line on the trend: the last finished pass against the one before it. */
export function cycleTrend(set: WoodpeckerSet): string | null {
  const done = summariseCycles(set).filter((c) => c.finished)
  if (done.length < 2) return null
  const a = done[done.length - 2]
  const b = done[done.length - 1]
  const faster = a.seconds > 0 ? Math.round((1 - b.seconds / a.seconds) * 100) : 0
  const cleaner = b.clean - a.clean
  const speed = faster > 0 ? `${faster}% faster` : faster < 0 ? `${-faster}% slower` : 'the same speed'
  const clean = cleaner > 0 ? `${cleaner} more clean` : cleaner < 0 ? `${-cleaner} fewer clean` : 'as many clean'
  return `Pass ${b.cycle} was ${speed} than pass ${a.cycle}, with ${clean}.`
}
