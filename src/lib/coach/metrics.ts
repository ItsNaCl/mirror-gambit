import { outcome, TAG_LABEL, type AnalysedGame, type MistakeTag, type Phase } from '../games/profile'

/**
 * Diagnostics the planner steers by. The weakness profile counts everything the student has
 * ever imported; these look at the recent games only, because that is what the coach should
 * react to, and they answer the questions a coach asks first: how often are pieces still
 * hanging, which mistake keeps coming back, where do the lost games go wrong, and is the
 * student playing the time control the training asks for.
 */

export const RECENT_GAMES = 20
export const REPEAT_WINDOW = 10
export const REPEAT_THRESHOLD = 3

export interface RepeatMistake {
  tag: MistakeTag
  label: string
  /** Times it happened in the last REPEAT_WINDOW games. */
  count: number
}

export interface Metrics {
  /** Games the metrics are computed from (the most recent ones, newest first). */
  games: number
  /** The player's rating from the newest rapid game, else the newest game of any speed. */
  rating: number | null
  /** The time class that rating comes from. */
  ratingClass: string | null
  /** Pieces left hanging (and free pieces missed) per game. */
  hungPerGame: number
  blundersPerGame: number
  /** Share of recent games played at rapid or slower. */
  slowShare: number
  /** In lost games, the phase where the biggest mistake happened, as counts. */
  lossPhase: Record<Phase, number>
  /** Mistakes that happened at least REPEAT_THRESHOLD times in the last REPEAT_WINDOW games. */
  repeats: RepeatMistake[]
  /** Wins per game against the player's recent record. */
  score: number
}

const SLOW = new Set(['rapid', 'classical', 'daily', 'correspondence'])
const round1 = (x: number) => Math.round(x * 10) / 10

/** Newest games first, whatever order the library is in. */
export function recentGames(analysed: AnalysedGame[], n = RECENT_GAMES): AnalysedGame[] {
  return [...analysed].sort((a, b) => Date.parse(b.game.date) - Date.parse(a.game.date)).slice(0, n)
}

export function ratingFrom(games: AnalysedGame[]): { rating: number | null; ratingClass: string | null } {
  const rated = games.filter((a) => a.game.userRating)
  const rapid = rated.find((a) => SLOW.has(a.game.timeClass))
  const pick = rapid ?? rated[0]
  return pick ? { rating: pick.game.userRating!, ratingClass: pick.game.timeClass } : { rating: null, ratingClass: null }
}

export function buildMetrics(analysed: AnalysedGame[]): Metrics | null {
  const recent = recentGames(analysed)
  const n = recent.length
  if (n === 0) return null

  const mistakes = recent.flatMap((a) => a.analysis.mistakes)
  const hung = mistakes.filter((m) => m.tags.includes('hung-piece') || m.tags.includes('missed-free-piece')).length
  const blunders = mistakes.filter((m) => m.cls === 'blunder').length

  const lossPhase: Record<Phase, number> = { opening: 0, middlegame: 0, endgame: 0 }
  for (const a of recent) {
    if (outcome(a.game) !== 'loss' || a.analysis.mistakes.length === 0) continue
    const worst = [...a.analysis.mistakes].sort((x, y) => y.lossCp - x.lossCp)[0]
    lossPhase[worst.phase]++
  }

  const window = recent.slice(0, REPEAT_WINDOW)
  const counts = new Map<MistakeTag, number>()
  for (const a of window) for (const m of a.analysis.mistakes) for (const t of m.tags) if (t !== 'other') counts.set(t, (counts.get(t) ?? 0) + 1)
  const repeats = [...counts.entries()]
    .filter(([, c]) => c >= REPEAT_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, label: TAG_LABEL[tag], count }))

  const points = recent.reduce((s, a) => s + (outcome(a.game) === 'win' ? 1 : outcome(a.game) === 'draw' ? 0.5 : 0), 0)

  return {
    games: n,
    ...ratingFrom(recent),
    hungPerGame: round1(hung / n),
    blundersPerGame: round1(blunders / n),
    slowShare: round1(recent.filter((a) => SLOW.has(a.game.timeClass)).length / n),
    lossPhase,
    repeats,
    score: round1(points / n),
  }
}

const PHASE_WORD: Record<Phase, string> = { opening: 'the opening', middlegame: 'the middlegame', endgame: 'the endgame' }

/** The phase most lost games turn in, or null when there is no clear one. */
export function worstPhase(m: Metrics): Phase | null {
  const rows = (Object.entries(m.lossPhase) as [Phase, number][]).sort((a, b) => b[1] - a[1])
  if (rows[0][1] === 0 || rows[0][1] === rows[1][1]) return null
  return rows[0][0]
}

/** Two or three short sentences a coach would open with. */
export function describeMetrics(m: Metrics): string[] {
  const out: string[] = []
  if (m.hungPerGame >= 1) out.push(`You leave about ${m.hungPerGame} piece${m.hungPerGame === 1 ? '' : 's'} hanging per game. That is the first thing to fix.`)
  else if (m.hungPerGame > 0) out.push(`Pieces hang about once every ${Math.round(1 / m.hungPerGame)} games. Keep the blunder check going.`)
  const repeat = m.repeats[0]
  if (repeat) out.push(`${repeat.label} came up ${repeat.count} times in your last ${Math.min(m.games, REPEAT_WINDOW)} games.`)
  const phase = worstPhase(m)
  if (phase) out.push(`Your lost games mostly turn in ${PHASE_WORD[phase]}.`)
  if (m.slowShare < 0.5) out.push(`Only ${Math.round(m.slowShare * 100)}% of your recent games are rapid or slower. Blunder checks need clock time.`)
  return out
}
