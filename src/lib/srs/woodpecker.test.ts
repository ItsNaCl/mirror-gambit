import { describe, expect, it } from 'vitest'
import { cardGroup, groupCards, groupQueue } from './groups'
import { createCard, type SrsCard } from './srs'
import { buildWoodpeckerSet, cycleTrend, normaliseWoodpecker, recordWoodpecker, remaining, startCycle, summariseCycles, WOODPECKER_MIN } from './woodpecker'

const T0 = Date.parse('2026-10-29T10:00:00Z')

function card(fen: string, bestMove: string, over: Partial<SrsCard> = {}, at = T0): SrsCard {
  return { ...createCard({ fen, playerMove: null, bestMove, cpLoss: 200, classification: 'blunder', source: 'review' }, at), ...over }
}

// Positions: a mate in one, a free piece, a check, a quiet developing move.
const MATE = card('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'Ra8#')
const FREE = card('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'Nxe5')
const CHECK = card('rnbqk1nr/pppp2pp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3', 'Qh5+')
const CAPTURE_CHECK = card('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'Bxf7+')
const QUIET = card('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'Nf6')

describe('card groups', () => {
  it('files cards by what the best move does, or by the puzzle motif', () => {
    expect(cardGroup(MATE)).toBe('mate')
    expect(cardGroup(FREE)).toBe('free-piece')
    expect(cardGroup(CHECK)).toBe('check')
    // A capture that also checks is filed as a capture: the pawn on f7 was defended by the king.
    expect(cardGroup(CAPTURE_CHECK)).toBe('capture')
    expect(cardGroup(QUIET)).toBe('quiet')
    expect(cardGroup({ ...QUIET, motif: 'back-rank' })).toBe('back-rank')
    expect(cardGroup({ ...QUIET, bestMove: 'Zz9' })).toBe('quiet')
  })

  it('groups with counts and due numbers, biggest first, and queues due cards first', () => {
    const later = { ...FREE, id: 'free-2', nextReview: new Date(T0 + 48 * 3600_000).toISOString() }
    const groups = groupCards([MATE, FREE, later, { ...QUIET, motif: 'back-rank' }], T0 + 5 * 3600_000)
    expect(groups.map((g) => [g.key, g.cards.length, g.due])).toEqual([
      ['free-piece', 2, 1],
      ['back-rank', 1, 1],
      ['mate', 1, 1],
    ])
    expect(groups[1].label).toBe('Back rank')
    expect(groupQueue(groups[0], T0 + 5 * 3600_000)).toEqual([FREE.id, 'free-2'])
  })
})

describe('woodpecker', () => {
  const own = Array.from({ length: 10 }, (_, i) => card(QUIET.fen, 'Nf6', { id: `c${i}`, createdAt: new Date(T0 + i * 1000).toISOString() }))

  it('builds a set from own mistakes, newest first, and needs a minimum', () => {
    const set = buildWoodpeckerSet(own, '2026-10-29T12:00:00Z', 4)!
    expect(set.cardIds).toEqual(['c9', 'c8', 'c7', 'c6'])
    expect(buildWoodpeckerSet(own.slice(0, WOODPECKER_MIN - 1))).toBeNull()
    expect(buildWoodpeckerSet(own.map((c) => ({ ...c, source: 'manual' as const })))).toBeNull()
  })

  it('runs a pass, records solves, closes the pass when the set is done and skips deleted cards', () => {
    let set = startCycle(buildWoodpeckerSet(own, '2026-10-29T12:00:00Z', 3)!, '2026-10-29T12:01:00Z')
    expect(set.cycles).toHaveLength(1)
    expect(startCycle(set)).toBe(set)
    expect(remaining(set, own)).toEqual(['c9', 'c8', 'c7'])
    set = recordWoodpecker(set, own, 'c9', 'clean', 20, '2026-10-29T12:02:00Z')
    set = recordWoodpecker(set, own, 'zzz', 'clean', 20)
    expect(remaining(set, own)).toEqual(['c8', 'c7'])
    expect(set.cycles[0].finishedAt).toBeNull()
    // c7 was deleted from the deck: the pass can still finish.
    const deck = own.filter((c) => c.id !== 'c7')
    set = recordWoodpecker(set, deck, 'c8', 'failed', 40, '2026-10-29T12:03:00Z')
    expect(set.cycles[0].finishedAt).toBe('2026-10-29T12:03:00Z')
    expect(summariseCycles(set)).toEqual([{ cycle: 1, clean: 1, assisted: 0, failed: 1, seconds: 60, finished: true }])
    expect(cycleTrend(set)).toBeNull()
    set = startCycle(set, '2026-10-30T12:00:00Z')
    set = recordWoodpecker(set, deck, 'c9', 'clean', 10, '2026-10-30T12:01:00Z')
    set = recordWoodpecker(set, deck, 'c8', 'clean', 20, '2026-10-30T12:02:00Z')
    expect(cycleTrend(set)).toBe('Pass 2 was 50% faster than pass 1, with 1 more clean.')
  })

  it('normalises stored sets field by field', () => {
    expect(normaliseWoodpecker(null)).toBeNull()
    expect(normaliseWoodpecker({ id: 'x', cardIds: [] })).toBeNull()
    const s = normaliseWoodpecker({ id: 'x', cardIds: ['a', 2, 'b'], cycles: [{ results: { a: 'clean', b: 'nope' }, seconds: '12' }, 'junk'] })!
    expect(s.cardIds).toEqual(['a', 'b'])
    expect(s.cycles).toHaveLength(1)
    expect(s.cycles[0].results).toEqual({ a: 'clean' })
    expect(s.cycles[0].seconds).toBe(12)
    expect(s.cycles[0].finishedAt).toBeNull()
  })
})
