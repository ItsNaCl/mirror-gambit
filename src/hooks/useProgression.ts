import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BANDS } from '../lib/coach/curriculum'
import { dayKey } from '../lib/coach/planner'
import { award as awardXp, BADGES, nextRank, normaliseProgression, rankFor, rankProgress, type Badge, type Progression, type Rank, type XpEvent } from '../lib/game/xp'
import * as kv from '../lib/store/kv'

export const PROGRESSION_KEY = 'mirror-gambit.progression.v1'
/** Hook-only state beside the progression: XP earned today and the highest band the student has reached. */
const META_KEY = 'mirror-gambit.progression-meta.v1'
const GAIN_MS = 3000
const LEVEL_UP_MS = 6000

interface Meta {
  day: { date: string; xp: number }
  bandId: string | null
}

function normaliseMeta(raw: unknown, today: string): Meta {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Meta>
  const day = r.day && typeof r.day === 'object' && r.day.date === today ? { date: today, xp: Math.max(0, Number(r.day.xp) || 0) } : { date: today, xp: 0 }
  return { day, bandId: typeof r.bandId === 'string' ? r.bandId : null }
}

/** One award, shown briefly by the UI. `seq` changes on every gain, even for equal amounts. */
export interface Gain {
  seq: number
  xp: number
  event: XpEvent
  badges: Badge[]
}

/**
 * The student's XP, rank and badges, saved as they change. `award` is synchronous and safe to
 * call several times in one tick: it works from the latest value, not the rendered one.
 */
export function useProgression() {
  const [progression, setProgression] = useState<Progression>(() => normaliseProgression(kv.readJson<unknown>(PROGRESSION_KEY, null)))
  const [meta, setMeta] = useState<Meta>(() => normaliseMeta(kv.readJson<unknown>(META_KEY, null), dayKey(new Date())))
  const [lastGain, setLastGain] = useState<Gain | null>(null)
  const [levelUp, setLevelUp] = useState<Rank | null>(null)
  const latest = useRef({ progression, meta })
  const seq = useRef(0)
  // The day can roll over while the app is open; the XP today figure follows it.
  const [today, setToday] = useState(() => dayKey(new Date()))
  useEffect(() => {
    const t = setInterval(() => setToday(dayKey(new Date())), 60_000)
    return () => clearInterval(t)
  }, [])

  const save = useCallback((p: Progression, m: Meta) => {
    latest.current = { progression: p, meta: m }
    setProgression(p)
    setMeta(m)
    kv.setItem(PROGRESSION_KEY, JSON.stringify(p))
    kv.setItem(META_KEY, JSON.stringify(m))
  }, [])

  /** Credits one event. `streak` is the training streak in days, for the streak badges. */
  const award = useCallback(
    (event: XpEvent, streak = 0) => {
      const a = awardXp(latest.current.progression, event, streak)
      const today = dayKey(new Date())
      const m = latest.current.meta
      const day = m.day.date === today ? { date: today, xp: m.day.xp + a.gained } : { date: today, xp: a.gained }
      save(a.next, { ...m, day })
      setLastGain({ seq: ++seq.current, xp: a.gained, event, badges: a.newBadges })
      if (a.newRank) setLevelUp(a.newRank)
      return a
    },
    [save],
  )

  /**
   * Pays the promotion when the student reaches a band above the highest one recorded. The
   * first band seen is only recorded, so finding out the rating is not itself a promotion, and
   * dropping a band and coming back is not one either.
   */
  const trackBand = useCallback(
    (bandId: string) => {
      const m = latest.current.meta
      const from = BANDS.findIndex((b) => b.id === m.bandId)
      const to = BANDS.findIndex((b) => b.id === bandId)
      if (to < 0 || (m.bandId !== null && to <= from)) return
      if (m.bandId !== null) award({ type: 'promotion' }, latest.current.progression.bestStreak)
      save(latest.current.progression, { ...latest.current.meta, bandId })
    },
    [award, save],
  )

  // The gain and the level up are transient: the UI shows them and they clear on their own.
  useEffect(() => {
    if (!lastGain) return
    const t = setTimeout(() => setLastGain((g) => (g?.seq === lastGain.seq ? null : g)), GAIN_MS)
    return () => clearTimeout(t)
  }, [lastGain])
  useEffect(() => {
    if (!levelUp) return
    const t = setTimeout(() => setLevelUp(null), LEVEL_UP_MS)
    return () => clearTimeout(t)
  }, [levelUp])
  const dismissLevelUp = useCallback(() => setLevelUp(null), [])

  const rank = rankFor(progression.xp)
  const next = nextRank(rank)
  const badges = useMemo(
    () =>
      BADGES.filter((b) => progression.badges[b.id])
        .map((b) => ({ ...b, earnedAt: progression.badges[b.id] }))
        .sort((a, b) => a.earnedAt.localeCompare(b.earnedAt)),
    [progression.badges],
  )
  return {
    progression,
    xp: progression.xp,
    rank,
    next,
    /** 0 to 1 through the current rank. */
    progress: rankProgress(progression.xp),
    badges,
    xpToday: meta.day.date === today ? meta.day.xp : 0,
    lastGain,
    levelUp,
    dismissLevelUp,
    award,
    trackBand,
  }
}

export type ProgressionApi = ReturnType<typeof useProgression>
