import { describe, expect, it } from 'vitest'
import { fenAt } from '../chess/game'
import { gradeGuess, guessPlies, judgeGuess, modelGameState, parseModelGames, pickModelGame, summarise, type ModelGame } from './guessTheMove'

// 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. Re1 a6 (14 plies)
const game: ModelGame = {
  id: 'abc',
  url: 'https://lichess.org/abc',
  white: 'A',
  black: 'B',
  whiteElo: 2500,
  blackElo: 2450,
  date: '2020-10-01',
  eco: 'C50',
  opening: 'Italian Game',
  timeControl: '600+0',
  result: '1-0',
  side: 'w',
  bucket: 'italian-w',
  sans: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6',
  evals: Array.from({ length: 15 }, (_, i) => 20 + i),
}

describe('parseModelGames', () => {
  it('keeps games that replay and drops the rest', () => {
    const set = parseModelGames({
      depth: 10,
      buckets: [],
      games: [game, { ...game, id: 'bad', sans: 'e4 e5 Nf3 Qh5' }, { ...game, id: 'short', sans: 'e4 e5', evals: [0, 0, 0] }, { ...game, id: 'few-evals', evals: game.evals.slice(0, 14) }],
    })
    expect(set.games.map((g) => g.id)).toEqual(['abc'])
    expect(set.depth).toBe(10)
  })

  it('survives junk', () => {
    expect(parseModelGames(null).games).toEqual([])
  })
})

describe('picking and plies', () => {
  const set = parseModelGames({ games: [game, { ...game, id: 'def', bucket: 'scotch-w' }] })

  it('picks from the bucket, preferring unseen games', () => {
    expect(pickModelGame(set, 'scotch-w', new Set())?.id).toBe('def')
    expect(pickModelGame(set, 'any', new Set(['abc']))?.id).toBe('def')
    expect(pickModelGame(set, 'any', new Set(['abc', 'def']), 0)?.id).toBe('abc')
    expect(pickModelGame(set, 'ruy-b', new Set())).toBeNull()
  })

  it('asks for the model side moves from move 6', () => {
    expect(guessPlies(game)).toEqual([10, 12])
    expect(guessPlies({ ...game, side: 'b' })).toEqual([11, 13])
    expect(modelGameState(game).moves).toHaveLength(14)
  })
})

describe('grading', () => {
  it('rewards the move and anything as good, and scales down with the loss', () => {
    expect(gradeGuess(200, 0, true)).toBe('match')
    expect(gradeGuess(10, 0, false)).toBe('equal')
    expect(gradeGuess(50, 0, false)).toBe('close')
    expect(gradeGuess(120, 0, false)).toBe('off')
    expect(gradeGuess(400, 20, false)).toBe('bad')
    // The master also gave a little away: the guess is measured against that.
    expect(gradeGuess(70, 60, false)).toBe('equal')
  })

  it('judges a guess with words', () => {
    const fen = fenAt(modelGameState(game), 10)
    const match = judgeGuess({ fen, side: 'w', guessUci: 'e1g1', masterSan: 'O-O', evalBefore: 30, evalMaster: 30, evalGuess: 30 })!
    expect(match.grade).toBe('match')
    expect(match.headline).toMatch(/O-O is what the master played/)
    // Bxf7+?? instead of castling: a piece for a pawn.
    const bad = judgeGuess({ fen, side: 'w', guessUci: 'c4f7', masterSan: 'O-O', evalBefore: 30, evalMaster: 30, evalGuess: -250 })!
    expect(bad.grade).toBe('bad')
    expect(bad.guess).toBe('Bxf7+')
    expect(bad.headline).toMatch(/O-O was the move/)
    expect(bad.reasons.length).toBeGreaterThan(0)
    expect(judgeGuess({ fen, side: 'w', guessUci: 'a1a8', masterSan: 'O-O', evalBefore: 0, evalMaster: 0, evalGuess: 0 })).toBeNull()
  })

  it('sums the session', () => {
    expect(summarise(['match', 'close', 'bad'])).toEqual({ points: 5, max: 9, percent: 56, matches: 1, guesses: 3 })
    expect(summarise([]).percent).toBe(0)
  })
})
