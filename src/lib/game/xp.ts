/**
 * Ranks, XP and badges. The game layer over the training loop: XP comes only from things
 * that make the student better (finishing session blocks, clean solves, reviewed games,
 * moving up a band), so chasing the numbers and chasing the rating are the same thing.
 */

export interface Rank {
  id: 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'
  label: string
  /** XP needed to hold this rank. */
  xp: number
}

export const RANKS: Rank[] = [
  { id: 'pawn', label: 'Pawn', xp: 0 },
  { id: 'knight', label: 'Knight', xp: 800 },
  { id: 'bishop', label: 'Bishop', xp: 2200 },
  { id: 'rook', label: 'Rook', xp: 4500 },
  { id: 'queen', label: 'Queen', xp: 8000 },
  { id: 'king', label: 'King', xp: 13000 },
]

export type XpEvent =
  | { type: 'block'; minutes: number }
  | { type: 'streak'; days: number }
  | { type: 'solve'; outcome: 'clean' | 'assisted' | 'failed'; rating: number }
  | { type: 'card'; grade: number }
  | { type: 'review' }
  | { type: 'slowGame'; result: 'win' | 'draw' | 'loss' }
  | { type: 'promotion' }

/** XP for one event. Minutes count double so a 40 minute game is worth more than a 5 minute drill. */
export function xpFor(e: XpEvent): number {
  switch (e.type) {
    case 'block':
      return Math.max(20, e.minutes * 2)
    case 'streak':
      return 10 * Math.min(e.days, 7)
    case 'solve':
      if (e.outcome === 'failed') return 2
      return Math.round((10 + Math.max(0, e.rating - 600) / 50) * (e.outcome === 'clean' ? 1 : 0.5))
    case 'card':
      return e.grade >= 5 ? 12 : e.grade >= 3 ? 6 : 2
    case 'review':
      return 60
    case 'slowGame':
      return e.result === 'win' ? 150 : 100
    case 'promotion':
      return 500
  }
}

export interface Progression {
  xp: number
  cleanSolves: number
  solves: number
  cardsDone: number
  reviews: number
  slowGames: number
  slowWins: number
  blocks: number
  promotions: number
  bestStreak: number
  /** Badge id to the ISO date it was earned. */
  badges: Record<string, string>
}

export const EMPTY_PROGRESSION: Progression = {
  xp: 0,
  cleanSolves: 0,
  solves: 0,
  cardsDone: 0,
  reviews: 0,
  slowGames: 0,
  slowWins: 0,
  blocks: 0,
  promotions: 0,
  bestStreak: 0,
  badges: {},
}

export function rankFor(xp: number): Rank {
  let r = RANKS[0]
  for (const rank of RANKS) if (xp >= rank.xp) r = rank
  return r
}

export function nextRank(rank: Rank): Rank | null {
  const i = RANKS.findIndex((r) => r.id === rank.id)
  return i < RANKS.length - 1 ? RANKS[i + 1] : null
}

/** 0 to 1 through the current rank. The top rank is always full. */
export function rankProgress(xp: number): number {
  const r = rankFor(xp)
  const n = nextRank(r)
  if (!n) return 1
  return Math.min(1, (xp - r.xp) / (n.xp - r.xp))
}

export interface Badge {
  id: string
  label: string
  /** One line on how it is earned. */
  how: string
  earned: (p: Progression, streak: number) => boolean
}

export const BADGES: Badge[] = [
  { id: 'first-session', label: 'First session', how: 'Finish a session block', earned: (p) => p.blocks >= 1 },
  { id: 'clean-10', label: 'Clean ten', how: 'Solve 10 puzzles clean', earned: (p) => p.cleanSolves >= 10 },
  { id: 'clean-100', label: 'Clean hundred', how: 'Solve 100 puzzles clean', earned: (p) => p.cleanSolves >= 100 },
  { id: 'reviewed-25', label: 'Honest player', how: 'Review 25 of your games', earned: (p) => p.reviews >= 25 },
  { id: 'cards-50', label: 'Card sharp', how: 'Clear 50 mistake cards', earned: (p) => p.cardsDone >= 50 },
  { id: 'slow-1', label: 'Clock time', how: 'Play a slow game', earned: (p) => p.slowGames >= 1 },
  { id: 'slow-win', label: 'Earned it', how: 'Win a slow game', earned: (p) => p.slowWins >= 1 },
  { id: 'streak-7', label: 'Week straight', how: 'Train 7 days in a row', earned: (_p, s) => s >= 7 },
  { id: 'streak-30', label: 'Month straight', how: 'Train 30 days in a row', earned: (_p, s) => s >= 30 },
  { id: 'band-up', label: 'Moving up', how: 'Leave a rating band', earned: (p) => p.promotions >= 1 },
]

export interface Award {
  next: Progression
  gained: number
  /** Set when the XP crossed into a new rank. */
  newRank: Rank | null
  newBadges: Badge[]
}

export function award(p: Progression, e: XpEvent, streak: number, nowIso: string = new Date().toISOString()): Award {
  // A missing field in an event (minutes, rating, grade) must not poison the stored XP with NaN.
  const raw = xpFor(e)
  const gained = Number.isFinite(raw) ? raw : 0
  // A streak event carries the day count itself; the badges see the same number.
  const days = e.type === 'streak' ? Math.max(streak, e.days) : streak
  const next: Progression = { ...p, xp: p.xp + gained, badges: { ...p.badges }, bestStreak: Math.max(p.bestStreak, days) }
  switch (e.type) {
    case 'block':
      next.blocks++
      break
    case 'solve':
      next.solves++
      if (e.outcome === 'clean') next.cleanSolves++
      break
    case 'card':
      next.cardsDone++
      break
    case 'review':
      next.reviews++
      break
    case 'slowGame':
      next.slowGames++
      if (e.result === 'win') next.slowWins++
      break
    case 'promotion':
      next.promotions++
      break
  }
  const before = rankFor(p.xp)
  const after = rankFor(next.xp)
  const newBadges = BADGES.filter((b) => !next.badges[b.id] && b.earned(next, days))
  for (const b of newBadges) next.badges[b.id] = nowIso
  return { next, gained, newRank: after.id !== before.id ? after : null, newBadges }
}

/** Old or partial stored shapes get every field: counters become whole non-negative numbers, unknown keys are dropped. */
export function normaliseProgression(raw: unknown): Progression {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...EMPTY_PROGRESSION, badges: {} as Record<string, string> }
  for (const key of Object.keys(EMPTY_PROGRESSION) as (keyof Progression)[]) {
    if (key === 'badges') continue
    out[key] = Math.max(0, Math.floor(Number(r[key]) || 0))
  }
  const badges = r.badges
  if (badges && typeof badges === 'object') {
    for (const [id, at] of Object.entries(badges as Record<string, unknown>)) if (typeof at === 'string' && at) out.badges[id] = at
  }
  return out
}
