import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { newGame, playUci, redo, type PromotionPiece } from '../lib/chess/game'
import { emptyStats, movesMatch, normalizeStats, outcomeOf, recordOutcome, type Outcome, type SetStats } from '../lib/practice/practice'
import { loadPuzzles, motifGuide, puzzlesFor, shuffle, type Puzzle, type PuzzleChoice, type PuzzleSetId } from '../lib/puzzles/puzzles'
import { useAttempt, useHintDecorations } from './useAttempt'
import type { GameApi } from './useGame'

export type { SetStats } from '../lib/practice/practice'
export type PuzzleStats = Partial<Record<PuzzleSetId, SetStats>>

/** playing: solving · solved: finished without giving up · revealing: gave up, stepping through the solution */
export type PuzzleStatus = 'idle' | 'playing' | 'solved' | 'revealing'

const STATS_KEY = 'mirror-gambit.puzzle-stats.v1'

export function loadPuzzleStats(): PuzzleStats {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: PuzzleStats = {}
    for (const [k, v] of Object.entries(parsed)) out[k as PuzzleSetId] = normalizeStats(v)
    return out
  } catch {
    return {}
  }
}

/** Level-1 hint text for a puzzle motif. */
export function puzzleTheme(motif: string): string {
  switch (motif) {
    case 'opening':
      return 'Think about opening principles: centre, development, king safety.'
    case 'opening_trap':
      return 'Something here is undefended or about to be. Look for checks, captures and threats.'
    case 'endgame':
      return 'Think endgame technique: king forward, cut off the enemy king, push the pawn.'
    case 'checkmate':
      return 'Look for a checkmate pattern.'
    case 'back_rank_mate':
      return 'Look for a back-rank mate.'
    default:
      return `Look for a ${motifGuide(motif).title.toLowerCase()}.`
  }
}

