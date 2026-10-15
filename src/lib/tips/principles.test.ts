import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { checkPrinciples } from './principles'

function movesFor(sans: string[]) {
  const chess = new Chess()
  for (const san of sans) chess.move(san)
  return chess.history({ verbose: true })
}

const ids = (sans: string[]) => checkPrinciples(movesFor(sans), sans.length - 1).map((r) => r.id)

describe('checkPrinciples', () => {
  it('flags the queen coming out early', () => {
    expect(ids(['e4', 'e5', 'Qh5'])).toContain('queen-early')
  })

  it('does not flag a queen move that captures or comes after development', () => {
    // Queen takes a pawn: there is a concrete reason.
    expect(ids(['e4', 'd5', 'exd5', 'Qxd5'])).not.toContain('queen-early')
    // Queen move at move 7 with pieces developed is fine.
    const line = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'Nc3', 'Nf6', 'd3', 'd6', 'Bg5', 'h6', 'Qd2']
    expect(ids(line)).not.toContain('queen-early')
  })

  it('flags the same piece moved twice while others sit at home', () => {
    expect(ids(['e4', 'e5', 'Nf3', 'Nc6', 'Ng5'])).toContain('piece-moved-twice')
  })

  it('allows a second move of the same piece when it captures or gives check', () => {
    expect(ids(['e4', 'e5', 'Nf3', 'Nc6', 'Nxe5'])).not.toContain('piece-moved-twice')
    expect(ids(['e4', 'e5', 'Bc4', 'Nf6', 'Bxf7+'])).not.toContain('piece-moved-twice')
  })

  it('flags no central pawn presence after move 5', () => {
    const line = ['a4', 'e5', 'h4', 'd5', 'a5', 'Nf6', 'h5', 'Nc6', 'Ra3']
    expect(ids(line)).toContain('no-center-pawn')
    // Black moved e and d pawns, so Black is fine at move 5.
    expect(ids([...line, 'Bc5'])).not.toContain('no-center-pawn')
  })

  it('flags undeveloped minor pieces after move 7', () => {
    const line = ['e4', 'e5', 'd4', 'exd4', 'c3', 'dxc3', 'bxc3', 'Nc6', 'h3', 'Nf6', 'a3', 'Bc5', 'g3', 'O-O', 'h4']
    expect(ids(line)).toContain('minors-undeveloped')
  })

  it('flags not castling by move 10', () => {
    const line = [
      'e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'd6', 'Nc3', 'Nf6', 'Bg5', 'h6', 'Bh4', 'g5', 'Bg3', 'Bg4', 'h3', 'Bh5', 'a3', 'a6',
    ]
    expect(ids(line)).toContain('not-castled') // White's 10th move a3
    expect(ids(line.slice(0, 19))).toContain('not-castled') // also Black at its 10th
    expect(ids(line.slice(0, 17))).not.toContain('not-castled') // move 9: too early
  })

  it('does not nag about castling once castled', () => {
    const line = [
      'e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'd6', 'Nc3', 'Nf6', 'O-O', 'h6', 'h3', 'a6', 'a3', 'b6', 'b3', 'Ra7', 'Re1', 'Rb7', 'Qe2',
    ]
    expect(ids(line)).not.toContain('not-castled')
  })

  it('stops after move 12', () => {
    // Shuffle knights back and forth: 1.Nf3 Nf6 2.Ng1 Ng8 ... reaches move 13 with nothing developed.
    const sans: string[] = []
    while (sans.length < 26) sans.push(...['Nf3', 'Nf6', 'Ng1', 'Ng8'])
    const moves = movesFor(sans)
    expect(checkPrinciples(moves, 23).length).toBeGreaterThan(0) // move 12 still checked
    expect(checkPrinciples(moves, 24)).toEqual([]) // move 13 ignored
  })
})
