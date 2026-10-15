/**
 * Spaced repetition for chess mistakes, an SM-2 port of Chess Rocket's
 * scripts/srs.py (GPL-3.0, see README credits). Pure functions only; storage
 * lives in the hook.
 */

/** SM-2 interval progression in hours: 4h, 1d, 3d, 1w, 2w, 1 month. */
export const INTERVAL_HOURS = [4, 24, 72, 168, 336, 720]
export const MIN_EASE_FACTOR = 1.3
export const INITIAL_EASE_FACTOR = 2.5

export type CardSource = 'review' | 'alert' | 'manual'

export interface SrsCard {
  id: string
  /** Position before the player's move. */
  fen: string
  /** What the player played (SAN), or null for a manually saved position. */
  playerMove: string | null
  /** Engine's best move (SAN). */
  bestMove: string
  cpLoss: number
  classification: string
  motif: string | null
  explanation: string
  source: CardSource
  createdAt: string
  nextReview: string
  intervalHours: number
  easeFactor: number
  repetitions: number
  qualityHistory: number[]
}

export interface NewCardInput {
  fen: string
  playerMove: string | null
  bestMove: string
  cpLoss: number
  classification: string
  motif?: string | null
  explanation?: string
  source: CardSource
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  return 'card-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

function hoursFrom(nowMs: number, hours: number): string {
  return new Date(nowMs + hours * 3600 * 1000).toISOString()
}

export function createCard(input: NewCardInput, nowMs: number = Date.now()): SrsCard {
  return {
    id: newId(),
    fen: input.fen,
    playerMove: input.playerMove,
    bestMove: input.bestMove,
    cpLoss: input.cpLoss,
    classification: input.classification,
    motif: input.motif ?? null,
    explanation: input.explanation ?? '',
    source: input.source,
    createdAt: new Date(nowMs).toISOString(),
    nextReview: hoursFrom(nowMs, INTERVAL_HOURS[0]),
    intervalHours: INTERVAL_HOURS[0],
    easeFactor: INITIAL_EASE_FACTOR,
    repetitions: 0,
    qualityHistory: [],
  }
}

/** Grades (0-5) come from srsGrade() in lib/practice: clean 5, retries 4, hint 1-2 is 3, hint 3-4 is 2, gave up 0. */

/**
 * SM-2 update. Quality < 3 resets the card to the first interval; otherwise the
 * card advances along the fixed sequence and then grows by its ease factor.
 * The ease factor changes every review and never drops below 1.3.
 */
export function sm2Update(card: SrsCard, quality: number, nowMs: number = Date.now()): SrsCard {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) throw new Error(`quality must be 0-5, got ${quality}`)
  let ef = card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  ef = Math.max(MIN_EASE_FACTOR, Math.round(ef * 10000) / 10000)

  let intervalHours: number
  let repetitions: number
  if (quality < 3) {
    intervalHours = INTERVAL_HOURS[0]
    repetitions = 0
  } else {
    const reps = card.repetitions
    intervalHours = reps < INTERVAL_HOURS.length ? INTERVAL_HOURS[reps] : Math.round(card.intervalHours * ef)
    repetitions = reps + 1
  }

  return {
    ...card,
    easeFactor: ef,
    intervalHours,
    repetitions,
    qualityHistory: [...card.qualityHistory, quality],
    nextReview: hoursFrom(nowMs, intervalHours),
  }
}

export function isDue(card: SrsCard, nowMs: number = Date.now()): boolean {
  return Date.parse(card.nextReview) <= nowMs
}

export function dueCards(cards: SrsCard[], nowMs: number = Date.now()): SrsCard[] {
  return cards.filter((c) => isDue(c, nowMs)).sort((a, b) => Date.parse(a.nextReview) - Date.parse(b.nextReview))
}

/** True when a card for the same position and move already exists. */
export function hasDuplicate(cards: SrsCard[], fen: string, playerMove: string | null): boolean {
  const key = fen.split(' ').slice(0, 4).join(' ')
  return cards.some((c) => c.fen.split(' ').slice(0, 4).join(' ') === key && c.playerMove === playerMove)
}

/** Validates an imported JSON document and returns the cards it contains. Throws on bad input. */
export function parseCardsJson(text: string): SrsCard[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const list = Array.isArray(data) ? data : (data as { cards?: unknown })?.cards
  if (!Array.isArray(list)) throw new Error('Expected a list of cards (or an object with a "cards" list).')
  const cards: SrsCard[] = []
  for (const raw of list as Partial<SrsCard>[]) {
    if (!raw || typeof raw.fen !== 'string' || typeof raw.bestMove !== 'string') throw new Error('A card is missing its position or best move.')
    cards.push({
      id: typeof raw.id === 'string' ? raw.id : newId(),
      fen: raw.fen,
      playerMove: typeof raw.playerMove === 'string' ? raw.playerMove : null,
      bestMove: raw.bestMove,
      cpLoss: typeof raw.cpLoss === 'number' ? raw.cpLoss : 0,
      classification: typeof raw.classification === 'string' ? raw.classification : 'manual',
      motif: typeof raw.motif === 'string' ? raw.motif : null,
      explanation: typeof raw.explanation === 'string' ? raw.explanation : '',
      source: raw.source === 'review' || raw.source === 'alert' || raw.source === 'manual' ? raw.source : 'manual',
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
      nextReview: typeof raw.nextReview === 'string' ? raw.nextReview : new Date().toISOString(),
      intervalHours: typeof raw.intervalHours === 'number' ? raw.intervalHours : INTERVAL_HOURS[0],
      easeFactor: typeof raw.easeFactor === 'number' ? raw.easeFactor : INITIAL_EASE_FACTOR,
      repetitions: typeof raw.repetitions === 'number' ? raw.repetitions : 0,
      qualityHistory: Array.isArray(raw.qualityHistory) ? raw.qualityHistory.filter((q): q is number => typeof q === 'number') : [],
    })
  }
  return cards
}

/** Merges imported cards into the existing deck, keeping existing cards when ids collide. */
export function mergeCards(existing: SrsCard[], imported: SrsCard[]): { cards: SrsCard[]; added: number } {
  const ids = new Set(existing.map((c) => c.id))
  const out = [...existing]
  let added = 0
  for (const c of imported) {
    if (ids.has(c.id) || hasDuplicate(out, c.fen, c.playerMove)) continue
    out.push(c)
    ids.add(c.id)
    added++
  }
  return { cards: out, added }
}
