import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Square } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { currentFen, newGame, playMove, playUci, type PromotionPiece } from '../lib/chess/game'
import { compareMoves, WHY_NOT_DEPTH, type Comparison, type WhyNotItem } from '../lib/modes/whyNot'
import { ANSWER_ARROW } from '../lib/ui/boardColors'
import type { EngineContextValue } from './useEngine'
import type { GameApi } from './useGame'

/** asking: the student's move · thinking: the engine answers it · compare: both lines are on the table */
export type WhyNotStage = 'idle' | 'asking' | 'thinking' | 'compare'

export interface Playback {
  which: 'tried' | 'best'
  /** Steps of the line already on the board. */
  shown: number
  playing: boolean
}

const STEP_MS = 1100
const OWNER = 'whynot'
/** A search that takes longer than this was replaced by another mode's; the question is asked again. */
const THINK_TIMEOUT_MS = 30_000

/**
 * Why not this move. The student plays an idea in a position from their own game, the engine
 * evaluates the position before and after it (one search at a time, live analysis suspended),
 * and the panel compares the idea with the engine's move. Either line can be played out on the
 * board one move at a time.
 */
export function useWhyNot(gameApi: GameApi, engine: EngineContextValue) {
  const { setGame } = gameApi
  const { evaluate, setLiveSuspended } = engine
  const [queue, setQueue] = useState<WhyNotItem[]>([])
  const [index, setIndex] = useState(0)
  const [stage, setStage] = useState<WhyNotStage>('idle')
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playback, setPlayback] = useState<Playback | null>(null)
  // Bumped whenever the position changes, so an engine answer for an earlier move is dropped.
  const runId = useRef(0)
  const item = queue[index] ?? null

  const show = useCallback(
    (it: WhyNotItem) => {
      runId.current++
      setStage('asking')
      setComparison(null)
      setPlayback(null)
      setError(null)
      setGame(newGame(it.fen))
    },
    [setGame],
  )

  const start = useCallback(
    (items: WhyNotItem[]) => {
      setQueue(items)
      setIndex(0)
      if (items[0]) show(items[0])
    },
    [show],
  )

  const exit = useCallback(() => {
    runId.current++
    setStage('idle')
    setQueue([])
    setIndex(0)
    setComparison(null)
    setPlayback(null)
    setError(null)
  }, [])

  const next = useCallback(() => {
    const i = index + 1
    if (i < queue.length) {
      setIndex(i)
      show(queue[i])
    } else exit()
  }, [index, queue, show, exit])

  const tryAgain = useCallback(() => {
    if (item) show(item)
  }, [item, show])

  // Live analysis is suspended exactly while the engine answers a move: whatever ends the
  // thinking (an answer, Skip, Try again, Stop) releases it, and so does unmounting.
  useEffect(() => {
    setLiveSuspended(stage === 'thinking', OWNER)
  }, [stage, setLiveSuspended])
  useEffect(() => () => setLiveSuspended(false, OWNER), [setLiveSuspended])

  // A search replaced by another mode's never settles; after a while the question is asked again.
  useEffect(() => {
    if (stage !== 'thinking' || !item) return
    const t = setTimeout(() => {
      runId.current++
      setError('The engine was interrupted. Play the move again.')
      setGame(newGame(item.fen))
      setStage('asking')
    }, THINK_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [stage, item, setGame])

  const game = gameApi.game
  const onBoardMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      if (!item || stage !== 'asking') return false
      const after = playMove(game, from, to, promotion)
      if (!after) return false
      setGame(after)
      const uci = from + to + (promotion ?? '')
      const afterFen = currentFen(after)
      setStage('thinking')
      setError(null)
      const id = ++runId.current
      void (async () => {
        try {
          // One search after the other: a second evaluate() would replace the first.
          const before = await evaluate(item.fen, WHY_NOT_DEPTH, 1)
          if (id !== runId.current) return
          const reply = await evaluate(afterFen, WHY_NOT_DEPTH, 1)
          if (id !== runId.current) return
          const c = compareMoves(item, uci, before, reply)
          if (!c) {
            setError('The engine could not judge that move. Try another.')
            setGame(newGame(item.fen))
            setStage('asking')
            return
          }
          setComparison(c)
          setStage('compare')
          // The student's move is already on the board; the engine's answer follows it.
          setPlayback({ which: 'tried', shown: 1, playing: true })
        } catch (e) {
          if (id !== runId.current) return
          setError(e instanceof Error ? e.message : 'The engine is not ready.')
          setGame(newGame(item.fen))
          setStage('asking')
        }
      })()
      return true
    },
    [item, stage, game, setGame, evaluate],
  )

  /** Puts a line on the board from the start position and plays it out. */
  const playLine = useCallback(
    (which: 'tried' | 'best') => {
      if (!item || !comparison) return
      setGame(newGame(item.fen))
      setPlayback({ which, shown: 0, playing: true })
    },
    [item, comparison, setGame],
  )
  const pauseLine = useCallback(() => setPlayback((p) => (p ? { ...p, playing: false } : p)), [])

  const report = playback && comparison ? (playback.which === 'best' ? comparison.best : comparison.tried) : null
  const steps = useMemo(() => report?.lesson.steps ?? [], [report])

  // Autoplay: one step per tick until the line is out. The board is rebuilt from the start
  // position each tick, so where the move list cursor sits cannot bend the line.
  useEffect(() => {
    if (!playback?.playing || !item) return
    if (playback.shown >= steps.length) {
      const t = setTimeout(() => setPlayback((p) => (p ? { ...p, playing: false } : p)), 0)
      return () => clearTimeout(t)
    }
    const upto = playback.shown + 1
    const t = setTimeout(() => {
      let g = newGame(item.fen)
      for (const s of steps.slice(0, upto)) g = playUci(g, s.uci) ?? g
      setGame(g)
      setPlayback((p) => (p ? { ...p, shown: upto } : p))
    }, STEP_MS)
    return () => clearTimeout(t)
  }, [playback, steps, item, setGame])

  // The next move of the line being shown, as an arrow, so a paused line still points the way.
  const arrows: Arrow[] = useMemo(() => {
    if (stage !== 'compare' || !playback || playback.playing) return []
    const step = steps[playback.shown]
    return step ? [{ startSquare: step.from, endSquare: step.to, color: ANSWER_ARROW }] : []
  }, [stage, playback, steps])

  return {
    active: stage !== 'idle',
    stage,
    item,
    index,
    total: queue.length,
    comparison,
    error,
    playback,
    arrows,
    orientation: (item?.side === 'b' ? 'black' : 'white') as 'white' | 'black',
    userToMove: stage === 'asking',
    /** The move list may be browsed once the comparison is up and no line is playing. */
    canBrowse: stage === 'compare' && !playback?.playing,
    start,
    next,
    tryAgain,
    exit,
    onBoardMove,
    playLine,
    pauseLine,
  }
}

export type WhyNotApi = ReturnType<typeof useWhyNot>
