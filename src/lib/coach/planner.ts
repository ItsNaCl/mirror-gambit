import type { MistakeTag } from '../games/profile'
import { ACTIVITY_LABEL, bandFor, BANDS, formatTimeControl, type Activity, type Band, type Habit } from './curriculum'
import { worstPhase, type Metrics } from './metrics'

/**
 * Builds today's session. The planner has one job: given what the student's games show,
 * what the band asks for this week, what has already been done this week, and how much time
 * there is today, decide the blocks and say why each one is there.
 *
 * It is deterministic: the same inputs give the same plan, so the tests can check it and the
 * student sees the same plan when they come back later in the day.
 */

export interface SessionBlock {
  activity: Activity
  minutes: number
  /** One line the student reads before starting the block. */
  reason: string
  /** For tactics: the rated puzzle theme filter to use. */
  theme?: string
  /** For a course block: which course to open. */
  course?: 'endgames' | 'strategy' | 'attack'
}

export interface SessionPlan {
  /** YYYY-MM-DD in local time. */
  date: string
  band: Band
  minutes: number
  blocks: SessionBlock[]
  habit: Habit
  /** The coach's opening lines, from the metrics. */
  notes: string[]
  /** What this week still needs, in minutes per activity, after today's plan. */
  weekRemaining: Partial<Record<Activity, number>>
}

/** One finished block, kept in the session log. */
export interface LoggedBlock {
  activity: Activity
  minutes: number
}

export interface SessionRecord {
  date: string
  blocks: LoggedBlock[]
}

export interface PlannerInput {
  metrics: Metrics | null
  /** The student's rapid rating, when the metrics have none (manual entry in Settings). */
  ratingOverride: number | null
  dueCards: number
  /** Imported games the batch review has not analysed yet. */
  pendingGames: number
  /** Positions ready for Why not this move (the student's own mistakes with a better move). */
  whyNotPositions?: number
  puzzleRating: number | null
  weeklyMinutes: number
  /** Minutes the student has today, or null to let the coach size it. */
  budget: number | null
  /** The session log, any order. */
  log: SessionRecord[]
  /** Today, YYYY-MM-DD local. */
  today: string
}

export const MIN_SESSION = 20
export const MAX_SESSION = 60
export const GAME_MINUTES = 40
export const REVIEW_MINUTES = 10
export const TRAINING_DAYS = 5
/** Own mistakes needed before the planner schedules Why not this move. */
export const WHY_NOT_MIN = 3

const TAG_THEME: Partial<Record<MistakeTag, string>> = {
  'hung-piece': 'hanging',
  'missed-free-piece': 'hanging',
  'missed-fork': 'fork',
  'allowed-fork': 'fork',
  'missed-mate': 'mate',
  'allowed-mate': 'mate',
  'walked-into-pin': 'pin',
}

const TAG_HABIT: Partial<Record<MistakeTag, string>> = {
  'hung-piece': 'cct',
  'missed-free-piece': 'free',
  'allowed-fork': 'cct',
  'allowed-mate': 'cct',
  'walked-into-pin': 'count',
}

export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Monday to Sunday containing the day. */
export function weekOf(date: string): string[] {
  const d = new Date(`${date}T12:00:00`)
  const dow = (d.getDay() + 6) % 7
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const x = new Date(d)
    x.setDate(d.getDate() - dow + i)
    out.push(dayKey(x))
  }
  return out
}

/** Days in a row, ending today or yesterday, with at least one logged block. */
export function streak(log: SessionRecord[], today: string): number {
  const days = new Set(log.filter((r) => r.blocks.length > 0).map((r) => r.date))
  const d = new Date(`${today}T12:00:00`)
  let count = 0
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1)
  while (days.has(dayKey(d))) {
    count++
    d.setDate(d.getDate() - 1)
  }
  return count
}

function doneThisWeek(log: SessionRecord[], today: string): Record<Activity, number> {
  const week = new Set(weekOf(today))
  const done: Record<Activity, number> = { tactics: 0, play: 0, review: 0, endgames: 0, strategy: 0, openings: 0, cards: 0, whynot: 0 }
  for (const r of log)
    if (week.has(r.date))
      for (const b of r.blocks) {
        if (!(b.activity in done)) continue
        done[b.activity] += b.minutes
        // Why not this move is tactics time spent on the student's own games.
        if (b.activity === 'whynot') done.tactics += b.minutes
      }
  return done
}

