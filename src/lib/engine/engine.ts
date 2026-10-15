import { parseBestMove, parseInfoLine, type EngineLine } from './uci'

export interface SearchRequest {
  /** Caller-chosen id. Every result carries it so stale results can be dropped. */
  id: number
  fen: string
  depth: number
  multiPv: number
}

export interface AnalysisResult {
  id: number
  fen: string
  /** Lines sorted by multipv (1 = best). Scores are from White's perspective. */
  lines: EngineLine[]
  /** Depth reached by the best line. */
  depth: number
  bestMove: string | null
  done: boolean
}

export type ResultListener = (result: AnalysisResult) => void

/** The subset of Worker we use, so tests can plug in a fake. */
export interface WorkerLike {
  postMessage(message: string): void
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror: ((ev: unknown) => void) | null
  terminate(): void
}

export interface EngineOptions {
  workerUrl: string
  threads: number
  hashMb?: number
  createWorker?: (url: string) => WorkerLike
  /** Called with every raw line from the engine (for debugging). */
  onLine?: (line: string) => void
}

export type EngineStatus = 'loading' | 'ready' | 'error'

interface ActiveSearch {
  req: SearchRequest
  listener: ResultListener
  lines: Map<number, EngineLine>
}

/**
 * Thin UCI driver around a Stockfish Web Worker.
 *
 * Only one search runs at a time. Calling analyze() while a search is running
 * sends "stop", waits for the engine's "bestmove" acknowledgement, and only
 * then starts the new search. Results emitted in the meantime still carry the
 * old request id, so consumers can tell them apart from the new search.
 */
export class StockfishEngine {
  status: EngineStatus = 'loading'
  errorMessage: string | null = null
  readonly ready: Promise<void>

  private worker: WorkerLike
  private active: ActiveSearch | null = null
  private pending: { req: SearchRequest; listener: ResultListener } | null = null
  private searching = false
  private stopSent = false
  private currentMultiPv = 1
  private resolveReady!: () => void
  private rejectReady!: (e: Error) => void
  private destroyed = false
  private readonly options: EngineOptions

  constructor(options: EngineOptions) {
    this.options = options
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    // Avoid unhandled rejection noise when nobody awaits ready before an error.
    this.ready.catch(() => {})
    const create = options.createWorker ?? ((url: string) => new Worker(url) as unknown as WorkerLike)
    try {
      this.worker = create(options.workerUrl)
    } catch (e) {
      this.worker = { postMessage() {}, onmessage: null, onerror: null, terminate() {} }
      this.fail(e instanceof Error ? e.message : String(e))
      return
    }
    this.worker.onmessage = (ev) => {
      if (typeof ev.data === 'string') this.handleLine(ev.data)
    }
    this.worker.onerror = (ev) => {
      const msg =
        ev && typeof ev === 'object' && 'message' in ev && typeof (ev as { message: unknown }).message === 'string'
          ? (ev as { message: string }).message
          : 'Engine worker failed to start'
      this.fail(msg)
    }
    this.send('uci')
  }

  private fail(message: string) {
    if (this.status === 'error') return
    this.status = 'error'
    this.errorMessage = message
    this.rejectReady(new Error(message))
  }

  private send(cmd: string) {
    if (this.destroyed) return
    this.worker.postMessage(cmd)
  }

  private handleLine(line: string) {
    this.options.onLine?.(line)
    if (this.status === 'loading') {
      if (line === 'uciok') {
        this.send(`setoption name Threads value ${Math.max(1, this.options.threads)}`)
        this.send(`setoption name Hash value ${this.options.hashMb ?? 64}`)
        this.send(`setoption name MultiPV value ${this.currentMultiPv}`)
        this.send('isready')
      } else if (line === 'readyok') {
        this.status = 'ready'
        this.resolveReady()
        this.startPending()
      }
      return
    }
    if (line.startsWith('bestmove')) {
      this.searching = false
      this.stopSent = false
      const active = this.active
      this.active = null
      if (active) {
        const bestMove = parseBestMove(line)
        active.listener(this.buildResult(active, bestMove, true))
      }
      this.startPending()
      return
    }
    if (line.startsWith('info ') && this.active) {
      const parsed = parseInfoLine(line, this.active.req.fen.split(' ')[1] === 'b' ? 'b' : 'w')
      if (!parsed) return
      this.active.lines.set(parsed.multipv, parsed)
      this.active.listener(this.buildResult(this.active, null, false))
    }
  }

  private buildResult(active: ActiveSearch, bestMove: string | null, done: boolean): AnalysisResult {
    const lines = [...active.lines.values()].sort((a, b) => a.multipv - b.multipv)
    const best = lines[0]
    return {
      id: active.req.id,
      fen: active.req.fen,
      lines,
      depth: best?.depth ?? 0,
      bestMove: bestMove ?? best?.pv[0] ?? null,
      done,
    }
  }

  private startPending() {
    if (this.status !== 'ready' || this.searching || !this.pending) return
    const { req, listener } = this.pending
    this.pending = null
    this.active = { req, listener, lines: new Map() }
    if (req.multiPv !== this.currentMultiPv) {
      this.currentMultiPv = req.multiPv
      this.send(`setoption name MultiPV value ${req.multiPv}`)
    }
    this.send(`position fen ${req.fen}`)
    this.send(`go depth ${req.depth}`)
    this.searching = true
  }

  /** Starts (or queues) a search, replacing any search that has not started yet. */
  analyze(req: SearchRequest, listener: ResultListener) {
    if (this.status === 'error') return
    this.pending = { req, listener }
    if (this.searching) {
      if (!this.stopSent) {
        this.stopSent = true
        this.send('stop')
      }
      return
    }
    this.startPending()
  }

  /** Stops the running search (its final result is still delivered with done = true). */
  stop() {
    this.pending = null
    if (this.searching && !this.stopSent) {
      this.stopSent = true
      this.send('stop')
    }
  }

  /** One-shot evaluation that resolves when the search finishes. */
  evaluate(fen: string, depth: number, multiPv = 1, id = -1): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
      if (this.status === 'error') {
        reject(new Error(this.errorMessage ?? 'Engine unavailable'))
        return
      }
      this.analyze({ id, fen, depth, multiPv }, (result) => {
        if (result.done) resolve(result)
      })
    })
  }

  get isSearching() {
    return this.searching
  }

  destroy() {
    this.destroyed = true
    this.pending = null
    this.active = null
    try {
      this.worker.postMessage('quit')
    } catch {
      /* ignore */
    }
    this.worker.terminate()
  }
}

/** Picks the engine file to load, falling back to the single-threaded build when SharedArrayBuffer is unavailable. */
export function chooseEngineBuild(lite: boolean): { url: string; multiThreaded: boolean } {
  const multiThreaded =
    typeof SharedArrayBuffer !== 'undefined' && typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/'
  const name = `stockfish-19${lite ? '-lite' : ''}${multiThreaded ? '' : '-single'}.js`
  return { url: `${base}stockfish/${name}`, multiThreaded }
}

export function defaultThreadCount(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2
  return Math.max(1, Math.min(8, cores - 1))
}
