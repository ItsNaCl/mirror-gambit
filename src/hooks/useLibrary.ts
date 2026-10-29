import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { fetchRecentGames } from '../lib/desktop'
import { analyseForUser, buildProfile, type GameAnalysis } from '../lib/games/profile'
import { libraryGameState, mergeLibrary, type GameSource, type LibraryGame } from '../lib/games/sources'
import { buildReview, type PositionEval } from '../lib/review/review'
import * as kv from '../lib/store/kv'
import type { EngineContextValue } from './useEngine'

const GAMES_KEY = 'mirror-gambit.game-library.v1'
const ANALYSIS_KEY = 'mirror-gambit.game-analysis.v1'
const ACCOUNT_KEY = 'mirror-gambit.import-account.v1'
const SUSPEND_OWNER = 'library'
/** Lower than a single Game review (14): fast enough for dozens of games, still sees one- and two-move tactics. */
export const BATCH_DEPTH = 12

export interface ImportAccount {
  source: GameSource
  username: string
}

export interface BatchProgress {
  /** Games finished in this run. */
  done: number
  total: number
  /** Position being analysed in the current game. */
  position: number
  positions: number
  current: LibraryGame | null
}

/** Your own games from Lichess and chess.com, their batch review, and the weakness profile. */
export function useLibrary(engine: EngineContextValue) {
  const [games, setGames] = useState<LibraryGame[]>(() => kv.readJson(GAMES_KEY, []))
  const [analyses, setAnalyses] = useState<Record<string, GameAnalysis>>(() => kv.readJson(ANALYSIS_KEY, {}))
  const [account, setAccount] = useState<ImportAccount | null>(() => kv.readJson(ACCOUNT_KEY, null))
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<BatchProgress | null>(null)
  const runId = useRef(0)
  // The latest list, so an import can count what it added before React applies the update.
  const gamesRef = useRef(games)
  useEffect(() => {
    gamesRef.current = games
  }, [games])
  const { evaluate, setLiveSuspended } = engine

  const importGames = useCallback(async (source: GameSource, username: string, max: number): Promise<{ added: number; found: number }> => {
    setImporting(true)
    try {
      const found = await fetchRecentGames(source, username.trim(), max)
      const prev = gamesRef.current
      const next = mergeLibrary(prev, found)
      const known = new Set(prev.map((g) => g.id))
      const added = found.filter((g) => !known.has(g.id)).length
      gamesRef.current = next
      setGames(next)
      kv.setItem(GAMES_KEY, JSON.stringify(next))
      const acc = { source, username: username.trim() }
      setAccount(acc)
      kv.setItem(ACCOUNT_KEY, JSON.stringify(acc))
      return { added, found: found.length }
    } finally {
      setImporting(false)
    }
  }, [])

  /** Keeps one game the student entered by hand. False when it is already there. */
  const addGame = useCallback((g: LibraryGame): boolean => {
    const prev = gamesRef.current
    if (prev.some((x) => x.id === g.id)) return false
    const next = mergeLibrary(prev, [g])
    gamesRef.current = next
    setGames(next)
    kv.setItem(GAMES_KEY, JSON.stringify(next))
    return true
  }, [])

  const cancel = useCallback(() => {
    if (runId.current === 0 && !progress) return
    runId.current++
    setProgress(null)
    setLiveSuspended(false, SUSPEND_OWNER)
  }, [progress, setLiveSuspended])

  /** Reviews every game that has no analysis yet, newest first, one position at a time. */
  const reviewPending = useCallback(async () => {
    const queue = games.filter((g) => !analyses[g.id])
    if (queue.length === 0) return
    const id = ++runId.current
    setLiveSuspended(true, SUSPEND_OWNER)
    try {
      for (let gi = 0; gi < queue.length; gi++) {
        const g = queue[gi]
        const state = libraryGameState(g)
        const fens = [state.startFen, ...state.moves.map((m) => m.after)]
        const evals: PositionEval[] = []
        for (let i = 0; i < fens.length; i++) {
          if (runId.current !== id) return
          setProgress({ done: gi, total: queue.length, position: i + 1, positions: fens.length, current: g })
          const chess = new Chess(fens[i])
          if (chess.isGameOver()) {
            evals.push({ fen: fens[i], score: { type: chess.isCheckmate() ? 'mate' : 'cp', value: 0 }, bestMove: null, depth: BATCH_DEPTH })
            continue
          }
          const r = await evaluate(fens[i], BATCH_DEPTH, 1)
          if (runId.current !== id) return
          const best = r.lines[0]
          evals.push({ fen: fens[i], score: best?.score ?? { type: 'cp', value: 0 }, bestMove: r.bestMove ?? best?.pv[0] ?? null, depth: r.depth, pv: best?.pv ?? [] })
        }
        const analysis = analyseForUser(buildReview(state, evals), fens, g.userColor, BATCH_DEPTH)
        // Saved after every game, so leaving the page loses at most the game in progress.
        setAnalyses((prev) => {
          const next = { ...prev, [g.id]: analysis }
          kv.setItem(ANALYSIS_KEY, JSON.stringify(next))
          return next
        })
      }
    } finally {
      if (runId.current === id) {
        runId.current = 0
        setProgress(null)
        setLiveSuspended(false, SUSPEND_OWNER)
      }
    }
  }, [games, analyses, evaluate, setLiveSuspended])

  const removeAll = useCallback(() => {
    runId.current++
    setProgress(null)
    setGames([])
    setAnalyses({})
    kv.setItem(GAMES_KEY, '[]')
    kv.setItem(ANALYSIS_KEY, '{}')
  }, [])

  const analysed = useMemo(() => games.filter((g) => analyses[g.id]).map((g) => ({ game: g, analysis: analyses[g.id] })), [games, analyses])
  const profile = useMemo(() => buildProfile(analysed), [analysed])

  return {
    games,
    analyses,
    account,
    importing,
    progress,
    addGame,
    pending: games.length - analysed.length,
    analysed,
    profile,
    importGames,
    reviewPending,
    cancel,
    removeAll,
  }
}

export type LibraryApi = ReturnType<typeof useLibrary>