const round5 = (x: number) => Math.max(5, Math.round(x / 5) * 5)

export function sessionMinutes(input: PlannerInput): number {
  if (input.budget !== null) return Math.max(MIN_SESSION, Math.min(MAX_SESSION, input.budget))
  let m = input.weeklyMinutes / TRAINING_DAYS
  // Coming back after a break: a short session is the one that gets done.
  if (streak(input.log, input.today) === 0 && input.log.length > 0) m = Math.min(m, 30)
  if (input.dueCards > 20) m += 5
  return Math.max(MIN_SESSION, Math.min(MAX_SESSION, round5(m)))
}

function pickHabit(band: Band, metrics: Metrics | null, today: string): Habit {
  const top = metrics?.repeats[0]?.tag
  const wanted = top ? TAG_HABIT[top] : undefined
  const match = wanted ? band.habits.find((h) => h.id === wanted) : undefined
  if (match) return match
  const dayIndex = Math.floor(new Date(`${today}T12:00:00`).getTime() / 86_400_000)
  return band.habits[dayIndex % band.habits.length]
}

export function buildPlan(input: PlannerInput): SessionPlan {
  const rating = input.metrics?.rating ?? input.ratingOverride
  const band = bandFor(rating)
  const minutes = sessionMinutes(input)
  const done = doneThisWeek(input.log, input.today)
  const target: Record<Activity, number> = {
    tactics: input.weeklyMinutes * band.split.tactics,
    play: input.weeklyMinutes * band.split.play,
    review: input.weeklyMinutes * band.split.review,
    endgames: input.weeklyMinutes * band.split.endgames,
    strategy: input.weeklyMinutes * band.split.strategy,
    openings: input.weeklyMinutes * band.split.openings,
    cards: 0,
    whynot: 0,
  }
  const deficit = (a: Activity) => Math.max(0, target[a] - done[a])

  const blocks: SessionBlock[] = []
  let left = minutes
  const m = input.metrics

  if (input.dueCards > 0) {
    const mins = Math.min(10, Math.max(5, Math.ceil(input.dueCards / 2)))
    blocks.push({ activity: 'cards', minutes: mins, reason: `${input.dueCards} of your own mistakes are due. Positions you have already got wrong once are the cheapest rating points there are.` })
    left -= mins
  }

  if (input.pendingGames > 0 && left >= REVIEW_MINUTES) {
    blocks.push({ activity: 'review', minutes: REVIEW_MINUTES, reason: `${input.pendingGames} imported game${input.pendingGames === 1 ? '' : 's'} not reviewed yet. Every game gets reviewed, that is the rule.` })
    left -= REVIEW_MINUTES
  }

  // A slow game only fits a long session, and only when the week still needs one.
  const wantsGame = deficit('play') > 0 && minutes >= 45 && left >= GAME_MINUTES
  const slowWarning = m && m.slowShare < 0.5 ? ' Rapid, not blitz: the habits need clock time.' : ''
  if (wantsGame) {
    blocks.push({ activity: 'play', minutes: GAME_MINUTES, reason: `One ${formatTimeControl(band.timeControl)} game with the habit of the day in mind.${slowWarning}` })
    left -= GAME_MINUTES
  }

  // The rest is study, filled by how far behind the week is on each kind.
  const study: Activity[] = ['tactics', 'endgames', 'strategy', 'openings']
  const weights = study.map((a) => ({ a, w: target[a] > 0 ? deficit(a) / target[a] : 0 })).filter((x) => x.w > 0)
  const totalW = weights.reduce((s, x) => s + x.w, 0)
  const sorted = [...weights].sort((a, b) => b.w - a.w)
  // Tactics is always first when it is behind: it is the band's biggest share and the fastest to pay off.
  for (const { a, w } of sorted) {
    if (left < 5) break
    let mins = round5((w / totalW) * left)
    mins = Math.min(mins, left)
    if (a === 'tactics' && mins < 10 && left >= 10) mins = 10
    blocks.push(studyBlock(a, mins, band, m))
    left -= mins
  }
  // Anything unallocated (rounding, or the week is done) goes to tactics, which is never wasted.
  if (left >= 5) {
    const t = blocks.find((b) => b.activity === 'tactics')
    if (t) t.minutes += left
    else blocks.push(studyBlock('tactics', left, band, m))
    left = 0
  }

  // A third of a long enough tactics block goes to the student's own mistakes, once there are a few.
  const tactics = blocks.findIndex((b) => b.activity === 'tactics')
  if (tactics >= 0 && blocks[tactics].minutes >= 15 && (input.whyNotPositions ?? 0) >= WHY_NOT_MIN) {
    const mins = round5(blocks[tactics].minutes / 3)
    blocks[tactics] = { ...blocks[tactics], minutes: blocks[tactics].minutes - mins }
    blocks.splice(tactics + 1, 0, {
      activity: 'whynot',
      minutes: mins,
      reason: 'Your own mistakes, replayed: play your move, watch what it allowed, then see the better move and its line.',
    })
  }

  const weekRemaining: Partial<Record<Activity, number>> = {}
  for (const a of study.concat('play', 'review')) {
    const counts = (b: SessionBlock) => b.activity === a || (a === 'tactics' && b.activity === 'whynot')
    const after = deficit(a) - blocks.filter(counts).reduce((s, b) => s + b.minutes, 0)
    if (after > 0) weekRemaining[a] = Math.round(after)
  }

  return {
    date: input.today,
    band,
    minutes: blocks.reduce((s, b) => s + b.minutes, 0),
    blocks,
    habit: pickHabit(band, m, input.today),
    notes: planNotes(band, m, rating, input.puzzleRating),
    weekRemaining,
  }
}

