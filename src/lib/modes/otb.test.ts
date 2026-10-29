import { describe, expect, it } from 'vitest'
import { otbGame, parseMoves, todayLocal, tokensOf } from './otb'

describe('tokensOf', () => {
  it('drops move numbers, results and comments and normalises castling', () => {
    expect(tokensOf('1. e4 e5 2. Nf3 {book} Nc6 3. Bb5!? a6 4. 0-0 Nf6 ; note\n5. o-o-o 1-0')).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'O-O', 'Nf6', 'O-O-O'])
    expect(tokensOf('1.e4 e5 2.Nf3')).toEqual(['e4', 'e5', 'Nf3'])
    expect(tokensOf('  ')).toEqual([])
  })
})

describe('parseMoves', () => {
  it('plays legal moves and points at the first bad one', () => {
    const ok = parseMoves('1. e4 e5 2. Nf3 Nc6 3. Bb5')
    expect(ok.error).toBeNull()
    expect(ok.sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])
    expect(ok.state.moves).toHaveLength(5)

    const bad = parseMoves('e4 e5 Nf3 Nf3')
    expect(bad.sans).toEqual(['e4', 'e5', 'Nf3'])
    expect(bad.error).toMatchObject({ index: 3, token: 'Nf3' })
    expect(bad.error?.message).toMatch(/Move 2, Black: "Nf3" is not a legal move here/)
  })

  it('accepts the castling spellings a scoresheet uses', () => {
    const r = parseMoves('e4 e5 Nf3 Nc6 Bc4 Bc5 0-0')
    expect(r.error).toBeNull()
    expect(r.sans.at(-1)).toBe('O-O')
  })
})

describe('otbGame', () => {
  it('shapes a library game the review and the profile can use', () => {
    const g = otbGame(['e4', 'e5'], { userColor: 'b', opponent: 'Sam', date: '2026-10-29', result: '0-1' })
    expect(g.id).toMatch(/^otb:[0-9a-z]+$/)
    // The same game entered twice gets the same id; a different day or move list does not.
    expect(otbGame(['e4', 'e5'], { userColor: 'b', opponent: 'Other', date: '2026-10-29', result: '1-0' }).id).toBe(g.id)
    expect(otbGame(['e4', 'e5'], { userColor: 'b', opponent: 'Sam', date: '2026-10-28', result: '0-1' }).id).not.toBe(g.id)
    expect(g.source).toBe('otb')
    expect(g.white).toBe('Sam')
    expect(g.black).toBe('Me')
    expect(g.userColor).toBe('b')
    expect(g.timeClass).toBe('classical')
    expect(g.sans).toBe('e4 e5')
    expect(g.date.startsWith('2026-10-29')).toBe(true)
    expect(otbGame([], { userColor: 'w', opponent: '  ', date: '2026-01-01', result: '1/2-1/2' }).black).toBe('Opponent')
  })

  it('formats today in local time', () => {
    expect(todayLocal(new Date(2026, 9, 29, 23, 30))).toBe('2026-10-29')
  })
})
