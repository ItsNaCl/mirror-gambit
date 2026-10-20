import { describe, expect, it } from 'vitest'
import type { ReviewedMove } from '../review/review'
import { coachNote, expandLine, lineLesson, lineText } from './coach'

describe('expandLine', () => {
  it('plays legal moves and stops at the first illegal one', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const steps = expandLine(start, ['e2e4', 'e7e5', 'e4e5', 'g1f3'])
    expect(steps.map((s) => s.san)).toEqual(['e4', 'e5'])
  })

  it('stops after the given number of plies', () => {
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(expandLine(start, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 2)).toHaveLength(2)
  })
})

describe('lineLesson', () => {
  it('spots a knight fork of king and rook, and the material it wins', () => {
    // White knight on e5 jumps to f7, forking the king on h8 and the rook on d8.
    const fen = '3r3k/6pp/8/4N3/8/8/6PP/6K1 w - - 0 1'
    const lesson = lineLesson(fen, ['e5f7', 'h8g8', 'f7d8'])
    expect(lesson.insights.some((i) => i.kind === 'fork' && /forks the king and rook/.test(i.text))).toBe(true)
    expect(lesson.materialSwing).toBe(5)
  })

  it('spots checkmate', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'
    const lesson = lineLesson(fen, ['a1a8'])
    expect(lesson.insights[0]).toMatchObject({ kind: 'mate' })
  })

  it('spots taking an undefended piece', () => {
    const fen = '6k1/8/8/3b4/8/8/8/3R2K1 w - - 0 1'
    const lesson = lineLesson(fen, ['d1d5'])
    expect(lesson.insights[0]).toMatchObject({ kind: 'hanging' })
    expect(lesson.materialSwing).toBe(3)
  })

  it('counts material from the starting side, losses included', () => {
    // White's knight takes a pawn and the rook takes the knight back: +1 - 3 = -2 for White.
    const fen = '3r2k1/8/3p4/8/2N5/8/8/6K1 w - - 0 1'
    const lesson = lineLesson(fen, ['c4d6', 'd8d6'])
    expect(lesson.materialSwing).toBe(-2)
  })
})

describe('recaptures', () => {
  it('does not call a recapture an undefended piece', () => {
    // Black's rook takes on a3 and the pawn takes it back: a trade.
    const fen = '8/5k2/8/5p1p/8/R7/1P6/5K2 b - - 0 1'
    const lesson = lineLesson(fen.replace('8/5k2', 'r7/5k2'), ['a8a3', 'b2a3'])
    expect(lesson.insights.filter((i) => i.kind === 'hanging')).toHaveLength(0)
  })
})

describe('lineText', () => {
  it('numbers moves from the position', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const steps = expandLine(fen, ['e7e5', 'g1f3', 'b8c6'])
    expect(lineText(fen, steps)).toBe('1... e5 2. Nf3 Nc6')
  })
})

describe('coachNote', () => {
  const before = '3r3k/6pp/8/4N3/8/8/6PP/6K1 w - - 0 1'
  const after = '3r3k/6pp/8/8/8/5N2/6PP/6K1 b - - 1 1' // White played Nf3 instead

  function reviewed(partial: Partial<ReviewedMove>): ReviewedMove {
    return {
      index: 0,
      san: 'Nf3',
      mover: 'w',
      classification: { cls: 'mistake', lossCp: 250 },
      betterMove: 'Nf7+',
      evalAfter: { type: 'cp', value: 0 },
      bestLine: ['e5f7', 'h8g8', 'f7d8'],
      replyLine: [],
      ...partial,
    }
  }

  it('explains the missed fork', () => {
    const note = coachNote(reviewed({}), before, after)
    expect(note.headline).toBe('Mistake: Nf3')
    expect(note.body.join(' ')).toMatch(/Better was Nf7\+/)
    expect(note.body.join(' ')).toMatch(/forks the king and rook/)
    expect(note.better?.steps).toHaveLength(3)
  })

  it('praises the best move and offers no better line', () => {
    const fenAfterBest = '3r3k/5Npp/8/8/8/8/6PP/6K1 b - - 1 1'
    const note = coachNote(reviewed({ san: 'Nf7+', classification: { cls: 'best', lossCp: 0 } }), before, fenAfterBest)
    expect(note.body[0]).toMatch(/top move/)
    expect(note.better).toBeNull()
  })

  it('warns about what a blunder allowed', () => {
    // Black to move after White's blunder; Black mates on the back rank.
    const blunderAfter = '6k1/8/8/8/8/8/5PPP/r5K1 w - - 0 1'
    const prev = '6k1/8/8/8/8/8/5PPP/r3R1K1 w - - 0 1'
    const note = coachNote(
      reviewed({ san: 'Re8+', classification: { cls: 'blunder', lossCp: 900 }, bestLine: [], replyLine: [] }),
      prev,
      blunderAfter,
    )
    expect(note.allowed).toBeNull()
    const withReply = coachNote(
      reviewed({ classification: { cls: 'blunder', lossCp: 900, reason: 'allowed-mate' }, bestLine: [], replyLine: ['a1a8'] }),
      prev,
      '6k1/8/8/8/8/8/5PPP/r5K1 b - - 0 1',
    )
    expect(withReply.body.join(' ')).toMatch(/lets the opponent force checkmate/)
  })
})
