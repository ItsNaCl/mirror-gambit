import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { newGame, playSan, playUci, type GameState, type PromotionPiece } from '../lib/chess/game'
import type { LibraryGame } from '../lib/games/sources'
import { srsGrade, themeForMove } from '../lib/practice/practice'
import {
  addLine,
  findGaps,
  newRepertoire,
  opponentPositions,
  opponentReplies,
  pickDrillLine,
  posKey,
  removeMove,
  repStats,
  reviewMove,
  type DrillStep,
  type Gap,
  type Repertoire,
  type Side,
} from '../lib/repertoire/repertoire'
import * as kv from '../lib/store/kv'
import { ANSWER_ARROW } from '../lib/ui/boardColors'
import { useAttempt, useHintDecorations } from './useAttempt'
import type { EngineContextValue } from './useEngine'
import type { GameApi } from './useGame'

const REPS_KEY = 'mirror-gambit.repertoires.v1'
const ACTIVE_KEY = 'mirror-gambit.repertoire-active.v1'
const SUSPEND_OWNER = 'repertoire'
/** How long the app waits before playing the opponent's reply in a drill. */
const REPLY_DELAY_MS = 550

export type RepMode = 'build' | 'drill' | 'gaps'

export type DrillFeedback =
  | { kind: 'your-move'; text: string }
  | { kind: 'correct'; text: string }
  | { kind: 'wrong'; text: string }
  | { kind: 'reveal'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'nothing-due'; text: string }

function loadReps(): Repertoire[] {
  try {
    const raw = kv.getItem(REPS_KEY)
    const list = raw ? (JSON.parse(raw) as Repertoire[]) : []
    return Array.isArray(list) ? list.filter((r) => r && Array.isArray(r.moves)) : []
  } catch {
    return []
  }
}

function stateFromSans(sans: string[]): GameState {
  let s = newGame()
  for (const san of sans) {
    const next = playSan(s, san)
    if (!next) break
    s = next
  }
  return s
}

