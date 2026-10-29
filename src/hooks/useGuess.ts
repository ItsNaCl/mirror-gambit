import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Square } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { currentFen, fenAt, playMove, type GameState, type PromotionPiece } from '../lib/chess/game'
import {
  guessPlies,
  judgeGuess,
  modelGameState,
  parseModelGames,
  pickModelGame,
  summarise,
  type GuessFeedback,
  type GuessGrade,
  type ModelGame,
  type ModelGameSet,
} from '../lib/modes/guessTheMove'
import * as kv from '../lib/store/kv'
import { ANSWER_ARROW } from '../lib/ui/boardColors'
import type { EngineContextValue } from './useEngine'
import type { GameApi } from './useGame'

/** loading: the game set · guessing: the student's move · thinking: the engine rates it · feedback: the master's move is shown · done: the game is over */
export type GuessStage = 'idle' | 'loading' | 'guessing' | 'thinking' | 'feedback' | 'done'

const SEEN_KEY = 'mirror-gambit.guess-seen.v1'
const OWNER = 'guess'
/** Generous, for the single-threaded engine on phones. */
const THINK_TIMEOUT_MS = 120_000
const GUESS_ARROW = 'rgba(239, 107, 126, 0.9)'

function loadSeen(): Set<string> {
  const raw = kv.readJson<unknown>(SEEN_KEY, [])
  return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
}

let setPromise: Promise<ModelGameSet> | null = null
/** The model games, loaded once and only when the mode is opened. */
function loadSet(): Promise<ModelGameSet> {
  setPromise ??= import('../data/model-games/games.json').then((m) => parseModelGames(m.default))
  return setPromise
}

/** A prefix of the model game: the moves up to `ply`, with the cursor at the end so nothing ahead shows. */
function upTo(full: GameState, ply: number): GameState {
  return { startFen: full.startFen, moves: full.moves.slice(0, ply), ply }
}

/**
 * Guess the move. The student plays the winner's side of a strong player's game from move 6:
 * each guess is compared with the move played, using the evaluations stored with the game and
 * one engine search for the guess (live analysis suspended while it runs).
 */
