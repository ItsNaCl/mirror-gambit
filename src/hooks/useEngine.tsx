import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  chooseEngineBuild,
  defaultThreadCount,
  StockfishEngine,
  type AnalysisResult,
  type EngineStatus,
} from '../lib/engine/engine'
import type { EngineLine, Score } from '../lib/engine/uci'
import { useSettings } from './useSettings'

export interface CachedEval {
  fen: string
  depth: number
  score: Score
  bestMove: string | null
  lines: EngineLine[]
}

export interface EngineContextValue {
  status: EngineStatus
  statusText: string
  buildInfo: string
  /** Live analysis of the current position only. Never contains lines for another position. */
  analysis: AnalysisResult | null
  /** Best evaluation seen so far for any position, keyed by FEN. */
  getCached: (fen: string) => CachedEval | undefined
  /** Increments whenever the cache changes, so effects can watch it. */
  evalVersion: number
  /** One-shot evaluation (review, play, puzzles). Suspend live analysis first: a new live search would replace it. */
  evaluate: (fen: string, depth: number, multiPv?: number) => Promise<AnalysisResult>
  /** Live analysis pauses while any owner holds a suspension, so one mode cannot release another's. */
  setLiveSuspended: (suspended: boolean, owner?: string) => void
}

const EngineContext = createContext<EngineContextValue | null>(null)

const LIVE_MULTI_PV = 3

export function EngineProvider({ fen, children }: { fen: string; children: ReactNode }) {
  const { settings } = useSettings()
  const [engine, setEngine] = useState<StockfishEngine | null>(null)
  const [status, setStatus] = useState<EngineStatus>('loading')
  const [buildInfo, setBuildInfo] = useState('')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [suspendedBy, setSuspendedBy] = useState<ReadonlySet<string>>(() => new Set())
  const liveSuspended = suspendedBy.size > 0
  const setLiveSuspended = useCallback((suspended: boolean, owner = 'review') => {
    setSuspendedBy((prev) => {
      if (prev.has(owner) === suspended) return prev
      const next = new Set(prev)
      if (suspended) next.add(owner)
      else next.delete(owner)
      return next
    })
  }, [])
  const [evalVersion, setEvalVersion] = useState(0)
  const cache = useRef(new Map<string, CachedEval>())
  const searchId = useRef(0)

  const threads = settings.threads > 0 ? settings.threads : defaultThreadCount()
  const lite = settings.engineBuild === 'lite'

  // Create the engine (and recreate it when the build or thread count changes).
  useEffect(() => {
    let cancelled = false
    let current: StockfishEngine | null = null

    function start(forceSingle: boolean) {
      const build = chooseEngineBuild(lite)
      const multi = build.multiThreaded && !forceSingle
      const url = multi ? build.url : build.url.replace(/\.js$/, '-single.js').replace('-single-single', '-single')
      const eng = new StockfishEngine({ workerUrl: url, threads: multi ? threads : 1, hashMb: lite ? 32 : 128 })
      current = eng
      setStatus('loading')
      setErrorText(null)
      setBuildInfo(`${lite ? 'lite' : 'full'} build, ${multi ? `multi-threaded, ${threads} thread${threads === 1 ? '' : 's'}` : 'single-threaded'}`)
      eng.ready
        .then(() => {
          if (cancelled) return
          setStatus('ready')
          setEngine(eng)
          const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
          console.info(`[engine] Stockfish ready: ${lite ? 'lite' : 'full'} build, ${multi ? `multi-threaded (${threads} threads)` : 'single-threaded'}; crossOriginIsolated=${isolated}`)
        })
        .catch((e: Error) => {
          if (cancelled) return
          if (multi) {
            // SharedArrayBuffer / threads not available after all: fall back automatically.
            eng.destroy()
            start(true)
            return
          }
          setStatus('error')
          setErrorText(e.message)
        })
    }
    start(false)
    return () => {
      cancelled = true
      current?.destroy()
      setEngine(null)
    }
  }, [lite, threads])

  const remember = useCallback((result: AnalysisResult) => {
    const best = result.lines[0]
    if (!best) return
    const existing = cache.current.get(result.fen)
    if (existing && existing.depth > result.depth) return
    if (existing && existing.depth === result.depth && existing.lines.length >= result.lines.length) return
    cache.current.set(result.fen, {
      fen: result.fen,
      depth: result.depth,
      score: best.score,
      bestMove: result.bestMove ?? best.pv[0] ?? null,
      lines: result.lines,
    })
    setEvalVersion((v) => v + 1)
  }, [])

  // Live analysis: restart the search on every position change.
  useEffect(() => {
    // No stop() while suspended: it would drop an evaluate() queued by the suspending mode,
    // and that mode's own search preempts the live one anyway.
    if (!engine || status !== 'ready' || liveSuspended) return
    const id = ++searchId.current
    setAnalysis(null)
    engine.analyze({ id, fen, depth: settings.depth, multiPv: LIVE_MULTI_PV }, (result) => {
      remember(result)
      // Results for an older search are discarded here: only the current position is ever shown.
      if (result.id !== searchId.current || result.fen !== fen) return
      setAnalysis(result)
    })
  }, [engine, status, fen, settings.depth, liveSuspended, remember])

  const evaluate = useCallback(
    async (targetFen: string, depth: number, multiPv = 1) => {
      if (!engine) throw new Error('Engine not ready')
      const cached = cache.current.get(targetFen)
      if (cached && cached.depth >= depth && cached.lines.length >= multiPv) {
        return {
          id: -1,
          fen: targetFen,
          lines: cached.lines,
          depth: cached.depth,
          bestMove: cached.bestMove,
          done: true,
        } satisfies AnalysisResult
      }
      const result = await engine.evaluate(targetFen, depth, multiPv)
      remember(result)
      return result
    },
    [engine, remember],
  )

  const getCached = useCallback((f: string) => cache.current.get(f), [])

  const statusText =
    status === 'loading' ? 'Loading engine…' : status === 'error' ? `Engine error: ${errorText}` : `Stockfish 19 ready (${buildInfo})`

  const value = useMemo<EngineContextValue>(
    () => ({
      status,
      statusText,
      buildInfo,
      analysis: analysis && analysis.fen === fen ? analysis : null,
      getCached,
      evalVersion,
      evaluate,
      setLiveSuspended,
    }),
    [status, statusText, buildInfo, analysis, fen, getCached, evalVersion, evaluate, setLiveSuspended],
  )

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>
}

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext)
  if (!ctx) throw new Error('useEngine must be used inside EngineProvider')
  return ctx
}
