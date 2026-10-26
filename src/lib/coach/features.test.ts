import { describe, expect, it } from 'vitest'
import { analyzePosition } from './features'

describe('analyzePosition', () => {
  it('reads the starting position as level and fully undeveloped', () => {
    const f = analyzePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    expect(f.material).toEqual({ w: 39, b: 39 })
    expect(f.loose).toEqual([])
    expect(f.lines).toEqual([])
    expect(f.undeveloped.w).toHaveLength(4)
    expect(f.pawns.w.islands).toBe(1)
    expect(f.control.e3.w).toBe(2) // d2 and f2 pawns
  })

  it('finds a hanging piece and its cheapest attacker', () => {
    // Black knight on e5 attacked by the f3 knight, nothing defends it.
    const f = analyzePosition('rnbqkb1r/pppp1ppp/8/4n3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4')
    const knight = f.loose.find((l) => l.square === 'e5')
    expect(knight?.kind).toBe('hanging')
    expect(knight?.cheapestAttacker).toBe('f3')
  })

  it('finds an absolute pin and a skewer', () => {
    // After ...d6 the d7 square is empty, so Bb5 pins the c6 knight to the e8 king.
    const pin = analyzePosition('r1bqkbnr/pp2pppp/2np4/1Bp5/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 4')
    expect(pin.lines).toContainEqual({ kind: 'pin', absolute: true, attacker: 'b5', front: 'c6', back: 'e8', victim: 'b' })
    // Rook on a1 checks the king on a5, which stands in front of the queen on a8: a skewer.
    const skewer = analyzePosition('q7/8/8/k7/8/8/8/R5K1 b - - 0 1')
    expect(skewer.lines).toContainEqual({ kind: 'skewer', absolute: true, attacker: 'a1', front: 'a5', back: 'a8', victim: 'b' })
  })

  it('ignores a queen lined up against a pawn and a queen, which is no pin', () => {
    // Black queen on d6 looks down the d-file at the d2 pawn and the d1 queen.
    const f = analyzePosition('rnb1kbnr/ppp1pppp/3q4/8/8/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 4')
    expect(f.lines.filter((t) => t.attacker === 'd6')).toEqual([])
  })

  it('reads isolated, doubled and passed pawns and counts islands', () => {
    // White: a2, c3, c4 (doubled), e5 (passed, no black pawn on d-f ahead). Black: a7, b7, g7, h7.
    const f = analyzePosition('4k3/pp4pp/8/4P3/2P5/2P5/P7/4K3 w - - 0 1')
    expect(f.pawns.w.isolated.sort()).toEqual(['a2', 'c3', 'c4', 'e5'])
    expect(f.pawns.w.doubled.sort()).toEqual(['c3', 'c4'])
    expect(f.pawns.w.passed).toContain('e5')
    expect(f.pawns.w.islands).toBe(3)
    expect(f.pawns.b.islands).toBe(2)
  })

  it('finds an outpost that no enemy pawn can attack', () => {
    // White pawn e4 supports d5; Black has no c- or e-pawn left to chase a piece from d5.
    const f = analyzePosition('4k3/pp3ppp/3p4/8/4P3/8/PP3PPP/4K3 w - - 0 1')
    expect(f.outposts.w).toContain('d5')
    expect(f.outposts.w).not.toContain('f5') // g7 can still come to g6
  })

  it('scores a castled king with a full pawn shield', () => {
    const f = analyzePosition('r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w - - 6 6')
    expect(f.kings.w.castled).toBe(true)
    expect(f.kings.w.shield).toBe(3)
    expect(f.kings.b.square).toBe('g8')
  })
})
