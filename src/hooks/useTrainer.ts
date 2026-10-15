import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { allLines, type LineMove, type Opening } from '../openings'
import { newGame, playSan, turnOf, type GameState, type PromotionPiece } from '../lib/chess/game'
import { movesMatch, themeForMove } from '../lib/practice/practice'
import { useAttempt, useHintDecorations } from './useAttempt'
import type { GameApi } from './useGame'

export type TrainerMode = 'step' | 'auto' | 'drill'

export interface DrillStats {
  attempts: number
  correct: number
}

export type DrillFeedback =
  | { kind: 'intro'; text: string }
  | { kind: 'correct'; text: string }
  | { kind: 'wrong'; text: string }
  | { kind: 'reveal'; text: string }
  | { kind: 'done'; text: string }

const STATS_KEY = 'mirror-gambit.opening-stats.v1'

function loadStats(): Record<string, DrillStats> {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, DrillStats>) : {}
  } catch {
    return {}
  }
}

/** Builds the game state after the first `count` moves of a line. */
function positionAfter(moves: LineMove[], count: number): GameState {
  let state = newGame()
  for (let i = 0; i < count; i++) {
    const next = playSan(state, moves[i].san)
    if (!next) break
    state = next
  }
  return state
}

export function useTrainer(gameApi: GameApi) {
  const [opening, setOpening] = useState<Opening | null>(null)
  const [lineKey, setLineKey] = useState('main')
  const [mode, setModeState] = useState<TrainerMode>('step')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speedMs, setSpeedMs] = useState(1500)
  const [drillSide, setDrillSide] = useState<'white' | 'black'>('white')
  const attempt = useAttempt()
  const [feedback, setFeedback] = useState<DrillFeedback | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [revealMove, setRevealMove] = useState<string | null>(null)
  const [drillScore, setDrillScore] = useState({ attempts: 0, correct: 0 })
  const [stats, setStats] = useState<Record<string, DrillStats>>(loadStats)
  const { setGame } = gameApi

  const lines = useMemo(() => (opening ? allLines(opening) : []), [opening])
  const line = useMemo(() => lines.find((l) => l.key === lineKey) ?? lines[0] ?? null, [lines, lineKey])
  const moves: LineMove[] = useMemo(() => line?.moves ?? [], [line])

  const recordAttempt = useCallback(
    (correct: boolean) => {
      if (!opening) return
      setDrillScore((s) => ({ attempts: s.attempts + 1, correct: s.correct + (correct ? 1 : 0) }))
      setStats((all) => {
        const prev = all[opening.id] ?? { attempts: 0, correct: 0 }
        const next = { ...all, [opening.id]: { attempts: prev.attempts + 1, correct: prev.correct + (correct ? 1 : 0) } }
        try {
          localStorage.setItem(STATS_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [opening],
  )

  // Keep the board in sync with the line position in step and autoplay modes.
  useEffect(() => {
    if (!opening || mode === 'drill') return
    setGame(positionAfter(moves, index))
  }, [opening, moves, index, mode, setGame])

  // Autoplay timer.
  useEffect(() => {
    if (!playing || mode !== 'auto') return
    if (index >= moves.length) {
      setPlaying(false)
      return
    }
    const t = setTimeout(() => setIndex((i) => Math.min(moves.length, i + 1)), speedMs)
    return () => clearTimeout(t)
  }, [playing, mode, index, moves.length, speedMs])

  const sideToMoveAt = useCallback((i: number): 'white' | 'black' => (i % 2 === 0 ? 'white' : 'black'), [])

  /** Applies line move i to the board (used for the opponent's book moves and reveals). */
  const applyLineMove = useCallback(
    (i: number) => {
      const san = moves[i]?.san
      if (!san) return
      setGame((g) => playSan(g, san) ?? g)
      setIndex(i + 1)
      attempt.nextMove()
      setRevealMove(null)
    },
    [moves, setGame, attempt],
  )

  // Drill: the app plays the other side's book moves after a short pause.
  const revealTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!opening || mode !== 'drill') return
    if (index >= moves.length) {
      setFeedback((f) =>
        f?.kind === 'done'
          ? f
          : {
              kind: 'done',
              text: `Line complete! You got ${drillScore.correct} of ${drillScore.attempts} moves right. Read the key ideas below, then try again or pick another line.`,
            },
      )
      return
    }
    const isUsersMove = sideToMoveAt(index) === drillSide
    if (isUsersMove && !revealMove) return
    const delay = revealMove ? 1600 : 650
    const t = window.setTimeout(() => applyLineMove(index), delay)
    revealTimer.current = t
    return () => clearTimeout(t)
  }, [opening, mode, index, moves.length, drillSide, revealMove, applyLineMove, sideToMoveAt, drillScore])

  const select = useCallback((o: Opening) => {
    setOpening(o)
    setLineKey('main')
    setModeState('step')
    setIndex(0)
    setPlaying(false)
    setFeedback(null)
    attempt.reset()
    setRevealMove(null)
    setDrillSide(o.side)
  }, [attempt])

  const exit = useCallback(() => {
    setOpening(null)
    setPlaying(false)
    setFeedback(null)
    setRevealMove(null)
  }, [])

  const setLine = useCallback((key: string) => {
    setLineKey(key)
    setIndex(0)
    setPlaying(false)
    setFeedback(null)
    attempt.reset()
    setRevealMove(null)
    setDrillScore({ attempts: 0, correct: 0 })
  }, [attempt])

  const setMode = useCallback(
    (m: TrainerMode) => {
      setModeState(m)
      setPlaying(false)
      setFeedback(null)
      attempt.reset()
      setRevealMove(null)
      if (m === 'drill') {
        setIndex(0)
        setDrillScore({ attempts: 0, correct: 0 })
        setGame(newGame())
        setFeedback({
          kind: 'intro',
          text: `You play ${drillSide === 'white' ? 'White' : 'Black'}. Play the moves of the line on the board; the app answers with the book moves. Take as many tries as you need: Hint shows a little more each click, Give up shows the move.`,
        })
      }
    },
    [drillSide, setGame, attempt],
  )

  const startDrill = useCallback(
    (side: 'white' | 'black') => {
      setDrillSide(side)
      setModeState('drill')
      setPlaying(false)
      setIndex(0)
      attempt.reset()
      setRevealMove(null)
      setDrillScore({ attempts: 0, correct: 0 })
      setGame(newGame())
      setFeedback({
        kind: 'intro',
        text: `You play ${side === 'white' ? 'White' : 'Black'}. Play the moves of the line on the board; the app answers with the book moves. Take as many tries as you need: Hint shows a little more each click, Give up shows the move.`,
      })
    },
    [setGame, attempt],
  )

  const next = useCallback(() => setIndex((i) => Math.min(moves.length, i + 1)), [moves.length])
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const goTo = useCallback((i: number) => setIndex(Math.max(0, Math.min(moves.length, i))), [moves.length])
  const play = useCallback(() => {
    setModeState('auto')
    setIndex((i) => (i >= moves.length ? 0 : i))
    setPlaying(true)
  }, [moves.length])
  const pause = useCallback(() => setPlaying(false), [])

  /** Handles a board move while drilling. Returns true if the move was accepted. */
  const onBoardMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      if (!opening || mode !== 'drill' || index >= moves.length || revealMove) return false
      if (sideToMoveAt(index) !== drillSide) return false
      const expected = moves[index]
      const chess = new Chess(gameApi.fen)
      let san: string
      try {
        san = chess.move({ from, to, promotion }).san
      } catch {
        return false
      }
      if (movesMatch(from + to + (promotion ?? ''), san, null, expected.san)) {
        setGame((g) => playSan(g, expected.san) ?? g)
        setIndex(index + 1)
        // A move counts as correct in the drill stats only if found with no wrong tries and no hints.
        const clean = attempt.wrongThisMove === 0 && attempt.hintLevel === 0
        recordAttempt(clean)
        attempt.nextMove()
        setFeedback({ kind: 'correct', text: `${expected.san}: ${expected.comment}` })
        return true
      }
      // Wrong: the piece snaps back and you try the same move again. Never revealed automatically.
      setShakeKey((k) => k + 1)
      attempt.wrong()
      setFeedback({ kind: 'wrong', text: `Not quite, try again. (${san} is not the book move here.)` })
      return false
    },
    [opening, mode, index, moves, revealMove, drillSide, gameApi.fen, recordAttempt, setGame, sideToMoveAt, attempt],
  )

  /** Give up on the current move: show it with its explanation, then the drill carries on. */
  const giveUp = useCallback(() => {
    if (!opening || mode !== 'drill' || index >= moves.length || revealMove) return
    if (sideToMoveAt(index) !== drillSide) return
    const expected = moves[index]
    recordAttempt(false)
    attempt.nextMove()
    setRevealMove(expected.san)
    setFeedback({ kind: 'reveal', text: `The book move is ${expected.san}. ${expected.comment}` })
  }, [opening, mode, index, moves, revealMove, drillSide, sideToMoveAt, recordAttempt, attempt],
  )

  const revealArrow: Arrow[] = useMemo(() => {
    if (!revealMove) return []
    try {
      const chess = new Chess(gameApi.fen)
      const mv = chess.move(revealMove)
      return [{ startSquare: mv.from, endSquare: mv.to, color: 'rgba(79, 196, 138, 0.9)' }]
    } catch {
      return []
    }
  }, [revealMove, gameApi.fen])

  const currentMove = index > 0 ? moves[index - 1] : null
  const boardOrientation: 'white' | 'black' = mode === 'drill' ? drillSide : (opening?.side ?? 'white')
  const userToMove = mode === 'drill' && opening !== null && index < moves.length && sideToMoveAt(index) === drillSide && !revealMove
  const boardSideToMove = turnOf(gameApi.fen)

  const expectedUci = useMemo(() => {
    if (!userToMove) return null
    try {
      const mv = new Chess(gameApi.fen).move(moves[index].san)
      return mv.from + mv.to + (mv.promotion ?? '')
    } catch {
      return null
    }
  }, [userToMove, gameApi.fen, moves, index])
  const hints = useHintDecorations(attempt.hintLevel, expectedUci, expectedUci ? themeForMove(gameApi.fen, expectedUci) : '', userToMove)

  return {
    attempt,
    hintText: hints.text,
    hintSquareStyles: hints.squareStyles,
    arrows: revealMove ? revealArrow : hints.arrows,
    giveUp,
    opening,
    lines,
    line,
    lineKey,
    moves,
    mode,
    index,
    playing,
    speedMs,
    drillSide,
    feedback,
    shakeKey,
    revealArrow,
    drillScore,
    stats,
    currentMove,
    boardOrientation,
    userToMove,
    boardSideToMove,
    active: opening !== null,
    select,
    exit,
    setLine,
    setMode,
    startDrill,
    next,
    prev,
    goTo,
    play,
    pause,
    setSpeedMs,
    onBoardMove,
  }
}

export type TrainerApi = ReturnType<typeof useTrainer>
