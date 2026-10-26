import { describe, expect, it } from 'vitest'
import { allLines, openings } from '../../openings'
import {
  addLine,
  findGaps,
  myMoveAt,
  newRepertoire,
  opponentReplies,
  pickDrillLine,
  posKey,
  removeMove,
  repStats,
  reviewMove,
  START_POS,
} from './repertoire'

const NOW = Date.parse('2026-10-26T12:00:00Z')
const HOUR = 3600 * 1000

function whiteItalian() {
  let rep = newRepertoire('White', 'w', NOW)
  rep = addLine(rep, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'], undefined, NOW).rep
  rep = addLine(rep, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3'], undefined, NOW).rep
  rep = addLine(rep, ['e4', 'c5', 'Nf3'], undefined, NOW).rep
  return rep
}

describe('addLine', () => {
  it('keeps one move per position on your side and any number of replies', () => {
    const rep = whiteItalian()
    // White: e4, Nf3 (twice, same position), Bc4, c3, d3, Nf3 vs Sicilian = 6 positions with a White move.
    expect(repStats(rep, NOW)).toEqual({ myMoves: 6, due: 6, learned: 0 })
    expect(rep.moves.filter((m) => m.pos === posKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).map((m) => m.san).sort()).toEqual(['c5', 'e5'])
  })

  it('replaces your move and drops what only followed it', () => {
    const { rep, replaced } = addLine(whiteItalian(), ['e4', 'c5', 'c3'], undefined, NOW)
    expect(replaced).toEqual([{ pos: expect.any(String), old: 'Nf3', now: 'c3' }])
    expect(rep.moves.some((m) => m.san === 'Nf3' && m.pos.includes('2p5'))).toBe(false)
  })

  it('treats a transposition as the same position', () => {
    let rep = newRepertoire('Black', 'b', NOW)
    rep = addLine(rep, ['d4', 'Nf6', 'c4', 'e6'], undefined, NOW).rep
    rep = addLine(rep, ['c4', 'Nf6', 'd4'], undefined, NOW).rep
    // After 1.c4 Nf6 2.d4 the position equals 1.d4 Nf6 2.c4, so Black's answer e6 is already known.
    const pos = posKey('rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2')
    expect(myMoveAt(rep, pos)?.san).toBe('e6')
  })
})

describe('removeMove', () => {
  it('removes a branch and everything under it', () => {
    const rep = whiteItalian()
    const afterE4 = posKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
    const cut = removeMove(rep, afterE4, 'e7e5')
    expect(repStats(cut, NOW).myMoves).toBe(2) // e4, Nf3 against the Sicilian
  })
})

describe('drills and the schedule', () => {
  it('drills a line that ends on your move, choosing replies that lead to due moves', () => {
    const rep = whiteItalian()
    const line = pickDrillLine(rep, { nowMs: NOW, random: () => 0 })
    expect(line[0]).toMatchObject({ pos: START_POS, san: 'e4', mine: true })
    expect(line.at(-1)?.mine).toBe(true)
    expect(line.every((s, i) => s.mine === (i % 2 === 0))).toBe(true)
  })

  it('pushes a well-answered move into the future and nothing is due after', () => {
    let rep = whiteItalian()
    for (const m of rep.moves.filter((x) => x.mine)) rep = reviewMove(rep, m.pos, m.uci, 5, NOW)
    expect(repStats(rep, NOW + HOUR).due).toBe(0)
    expect(pickDrillLine(rep, { nowMs: NOW + HOUR })).toEqual([])
    expect(repStats(rep, NOW + 5 * HOUR).due).toBe(6) // first interval is 4 hours
    expect(pickDrillLine(rep, { nowMs: NOW + HOUR, all: true }).length).toBeGreaterThan(0)
  })

  it('prefers the reply opponents actually play', () => {
    const rep = whiteItalian()
    const counts = opponentReplies(
      Array.from({ length: 50 }, () => ({ sans: 'e4 c5 Nf3 d6', userColor: 'w' as const })),
      'w',
    )
    // random() = 0.9 lands in the heavily weighted Sicilian branch.
    const line = pickDrillLine(rep, { nowMs: NOW, replyCounts: counts, random: () => 0.9 })
    expect(line.map((s) => s.san)).toEqual(['e4', 'c5', 'Nf3'])
  })
})

describe('built-in openings as repertoires', () => {
  it.each(openings.map((o) => [o.name, o] as const))('%s imports without replacing a main-line move', (_name, o) => {
    let rep = newRepertoire(o.name, o.side === 'white' ? 'w' : 'b', NOW)
    const mainMoves = new Set<string>()
    for (const [i, line] of allLines(o).filter((l) => !l.isTrap).entries()) {
      const r = addLine(rep, line.moves.map((m) => m.san), undefined, NOW, 'skip')
      rep = r.rep
      expect(r.replaced).toEqual([])
      if (i === 0) for (const m of rep.moves) if (m.mine) mainMoves.add(`${m.pos}|${m.uci}`)
    }
    // Every one of your main-line moves survives the sidelines.
    for (const k of mainMoves) expect(rep.moves.some((m) => `${m.pos}|${m.uci}` === k)).toBe(true)
    expect(repStats(rep, NOW).myMoves).toBeGreaterThan(3)
  })

  it('skips a sideline that is a different choice for your side', () => {
    const ruy = openings.find((o) => o.id === 'ruyLopez' || o.name === 'Ruy Lopez')!
    let rep = newRepertoire('Ruy', 'w', NOW)
    const skipped: string[] = []
    for (const line of allLines(ruy).filter((l) => !l.isTrap)) {
      const r = addLine(rep, line.moves.map((m) => m.san), undefined, NOW, 'skip')
      rep = r.rep
      if (r.skipped) skipped.push(line.name)
    }
    expect(skipped).toContain('Exchange Variation (4.Bxc6)')
  })
})

describe('findGaps', () => {
  it('lists opponent replies with no prepared answer, most played first', () => {
    const rep = whiteItalian()
    const counts = opponentReplies(
      [
        { sans: 'e4 e6 d4 d5', userColor: 'w' },
        { sans: 'e4 e6 d4 d5', userColor: 'w' },
        { sans: 'e4 c6 d4 d5', userColor: 'w' },
        { sans: 'e4 e5 Nf3 Nc6', userColor: 'w' },
      ],
      'w',
    )
    const gaps = findGaps(rep, counts)
    expect(gaps.map((g) => [g.san, g.played])).toEqual([
      ['e6', 2],
      ['c6', 1],
    ])
    expect(gaps[0].line).toEqual(['e4'])
  })
})
