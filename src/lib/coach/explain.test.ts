import { describe, expect, it } from 'vitest'
import { analyzePosition } from './features'
import { describePosition, describeReply, explainMove, positionalReasons, verdictFor } from './explain'

// 1.e4 e5 2.Nf3 Nc6 3.Bb5, Black to move.
const RUY = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3'
// ...a6 4.Bxc6, Black to move: both recaptures are possible.
const EXCHANGE = 'r1bqkbnr/1ppp1ppp/p1B5/4p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4'

describe('positionalReasons', () => {
  it('names a pin the move walks into', () => {
    const reasons = positionalReasons(RUY, 'd6', true)
    expect(reasons.join(' ')).toMatch(/pin/)
    expect(reasons.join(' ')).toMatch(/c6/)
  })

  it('names doubled pawns from the wrong recapture', () => {
    expect(positionalReasons(EXCHANGE, 'bxc6', true).join(' ')).toMatch(/doubles your pawns/)
  })

  it('praises a knight landing on an outpost', () => {
    const fen = '4k3/pp3ppp/3p4/8/4P3/2N5/PP3PPP/4K3 w - - 0 1'
    expect(positionalReasons(fen, 'Nd5', false).join(' ')).toMatch(/outpost/)
  })

  it('returns nothing for an illegal move', () => {
    // Black cannot castle yet: the bishop and knight still stand between king and rook.
    expect(positionalReasons(RUY, 'O-O', false)).toEqual([])
  })
})

describe('explainMove', () => {
  it('explains castling as a good move', () => {
    // White to move with castling available.
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
    const note = explainMove({ beforeFen: fen, uci: 'e1g1', classification: { cls: 'best', lossCp: 0 }, bestUci: 'e1g1', replyUci: null })
    expect(note?.tone).toBe('good')
    expect(note?.headline).toMatch(/O-O/)
    expect(note?.points.join(' ')).toMatch(/Castling/)
  })

  it('explains a blunder through the refutation and the better move', () => {
    // Scandinavian after 2.Nc3: the queen on d5 must move, and ...Qc4?? drops it to Bxc4. ...Qa5 was the move.
    const fen = 'rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3'
    const note = explainMove({
      beforeFen: fen,
      uci: 'd5c4',
      classification: { cls: 'blunder', lossCp: 900 },
      bestUci: 'd5a5',
      replyUci: 'f1c4',
    })
    expect(note?.tone).toBe('bad')
    expect(note?.points.join(' ')).toMatch(/wins the queen/)
    expect(note?.points.join(' ')).not.toMatch(/no defender/)
    expect(note?.points.join(' ')).toMatch(/Qa5 was the move|Qa5 was stronger/)
  })
})

describe('describeReply', () => {
  it('describes a capture and a checkmate', () => {
    // Scholar's mate: Qxf7 is mate.
    const mate = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'
    expect(describeReply(mate, 'h5f7')).toMatch(/mates with Qxf7#/)
  })
})

describe('verdictFor', () => {
  it('turns scores into words', () => {
    expect(verdictFor({ type: 'cp', value: 12 }).label).toBe('Equal')
    expect(verdictFor({ type: 'cp', value: 60 }).label).toBe('White is slightly better')
    expect(verdictFor({ type: 'cp', value: -150 }).label).toBe('Black is better')
    expect(verdictFor({ type: 'cp', value: 900 }).label).toBe('White is winning')
    expect(verdictFor({ type: 'mate', value: -3 }).label).toBe('Black mates in 3')
  })
})

describe('describePosition', () => {
  it('points at a loose enemy piece and an uncastled king', () => {
    // Black knight on e5 attacked by Nf3 and undefended; both kings still in the centre.
    const f = analyzePosition('rnbqkb1r/pppp1ppp/8/4n3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4')
    const lines = describePosition(f)
    expect(lines.join(' ')).toMatch(/knight on e5 is loose/)
  })

  it('reports a material lead', () => {
    const f = analyzePosition('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')
    expect(describePosition(f)[0]).toBe('White is 5 pawns up in material.')
  })
})
