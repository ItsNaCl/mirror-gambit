import { useCallback, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { GameState } from '../lib/chess/game'
import { appendHistory, recordFromReview } from '../lib/progress/history'
import { buildReview, REVIEW_DEPTH, type PositionEval, type ReviewResult } from '../lib/review/review'
import type { EngineContextValue } from './useEngine'
import type { GameApi } from './useGame'

export type ReviewStatus = 'idle' | 'running' | 'done' | 'error'

export interface ReviewState {
  status: ReviewStatus
  /** 0..1 while running. */
  progress: number
  /** Position currently being analysed (1-based) while running. */
  current: number
  total: number
  result: ReviewResult | null
  /** Identifies the game that was reviewed, so a changed game can be detected. */
  reviewedKey: string | null
  error: string | null
}

export function gameKey(game: GameState): string {
  return game.startFen + '|' + game.moves.map((m) => m.san).join(' ')
}

export function useReview(gameApi: GameApi, engine: EngineContextValue) {
  const [state, setState] = useState<ReviewState>({
    status: 'idle',
    progress: 0,
    current: 0,
    total: 0,
    result: null,
    reviewedKey: null,
    error: null,
  })
  const runId = useRef(0)
  // Bumps whenever a review is stored in the progress history.
  const [historyVersion, setHistoryVersion] = useState(0)

  const cancel = useCallback(() => {
    runId.current++
    engine.setLiveSuspended(false)
    setState((s) => (s.status === 'running' ? { ...s, status: s.result ? 'done' : 'idle', progress: 0 } : s))
  }, [engine])

  /** Reviews the current game, or the given one (e.g. a saved game that was just loaded onto the board). */
  const start = useCallback(async (target?: GameState) => {
    const game = target ?? gameApi.game
    const id = ++runId.current
    const fens = [game.startFen, ...game.moves.map((m) => m.after)]
    const key = gameKey(game)
    setState({ status: 'running', progress: 0, current: 0, total: fens.length, result: null, reviewedKey: key, error: null })
    engine.setLiveSuspended(true)
    const evals: PositionEval[] = []
    try {
      for (let i = 0; i < fens.length; i++) {
        if (runId.current !== id) return
        setState((s) => ({ ...s, current: i + 1, progress: i / fens.length }))
        const fen = fens[i]
        const chess = new Chess(fen)
        if (chess.isCheckmate()) {
          evals.push({ fen, score: { type: 'mate', value: 0 }, bestMove: null, depth: REVIEW_DEPTH })
          continue
        }
        if (chess.isGameOver()) {
          evals.push({ fen, score: { type: 'cp', value: 0 }, bestMove: null, depth: REVIEW_DEPTH })
          continue
        }
        const r = await engine.evaluate(fen, REVIEW_DEPTH, 1)
        if (runId.current !== id) return
        const best = r.lines[0]
        evals.push({
          fen,
          score: best?.score ?? { type: 'cp', value: 0 },
          bestMove: r.bestMove ?? best?.pv[0] ?? null,
          depth: r.depth,
          pv: best?.pv ?? [],
        })
      }
      const result = buildReview(game, evals)
      setState({ status: 'done', progress: 1, current: fens.length, total: fens.length, result, reviewedKey: key, error: null })
      if (game.moves.length >= 10) {
        appendHistory(recordFromReview(result, key))
        setHistoryVersion((v) => v + 1)
      }
    } catch (e) {
      if (runId.current !== id) return
      setState((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : String(e) }))
    } finally {
      if (runId.current === id) engine.setLiveSuspended(false)
    }
  }, [gameApi.game, engine])

  const matchesCurrentGame = state.reviewedKey !== null && state.reviewedKey === gameKey(gameApi.game)

  return { state, start, cancel, matchesCurrentGame, historyVersion }
}

export type ReviewApi = ReturnType<typeof useReview>
