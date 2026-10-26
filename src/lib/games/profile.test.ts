import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { buildProfile, openingFamily, outcome, phaseOf, tagMistake, type AnalysedGame, type TaggedMistake } from './profile'
import type { LibraryGame } from './sources'

function after(fen: string, san: string): string {
  const c = new Chess(fen)
  c.move(san)
  return c.fen()
}

describe('phaseOf', () => {
  it('splits opening, middlegame and endgame', () => {
    expect(phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 0)).toBe('opening')
    expect(phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 40)).toBe('middlegame')
    // Rook and bishop each: 16 points of pieces, an endgame whatever the move number.
    expect(phaseOf('2r1k3/pp3b2/8/8/8/8/PP3B2/2R1K3 w - - 0 1', 10)).toBe('endgame')
  })
})

describe('tagMistake', () => {
  it('tags a missed knight fork', () => {
    // Nc7+ forks the king on e8 and the rook on a8; White played Kd2 instead.
    const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1'
    expect(tagMistake(fen, after(fen, 'Kd2'), 'Kd2', ['b5c7'], [])).toContain('missed-fork')
  })

  it('tags a piece left hanging', () => {
    // White's knight goes to e5, where the black queen on d5 takes it for free.
    const fen = '4k3/8/8/3q4/8/5N2/8/4K3 w - - 0 1'
    expect(tagMistake(fen, after(fen, 'Ne5'), 'Ne5', [], ['d5e5'])).toContain('hung-piece')
  })

  it('falls back to other when nothing concrete is found', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(tagMistake(fen, after(fen, 'a3'), 'a3', ['e2e4'], ['e7e5'])).toEqual(['other'])
  })
})

describe('openingFamily and outcome', () => {
  it('reduces an opening to its family', () => {
    expect(openingFamily('B90 Sicilian Defense: Najdorf Variation')).toBe('Sicilian Defense')
    expect(openingFamily('Scandinavian Defense Mieses Kotroc Variation')).toBe('Scandinavian Defense Mieses Kotroc Variation')
    expect(openingFamily(undefined)).toBe('Unknown opening')
  })

  it('scores a game from the user side', () => {
    expect(outcome({ result: '0-1', userColor: 'b' } as LibraryGame)).toBe('win')
    expect(outcome({ result: '0-1', userColor: 'w' } as LibraryGame)).toBe('loss')
    expect(outcome({ result: '1/2-1/2', userColor: 'w' } as LibraryGame)).toBe('draw')
  })
})

describe('buildProfile', () => {
  const mistake = (phase: TaggedMistake['phase'], tags: TaggedMistake['tags'], cls: TaggedMistake['cls'] = 'mistake'): TaggedMistake => ({
    ply: 30,
    san: 'Nf3',
    cls,
    lossCp: 200,
    better: 'Nc3',
    phase,
    tags,
  })
  const game = (id: string, result: LibraryGame['result'], userColor: 'w' | 'b', opening: string, mistakes: TaggedMistake[], accuracy = 70): AnalysedGame => ({
    game: { id, result, userColor, opening, date: '2026-10-20T00:00:00Z' } as LibraryGame,
    analysis: { depth: 12, accuracy, moves: 30, mistakes },
  })

  it('adds up results, phases, tags and openings, and names the biggest leak', () => {
    const p = buildProfile([
      game('a', '1-0', 'w', 'C50 Italian Game: Giuoco Piano', [mistake('middlegame', ['missed-fork']), mistake('middlegame', ['hung-piece'], 'blunder')]),
      game('b', '0-1', 'w', 'C50 Italian Game', [mistake('middlegame', ['missed-fork']), mistake('opening', ['other'])], 60),
      game('c', '1/2-1/2', 'b', 'B01 Scandinavian Defense', []),
    ])!
    expect(p).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1, accuracy: 67, blundersPerGame: 0.3 })
    expect(p.phases.find((r) => r.phase === 'middlegame')).toMatchObject({ perGame: 1, blunders: 1 })
    expect(p.tags[0]).toMatchObject({ tag: 'missed-fork', count: 2 })
    expect(p.tags.at(-1)?.tag).toBe('other')
    expect(p.openings[0]).toMatchObject({ name: 'Italian Game', color: 'w', games: 2, score: 50, accuracy: 65 })
    expect(p.finding).toBe('Most of your mistakes come in the middlegame: 1 a game, against 0 in the endgame. The most common one: missed a fork, 2 times in 3 games.')
  })

  it('is empty with no games', () => {
    expect(buildProfile([])).toBeNull()
  })
})
