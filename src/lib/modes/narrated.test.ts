import { describe, expect, it } from 'vitest'
import type { EngineLine } from '../engine/uci'
import { gameOverLine, intro, narrateCoachMove, narrateOpponentMove, predictionLoss, predictPrompt } from './narrated'

const line = (pv: string[], cp: number): EngineLine => ({ multipv: 1, depth: 12, score: { type: 'cp', value: cp }, pv })

// After 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4?: White to move, Nxe5 wins a pawn.
const FEN = 'r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 1 4'

describe('narrated game voices', () => {
  it('speaks in each voice', () => {
    expect(intro('direct', 'w', 'Club')).toMatch(/I play White against the Club level/)
    expect(intro('playful', 'b', 'Novice')).toMatch(/Black/)
    expect(predictPrompt('calm')).toMatch(/When you are ready/)
    expect(gameOverLine('direct', 'win')).toMatch(/I won/)
    expect(gameOverLine('playful', 'loss')).toMatch(/Lost/)
  })
})

describe('predictionLoss', () => {
  const lines = [line(['f3e5', 'd8g5'], 120), line(['e1g1'], 40), line(['c2c3'], 30)]
  it('measures a prediction against the best line from the mover side', () => {
    expect(predictionLoss(lines, 'f3e5', 'w')).toBe(0)
    expect(predictionLoss(lines, 'e1g1', 'w')).toBe(80)
    expect(predictionLoss(lines, 'a2a3', 'w')).toBeNull()
  })
  it('flips the sign for Black', () => {
    const black = [line(['e7e5'], -30), line(['c7c5'], 10)]
    expect(predictionLoss(black, 'c7c5', 'b')).toBe(40)
  })
})

describe('narrateCoachMove', () => {
  const lines = [line(['f3e5', 'd8g5'], 120), line(['e1g1'], 40)]

  it('praises a matching prediction and explains the move with the alternative it rejected', () => {
    const n = narrateCoachMove({ fenBefore: FEN, uci: 'f3e5', voice: 'direct', lines, prediction: { uci: 'f3e5', lossCp: 0 } })
    expect(n.title).toBe('Nxe5')
    expect(n.lines[0]).toBe('That is my move too.')
    expect(n.lines[1]).toMatch(/^I play Nxe5\./)
    expect(n.lines.some((l) => /rejected O-O: it loses about 0\.8 pawns/.test(l))).toBe(true)
  })

  it('tells a missed prediction what it gave away, in the chosen voice', () => {
    const n = narrateCoachMove({ fenBefore: FEN, uci: 'f3e5', voice: 'playful', lines, prediction: { uci: 'e1g1', lossCp: 80 } })
    expect(n.lines[0]).toMatch(/^O-O\? That would cost about 0\.8 pawns/)
    const close = narrateCoachMove({ fenBefore: FEN, uci: 'f3e5', voice: 'calm', lines, prediction: { uci: 'e1g1', lossCp: 20 } })
    expect(close.lines[0]).toMatch(/O-O is a reasonable idea/)
  })

  it('has a quiet-move line when the board gives no idea', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const n = narrateCoachMove({ fenBefore: start, uci: 'a2a3', voice: 'direct', lines: [line(['a2a3'], 0)] })
    expect(n.lines[0]).toMatch(/I play a3\. A quiet move/)
    expect(narrateCoachMove({ fenBefore: start, uci: 'a1a8', voice: 'direct', lines: [] }).lines).toEqual([])
  })
})

describe('narrateOpponentMove', () => {
  it('names a threat against the coach and a gift the move leaves', () => {
    // 1. e4 e5 2. Nf3 Nc6 3. Bc4: Black's Ba3 puts the bishop where the b2 pawn takes it.
    const before = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3'
    const n = narrateOpponentMove(before, 'f8a3', 'direct')
    expect(n.title).toBe('Ba3')
    expect(n.lines[0]).toMatch(/^They play Ba3/)
    expect(n.lines.some((l) => /gift/i.test(l))).toBe(true)
  })

  it('says what a developing move does', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const n = narrateOpponentMove(start, 'g8f6', 'calm')
    expect(n.lines[0]).toMatch(/The reply is Nf6\. /)
  })
})
