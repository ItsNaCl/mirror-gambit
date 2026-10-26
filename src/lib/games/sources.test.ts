import { describe, expect, it } from 'vitest'
import { libraryGameState, mergeLibrary, parseChessComGames, parseLichessNdjson, type LibraryGame } from './sources'

// Shapes follow the Lichess and chess.com public API responses.
const LICHESS = [
  JSON.stringify({
    id: 'AbCd1234',
    variant: 'standard',
    speed: 'blitz',
    createdAt: Date.parse('2026-10-20T18:00:00Z'),
    players: { white: { user: { name: 'NaClPlayer' } }, black: { user: { name: 'someone' } } },
    winner: 'black',
    status: 'mate',
    moves: 'f3 e5 g4 Qh4#',
    opening: { eco: 'A00', name: "Barnes Opening: Fool's Mate" },
  }),
  JSON.stringify({ id: 'Var12345', variant: 'chess960', players: { white: { user: { name: 'naclplayer' } } }, moves: 'e4' }),
  JSON.stringify({ id: 'Other123', variant: 'standard', players: { white: { user: { name: 'x' } }, black: { user: { name: 'y' } } }, moves: 'e4 e5' }),
  'not json',
].join('\n')

const CHESSCOM_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[White "Opponent"]
[Black "NaClPlayer"]
[Result "0-1"]
[ECOUrl "https://www.chess.com/openings/Scandinavian-Defense-Mieses-Kotroc-Variation"]

1. e4 {[%clk 0:04:59]} 1... d5 {[%clk 0:04:58]} 2. exd5 Qxd5 3. Nc3 Qa5 0-1`

describe('parseLichessNdjson', () => {
  it('keeps standard games of the user, works out their colour and the result', () => {
    const games = parseLichessNdjson(LICHESS, 'naclplayer')
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({
      id: 'lichess:AbCd1234',
      userColor: 'w',
      result: '0-1',
      timeClass: 'blitz',
      sans: 'f3 e5 g4 Qh4#',
      opening: "A00 Barnes Opening: Fool's Mate",
    })
    expect(libraryGameState(games[0]).moves).toHaveLength(4)
  })
})

describe('parseChessComGames', () => {
  it('reads the PGN, ignoring clock comments, and finds the user as Black', () => {
    const games = parseChessComGames(
      [
        { url: 'https://www.chess.com/game/live/98765', pgn: CHESSCOM_PGN, time_class: 'blitz', rules: 'chess', end_time: 1761000000, white: { username: 'Opponent', result: 'resigned' }, black: { username: 'NaClPlayer', result: 'win' } },
        { url: 'https://www.chess.com/game/live/1', pgn: CHESSCOM_PGN, rules: 'crazyhouse', white: { username: 'NaClPlayer' }, black: { username: 'b' } },
      ],
      'naclplayer',
    )
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({ id: 'chesscom:98765', userColor: 'b', result: '0-1', sans: 'e4 d5 exd5 Qxd5 Nc3 Qa5' })
    expect(games[0].opening).toBe('Scandinavian Defense Mieses Kotroc Variation')
  })
})

describe('mergeLibrary', () => {
  const g = (id: string, date: string) => ({ id, date }) as LibraryGame
  it('adds new games, keeps the newest first and skips duplicates', () => {
    const merged = mergeLibrary([g('a', '2026-10-01T00:00:00Z')], [g('b', '2026-10-05T00:00:00Z'), g('a', '2026-10-01T00:00:00Z')])
    expect(merged.map((x) => x.id)).toEqual(['b', 'a'])
    expect(mergeLibrary([], [g('a', '2026-10-01T00:00:00Z'), g('b', '2026-10-02T00:00:00Z')], 1).map((x) => x.id)).toEqual(['b'])
  })
})
