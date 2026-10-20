import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { CLASS_LABEL, classifyMove, isProblem, type MoveClass } from '../lib/analysis/classify'
import { fenAt, isAtEnd, jumpTo, playUci, turnOf, uciToSan, type PromotionPiece } from '../lib/chess/game'
import { exportPgn } from '../lib/chess/pgn'
import { levelById, pickMove, type PlayLevel } from '../lib/play/levels'
import { addSavedGame, loadSavedGames, storeSavedGames, type SavedGame } from '../lib/play/savedGames'
import type { EngineContextValue } from './useEngine'
import type { GameApi } from './useGame'

/** Short pause before the computer moves, so its reply does not appear instantly. */
const THINK_DELAY_MS = 450
const SUSPEND_OWNER = 'play'
/** Depth for judging the student's move when the live coach is on. */
const COACH_DEPTH = 12

/** The live coach's warning after one of the student's moves. */
export interface CoachAlert {
  moveIndex: number
  san: string
  cls: MoveClass
  better: string | null
  text: string
}

export interface PlayResult {
  result: SavedGame['result']
  title: string
  detail: string
}

/**
 * A game against the computer on the shared board. The student picks a colour
 * and a level; the computer answers each move. When the game ends it is saved
 * so it can be reviewed straight away or later from the list of past games.
 */
