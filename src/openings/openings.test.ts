import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { hasOpeningName, openingRowsByName } from '../lib/tips/openingDetect'
import { allLines, openings } from './index'

/** Replays a SAN list and returns the first illegal move, or null if all are legal. */
function firstIllegal(sans: string[]): { index: number; san: string; fen: string } | null {
  const chess = new Chess()
  for (let i = 0; i < sans.length; i++) {
    const fen = chess.fen()
    try {
      chess.move(sans[i])
    } catch {
      return { index: i, san: sans[i], fen }
    }
  }
  return null
}

describe('opening data', () => {
  it('has unique ids', () => {
    const ids = openings.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers the 17 requested openings plus one trap line per side', () => {
    expect(openings.filter((o) => o.group === 'trap-line' && o.side === 'white')).toHaveLength(1)
    expect(openings.filter((o) => o.group === 'trap-line' && o.side === 'black')).toHaveLength(1)
    expect(openings.filter((o) => o.group !== 'trap-line')).toHaveLength(17)
  })

  for (const opening of openings) {
    describe(opening.name, () => {
      for (const line of allLines(opening)) {
        it(`${line.name}: every move is legal`, () => {
          const sans = line.moves.map((m) => m.san)
          const bad = firstIllegal(sans)
          expect(bad, bad ? `illegal move ${bad.san} at ply ${bad.index + 1} in position ${bad.fen}` : '').toBeNull()
        })

        it(`${line.name}: every move has a comment`, () => {
          for (const m of line.moves) expect(m.comment.trim().length, `missing comment for ${m.san}`).toBeGreaterThan(10)
        })
      }

      it('main line is 8 to 12 moves long', () => {
        expect(opening.mainLine.moves.length).toBeGreaterThanOrEqual(16)
        expect(opening.mainLine.moves.length).toBeLessThanOrEqual(24)
      })

      it('has one or two sidelines, key ideas and a trap', () => {
        expect(opening.sidelines.length).toBeGreaterThanOrEqual(1)
        expect(opening.sidelines.length).toBeLessThanOrEqual(2)
        expect(opening.keyIdeas.length).toBeGreaterThanOrEqual(3)
        expect(opening.trap.moves.length).toBeGreaterThan(0)
        expect(opening.trap.description.length).toBeGreaterThan(20)
      })

      it('branches start inside the main line', () => {
        for (const b of [...opening.sidelines, opening.trap]) {
          expect(b.from).toBeGreaterThanOrEqual(0)
          expect(b.from).toBeLessThanOrEqual(opening.mainLine.moves.length)
        }
      })

      it('name exists in the Lichess dataset and its book moves start the main line', () => {
        expect(hasOpeningName(opening.lichessName), `"${opening.lichessName}" is not in the Lichess data`).toBe(true)
        const mainSans = opening.mainLine.moves.map((m) => m.san)
        const rows = openingRowsByName(opening.lichessName)
        const matches = rows.some(([, , moves]) => {
          const book = moves.split(' ')
          return book.length <= mainSans.length && book.every((san, i) => san === mainSans[i])
        })
        expect(matches, `no Lichess row for "${opening.lichessName}" is a prefix of the main line`).toBe(true)
      })
    })
  }
})
