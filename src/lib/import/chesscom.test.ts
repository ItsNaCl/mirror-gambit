import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { currentFen } from '../chess/game'
import { decodeTcn, encodeTcn, gameFromChessComJson, parseChessComUrl } from './chesscom'

// A public blitz game (chess.com game 97872578329): its TCN move list and the final position from its PGN.
const SAMPLE_TCN =
  'mCYIbs2UnD92gv5QfAQGAmZReg!Tde8!ltGQeFQBvBIBsb0Sbl6Zlv46mdTNFn7PCKRKDK1Lfe97nBPBvB29Bv9IgfZQvM78dNUNMx!1ksQHxD67fm8!cuI0adXPmnNFtBHQsAQCBJSJKS18AJ0RowRDuD7JdcJIcIPIecFwDw80cI0SIY!7wD3NYW7tWOS0DM01OqtlMl'
const SAMPLE_FINAL = '8/5k2/8/5p1p/4b3/R7/PP1B1K1P/8 b - -'

describe('parseChessComUrl', () => {
  it('reads live, daily and review URLs', () => {
    expect(parseChessComUrl('https://www.chess.com/game/live/97872578329')).toEqual({ kind: 'live', id: '97872578329' })
    expect(parseChessComUrl('https://www.chess.com/game/daily/123456?username=x')).toEqual({ kind: 'daily', id: '123456' })
    expect(parseChessComUrl('https://www.chess.com/analysis/game/live/97872578329/review?tab=review')).toEqual({
      kind: 'live',
      id: '97872578329',
    })
    expect(parseChessComUrl('https://chess.com/live/game/97872578329')).toEqual({ kind: 'live', id: '97872578329' })
    expect(parseChessComUrl('  https://www.chess.com/game/97872578329  ')).toEqual({ kind: 'live', id: '97872578329' })
  })

  it('rejects other sites and pages without a game id', () => {
    expect(parseChessComUrl('https://lichess.org/abcdef12')).toBeNull()
    expect(parseChessComUrl('https://evil-chess.com.example.org/game/live/123456')).toBeNull()
    expect(parseChessComUrl('https://www.chess.com/home')).toBeNull()
    expect(parseChessComUrl('not a url')).toBeNull()
  })
})

describe('TCN', () => {
  it('decodes a real game to the right final position', () => {
    const chess = new Chess()
    for (const uci of decodeTcn(SAMPLE_TCN)) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    expect(chess.fen().split(' ').slice(0, 4).join(' ')).toBe(SAMPLE_FINAL)
  })

  it('round-trips promotions in every direction and piece', () => {
    const moves = ['a7a8q', 'b7a8n', 'c7d8r', 'h2h1b', 'g2f1q', 'e2d1n', 'e2e4', 'g8f6']
    expect(decodeTcn(encodeTcn(moves))).toEqual(moves)
  })

  it('throws on unknown characters', () => {
    expect(() => decodeTcn('m"')).toThrow(/Unreadable/)
  })
})

describe('gameFromChessComJson', () => {
  it('builds the game with players and result', () => {
    const json = JSON.stringify({
      game: { moveList: SAMPLE_TCN, initialSetup: '', pgnHeaders: { White: 'Hikaru', Black: 'Gravity_Chess', Result: '1-0', Date: '2024.01.01' } },
    })
    const g = gameFromChessComJson(json)
    expect(g.white).toBe('Hikaru')
    expect(g.result).toBe('1-0')
    expect(g.state.moves).toHaveLength(101)
    expect(currentFen(g.state).startsWith(SAMPLE_FINAL.split(' ')[0])).toBe(true)
  })

  it('explains what went wrong', () => {
    expect(() => gameFromChessComJson('<html>')).toThrow(/not a game/)
    expect(() => gameFromChessComJson('{"game":{}}')).toThrow(/did not include the moves/)
    expect(() => gameFromChessComJson(JSON.stringify({ game: { moveList: 'mCmC' } }))).toThrow(/does not fit/)
  })
})
