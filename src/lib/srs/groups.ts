import { Chess } from 'chess.js'
import { dueCards, type SrsCard } from './srs'

/**
 * Cards grouped by what the missed move was: the puzzle motif when the card came from a puzzle
 * set, otherwise what the best move does on the board. Groups let the student drill one pattern
 * at a time instead of a mixed deck.
 */

export type GroupKey = 'mate' | 'check' | 'free-piece' | 'capture' | 'king-safety' | 'promotion' | 'quiet' | string

export const GROUP_LABEL: Record<string, string> = {
  mate: 'Checkmates',
  check: 'Checks that win',
  'free-piece': 'Free pieces',
  capture: 'Captures and trades',
  'king-safety': 'King safety',
  promotion: 'Promotion',
  quiet: 'Quiet moves and plans',
}

export interface CardGroup {
  key: GroupKey
  label: string
  cards: SrsCard[]
  due: number
}

const groupCache = new Map<string, GroupKey>()

/** The pattern a card drills, from its motif or from the best move on the board. Cached: a card's position never changes. */
export function cardGroup(card: SrsCard): GroupKey {
  if (card.motif) return card.motif
  const key = `${card.fen}|${card.bestMove}`
  const hit = groupCache.get(key)
  if (hit) return hit
  const group = groupFromBoard(card)
  if (groupCache.size > 5000) groupCache.clear()
  groupCache.set(key, group)
  return group
}

function groupFromBoard(card: SrsCard): GroupKey {
  try {
    const chess = new Chess(card.fen)
    const mv = chess.move(card.bestMove)
    if (mv.san.includes('#')) return 'mate'
    if (mv.isKingsideCastle() || mv.isQueensideCastle()) return 'king-safety'
    if (mv.promotion) return 'promotion'
    if (mv.isCapture()) {
      // A capture of something nobody guarded is a free piece, the beginner's bread and butter.
      const before = new Chess(card.fen)
      const defenders = before.attackers(mv.to, mv.color === 'w' ? 'b' : 'w').length
      return defenders === 0 ? 'free-piece' : 'capture'
    }
    if (mv.san.includes('+')) return 'check'
    return 'quiet'
  } catch {
    return 'quiet'
  }
}

function labelFor(key: GroupKey): string {
  if (GROUP_LABEL[key]) return GROUP_LABEL[key]
  // A puzzle motif such as "back-rank" or "discovered-attack" reads as words.
  return key.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

/** Groups with the most cards first; the due count per group is what the deck shows. */
export function groupCards(cards: SrsCard[], nowMs: number = Date.now()): CardGroup[] {
  const due = new Set(dueCards(cards, nowMs).map((c) => c.id))
  const map = new Map<GroupKey, SrsCard[]>()
  for (const c of cards) {
    const k = cardGroup(c)
    const list = map.get(k)
    if (list) list.push(c)
    else map.set(k, [c])
  }
  return [...map.entries()]
    .map(([key, list]) => ({ key, label: labelFor(key), cards: list, due: list.filter((c) => due.has(c.id)).length }))
    .sort((a, b) => b.cards.length - a.cards.length || a.label.localeCompare(b.label))
}

/** The order a group is drilled in: due cards first, then the rest by how soon they come due. */
export function groupQueue(group: CardGroup, nowMs: number = Date.now()): string[] {
  const due = new Set(dueCards(group.cards, nowMs).map((c) => c.id))
  return [...group.cards]
    .sort((a, b) => Number(due.has(b.id)) - Number(due.has(a.id)) || Date.parse(a.nextReview) - Date.parse(b.nextReview))
    .map((c) => c.id)
}
