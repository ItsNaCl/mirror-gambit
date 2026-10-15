import { describe, expect, it } from 'vitest'
import { StockfishEngine, type AnalysisResult, type WorkerLike } from './engine'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

/** A fake Stockfish worker that answers the handshake and lets tests feed lines. */
class FakeWorker implements WorkerLike {
  sent: string[] = []
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  postMessage(message: string) {
    this.sent.push(message)
    if (message === 'uci') this.emit('uciok')
    if (message === 'isready') this.emit('readyok')
  }
  emit(line: string) {
    this.onmessage?.({ data: line })
  }
  terminate() {}
  /** Commands sent after the handshake / options. */
  get searchCommands() {
    return this.sent.filter((c) => /^(position|go|stop)/.test(c))
  }
}

function makeEngine() {
  const worker = new FakeWorker()
  const engine = new StockfishEngine({ workerUrl: 'fake', threads: 1, createWorker: () => worker })
  return { worker, engine }
}

describe('StockfishEngine', () => {
  it('completes the UCI handshake and sets options', async () => {
    const { worker, engine } = makeEngine()
    await engine.ready
    expect(engine.status).toBe('ready')
    expect(worker.sent).toContain('setoption name Threads value 1')
    expect(worker.sent).toContain('setoption name MultiPV value 1')
  })

  it('tags every result with the request id so stale lines can be discarded', async () => {
    const { worker, engine } = makeEngine()
    await engine.ready
    const received: AnalysisResult[] = []
    const listenerA = (r: AnalysisResult) => received.push({ ...r, id: r.id })
    const listenerB = (r: AnalysisResult) => received.push({ ...r, id: r.id })

    engine.analyze({ id: 1, fen: START, depth: 18, multiPv: 3 }, listenerA)
    expect(worker.searchCommands).toEqual([`position fen ${START}`, 'go depth 18'])

    worker.emit('info depth 5 multipv 1 score cp 30 nodes 1 pv e2e4 e7e5')
    expect(received.at(-1)?.id).toBe(1)
    expect(received.at(-1)?.lines[0].pv).toEqual(['e2e4', 'e7e5'])

    // The position changes while the first search is still running.
    engine.analyze({ id: 2, fen: AFTER_E4, depth: 18, multiPv: 3 }, listenerB)
    expect(worker.searchCommands.at(-1)).toBe('stop')
    // The new position must NOT be sent until the old search acknowledges the stop.
    expect(worker.searchCommands.filter((c) => c.startsWith('position'))).toHaveLength(1)

    // A late line from the old search still carries the OLD id.
    worker.emit('info depth 6 multipv 1 score cp 32 nodes 1 pv e2e4 e7e5 g1f3')
    expect(received.at(-1)?.id).toBe(1)
    expect(received.at(-1)?.done).toBe(false)

    // Old search ends; it is reported done with id 1 and only then does search 2 start.
    worker.emit('bestmove e2e4')
    expect(received.at(-1)).toMatchObject({ id: 1, done: true, bestMove: 'e2e4' })
    expect(worker.searchCommands.slice(-2)).toEqual([`position fen ${AFTER_E4}`, 'go depth 18'])

    // Black to move: the cp score is flipped to White's perspective.
    worker.emit('info depth 4 multipv 1 score cp 25 nodes 1 pv e7e5')
    expect(received.at(-1)).toMatchObject({ id: 2, fen: AFTER_E4 })
    expect(received.at(-1)?.lines[0].score).toEqual({ type: 'cp', value: -25 })

    // A consumer that only keeps the current id never shows stale lines.
    const currentId = 2
    const shown = received.filter((r) => r.id === currentId)
    expect(shown.every((r) => r.fen === AFTER_E4)).toBe(true)
  })

  it('sends a single stop and keeps only the latest pending request', async () => {
    const { worker, engine } = makeEngine()
    await engine.ready
    const got: number[] = []
    engine.analyze({ id: 1, fen: START, depth: 10, multiPv: 1 }, (r) => got.push(r.id))
    engine.analyze({ id: 2, fen: AFTER_E4, depth: 10, multiPv: 1 }, (r) => got.push(r.id))
    engine.analyze({ id: 3, fen: START, depth: 12, multiPv: 1 }, (r) => got.push(r.id))
    expect(worker.searchCommands.filter((c) => c === 'stop')).toHaveLength(1)
    worker.emit('bestmove e2e4')
    expect(worker.searchCommands.at(-1)).toBe('go depth 12')
    worker.emit('info depth 1 multipv 1 score cp 10 pv e2e4')
    expect(got).toEqual([1, 3])
  })

  it('evaluate() resolves with the final result when bestmove arrives', async () => {
    const { worker, engine } = makeEngine()
    await engine.ready
    const p = engine.evaluate(START, 14)
    worker.emit('info depth 14 multipv 1 score cp 20 pv e2e4 e7e5')
    worker.emit('bestmove e2e4 ponder e7e5')
    const result = await p
    expect(result.done).toBe(true)
    expect(result.bestMove).toBe('e2e4')
    expect(result.depth).toBe(14)
    expect(result.lines[0].score).toEqual({ type: 'cp', value: 20 })
  })

  it('switches MultiPV only when the request needs a different value', async () => {
    const { worker, engine } = makeEngine()
    await engine.ready
    engine.analyze({ id: 1, fen: START, depth: 10, multiPv: 3 }, () => {})
    expect(worker.sent.filter((c) => c === 'setoption name MultiPV value 3')).toHaveLength(1)
    worker.emit('bestmove e2e4')
    engine.analyze({ id: 2, fen: START, depth: 10, multiPv: 3 }, () => {})
    expect(worker.sent.filter((c) => c === 'setoption name MultiPV value 3')).toHaveLength(1)
  })

  it('reports worker errors', async () => {
    const { worker, engine } = makeEngine()
    await engine.ready
    worker.onerror?.({ message: 'boom' })
    expect(engine.status).toBe('error')
    expect(engine.errorMessage).toBe('boom')
  })
})
