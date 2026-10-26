import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flush, getItem, hydrate, LEGACY_KEYS, resetForTests, setItem } from './kv'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v))
  }
}

// Shapes copied from real 1.1 data.
const V1_DATA: Record<string, string> = {
  'mirror-gambit.settings.v1': JSON.stringify({ showAnalysis: true, depth: 18, legalDots: true, autoHintAfter: 3 }),
  'mirror-gambit.srs-cards.v1': JSON.stringify([
    {
      id: 'c1',
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      playerMove: 'Bc4',
      bestMove: 'Bb5',
      cpLoss: 40,
      classification: 'good',
      explanation: 'x',
      source: 'review',
      ease: 2.5,
      interval: 0,
      reps: 0,
      due: 0,
    },
  ]),
  'mirror-gambit.opening-stats.v1': JSON.stringify({ italian: { attempts: 12, correct: 9 } }),
  'mirror-gambit.puzzle-stats.v1': JSON.stringify({ forks: { clean: 3, assisted: 1, failed: 0 } }),
  'mirror-gambit.review-history.v1': JSON.stringify([{ id: 'g1', accuracy: 71 }]),
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  ;(globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage()
})

afterEach(() => {
  resetForTests()
})

describe('kv store', () => {
  it('copies every 1.x key from localStorage on the first run', async () => {
    for (const [k, v] of Object.entries(V1_DATA)) localStorage.setItem(k, v)
    const result = await hydrate()
    expect(result.backend).toBe('indexeddb')
    expect(result.migrated.sort()).toEqual([...LEGACY_KEYS].sort())
    for (const [k, v] of Object.entries(V1_DATA)) expect(getItem(k)).toBe(v)
  })

  it('migrates only once and then reads from IndexedDB', async () => {
    for (const [k, v] of Object.entries(V1_DATA)) localStorage.setItem(k, v)
    await hydrate()
    setItem('mirror-gambit.opening-stats.v1', '{"italian":{"attempts":13,"correct":10}}')
    await flush()
    resetForTests()
    // Simulate localStorage being cleared after the upgrade: IndexedDB still has everything.
    localStorage.clear()
    const second = await hydrate()
    expect(second.migrated).toEqual([])
    expect(getItem('mirror-gambit.opening-stats.v1')).toBe('{"italian":{"attempts":13,"correct":10}}')
    expect(getItem('mirror-gambit.srs-cards.v1')).toBe(V1_DATA['mirror-gambit.srs-cards.v1'])
  })

  it('mirrors 1.x keys back to localStorage so 1.1 can still read them', async () => {
    await hydrate()
    setItem('mirror-gambit.settings.v1', '{"depth":20}')
    setItem('mirror-gambit.games.v2', '[]')
    expect(localStorage.getItem('mirror-gambit.settings.v1')).toBe('{"depth":20}')
    expect(localStorage.getItem('mirror-gambit.games.v2')).toBeNull()
  })

  it('falls back to localStorage when IndexedDB is missing', async () => {
    ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = undefined
    localStorage.setItem('mirror-gambit.settings.v1', '{"depth":12}')
    const result = await hydrate()
    expect(result.backend).toBe('localstorage')
    expect(getItem('mirror-gambit.settings.v1')).toBe('{"depth":12}')
    setItem('mirror-gambit.games.v2', '[1]')
    expect(localStorage.getItem('mirror-gambit.games.v2')).toBe('[1]')
  })
})
