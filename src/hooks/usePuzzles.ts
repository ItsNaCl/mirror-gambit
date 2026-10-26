import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { newGame, playUci, redo, type PromotionPiece } from '../lib/chess/game'
import type { Score } from '../lib/engine/uci'
import {
  acceptsAlternative,
  emptyStats,
  movesMatch,
  normalizeStats,
  outcomeOf,
  recordOutcome,
  type Outcome,
  type SetStats,
} from '../lib/practice/practice'
import { loadPuzzles, motifGuide, puzzlesFor, shuffle, type Puzzle, type PuzzleChoice, type PuzzleSetId } from '../lib/puzzles/puzzles'
import { useAttempt, useHintDecorations } from './useAttempt'
import type { EngineContextValue } from './useEngine'
import type { GameApi } from './useGame'
import * as kv from '../lib/store/kv'
import { ANSWER_ARROW } from '../lib/ui/boardColors'

export type { SetStats } from '../lib/practice/practice'
export type PuzzleStats = Partial<Record<PuzzleSetId, SetStats>>

/** playing: solving · solved: finished without giving up · revealing: gave up, stepping through the solution */
export type PuzzleStatus = 'idle' | 'playing' | 'solved' | 'revealing'

const STATS_KEY = 'mirror-gambit.puzzle-stats.v1'
/** Depth for judging a move that differs from the solution, and for replies once off the script. */
const ALT_DEPTH = 12
const SUSPEND_OWNER = 'puzzles'