export function usePlay(gameApi: GameApi, engine: EngineContextValue) {
  const { game, gameId, fen, gameOver, setGame, reset } = gameApi
  const [active, setActive] = useState(false)
  const [userColor, setUserColor] = useState<'w' | 'b'>('w')
  const [level, setLevel] = useState<PlayLevel>(() => levelById(2))
  const [thinking, setThinking] = useState(false)
  const [resigned, setResigned] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Sticky once the game ends, so stepping back through the moves afterwards does not reopen it.
  const [finished, setFinished] = useState<PlayResult | null>(null)
  const [savedGames, setSavedGames] = useState<SavedGame[]>(loadSavedGames)
  const [liveCoach, setLiveCoach] = useState(false)
  const [coachAlert, setCoachAlert] = useState<CoachAlert | null>(null)
  // The gameId of the game this mode started, so loading another game (PGN import, reset) ends play mode.
  const [playGameId, setPlayGameId] = useState<number | null>(null)
  const savedFor = useRef<number | null>(null)
  const requestId = useRef(0)
  const { setLiveSuspended, evaluate } = engine

  const playing = active && playGameId === gameId
  const userToMove = turnOf(fen) === userColor

  const endedNow: PlayResult | null = useMemo(() => {
    if (!playing) return null
    if (resigned) {
      return {
        result: userColor === 'w' ? '0-1' : '1-0',
        title: `You resigned. ${userColor === 'w' ? 'Black' : 'White'} wins.`,
        detail: 'Resigning is fine. Reviewing the game shows where it turned.',
      }
    }
    if (gameOver && isAtEnd(game)) return { result: gameOver.result, title: gameOver.title, detail: gameOver.detail }
    return null
  }, [playing, resigned, userColor, gameOver, game])
  const result = playing ? (finished ?? endedNow) : null

  // Live analysis would show the best move on the board, and would also race the computer's searches.
  useEffect(() => {
    setLiveSuspended(playing, SUSPEND_OWNER)
  }, [playing, setLiveSuspended])
  useEffect(() => () => setLiveSuspended(false, SUSPEND_OWNER), [setLiveSuspended])

  const start = useCallback(
    (color: 'w' | 'b', levelId: number, coach = false) => {
      requestId.current++
      setLiveCoach(coach)
      setCoachAlert(null)
      setUserColor(color)
      setLevel(levelById(levelId))
      setResigned(false)
      setFinished(null)
      setError(null)
      setThinking(false)
      savedFor.current = null
      reset()
      setPlayGameId(gameId + 1) // reset() bumps gameId by one
      setActive(true)
    },
    [reset, gameId],
  )

  const exit = useCallback(() => {
    requestId.current++
    setActive(false)
    setThinking(false)
    setPlayGameId(null)
  }, [])

  // The computer moves whenever it is its turn at the end of the game.
  useEffect(() => {
    if (!playing || result || userToMove || !isAtEnd(game) || engine.status !== 'ready') return
    const id = ++requestId.current
    const fenAtRequest = fen
    setThinking(true)
    const t = window.setTimeout(async () => {
      try {
        const last = game.ply > 0 ? game.moves[game.ply - 1] : null
        if (liveCoach && last && last.color === userColor) {
          // Judge the student's move before replying, so a warning can come with a take-back.
          const beforeFen = fenAt(game, game.ply - 1)
          const before = await evaluate(beforeFen, COACH_DEPTH, 1)
          const after = await evaluate(fenAtRequest, COACH_DEPTH, 1)
          if (requestId.current !== id) return
          const b = before.lines[0]?.score
          const a = after.lines[0]?.score
          if (b && a) {
            const uci = last.from + last.to + (last.promotion ?? '')
            const c = classifyMove({ before: b, after: a, mover: userColor, playedBestMove: before.bestMove === uci })
            if (isProblem(c.cls)) {
              const better = before.bestMove && before.bestMove !== uci ? uciToSan(beforeFen, before.bestMove) : null
              const why =
                c.reason === 'allowed-mate'
                  ? 'It lets the computer force checkmate.'
                  : c.reason === 'missed-mate'
                    ? 'You had a forced checkmate.'
                    : `It gives away about ${(c.lossCp / 100).toFixed(1)} pawns.`
              setCoachAlert({
                moveIndex: game.ply - 1,
                san: last.san,
                cls: c.cls,
                better,
                text: `${CLASS_LABEL[c.cls]}: ${last.san}. ${why}${better ? ` Better was ${better}.` : ''}`,
              })
            }
          }
        }
        const r = await evaluate(fenAtRequest, level.depth, level.candidates)
        if (requestId.current !== id) return
        const legal = new Chess(fenAtRequest).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''))
        const uci = pickMove(r.lines, turnOf(fenAtRequest), level, legal)
        if (!uci) return
        setGame((g) => (g.ply === game.ply && isAtEnd(g) ? (playUci(g, uci) ?? g) : g))
      } catch (e) {
        if (requestId.current === id) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (requestId.current === id) setThinking(false)
      }
    }, THINK_DELAY_MS)
    return () => {
      clearTimeout(t)
      setThinking(false)
    }
  }, [playing, result, userToMove, game, fen, level, evaluate, setGame, engine.status, liveCoach, userColor])

  // Save each finished game once.
  useEffect(() => {
    if (!endedNow || finished || savedFor.current === gameId) return
    savedFor.current = gameId
    const result = endedNow
    setFinished(result)
    const levelName = `Stockfish (${level.name})`
    const pgn = exportPgn(game, {
      headers: {
        Event: 'Mirror Gambit: play vs computer',
        White: userColor === 'w' ? 'Me' : levelName,
        Black: userColor === 'b' ? 'Me' : levelName,
        Result: result.result,
        ...(resigned ? { Termination: 'Resignation' } : {}),
      },
    })
    const saved: SavedGame = {
      id: `${Date.now()}-${gameId}`,
      date: new Date().toISOString(),
      levelId: level.id,
      userColor,
      result: result.result,
      reason: result.title,
      moveCount: game.moves.length,
      pgn,
    }
    setSavedGames((list) => {
      const next = addSavedGame(list, saved)
      storeSavedGames(next)
      return next
    })
  }, [endedNow, finished, gameId, game, level, userColor, resigned])

  const onBoardMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      if (!playing || result || !userToMove || thinking) return false
      const ok = gameApi.move(from, to, promotion)
      if (ok) setCoachAlert(null)
      return ok
    },
    [playing, result, userToMove, thinking, gameApi],
  )

  /** Takes back the last move pair so it is the student's turn again. */
  const takeBack = useCallback(() => {
    if (!playing || result) return
    requestId.current++
    setThinking(false)
    setCoachAlert(null)
    const back = userToMove ? 2 : 1
    const minPly = userColor === 'b' ? 1 : 0
    const target = Math.max(minPly, game.ply - back)
    if (target === game.ply) return
    // Drop the moves after the target so the computer does not replay them as "redo".
    const jumped = jumpTo(game, target)
    setGame({ ...jumped, moves: jumped.moves.slice(0, target) })
  }, [playing, result, userToMove, userColor, game, setGame])

  const resign = useCallback(() => {
    if (!playing || result) return
    requestId.current++
    setThinking(false)
    setResigned(true)
  }, [playing, result])

  const deleteSaved = useCallback((id: string) => {
    setSavedGames((list) => {
      const next = list.filter((g) => g.id !== id)
      storeSavedGames(next)
      return next
    })
  }, [])

  const canTakeBack = playing && !result && game.ply > (userColor === 'b' ? 1 : 0)

  return {
    active: playing,
    userColor,
    level,
    thinking,
    userToMove,
    result,
    error,
    savedGames,
    canTakeBack,
    liveCoach,
    coachAlert,
    dismissCoach: () => setCoachAlert(null),
    orientation: (userColor === 'w' ? 'white' : 'black') as 'white' | 'black',
    start,
    exit,
    takeBack,
    resign,
    deleteSaved,
    onBoardMove,
  }
}

export type PlayApi = ReturnType<typeof usePlay>