function studyBlock(a: Activity, minutes: number, band: Band, m: Metrics | null): SessionBlock {
  switch (a) {
    case 'tactics': {
      const top = m?.repeats[0]
      const theme = (top && TAG_THEME[top.tag]) ?? (band.themes[0] === 'any' ? 'any' : band.themes[0])
      const reason = top && TAG_THEME[top.tag]
        ? `Rated puzzles on the pattern you keep missing: ${top.label.toLowerCase()}, ${top.count} times lately.`
        : `Rated puzzles near your level. Calculate the whole line before you touch a piece.`
      return { activity: 'tactics', minutes, reason, theme }
    }
    case 'endgames': {
      const phase = m ? worstPhase(m) : null
      return {
        activity: 'endgames',
        minutes,
        reason: phase === 'endgame' ? 'Your lost games turn in the endgame. The basic ones are learnable in a week.' : 'Basic mates and king and pawn endings. These decide the games you are winning.',
        course: 'endgames',
      }
    }
    case 'strategy':
      return { activity: 'strategy', minutes, reason: 'Outposts, open files and the isolated pawn: where plans come from when there is no tactic.', course: 'strategy' }
    case 'openings':
      return { activity: 'openings', minutes, reason: 'Your repertoire, drilled from memory. Principles and the first eight moves, not deep lines.' }
    default:
      return { activity: a, minutes, reason: ACTIVITY_LABEL[a] }
  }
}

function planNotes(band: Band, m: Metrics | null, rating: number | null, puzzleRating: number | null): string[] {
  const out: string[] = []
  if (rating === null) out.push('No rating yet. Import your games or set your rating in Settings and the plan sharpens.')
  else out.push(`Rated about ${rating}: ${band.label.toLowerCase()} is the job until ${band.to ?? 'well past 1800'}.`)
  if (m) {
    if (m.hungPerGame >= 1) out.push(`About ${m.hungPerGame} piece${m.hungPerGame === 1 ? '' : 's'} hang per game in your last ${m.games}. Nothing else matters until that is under one.`)
    const top = m.repeats[0]
    if (top) out.push(`${top.label} is the repeat offender: ${top.count} times in your last ten games.`)
  }
  if (puzzleRating !== null && band.exit.some((e) => e.id === 'puzzles' && puzzleRating >= e.target)) out.push('Your puzzle rating is already where this band needs it. The games have to catch up.')
  return out
}

/** How close the student is to leaving the band, per criterion, as the planner sees it. */
export interface ExitProgress {
  id: string
  label: string
  target: number
  direction: 'atLeast' | 'atMost'
  value: number | null
  met: boolean
}

export function exitProgress(band: Band, m: Metrics | null, ratingOverride: number | null, puzzleRating: number | null): ExitProgress[] {
  return band.exit.map((e) => {
    let value: number | null = null
    if (e.id === 'rating') value = m?.rating ?? ratingOverride
    else if (e.id === 'hung') value = m?.hungPerGame ?? null
    else if (e.id === 'puzzles') value = puzzleRating
    const met = value !== null && (e.direction === 'atLeast' ? value >= e.target : value <= e.target)
    return { ...e, value, met }
  })
}

export { BANDS }