export function useRepertoire(gameApi: GameApi, engine: EngineContextValue, libraryGames: LibraryGame[]) {
  const { game, fen, setGame } = gameApi
  const [reps, setReps] = useState<Repertoire[]>(loadReps)
  const [activeId, setActiveId] = useState<string | null>(() => kv.getItem(ACTIVE_KEY))
  const [mode, setModeState] = useState<RepMode>('build')
  const [notice, setNotice] = useState<string | null>(null)
  const attempt = useAttempt()
  const [line, setLine] = useState<DrillStep[]>([])
  const [step, setStep] = useState(0)
  const [feedback, setFeedback] = useState<DrillFeedback | null>(null)
  const [reveal, setReveal] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const [score, setScore] = useState({ answered: 0, firstTry: 0 })
  const [engineReplies, setEngineReplies] = useState<Map<string, string[]> | null>(null)
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null)
  const scanId = useRef(0)

  const rep = reps.find((r) => r.id === activeId) ?? reps[0] ?? null

  const save = useCallback((next: Repertoire[]) => {
    setReps(next)
    kv.setItem(REPS_KEY, JSON.stringify(next))
  }, [])

  const update = useCallback(
    (r: Repertoire) => {
      setReps((prev) => {
        const next = prev.map((x) => (x.id === r.id ? r : x))
        kv.setItem(REPS_KEY, JSON.stringify(next))
        return next
      })
    },
    [],
  )

  const select = useCallback((id: string) => {
    setActiveId(id)
    kv.setItem(ACTIVE_KEY, id)
  }, [])

  const create = useCallback(
    (name: string, color: Side) => {
      const r = newRepertoire(name.trim() || (color === 'w' ? 'My White repertoire' : 'My Black repertoire'), color)
      save([...reps, r])
      select(r.id)
      setGame(newGame())
      setModeState('build')
      return r
    },
    [reps, save, select, setGame],
  )

  const remove = useCallback(
    (id: string) => {
      const next = reps.filter((r) => r.id !== id)
      save(next)
      if (activeId === id) setActiveId(next[0]?.id ?? null)
    },
    [reps, save, activeId],
  )

  const replyCounts = useMemo(() => (rep ? opponentReplies(libraryGames, rep.color) : new Map()), [libraryGames, rep])
  const stats = useMemo(() => (rep ? repStats(rep) : null), [rep])

  // ---------- build ----------

  /**
   * Adds one or more lines of SAN moves (from the start) in one go and reports what changed.
   * With skipNames, a line that would change one of your moves is left out instead (used for the
   * built-in openings, whose sidelines are sometimes another choice for your side).
   */
  const addLines = useCallback(
    (lines: string[][], label?: string, skipNames?: string[]) => {
      if (!rep) return
      let next = rep
      let added = 0
      const replaced: { old: string; now: string }[] = []
      const skipped: string[] = []
      lines.forEach((sans, i) => {
        const r = addLine(next, sans, undefined, undefined, skipNames ? 'skip' : 'replace')
        next = r.rep
        added += r.added
        replaced.push(...r.replaced)
        if (r.skipped && skipNames) skipped.push(skipNames[i])
      })
      update(next)
      if (skipped.length) {
        setNotice(
          `Added ${added} move${added === 1 ? '' : 's'} from ${label}. Left out ${skipped.join(', ')}: ${skipped.length === 1 ? 'it is' : 'they are'} a different choice for your side. Play it on the board if you prefer it.`,
        )
        return
      }
      if (replaced.length) setNotice(`Your move ${replaced[0].old} here was replaced by ${replaced[0].now}. A repertoire keeps one answer per position.`)
      else if (label) setNotice(added ? `Added ${added} move${added === 1 ? '' : 's'} from ${label}.` : `${label} was already in this repertoire.`)
      else setNotice(null)
    },
    [rep, update],
  )
  const addSans = useCallback((sans: string[], label?: string) => addLines([sans], label), [addLines])

  const onBuildMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      if (!rep) return false
      const ok = gameApi.move(from, to, promotion)
      if (!ok) return false
      // The move lands in gameApi.game on the next render; rebuild the line here to add it now.
      const chess = new Chess(fen)
      const mv = chess.move({ from, to, promotion })
      addSans([...game.moves.slice(0, game.ply).map((m) => m.san), mv.san])
      return true
    },
    [rep, gameApi, fen, game, addSans],
  )

  const deleteHere = useCallback(
    (uci: string) => {
      if (!rep) return
      update(removeMove(rep, posKey(fen), uci))
    },
    [rep, fen, update],
  )

  /** Plays a move that is already in the repertoire, to walk the tree. */
  const follow = useCallback(
    (uci: string) => {
      const next = playUci({ ...game, moves: game.moves.slice(0, game.ply) }, uci)
      if (next) setGame(next)
    },
    [game, setGame],
  )

  // ---------- drill ----------

  const startDrill = useCallback(
    (all = false) => {
      if (!rep) return
      const next = pickDrillLine(rep, { all, replyCounts })
      setModeState('drill')
      setGame(newGame())
      setStep(0)
      setReveal(false)
      attempt.reset()
      setScore({ answered: 0, firstTry: 0 })
      setLine(next)
      setFeedback(
        next.length === 0
          ? { kind: 'nothing-due', text: stats && stats.myMoves > 0 ? 'Nothing is due right now. Come back later, or practise anyway.' : 'Add some moves in Build first.' }
          : { kind: 'your-move', text: next[0].mine ? 'Your move. Play your repertoire move.' : 'Watch the reply, then play your move.' },
      )
    },
    [rep, replyCounts, setGame, attempt, stats],
  )

  const current = mode === 'drill' ? line[step] : undefined
  const userToMove = mode === 'drill' && !!current && current.mine && !reveal

  const advance = useCallback(
    (s: DrillStep) => {
      setGame((g) => playUci(g, s.uci) ?? g)
      setStep((i) => i + 1)
      setReveal(false)
      attempt.nextMove()
    },
    [setGame, attempt],
  )

  // The app plays the opponent's replies (and a revealed move) after a short pause.
  useEffect(() => {
    if (mode !== 'drill' || !current) return
    if (current.mine && !reveal) return
    const t = window.setTimeout(() => advance(current), reveal ? 1600 : REPLY_DELAY_MS)
    return () => clearTimeout(t)
  }, [mode, current, reveal, advance])

  // At the end of the line the feedback is the summary.
  const lineDone = mode === 'drill' && line.length > 0 && step >= line.length
  const shownFeedback: DrillFeedback | null = lineDone
    ? { kind: 'done', text: `Line complete: ${score.firstTry} of ${score.answered} moves right first time.` }
    : feedback

  const onDrillMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      if (!rep || !current || !userToMove) return false
      const uci = from + to + (promotion ?? '')
      const expected = current.uci
      if (uci === expected || (uci.length === 4 && expected.startsWith(uci) && expected[4] === 'q')) {
        const grade = srsGrade({ wrongTries: attempt.wrongThisMove, maxHintLevel: attempt.hintLevel, gaveUp: false })
        update(reviewMove(rep, current.pos, current.uci, grade))
        setScore((s) => ({ answered: s.answered + 1, firstTry: s.firstTry + (grade === 5 ? 1 : 0) }))
        setFeedback({ kind: 'correct', text: `${current.san} is right.` })
        advance(current)
        return true
      }
      // Wrong: is it your move in another line of this repertoire? Say so, it is a common mix-up.
      let san = uci
      try {
        san = new Chess(current.fen).move({ from, to, promotion }).san
      } catch {
        return false
      }
      const elsewhere = rep.moves.some((m) => m.mine && m.san === san && m.pos !== current.pos)
      setShakeKey((k) => k + 1)
      attempt.wrong()
      setFeedback({
        kind: 'wrong',
        text: elsewhere ? `${san} is your move in a different line, not in this position. Try again.` : `${san} is not in your repertoire here. Try again.`,
      })
      return false
    },
    [rep, current, userToMove, attempt, update, advance],
  )

  const giveUp = useCallback(() => {
    if (!rep || !current || !userToMove) return
    update(reviewMove(rep, current.pos, current.uci, 0))
    setScore((s) => ({ ...s, answered: s.answered + 1 }))
    setFeedback({ kind: 'reveal', text: `Your move here is ${current.san}. It will come back soon.` })
    setReveal(true)
  }, [rep, current, userToMove, update])

  const expectedUci = userToMove ? current!.uci : null
  const hints = useHintDecorations(attempt.hintLevel, expectedUci, expectedUci ? themeForMove(current!.fen, expectedUci) : '', userToMove)
  const revealArrow: Arrow[] = useMemo(
    () => (reveal && current ? [{ startSquare: current.uci.slice(0, 2), endSquare: current.uci.slice(2, 4), color: ANSWER_ARROW }] : []),
    [reveal, current],
  )

  // ---------- gaps ----------

  const gaps: Gap[] = useMemo(() => (rep ? findGaps(rep, replyCounts, engineReplies ?? undefined) : []), [rep, replyCounts, engineReplies])

  /** Asks Stockfish for the three most likely replies in each position where the opponent moves. */
  const scanWithEngine = useCallback(async () => {
    if (!rep) return
    const id = ++scanId.current
    const positions = opponentPositions(rep).slice(0, 40)
    const found = new Map<string, string[]>()
    engine.setLiveSuspended(true, SUSPEND_OWNER)
    try {
      for (let i = 0; i < positions.length; i++) {
        if (scanId.current !== id) return
        setScanning({ done: i, total: positions.length })
        const r = await engine.evaluate(positions[i].fen, 12, 3)
        found.set(positions[i].pos, r.lines.map((l) => l.pv[0]).filter(Boolean))
      }
      if (scanId.current === id) setEngineReplies(found)
    } finally {
      if (scanId.current === id) {
        setScanning(null)
        engine.setLiveSuspended(false, SUSPEND_OWNER)
      }
    }
  }, [rep, engine])

  const stopScan = useCallback(() => {
    scanId.current++
    setScanning(null)
    engine.setLiveSuspended(false, SUSPEND_OWNER)
  }, [engine])

  /** Opens a gap on the board in Build mode, ready for an answer to be added. */
  const openGap = useCallback(
    (g: Gap) => {
      const state = stateFromSans([...g.line, g.san])
      setGame(state)
      setModeState('build')
      setNotice(`Play your answer to ${g.san}. It will be added to the repertoire.`)
      // Add the opponent's reply now, so the answer attaches to it.
      addSans([...g.line, g.san])
    },
    [setGame, addSans],
  )

  const setMode = useCallback(
    (m: RepMode) => {
      if (m === 'drill') return startDrill(false)
      stopScan()
      setModeState(m)
      setLine([])
      setFeedback(null)
      setReveal(false)
      if (m === 'build') setGame(newGame())
    },
    [startDrill, stopScan, setGame],
  )

  const exit = useCallback(() => {
    setLine([])
    setFeedback(null)
    setModeState('build')
  }, [])

  return {
    reps,
    rep,
    stats,
    mode,
    notice,
    dismissNotice: () => setNotice(null),
    select,
    create,
    remove,
    setMode,
    // build
    addSans,
    addLines,
    deleteHere,
    follow,
    onBuildMove,
    // drill
    line,
    step,
    feedback: shownFeedback,
    userToMove,
    startDrill,
    giveUp,
    attempt,
    hintText: hints.text,
    squareStyles: userToMove ? hints.squareStyles : undefined,
    arrows: reveal ? revealArrow : userToMove ? hints.arrows : [],
    shakeKey,
    onDrillMove,
    // gaps
    gaps,
    replyGames: libraryGames.filter((g) => rep && g.userColor === rep.color).length,
    engineScanned: engineReplies !== null,
    scanning,
    scanWithEngine,
    stopScan,
    openGap,
    exit,
    active: rep !== null,
  }
}

export type RepertoireApi = ReturnType<typeof useRepertoire>