export function loadPuzzleStats(): PuzzleStats {
  try {
    const raw = kv.getItem(STATS_KEY)
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

export function usePuzzles(gameApi: GameApi, engine: EngineContextValue) {
  const { setGame } = gameApi
  const { evaluate, setLiveSuspended } = engine
  const engineReady = engine.status === 'ready'
  const attempt = useAttempt()
  const [choice, setChoice] = useState<PuzzleChoice | 'custom' | 'rated' | null>(null)
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
  // Set when the student played a different but equally good move: from that step on the
  // engine plays the replies and judges the moves, since the stored solution no longer applies.
  const [offScriptAt, setOffScriptAt] = useState<number | null>(null)
  const [engineExpected, setEngineExpected] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const checkId = useRef(0)
  // Engine questions run one after another: a second evaluate() would cancel the first.
  const engineQueue = useRef<Promise<unknown>>(Promise.resolve())
  const ask = useCallback(
    (fen: string) => {
      const run = engineQueue.current.then(() => evaluate(fen, ALT_DEPTH, 1))
      engineQueue.current = run.catch(() => {})
      return run
    },
    [evaluate],
  )

  const record = useCallback((p: Puzzle, result: Outcome) => {
    setStats((all) => {
      const next: PuzzleStats = { ...all, [p.set]: recordOutcome(all[p.set] ?? emptyStats(), result, p.id) }
      try {
        kv.setItem(STATS_KEY, JSON.stringify(next))
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
      setOffScriptAt(null)
      setEngineExpected(null)
      setChecking(false)
      checkId.current++
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

  /** One rated puzzle; the rated hook (useRatedPuzzles) chooses the next one. */
  const startRated = useCallback(
    (p: Puzzle) => {
      setChoice('rated')
      setLabel('Rated')
      setQueue([])
      show(p)
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
    if (!choice || choice === 'rated') return
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
    checkId.current++
    setChecking(false)
    setChoice(null)
    setPuzzle(null)
    setStatus('idle')
    setMessage(null)
    if (timer.current) clearTimeout(timer.current)
  }, [])

  // Live analysis would race the engine checks below (and show the answer on the Analysis tab).
  const solving = puzzle !== null && status === 'playing'
  useEffect(() => {
    setLiveSuspended(solving, SUSPEND_OWNER)
  }, [solving, setLiveSuspended])
  useEffect(() => () => setLiveSuspended(false, SUSPEND_OWNER), [setLiveSuspended])

  const fen = gameApi.fen
  const gameEnded = gameApi.gameOver !== null

  // After a correct solver move, the app plays the reply (if any) after a short pause.
  useEffect(() => {
    if (!puzzle || status !== 'playing') return
    if (step % 2 === 0 || step >= puzzle.solution.length || gameEnded) return // solver's turn, or done
    const scripted = offScriptAt === null ? puzzle.solution[step] : null
    let cancelled = false
    const t = window.setTimeout(async () => {
      let reply = scripted
      if (!reply) {
        try {
          reply = (await ask(fen)).bestMove
        } catch {
          reply = null
        }
      }
      if (cancelled || !reply) return
      const move = reply
      setGame((g) => playUci(g, move) ?? g)
      setStep((s) => s + 1)
    }, 600)
    timer.current = t
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [puzzle, status, step, setGame, offScriptAt, fen, ask, gameEnded])

  // Off the script, the engine's best move is what the hints point at.
  useEffect(() => {
    if (!puzzle || status !== 'playing' || offScriptAt === null || step % 2 === 1 || gameEnded) return
    let cancelled = false
    setEngineExpected(null)
    ask(fen)
      .then((r) => {
        if (!cancelled) setEngineExpected(r.bestMove)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [puzzle, status, offScriptAt, step, fen, ask, gameEnded])

  // Finished when all solution moves are on the board, or when the solver's move ended the game
  // (an alternative mate can finish sooner than the stored line).
  useEffect(() => {
    if (!puzzle || status !== 'playing') return
    if (step >= puzzle.solution.length || (step % 2 === 1 && gameEnded)) {
      const result = outcomeOf(attempt.record(false))
      setStatus('solved')
      setOutcome(result)
      record(puzzle, result)
      setMessage(null)
    }
  }, [puzzle, status, step, record, attempt, gameEnded])

  /** Give up: counts as failed, then the solution is shown one move at a time from where you are. */
  const giveUp = useCallback(() => {
    if (!puzzle || status !== 'playing') return
    checkId.current++
    setChecking(false)
    let g = newGame(puzzle.fen)
    for (const uci of puzzle.solution) g = playUci(g, uci) ?? g
    // Off the script the stored line no longer matches the board, so show it from where you left it.
    setGame({ ...g, ply: offScriptAt ?? step })
    setStatus('revealing')
    setOutcome('failed')
    record(puzzle, 'failed')
    setMessage(null)
  }, [puzzle, status, step, record, setGame, offScriptAt])

  /** While revealing, show the next solution move. */
  const revealNext = useCallback(() => setGame((g) => redo(g)), [setGame])

  const onBoardMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      if (!puzzle || status !== 'playing' || step % 2 === 1 || checking) return false
      const beforeFen = gameApi.fen
      let played: { san: string; after: string; color: 'w' | 'b' }
      try {
        played = new Chess(beforeFen).move({ from, to, promotion })
      } catch {
        return false
      }
      const uci = from + to + (promotion ?? '')
      const onScript = offScriptAt === null
      const expected = onScript ? puzzle.solution[step] : engineExpected
      const isLast = step + 1 >= puzzle.solution.length

      const accept = (alternative: boolean) => {
        setGame((g) => playUci(g, uci) ?? g)
        setStep(step + 1)
        attempt.nextMove()
        if (alternative && onScript) setOffScriptAt(step)
        if (alternative) setMessage(isLast ? null : 'That works too! It is not the stored answer, but it is just as strong. Keep going…')
        else setMessage(isLast ? null : 'Correct! Keep going…')
      }
      // Wrong: the piece snaps back and you stay on the same move. Never ends the puzzle.
      const reject = () => {
        setShakeKey((k) => k + 1)
        attempt.wrong()
        setMessage(`Not quite, try again. (${played.san} is not it.)`)
      }

      if (expected && movesMatch(uci, played.san, expected, onScript ? puzzle.solutionSan[step] : '')) {
        accept(false)
        return true
      }
      if (played.san.includes('#')) {
        accept(true)
        return true
      }
      if (!engineReady) {
        reject()
        return false
      }
      // A different move: ask the engine whether it is just as good before calling it wrong.
      const id = ++checkId.current
      setChecking(true)
      setMessage('Checking that move…')
      void (async () => {
        try {
          const before = await ask(beforeFen)
          const best = before.lines[0]?.score
          let ok = before.bestMove === uci
          if (!ok && best) {
            const afterChess = new Chess(played.after)
            const after: Score | undefined = afterChess.isGameOver()
              ? { type: afterChess.isCheckmate() ? 'mate' : 'cp', value: 0 }
              : (await ask(played.after)).lines[0]?.score
            ok = !!after && acceptsAlternative(best, after, played.color)
          }
          if (checkId.current !== id) return
          if (ok) accept(true)
          else reject()
        } catch {
          if (checkId.current === id) reject()
        } finally {
          if (checkId.current === id) setChecking(false)
        }
      })()
      return false
    },
    [puzzle, status, step, checking, gameApi.fen, offScriptAt, engineExpected, engineReady, setGame, attempt, ask],
  )

  const solverToMove = puzzle !== null && status === 'playing' && step % 2 === 0 && !checking
  const orientation: 'white' | 'black' = puzzle?.side === 'b' ? 'black' : 'white'
  const expectedUci = puzzle && solverToMove ? (offScriptAt === null ? (puzzle.solution[step] ?? null) : engineExpected) : null
  const hints = useHintDecorations(attempt.hintLevel, expectedUci, puzzle ? puzzleTheme(puzzle.motif) : '', solverToMove)

  // During the give-up walkthrough, an arrow shows the next solution move.
  const revealArrows: Arrow[] = useMemo(() => {
    if (!puzzle || status !== 'revealing') return []
    const nextIndex = gameApi.game.ply
    const uci = puzzle.solution[nextIndex]
    if (!uci || nextIndex >= gameApi.game.moves.length) return []
    return [{ startSquare: uci.slice(0, 2), endSquare: uci.slice(2, 4), color: ANSWER_ARROW }]
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
    checking,
    offScript: offScriptAt !== null,
    orientation,
    revealDone,
    remaining: queue.length,
    start,
    startList,
    startRated,
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
