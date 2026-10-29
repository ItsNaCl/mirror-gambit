import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { newRating, parseRated, pickRated, PROVISIONAL_GAMES, toPuzzle, updateRating, type PuzzleRating, type RatedEntry, type RatedPuzzle, type ThemeFilter } from '../lib/puzzles/rated'
import type { Outcome } from '../lib/practice/practice'
import * as kv from '../lib/store/kv'
import type { PuzzlesApi } from './usePuzzles'

const RATING_KEY = 'mirror-gambit.puzzle-rating.v1'
const SEEN_KEY = 'mirror-gambit.puzzle-rated-seen.v1'
const MAX_SEEN = 2000

export interface RatedResult {
  outcome: Outcome
  /** The puzzle's rating, not the student's. */
  rating: number
  delta: number
}

export interface RatedOptions {
  /** Called once per puzzle when it ends. */
  onResult?: (result: RatedResult) => void
}

/**
 * Rated puzzles: the pool loads the first time it is needed (it is a few hundred kilobytes), each
 * puzzle is picked near the student's rating, and the result updates the rating once the puzzle
 * ends. Solving itself runs through the normal puzzle hook.
 */
export function useRatedPuzzles(puzzles: PuzzlesApi, options: RatedOptions = {}) {
  // A ref, so the scoring effect does not depend on the callback's identity.
  const onResult = useRef(options.onResult)
  useEffect(() => {
    onResult.current = options.onResult
  }, [options.onResult])
  const [pool, setPool] = useState<RatedPuzzle[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [rating, setRating] = useState<PuzzleRating>(() => kv.readJson(RATING_KEY, newRating()))
  const [seen, setSeen] = useState<string[]>(() => kv.readJson(SEEN_KEY, []))
  const [theme, setTheme] = useState<ThemeFilter>('any')
  const [current, setCurrent] = useState<RatedPuzzle | null>(null)
  const [lastDelta, setLastDelta] = useState<number | null>(null)
  const scored = useRef<string | null>(null)

  const ensurePool = useCallback(async (): Promise<RatedPuzzle[]> => {
    if (pool) return pool
    setLoading(true)
    try {
      const mod = await import('../data/puzzles/rated.json')
      const parsed = parseRated(mod.default as RatedEntry[])
      setPool(parsed)
      return parsed
    } finally {
      setLoading(false)
    }
  }, [pool])

  const next = useCallback(
    async (withTheme: ThemeFilter = theme) => {
      const all = await ensurePool()
      const p = pickRated(all, rating.rating, new Set(seen), withTheme)
      if (!p) return
      setTheme(withTheme)
      setCurrent(p)
      setLastDelta(null)
      scored.current = null
      puzzles.startRated(toPuzzle(p))
    },
    [ensurePool, rating.rating, seen, theme, puzzles],
  )

  const active = puzzles.active && puzzles.choice === 'rated'

  // Score the puzzle once it ends: clean 1, solved with retries or hints 0.5, gave up 0.
  const finished = active && current && puzzles.puzzle?.id === `rated-${current.id}` && (puzzles.status === 'solved' || puzzles.status === 'revealing')
  useEffect(() => {
    if (!finished || !current || scored.current === current.id) return
    scored.current = current.id
    const outcome: Outcome = puzzles.status === 'revealing' ? 'failed' : puzzles.outcome === 'clean' ? 'clean' : 'assisted'
    const score = outcome === 'failed' ? 0 : outcome === 'clean' ? 1 : 0.5
    const { next: updated, delta } = updateRating(rating, current.rating, score)
    setRating(updated)
    kv.setItem(RATING_KEY, JSON.stringify(updated))
    const nextSeen = [...seen, current.id].slice(-MAX_SEEN)
    setSeen(nextSeen)
    kv.setItem(SEEN_KEY, JSON.stringify(nextSeen))
    setLastDelta(delta)
    onResult.current?.({ outcome, rating: current.rating, delta })
  }, [finished, current, puzzles.status, puzzles.outcome, rating, seen])

  const recent = useMemo(() => rating.history.slice(-30), [rating.history])

  return {
    rating: rating.rating,
    games: rating.games,
    provisional: rating.games < PROVISIONAL_GAMES,
    history: recent,
    theme,
    setTheme,
    current,
    lastDelta,
    loading,
    active,
    next,
  }
}

export type RatedPuzzlesApi = ReturnType<typeof useRatedPuzzles>
