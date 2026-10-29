import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildMetrics } from '../lib/coach/metrics'
import { buildPlan, dayKey, exitProgress, streak, type SessionBlock, type SessionPlan, type SessionRecord } from '../lib/coach/planner'
import type { AnalysedGame } from '../lib/games/profile'
import * as kv from '../lib/store/kv'

export const SESSIONS_KEY = 'mirror-gambit.sessions.v1'
const ACTIVE_KEY = 'mirror-gambit.coach-session.v1'
const MAX_LOG = 400

function load<T>(key: string, fallback: T): T {
  try {
    const raw = kv.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** A session in progress: which block is running and when it started, kept across reloads. */
export interface ActiveSession {
  date: string
  blocks: SessionBlock[]
  /** Index of the current block, or blocks.length when every block is done. */
  index: number
  startedAt: number
  /** Minutes credited per block so far (skipped blocks get 0). */
  credited: number[]
}

export interface CoachInput {
  analysed: AnalysedGame[]
  dueCards: number
  pendingGames: number
  puzzleRating: number | null
  weeklyHours: number
  ratingOverride: number | null
}

/** The coach: today's plan, the session in progress, the log and the streak. */
export function useCoach(input: CoachInput) {
  const { analysed, dueCards, pendingGames, puzzleRating, weeklyHours, ratingOverride } = input
  const [log, setLog] = useState<SessionRecord[]>(() => load(SESSIONS_KEY, []))
  const [active, setActive] = useState<ActiveSession | null>(() => load(ACTIVE_KEY, null))
  const [budget, setBudget] = useState<number | null>(null)
  const [today, setToday] = useState(() => dayKey(new Date()))

  // The day can roll over while the app is open.
  useEffect(() => {
    const t = setInterval(() => setToday(dayKey(new Date())), 60_000)
    return () => clearInterval(t)
  }, [])

  const metrics = useMemo(() => buildMetrics(analysed), [analysed])

  const plan: SessionPlan = useMemo(
    () =>
      buildPlan({
        metrics,
        ratingOverride,
        dueCards,
        pendingGames,
        puzzleRating,
        weeklyMinutes: Math.max(60, Math.round(weeklyHours * 60)),
        budget,
        log,
        today,
      }),
    [metrics, ratingOverride, dueCards, pendingGames, puzzleRating, weeklyHours, budget, log, today],
  )

  const saveLog = useCallback((next: SessionRecord[]) => {
    const trimmed = next.slice(-MAX_LOG)
    setLog(trimmed)
    kv.setItem(SESSIONS_KEY, JSON.stringify(trimmed))
  }, [])

  const saveActive = useCallback((next: ActiveSession | null) => {
    setActive(next)
    kv.setItem(ACTIVE_KEY, next ? JSON.stringify(next) : '')
  }, [])

  const credit = useCallback(
    (block: SessionBlock, minutes: number) => {
      if (minutes <= 0) return
      const rec = log.find((r) => r.date === today) ?? { date: today, blocks: [] }
      const rest = log.filter((r) => r.date !== today)
      saveLog([...rest, { ...rec, blocks: [...rec.blocks, { activity: block.activity, minutes }] }])
    },
    [log, today, saveLog],
  )

  /** Starts today's plan from its first block. A session from an earlier day is dropped. */
  const start = useCallback(() => {
    saveActive({ date: today, blocks: plan.blocks, index: 0, startedAt: Date.now(), credited: plan.blocks.map(() => 0) })
  }, [plan.blocks, today, saveActive])

  /** Jumps to a block (to redo one, or to pick a different order). */
  const goTo = useCallback(
    (index: number) => {
      if (!active) return
      saveActive({ ...active, index, startedAt: Date.now() })
    },
    [active, saveActive],
  )

  /** Marks the current block done. The minutes actually spent are credited, capped at double the plan. */
  const complete = useCallback(() => {
    if (!active || active.index >= active.blocks.length) return
    const block = active.blocks[active.index]
    const spent = Math.round((Date.now() - active.startedAt) / 60_000)
    const minutes = Math.max(1, Math.min(spent || block.minutes, block.minutes * 2))
    credit(block, minutes)
    const credited = [...active.credited]
    credited[active.index] = minutes
    saveActive({ ...active, index: active.index + 1, startedAt: Date.now(), credited })
  }, [active, credit, saveActive])

  const skip = useCallback(() => {
    if (!active || active.index >= active.blocks.length) return
    saveActive({ ...active, index: active.index + 1, startedAt: Date.now() })
  }, [active, saveActive])

  const finish = useCallback(() => saveActive(null), [saveActive])

  const current = active && active.date === today && active.index < active.blocks.length ? active.blocks[active.index] : null
  const done = active && active.date === today && active.index >= active.blocks.length

  return {
    plan,
    metrics,
    active: active && active.date === today ? active : null,
    current,
    done: !!done,
    streak: streak(log, today),
    todayMinutes: (log.find((r) => r.date === today)?.blocks ?? []).reduce((s, b) => s + b.minutes, 0),
    exit: exitProgress(plan.band, metrics, ratingOverride, puzzleRating),
    budget,
    setBudget,
    start,
    goTo,
    complete,
    skip,
    finish,
    log,
  }
}

export type CoachApi = ReturnType<typeof useCoach>
