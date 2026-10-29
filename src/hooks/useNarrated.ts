import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { isAtEnd, playMove, playUci, turnOf, type PromotionPiece } from '../lib/chess/game'
import { scoreToCp } from '../lib/engine/uci'
import { gameOverLine, intro, narrateCoachMove, narrateOpponentMove, predictionLoss, type Narration, type Voice } from '../lib/modes/narrated'
import { levelById, pickMove, type PlayLevel } from '../lib/play/levels'
import { ANSWER_ARROW } from '../lib/ui/boardColors'
import type { EngineContextValue } from './useEngine'
import type { GameApi } from './useGame'

/** predict: the student plays the move they expect from the coach · coach: the coach searches and moves · opponent: the computer replies */
export type NarratedStage = 'idle' | 'predict' | 'coach' | 'opponent' | 'done'

export interface NarrationEntry {
  /** Ply after which it was said. */
  ply: number
  who: 'coach' | 'opponent' | 'system'
  narration: Narration
}

export interface PredictionStats {
  asked: number
  exact: number
  /** Within 30 centipawns of the coach's move. */
  close: number
}

const OWNER = 'narrated'
/** The coach plays the first moves without asking: predicting move one is not a test. */
const PREDICT_FROM_PLY = 4
const COACH_DEPTH = 14
const COACH_CANDIDATES = 3
/** Time to read the coach's note before the computer answers. */
const OPPONENT_DELAY_MS = 2600
const COACH_DELAY_MS = 500

/**
 * The narrated game: the coach plays a full game against one of the computer levels and says
 * what it is thinking after each move, in the student's chosen voice. Before each coach move
 * from move 3 on, the student plays the move they expect; the coach says how close it was.
 */
