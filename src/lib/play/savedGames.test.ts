import { describe, expect, it } from 'vitest'
import { addSavedGame, countsAsSlowGame, MAX_SAVED_GAMES, outcomeFor, recordByLevel, type SavedGame } from './savedGames'

function game(id: string, levelId: number, userColor: 'w' | 'b', result: SavedGame['result']): SavedGame {
  return { id, date: '2026-10-20T12:00:00.000Z', levelId, userColor, result, reason: 'Checkmate', moveCount: 20, pgn: '1. e4 e5 *' }
}

describe('saved games', () => {
  it('turns a result into a win, loss or draw for the player', () => {
    expect(outcomeFor('1-0', 'w')).toBe('win')
    expect(outcomeFor('1-0', 'b')).toBe('loss')
    expect(outcomeFor('0-1', 'b')).toBe('win')
    expect(outcomeFor('1/2-1/2', 'w')).toBe('draw')
  })

  it('keeps the newest games first, without duplicates, up to the cap', () => {
    let list: SavedGame[] = []
    for (let i = 0; i < MAX_SAVED_GAMES + 5; i++) list = addSavedGame(list, game(String(i), 1, 'w', '1-0'))
    expect(list).toHaveLength(MAX_SAVED_GAMES)
    expect(list[0].id).toBe(String(MAX_SAVED_GAMES + 4))
    list = addSavedGame(list, game('10', 2, 'w', '0-1'))
    expect(list.filter((g) => g.id === '10')).toHaveLength(1)
    expect(list[0].levelId).toBe(2)
  })

  it('counts results per level', () => {
    const r = recordByLevel([game('a', 1, 'w', '1-0'), game('b', 1, 'b', '1-0'), game('c', 3, 'w', '1/2-1/2')])
    expect(r[1]).toEqual({ win: 1, loss: 1, draw: 0 })
    expect(r[3]).toEqual({ win: 0, loss: 0, draw: 1 })
  })
})

describe('slow game rule', () => {
  it('counts a long game, or a shorter one that was played out', () => {
    expect(countsAsSlowGame(40, true)).toBe(true)
    expect(countsAsSlowGame(20, false)).toBe(true)
    expect(countsAsSlowGame(20, true)).toBe(false)
    expect(countsAsSlowGame(12, false)).toBe(false)
  })
})
