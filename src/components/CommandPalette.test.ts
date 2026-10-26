import { describe, expect, it } from 'vitest'
import { filterCommands, type Command } from './CommandPalette'

const noop = () => {}
const commands: Command[] = [
  { id: 'go-puzzles', group: 'Go to', label: 'Puzzles', description: 'Forks, pins, mates', keywords: 'tactics', run: noop },
  { id: 'go-cards', group: 'Go to', label: 'Mistake cards', keywords: 'srs spaced repetition', run: noop },
  { id: 'flip', group: 'Board', label: 'Flip board', run: noop },
  { id: 'export', group: 'Board', label: 'Export PGN', enabled: false, run: noop },
]

describe('filterCommands', () => {
  it('returns every enabled command for an empty query', () => {
    expect(filterCommands(commands, '').map((c) => c.id)).toEqual(['go-puzzles', 'go-cards', 'flip'])
  })

  it('matches keywords and descriptions, and every word must match', () => {
    expect(filterCommands(commands, 'tactics').map((c) => c.id)).toEqual(['go-puzzles'])
    expect(filterCommands(commands, 'spaced rep').map((c) => c.id)).toEqual(['go-cards'])
    expect(filterCommands(commands, 'flip puzzles')).toEqual([])
  })

  it('ranks label matches above keyword matches and skips disabled commands', () => {
    const extra: Command[] = [...commands, { id: 'pins', group: 'Go to', label: 'Pins set', run: noop }]
    expect(filterCommands(extra, 'pins').map((c) => c.id)).toEqual(['pins', 'go-puzzles'])
    expect(filterCommands(commands, 'pgn')).toEqual([])
  })
})
