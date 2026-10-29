/**
 * The curriculum: what a player should be working on at each rating band, how a week splits
 * between kinds of training, the habits to build, and what has to be true before moving up.
 *
 * The bands and splits follow what coaches who take beginners to club level agree on
 * (safety and tactics first, slow games reviewed every time, endgames and strategy growing with
 * the rating, openings as principles and plans rather than lines). The numbers are a starting
 * point the planner adjusts from the player's own games.
 */

export type BandId = 'b1' | 'b2' | 'b3' | 'b4'

/** The kinds of work the planner can schedule. */
export type Activity = 'tactics' | 'play' | 'review' | 'endgames' | 'strategy' | 'openings' | 'cards' | 'whynot' | 'guess' | 'narrated'

export const ACTIVITY_LABEL: Record<Activity, string> = {
  tactics: 'Tactics',
  play: 'Play a slow game',
  review: 'Review a game',
  endgames: 'Endgames',
  strategy: 'Strategy',
  openings: 'Openings',
  cards: 'Mistake cards',
  whynot: 'Why not this move',
  guess: 'Guess the move',
  narrated: 'Narrated game',
}

export interface Habit {
  id: string
  /** The habit as an instruction the player can repeat to themselves. */
  text: string
}

/** A condition the planner checks against real data before the band is done. */
export interface ExitCriterion {
  id: string
  label: string
  /** Lower bound (rating) or upper bound (blunders) and which way the comparison goes. */
  target: number
  direction: 'atLeast' | 'atMost'
}

export interface Band {
  id: BandId
  label: string
  /** Chess.com rapid rating range, upper bound exclusive. The last band has no upper bound. */
  from: number
  to: number | null
  /** Share of weekly time per activity. Sums to 1. "cards" and "whynot" are folded into tactics here, "guess" into openings, "narrated" into play, and split out by the planner. */
  split: Record<Exclude<Activity, 'cards' | 'whynot' | 'guess' | 'narrated'>, number>
  habits: Habit[]
  exit: ExitCriterion[]
  /** The time control the coach wants the player's main games in. */
  timeControl: { minutes: number; increment: number }
  /** Puzzle themes to lean on in this band, matching the rated puzzle theme filters. */
  themes: string[]
}

export const BANDS: Band[] = [
  {
    id: 'b1',
    label: 'Stop hanging pieces',
    from: 0,
    to: 1000,
    split: { tactics: 0.4, play: 0.25, review: 0.15, endgames: 0.1, strategy: 0, openings: 0.1 },
    habits: [
      { id: 'cct', text: 'Before every move, list the checks, captures and threats for both sides.' },
      { id: 'count', text: 'Before you capture, count the attackers and the defenders.' },
      { id: 'castle', text: 'Castle by move 10 unless there is a concrete reason not to.' },
      { id: 'free', text: 'Take free pieces. Check that they are really free first.' },
      { id: 'quiet', text: 'When nothing is happening, make a quiet move that improves your worst piece.' },
    ],
    exit: [
      { id: 'hung', label: 'Pieces left hanging per game, last 20 games', target: 1, direction: 'atMost' },
      { id: 'rating', label: 'Rapid rating', target: 1000, direction: 'atLeast' },
      { id: 'puzzles', label: 'Puzzle rating', target: 1200, direction: 'atLeast' },
    ],
    timeControl: { minutes: 15, increment: 10 },
    themes: ['hanging', 'fork', 'mate'],
  },
  {
    id: 'b2',
    label: 'Think before you move',
    from: 1000,
    to: 1300,
    split: { tactics: 0.35, play: 0.25, review: 0.1, endgames: 0.15, strategy: 0.1, openings: 0.05 },
    habits: [
      { id: 'five', text: 'On every critical move: what did their move do, what do I want, which moves do it, which are unsafe, which is best?' },
      { id: 'wish', text: 'Say what you want (a rook on the seventh, a knight on d5), then find the move that gets it.' },
      { id: 'cause', text: 'Stop a threat by removing its cause, not by reacting to the symptom.' },
      { id: 'cct', text: 'Checks, captures and threats, every move, both sides.' },
    ],
    exit: [
      { id: 'rating', label: 'Rapid rating', target: 1300, direction: 'atLeast' },
      { id: 'hung', label: 'Pieces left hanging per game, last 20 games', target: 0.5, direction: 'atMost' },
      { id: 'puzzles', label: 'Puzzle rating', target: 1500, direction: 'atLeast' },
    ],
    timeControl: { minutes: 15, increment: 10 },
    themes: ['fork', 'pin', 'discovered', 'mate', 'endgame'],
  },
  {
    id: 'b3',
    label: 'Calculate and plan',
    from: 1300,
    to: 1600,
    split: { tactics: 0.3, play: 0.25, review: 0.1, endgames: 0.15, strategy: 0.15, openings: 0.05 },
    habits: [
      { id: 'candidates', text: 'List your candidate moves before you calculate any of them.' },
      { id: 'prophylaxis', text: 'Every move, ask what your opponent wants to do next.' },
      { id: 'structure', text: 'Pick your plan from the pawn structure: where are the weaknesses, which is your worst piece?' },
    ],
    exit: [
      { id: 'rating', label: 'Rapid rating', target: 1600, direction: 'atLeast' },
      { id: 'puzzles', label: 'Puzzle rating', target: 1800, direction: 'atLeast' },
    ],
    timeControl: { minutes: 15, increment: 10 },
    themes: ['any'],
  },
  {
    id: 'b4',
    label: 'Strong club player',
    from: 1600,
    to: null,
    split: { tactics: 0.25, play: 0.2, review: 0.1, endgames: 0.15, strategy: 0.2, openings: 0.1 },
    habits: [
      { id: 'candidates', text: 'Candidate moves first, then calculate each one once.' },
      { id: 'prophylaxis', text: 'Prophylaxis every move.' },
      { id: 'convert', text: 'When winning, trade pieces and keep it simple. When losing, make every move a problem.' },
    ],
    exit: [
      { id: 'rating', label: 'Rapid rating', target: 1800, direction: 'atLeast' },
    ],
    timeControl: { minutes: 15, increment: 10 },
    themes: ['any'],
  },
]

export function bandFor(rating: number | null): Band {
  if (rating === null) return BANDS[0]
  return BANDS.find((b) => b.to === null || rating < b.to) ?? BANDS[BANDS.length - 1]
}

export function nextBand(band: Band): Band | null {
  const i = BANDS.findIndex((b) => b.id === band.id)
  return i >= 0 && i < BANDS.length - 1 ? BANDS[i + 1] : null
}

export function formatTimeControl(tc: { minutes: number; increment: number }): string {
  return `${tc.minutes}+${tc.increment}`
}