export function useGuess(gameApi: GameApi, engine: EngineContextValue) {
  const { setGame } = gameApi
  const { evaluate, setLiveSuspended } = engine
  const [set, setSet] = useState<ModelGameSet | null>(null)
  const [model, setModel] = useState<ModelGame | null>(null)
  const [full, setFull] = useState<GameState | null>(null)
  const [plies, setPlies] = useState<number[]>([])
  const [at, setAt] = useState(0)
  const [stage, setStage] = useState<GuessStage>('idle')
  const [feedback, setFeedback] = useState<GuessFeedback | null>(null)
  const [grades, setGrades] = useState<GuessGrade[]>([])
  const [error, setError] = useState<string | null>(null)
  const [seen, setSeen] = useState<Set<string>>(loadSeen)
  const runId = useRef(0)

  const load = useCallback(async () => {
    try {
      const s = await loadSet()
      setSet(s)
      return s
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The model games could not be loaded.')
      return null
    }
  }, [])

  // The buckets are offered before a game starts, so the set loads as soon as the hook is used.
  useEffect(() => {
    let on = true
    loadSet()
      .then((s) => {
        if (on) setSet(s)
      })
      .catch((e: unknown) => {
        if (on) setError(e instanceof Error ? e.message : 'The model games could not be loaded.')
      })
    return () => {
      on = false
    }
  }, [])

  const start = useCallback(
    async (bucket: string | 'any') => {
      const id = ++runId.current
      setStage('loading')
      setError(null)
      const s = set ?? (await load())
      // Exit, or a second start, while the games were loading: this call is stale.
      if (id !== runId.current) return
      if (!s) {
        setStage('idle')
        return
      }
      const g = pickModelGame(s, bucket, seen, Math.floor(Math.random() * 1e6))
      if (!g) {
        setError('No model game for that opening yet.')
        setStage('idle')
        return
      }
      const state = modelGameState(g)
      const ask = guessPlies(g)
      setModel(g)
      setFull(state)
      setPlies(ask)
      setAt(0)
      setGrades([])
      setFeedback(null)
      setGame(upTo(state, ask[0]))
      setStage('guessing')
    },
    [set, load, seen, setGame],
  )

  const exit = useCallback(() => {
    runId.current++
    setStage('idle')
    setModel(null)
    setFull(null)
    setPlies([])
    setAt(0)
    setFeedback(null)
    setGrades([])
    setError(null)
  }, [])

  useEffect(() => {
    setLiveSuspended(stage === 'thinking', OWNER)
  }, [stage, setLiveSuspended])
  useEffect(() => () => setLiveSuspended(false, OWNER), [setLiveSuspended])

  // A search replaced by another mode's never settles; the question is asked again after a while.
  useEffect(() => {
    if (stage !== 'thinking' || !full) return
    const ply = plies[at]
    const t = setTimeout(() => {
      runId.current++
      setError('The engine was interrupted. Play your move again.')
      setGame(upTo(full, ply))
      setStage('guessing')
    }, THINK_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [stage, full, plies, at, setGame])

  const finish = useCallback(
    (ply: number, fb: GuessFeedback) => {
      if (!full) return
      setFeedback(fb)
      setGrades((g) => [...g, fb.grade])
      // The board shows the master's move; the guess, when different, stays as an arrow.
      setGame(upTo(full, ply + 1))
      setStage('feedback')
    },
    [full, setGame],
  )

  const game = gameApi.game
  const onBoardMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      if (stage !== 'guessing' || !model || !full || !set) return false
      const ply = plies[at]
      const after = playMove(game, from, to, promotion)
      if (!after) return false
      const guessUci = from + to + (promotion ?? '')
      const fen = fenAt(full, ply)
      const masterSan = full.moves[ply].san
      const base = { fen, side: model.side, guessUci, masterSan, evalBefore: model.evals[ply], evalMaster: model.evals[ply + 1] }
      // The master's own move needs no search.
      if (after.moves[ply].san === masterSan) {
        const fb = judgeGuess({ ...base, evalGuess: model.evals[ply + 1] })
        if (fb) finish(ply, fb)
        return true
      }
      setGame(after)
      setStage('thinking')
      setError(null)
      const id = ++runId.current
      // Suspended here as well as by the stage effect: the search must not be queued behind a live one.
      setLiveSuspended(true, OWNER)
      void (async () => {
        try {
          const r = await evaluate(currentFen(after), set.depth, 1)
          if (id !== runId.current) return
          const line = r.lines[0]
          const evalGuess = line ? (line.score.type === 'mate' ? (line.score.value > 0 ? 10000 - line.score.value : -10000 - line.score.value) : line.score.value) : model.evals[ply]
          const fb = judgeGuess({ ...base, evalGuess })
          if (!fb) throw new Error('That move could not be judged.')
          finish(ply, fb)
        } catch (e) {
          if (id !== runId.current) return
          setError(e instanceof Error ? e.message : 'The engine is not ready.')
          setGame(upTo(full, ply))
          setStage('guessing')
        }
      })()
      return true
    },
    [stage, model, full, set, plies, at, game, setGame, evaluate, finish, setLiveSuspended],
  )

  /** After the feedback: the opponent replies and the next guess is asked, or the game is over. */
  const next = useCallback(() => {
    if (!full || !model) return
    setFeedback(null)
    if (at + 1 < plies.length) {
      setAt(at + 1)
      setGame(upTo(full, plies[at + 1]))
      setStage('guessing')
      return
    }
    setGame({ ...full, ply: full.moves.length })
    setStage('done')
    setSeen((s) => {
      const nextSeen = new Set(s).add(model.id)
      kv.setItem(SEEN_KEY, JSON.stringify([...nextSeen]))
      return nextSeen
    })
  }, [full, model, at, plies, setGame])

  // The master's move in gold; the guess, when it was another move, in red beside it.
  const arrows: Arrow[] = useMemo(() => {
    if (stage !== 'feedback' || !feedback) return []
    const out: Arrow[] = [{ startSquare: feedback.masterUci.slice(0, 2), endSquare: feedback.masterUci.slice(2, 4), color: ANSWER_ARROW }]
    if (feedback.grade !== 'match') out.push({ startSquare: feedback.guessUci.slice(0, 2), endSquare: feedback.guessUci.slice(2, 4), color: GUESS_ARROW })
    return out
  }, [stage, feedback])

  const summary = useMemo(() => summarise(grades), [grades])

  return {
    active: stage !== 'idle',
    stage,
    set,
    buckets: set?.buckets ?? [],
    model,
    /** Which guess this is, from 1, and how many there are. */
    at: at + 1,
    total: plies.length,
    /** The move number the student is asked for. */
    moveNumber: full && plies[at] !== undefined ? Math.floor(plies[at] / 2) + 1 : 0,
    feedback,
    grades,
    summary,
    error,
    arrows,
    orientation: (model?.side === 'b' ? 'black' : 'white') as 'white' | 'black',
    userToMove: stage === 'guessing',
    start,
    next,
    exit,
    onBoardMove,
  }
}

export type GuessApi = ReturnType<typeof useGuess>