export function useNarrated(gameApi: GameApi, engine: EngineContextValue, voice: Voice) {
  const { game, gameId, fen, gameOver, setGame, reset } = gameApi
  const { evaluate, setLiveSuspended } = engine
  const [coachSide, setCoachSide] = useState<'w' | 'b'>('w')
  const [level, setLevel] = useState<PlayLevel>(() => levelById(3))
  const [running, setRunning] = useState(false)
  // Set by the shell while another screen is open: the game waits, and the engine is free for that screen.
  const [paused, setPaused] = useState(false)
  // True once the student has predicted or skipped for the coach move now due.
  const [predictDecided, setPredictDecided] = useState(false)
  const [playGameId, setPlayGameId] = useState<number | null>(null)
  const [log, setLog] = useState<NarrationEntry[]>([])
  const [prediction, setPrediction] = useState<string | null>(null)
  const [stats, setStats] = useState<PredictionStats>({ asked: 0, exact: 0, close: 0 })
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const active = running && playGameId === gameId
  const coachToMove = turnOf(fen) === coachSide
  const over = !!gameOver && isAtEnd(game)
  // The stage follows the board: no state mirrors the turn, so nothing can fall out of step.
  const stage: NarratedStage = !active ? 'idle' : over ? 'done' : coachToMove ? (game.ply >= PREDICT_FROM_PLY && !predictDecided ? 'predict' : 'coach') : 'opponent'

  useEffect(() => {
    setLiveSuspended(active && !over && !paused, OWNER)
  }, [active, over, paused, setLiveSuspended])
  useEffect(() => () => setLiveSuspended(false, OWNER), [setLiveSuspended])

  const say = useCallback((who: NarrationEntry['who'], narration: Narration, ply: number) => setLog((l) => [{ ply, who, narration }, ...l]), [])

  const start = useCallback(
    (side: 'w' | 'b', levelId: number) => {
      requestId.current++
      const lv = levelById(levelId)
      setCoachSide(side)
      setLevel(lv)
      setLog([{ ply: 0, who: 'system', narration: { title: 'The game', lines: [intro(voice, side, lv.name)] } }])
      setPrediction(null)
      setPredictDecided(false)
      setStats({ asked: 0, exact: 0, close: 0 })
      setError(null)
      reset()
      setPlayGameId(gameId + 1) // reset() bumps gameId by one
      setRunning(true)
    },
    [reset, gameId, voice],
  )

  const exit = useCallback(() => {
    requestId.current++
    setRunning(false)
    setPlayGameId(null)
    setPrediction(null)
  }, [])

  // The game's last word is derived, so the log never needs an effect to close it.
  const entries = useMemo<NarrationEntry[]>(() => {
    if (!active || !over || !gameOver) return log
    const outcome = gameOver.result === '1/2-1/2' ? 'draw' : (gameOver.result === '1-0') === (coachSide === 'w') ? 'win' : 'loss'
    return [{ ply: game.ply, who: 'system', narration: { title: gameOver.title, lines: [gameOverLine(voice, outcome)] } }, ...log]
  }, [active, over, gameOver, game.ply, coachSide, voice, log])

  /** The student's prediction: the board does not change, the move is kept for the coach to compare. */
  const onBoardMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      if (!active || stage !== 'predict') return false
      if (!playMove(game, from, to, promotion)) return false
      setPrediction(from + to + (promotion ?? ''))
      setPredictDecided(true)
      return true
    },
    [active, stage, game],
  )

  /** Skips the prediction and lets the coach move. */
  const skipPrediction = useCallback(() => {
    if (stage === 'predict') {
      setPrediction(null)
      setPredictDecided(true)
    }
  }, [stage])

  // The coach's move: the engine's best, narrated against the prediction.
  useEffect(() => {
    if (!active || paused || stage !== 'coach' || !coachToMove || gameOver || !isAtEnd(game) || engine.status !== 'ready') return
    const id = ++requestId.current
    const fenNow = fen
    const ply = game.ply
    const predicted = prediction
    const t = window.setTimeout(async () => {
      try {
        const r = await evaluate(fenNow, COACH_DEPTH, COACH_CANDIDATES)
        if (requestId.current !== id) return
        const uci = r.bestMove ?? r.lines[0]?.pv[0]
        if (!uci) return
        let pred: { uci: string; lossCp: number } | null = null
        if (predicted) {
          let loss = predictionLoss(r.lines, predicted, coachSide)
          if (loss === null) {
            // The prediction is not among the candidates: one more search tells how much it gives away.
            const after = playUci(game, predicted)
            const best = r.lines[0]?.score
            if (after && best) {
              const a = await evaluate(after.moves[after.moves.length - 1].after, COACH_DEPTH, 1)
              if (requestId.current !== id) return
              const sign = coachSide === 'w' ? 1 : -1
              loss = a.lines[0] ? Math.max(0, sign * (scoreToCp(best) - scoreToCp(a.lines[0].score))) : 0
            } else loss = 0
          }
          pred = { uci: predicted, lossCp: loss }
          setStats((s) => ({ asked: s.asked + 1, exact: s.exact + (predicted === uci ? 1 : 0), close: s.close + (predicted !== uci && loss <= 30 ? 1 : 0) }))
        }
        say('coach', narrateCoachMove({ fenBefore: fenNow, uci, voice, lines: r.lines, prediction: pred }), ply + 1)
        setPrediction(null)
        setPredictDecided(false)
        setGame((g) => (g.ply === ply && isAtEnd(g) ? (playUci(g, uci) ?? g) : g))
      } catch (e) {
        if (requestId.current === id) setError(e instanceof Error ? e.message : String(e))
      }
    }, COACH_DELAY_MS)
    return () => clearTimeout(t)
  }, [active, paused, stage, coachToMove, gameOver, game, fen, engine.status, evaluate, prediction, coachSide, voice, say, setGame])

  // The computer's reply at its level, after a pause to read the coach.
  useEffect(() => {
    if (!active || paused || stage !== 'opponent' || coachToMove || gameOver || !isAtEnd(game) || engine.status !== 'ready') return
    const id = ++requestId.current
    const fenNow = fen
    const ply = game.ply
    const t = window.setTimeout(async () => {
      try {
        const r = await evaluate(fenNow, level.depth, level.candidates)
        if (requestId.current !== id) return
        const legal = new Chess(fenNow).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''))
        const uci = pickMove(r.lines, turnOf(fenNow), level, legal)
        if (!uci) return
        say('opponent', narrateOpponentMove(fenNow, uci, voice), ply + 1)
        setGame((g) => (g.ply === ply && isAtEnd(g) ? (playUci(g, uci) ?? g) : g))
      } catch (e) {
        if (requestId.current === id) setError(e instanceof Error ? e.message : String(e))
      }
    }, ply === 0 ? COACH_DELAY_MS : OPPONENT_DELAY_MS)
    return () => clearTimeout(t)
  }, [active, paused, stage, coachToMove, gameOver, game, fen, engine.status, evaluate, level, voice, say, setGame])

  // The prediction stays on the board as an arrow until the coach has moved.
  const arrows: Arrow[] = useMemo(() => {
    if (!prediction || stage !== 'coach') return []
    return [{ startSquare: prediction.slice(0, 2), endSquare: prediction.slice(2, 4), color: ANSWER_ARROW }]
  }, [prediction, stage])

  return {
    active,
    stage,
    coachSide,
    level,
    log: entries,
    stats,
    error,
    arrows,
    orientation: (coachSide === 'w' ? 'white' : 'black') as 'white' | 'black',
    userToMove: active && stage === 'predict',
    thinking: active && !paused && (stage === 'coach' || stage === 'opponent'),
    paused,
    setPaused,
    start,
    exit,
    skipPrediction,
    onBoardMove,
  }
}

export type NarratedApi = ReturnType<typeof useNarrated>