export function usePuzzles(gameApi: GameApi) {
  const { setGame } = gameApi
  const attempt = useAttempt()
  const [choice, setChoice] = useState<PuzzleChoice | 'custom' | null>(null)
  const [customList, setCustomList] = useState<Puzzle[]>([])
  const [label, setLabel] = useState<string>('')
  const [queue, setQueue] = useState<Puzzle[]>([])
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [step, setStep] = useState(0) // index into puzzle.solution of the next expected move
  const [status, setStatus] = useState<PuzzleStatus>('idle')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [stats, setStats] = useState<PuzzleStats>(loadPuzzleStats)
  const timer = useRef<number | null>(null)

  const record = useCallback((p: Puzzle, result: Outcome) => {
    setStats((all) => {
      const next: PuzzleStats = { ...all, [p.set]: recordOutcome(all[p.set] ?? emptyStats(), result, p.id) }
      try {
        localStorage.setItem(STATS_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const show = useCallback(
    (p: Puzzle) => {
      setPuzzle(p)
      setStep(0)
      setStatus('playing')
      setOutcome(null)
      setMessage(null)
      attempt.reset()
      setGame(newGame(p.fen))
    },
    [setGame, attempt],
  )

  const start = useCallback(
    (c: PuzzleChoice) => {
      const list = shuffle(puzzlesFor(c))
      setChoice(c)
      setLabel('')
      setQueue(list.slice(1))
      if (list[0]) show(list[0])
    },
    [show],
  )

  /** Plays a fixed list of puzzles in order (opening trap step, retry-failed). */
  const startList = useCallback(
    (list: Puzzle[], listLabel: string) => {
      if (list.length === 0) return
      setChoice('custom')
      setCustomList(list)
      setLabel(listLabel)
      setQueue(list.slice(1))
      show(list[0])
    },
    [show],
  )

  /** Puzzles whose latest result was a fail, for one set or for all sets. */
  const failedPuzzles = useCallback(
    (c: PuzzleChoice): Puzzle[] => {
      const all = loadPuzzles().puzzles
      const ids = new Set(
        c === 'mixed' ? Object.values(stats).flatMap((s) => s?.failedIds ?? []) : (stats[c]?.failedIds ?? []),
      )
      return all.filter((p) => ids.has(p.id))
    },
    [stats],
  )

  const retryFailed = useCallback(
    (c: PuzzleChoice, setLabelText: string) => startList(failedPuzzles(c), `Retry failed: ${setLabelText}`),
    [failedPuzzles, startList],
  )

  const next = useCallback(() => {
    if (!choice) return
    if (queue.length === 0) {
      const list = choice === 'custom' ? customList : shuffle(puzzlesFor(choice))
      setQueue(list.slice(1))
      if (list[0]) show(list[0])
      return
    }
    const [head, ...rest] = queue
    setQueue(rest)
    show(head)
  }, [choice, customList, queue, show])

  const retry = useCallback(() => {
    if (puzzle) show(puzzle)
  }, [puzzle, show])

  const exit = useCallback(() => {
    setChoice(null)
    setPuzzle(null)
    setStatus('idle')
    setMessage(null)
    if (timer.current) clearTimeout(timer.current)
  }, [])

  // After a correct solver move, the app plays the reply (if any) after a short pause.
  useEffect(() => {
    if (!puzzle || status !== 'playing') return
    if (step % 2 === 0) return // solver's turn
    const reply = puzzle.solution[step]
    if (!reply) return
    const t = window.setTimeout(() => {
      setGame((g) => playUci(g, reply) ?? g)
      setStep((s) => s + 1)
    }, 600)
    timer.current = t
    return () => clearTimeout(t)
  }, [puzzle, status, step, setGame])

  // Finished when all solution moves are on the board.
  useEffect(() => {
    if (!puzzle || status !== 'playing') return
    if (step >= puzzle.solution.length) {
      const result = outcomeOf(attempt.record(false))
      setStatus('solved')
      setOutcome(result)
      record(puzzle, result)
      setMessage(null)
    }
  }, [puzzle, status, step, record, attempt])

  /** Give up: counts as failed, then the solution is shown one move at a time from where you are. */
  const giveUp = useCallback(() => {
    if (!puzzle || status !== 'playing') return
    let g = newGame(puzzle.fen)
    for (const uci of puzzle.solution) g = playUci(g, uci) ?? g
    setGame({ ...g, ply: step })
    setStatus('revealing')
    setOutcome('failed')
    record(puzzle, 'failed')
    setMessage(null)
  }, [puzzle, status, step, record, setGame])

  /** While revealing, show the next solution move. */
  const revealNext = useCallback(() => setGame((g) => redo(g)), [setGame])

  const onBoardMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      if (!puzzle || status !== 'playing' || step % 2 === 1) return false
      const expected = puzzle.solution[step]
      const chess = new Chess(gameApi.fen)
      let san: string
      try {
        san = chess.move({ from, to, promotion }).san
      } catch {
        return false
      }
      if (movesMatch(from + to + (promotion ?? ''), san, expected, puzzle.solutionSan[step])) {
        setGame((g) => playUci(g, expected) ?? g)
        setStep(step + 1)
        attempt.nextMove()
        setMessage(step + 1 >= puzzle.solution.length ? null : 'Correct! Keep going…')
        return true
      }
      // Wrong: the piece snaps back and you stay on the same move. Never ends the puzzle.
      setShakeKey((k) => k + 1)
      attempt.wrong()
      setMessage(`Not quite, try again. (${san} is not it.)`)
      return false
    },
    [puzzle, status, step, gameApi.fen, setGame, attempt],
  )

  const solverToMove = puzzle !== null && status === 'playing' && step % 2 === 0
  const orientation: 'white' | 'black' = puzzle?.side === 'b' ? 'black' : 'white'
  const expectedUci = puzzle && solverToMove ? (puzzle.solution[step] ?? null) : null
  const hints = useHintDecorations(attempt.hintLevel, expectedUci, puzzle ? puzzleTheme(puzzle.motif) : '', solverToMove)

  // During the give-up walkthrough, an arrow shows the next solution move.
  const revealArrows: Arrow[] = useMemo(() => {
    if (!puzzle || status !== 'revealing') return []
    const nextIndex = gameApi.game.ply
    const uci = puzzle.solution[nextIndex]
    if (!uci || nextIndex >= gameApi.game.moves.length) return []
    return [{ startSquare: uci.slice(0, 2), endSquare: uci.slice(2, 4), color: 'rgba(79, 196, 138, 0.9)' }]
  }, [puzzle, status, gameApi.game])

  const revealDone = status === 'revealing' && gameApi.game.ply >= gameApi.game.moves.length

  return {
    active: puzzle !== null,
    choice,
    label,
    puzzle,
    step,
    status,
    outcome,
    message,
    shakeKey,
    stats,
    attempt,
    hintText: hints.text,
    squareStyles: hints.squareStyles,
    arrows: status === 'revealing' ? revealArrows : hints.arrows,
    solverToMove,
    orientation,
    revealDone,
    remaining: queue.length,
    start,
    startList,
    failedPuzzles,
    retryFailed,
    next,
    retry,
    exit,
    giveUp,
    revealNext,
    onBoardMove,
  }
}

export type PuzzlesApi = ReturnType<typeof usePuzzles>
