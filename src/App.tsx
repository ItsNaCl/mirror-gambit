import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import {
  ArrowLeft,
  ArrowUpDown,
  BookOpen,
  ClipboardCopy,
  Crosshair,
  Download,
  Ellipsis,
  Eye,
  Layers2,
  FileUp,
  Plus,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react'
import { ROUTE_ICONS, Sidebar, TopBar } from './app/Shell'
import { NAV, ROUTES, useRoute, type RouteId } from './app/routes'
import { AnalysisPanel } from './components/AnalysisPanel'
import { BadgesPanel } from './components/BadgesPanel'
import { CoachHome } from './components/CoachHome'
import { LevelUp } from './components/LevelUp'
import { useCoach, type BlockDone } from './hooks/useCoach'
import { useProgression } from './hooks/useProgression'
import type { SessionBlock } from './lib/coach/planner'
import type { ThemeFilter } from './lib/puzzles/rated'
import type { BoardPreview } from './components/CoachPanel'
import { moveBadgeStyle } from './components/moveBadge'
import { Board } from './components/Board'
import { BoardOverlay } from './components/BoardOverlay'
import { ClaudeCoach } from './components/ClaudeCoach'
import { CommandPalette, type Command } from './components/CommandPalette'
import { EvalBar } from './components/EvalBar'
import { MenuButton } from './components/MenuButton'
import { Modal } from './components/Modal'
import { MoveList } from './components/MoveList'
import { OpeningsPanel } from './components/OpeningsPanel'
import { PositionNotes } from './components/PositionNotes'
import { CoursesPanel } from './components/CoursesPanel'
import { RepertoirePanel } from './components/RepertoirePanel'
import { PlayPanel } from './components/PlayPanel'
import { ProgressPanel } from './components/ProgressPanel'
import { MyGamesPanel } from './components/MyGamesPanel'
import { PuzzlesPanel } from './components/PuzzlesPanel'
import { ReviewPanel } from './components/ReviewPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { SetupPanel } from './components/SetupPanel'
import { SrsPanel } from './components/SrsPanel'
import { TipsSection } from './components/TipsSection'
import { WhyNotPanel } from './components/WhyNotPanel'
import { GuessPanel } from './components/GuessPanel'
import { NarratedPanel } from './components/NarratedPanel'
import { OtbPanel } from './components/OtbPanel'
import { ToastStack, useToasts } from './components/Toast'
import { UpdateBanner } from './components/UpdatePanel'
import { EngineProvider, useEngine } from './hooks/useEngine'
import { useGame, type GameApi } from './hooks/useGame'
import { usePlay, type PlayApi } from './hooks/usePlay'
import { usePuzzles, type PuzzlesApi } from './hooks/usePuzzles'
import { gameKey, useReview } from './hooks/useReview'
import { useSettings } from './hooks/useSettings'
import { useSfx } from './hooks/useSfx'
import { useSrs, type SrsApi, type SrsOptions } from './hooks/useSrs'
import { useTips, type MoveAlert } from './hooks/useTips'
import { useTrainer, type TrainerApi } from './hooks/useTrainer'
import { useWhyNot } from './hooks/useWhyNot'
import { useGuess } from './hooks/useGuess'
import { useNarrated } from './hooks/useNarrated'
import { useOtb } from './hooks/useOtb'
import { useUpdates } from './hooks/useUpdates'
import { useClaudeCoach } from './hooks/useClaudeCoach'
import { useLibrary } from './hooks/useLibrary'
import { useRepertoire } from './hooks/useRepertoire'
import { useRatedPuzzles, type RatedOptions } from './hooks/useRatedPuzzles'
import { useCourse } from './hooks/useCourse'
import { CLASS_LABEL, CLASS_SYMBOL, isProblem } from './lib/analysis/classify'
import { fenAt, isAtEnd, lastMoveAt, playUci, turnOf, uciToSan } from './lib/chess/game'
import { exportPgn, importPgn } from './lib/chess/pgn'
import { cleanError, fetchChessComJson } from './lib/desktop'
import { gameFromChessComJson, parseChessComUrl } from './lib/import/chesscom'
import { countsAsSlowGame, outcomeFor, type SavedGame } from './lib/play/savedGames'
import { libraryGameState, type LibraryGame } from './lib/games/sources'
import { outcome } from './lib/games/profile'
import { promotionBand } from './lib/coach/curriculum'
import { createPaidStore, paysSlowGame } from './lib/game/paid'
import { whyNotItems } from './lib/modes/whyNot'
import { soundForMove } from './lib/sound/sfx'
import type { XpEvent } from './lib/game/xp'
import { motifGuide, PUZZLE_SETS } from './lib/puzzles/puzzles'
import { reviewComment } from './lib/review/review'
import { explainMove } from './lib/coach/explain'
import { buildCoachContext, type CoachMode } from './lib/coach/claudeContext'
import { ANSWER_ARROW } from './lib/ui/boardColors'
import { openings } from './openings'
import { courseSession, freeSession, playSession, puzzleSession, repertoireSession, sessionFor, srsSession, trainerSession, whyNotSession, guessSession, narratedSession, otbSession, type BoardSession, type SessionId } from './sessions/sessions'

/** On a first import, slow games from the last week count. */
const RECENT_IMPORT_MS = 7 * 86_400_000
/** Slow games paid per import and games paid per batch review, so a backlog is not a rank jump. */
const MAX_IMPORT_PAY = 3
const MAX_BATCH_PAY = 5

export default function App() {
  const [route, navigate] = useRoute()
  // Each mode has its own game, so a puzzle, a drill or a game against the computer never
  // overwrites the game on the board.
  const free = useGame()
  const playGame = useGame()
  const repGame = useGame()
  const courseGame = useGame()
  const trainerGame = useGame()
  const puzzleGame = useGame()
  const srsGame = useGame()
  const whyNotGame = useGame()
  const guessGame = useGame()
  const narratedGame = useGame()
  const otbGame = useGame()
  const games: Record<SessionId, GameApi> = { free, play: playGame, rep: repGame, course: courseGame, trainer: trainerGame, puzzle: puzzleGame, srs: srsGame, whynot: whyNotGame, guess: guessGame, narrated: narratedGame, otb: otbGame }
  // Play and puzzles need the engine, so they live inside the provider; the workspace reports
  // which board is on screen and the engine follows it.
  const [engineFen, setEngineFen] = useState(free.fen)

  return (
    <EngineProvider fen={engineFen}>
      <Workspace route={route} navigate={navigate} games={games} onBoardFen={setEngineFen} />
    </EngineProvider>
  )
}

interface WorkspaceProps {
  route: RouteId
  navigate: (id: RouteId) => void
  games: Record<SessionId, GameApi>
  onBoardFen: (fen: string) => void
}

function Workspace({ route, navigate, games, onBoardFen }: WorkspaceProps) {
  const { settings, update } = useSettings()
  const engine = useEngine()
  const trainer = useTrainer(games.trainer)
  const puzzles = usePuzzles(games.puzzle, engine)
  const progression = useProgression()
  const { award } = progression
  // XP events from the hooks below reach the progression through this ref, because the streak
  // they are credited with comes from the coach, which is built after them.
  const earnRef = useRef<(e: XpEvent) => void>(() => {})
  const srsOptions = useMemo<SrsOptions>(() => ({ onGrade: (grade, _card, pays) => {
        if (pays) earnRef.current({ type: 'card', grade })
      },
    }), [])
  const srs = useSrs(games.srs, srsOptions)
  const play = usePlay(games.play, engine)
  const ratedOptions = useMemo<RatedOptions>(() => ({ onResult: (r) => earnRef.current({ type: 'solve', outcome: r.outcome, rating: r.rating }) }), [])
  const rated = useRatedPuzzles(puzzles, ratedOptions)
  const course = useCourse(games.course)
  const updates = useUpdates()
  const claude = useClaudeCoach(settings.claudeMonthlyCap)
  const library = useLibrary(engine)
  const repertoire = useRepertoire(games.rep, engine, library.games)
  const whyNot = useWhyNot(games.whynot, engine)
  const whyNotList = useMemo(() => whyNotItems(library.analysed), [library.analysed])
  const guess = useGuess(games.guess, engine)
  const narrated = useNarrated(games.narrated, engine, settings.coachVoice)
  const otb = useOtb(games.otb)
  // The narrated game waits while another screen is open, so its searches never replace that screen's.
  const pauseNarrated = narrated.setPaused
  useEffect(() => {
    pauseNarrated(route !== 'narrated')
  }, [route, pauseNarrated])
  // A search another screen replaces never settles, so a screen left while its engine question is
  // open drops it, and its hold on live analysis goes with it.
  const { exit: exitWhyNot, stage: whyNotStage } = whyNot
  const { exit: exitGuess, stage: guessStage } = guess
  useEffect(() => {
    if (route !== 'whynot' && whyNotStage === 'thinking') exitWhyNot()
    if (route !== 'guess' && guessStage === 'thinking') exitGuess()
  }, [route, whyNotStage, guessStage, exitWhyNot, exitGuess])
  const onBlockDone = useCallback(
    (d: BlockDone) => {
      award({ type: 'block', minutes: d.minutes }, d.streak)
      if (d.firstToday) award({ type: 'streak', days: d.streak }, d.streak)
    },
    [award],
  )
  const coach = useCoach({
    analysed: library.analysed,
    dueCards: srs.dueCount,
    pendingGames: library.pending,
    whyNotPositions: whyNotList.length,
    modelGames: (guess.set?.games.length ?? 0) > 0,
    woodpeckerLeft: srs.woodpecker?.left ?? 0,
    puzzleRating: rated.games > 0 ? rated.rating : null,
    weeklyHours: settings.weeklyHours,
    ratingOverride: settings.ratingOverride,
    onBlockDone,
  })
  const earn = useCallback((e: XpEvent) => award(e, coach.streak), [award, coach.streak])
  useEffect(() => {
    earnRef.current = earn
  }, [earn])

  // A finished game against the computer counts as a slow game once it was long enough, once per game.
  const playAwarded = useRef<number | null>(null)
  const playGame = games.play
  useEffect(() => {
    if (!play.active || !play.result || playAwarded.current === playGame.gameId) return
    if (!countsAsSlowGame(playGame.game.moves.length, play.resigned, (Date.now() - play.startedAt) / 60_000)) return
    playAwarded.current = playGame.gameId
    earn({ type: 'slowGame', result: outcomeFor(play.result.result, play.userColor) })
  }, [play.active, play.result, play.resigned, play.startedAt, play.userColor, playGame.game.moves.length, playGame.gameId, earn])

  // Imported slow games count when they are new to the library and were played after every game
  // seen so far, so importing a history does not pay for old games, and clearing the library and
  // importing again does not pay twice. Games there at start-up only seed what is known.
  const knownGames = useRef<{ ids: Set<string>; newest: number } | null>(null)
  useEffect(() => {
    const stamp = (g: LibraryGame) => Date.parse(g.date) || 0
    const known = knownGames.current
    if (!known) {
      knownGames.current = { ids: new Set(library.games.map((g) => g.id)), newest: library.games.reduce((t, g) => Math.max(t, stamp(g)), 0) }
      return
    }
    const since = known.newest || Date.now() - RECENT_IMPORT_MS
    const fresh = library.games.filter((g) => !known.ids.has(g.id)).sort((a, b) => stamp(b) - stamp(a))
    let paid = 0
    for (const g of fresh) {
      known.ids.add(g.id)
      known.newest = Math.max(known.newest, stamp(g))
      if (paysSlowGame(g) && stamp(g) > since && paid < MAX_IMPORT_PAY) {
        paid++
        earn({ type: 'slowGame', result: outcome(g) })
      }
    }
  }, [library.games, earn])

  // Moving up a band pays once the band is known from a rating in the imported games. The
  // Settings override steers the plan but never counts here, or typing a number would pay.
  const importedBandId = promotionBand(coach.metrics?.rating ?? null)?.id ?? null
  const trackBand = progression.trackBand
  useEffect(() => {
    if (importedBandId) trackBand(importedBandId)
  }, [importedBandId, trackBand])
  // The engine runs one search at a time, so the batch review only runs while My games is open.
  const stopBatch = library.cancel
  const batchRunning = !!library.progress
  useEffect(() => {
    if (route !== 'games' && batchRunning) stopBatch()
  }, [route, batchRunning, stopBatch])
  // Review XP is paid once per game id in My games, and the paid ids are saved, so a reload or a
  // second review of the same game cannot pay again. The first time this version runs, the games
  // already analysed are marked paid without paying, and a batch run pays at most MAX_BATCH_PAY.
  const [paid] = useState(createPaidStore)
  const batchPaid = useRef<{ known: Set<string>; paid: number } | null>(null)
  useEffect(() => {
    const ids = library.analysed.map((a) => a.game.id)
    const s = batchPaid.current
    if (!s) {
      batchPaid.current = { known: new Set(ids), paid: 0 }
      if (!paid.existed) paid.seed(ids)
      return
    }
    if (!batchRunning) s.paid = 0
    for (const id of ids) {
      if (s.known.has(id)) continue
      s.known.add(id)
      if (s.paid < MAX_BATCH_PAY && paid.claim(id)) {
        s.paid++
        earn({ type: 'review' })
      }
    }
  }, [library.analysed, batchRunning, earn, paid])
  const sessionId = sessionFor(route, puzzles)
  const free = games.free
  const { game, fen, gameOver } = free
  const { toasts, notify, dismiss } = useToasts()
  // A coach line or best move shown on the board in place of the game (Game review only).
  const [boardPreview, setBoardPreview] = useState<BoardPreview | null>(null)
  const preview = route === 'review' ? boardPreview : null

  const [manualOrientation, setManualOrientation] = useState<'white' | 'black'>('white')
  const [setupMode, setSetupMode] = useState(false)
  const [pgnModal, setPgnModal] = useState<'import' | 'export' | null>(null)
  const [pgnText, setPgnText] = useState('')
  const [pgnError, setPgnError] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const review = useReview(free, engine)
  // A game from My games reviewed on the board is a reviewed game, once per game id. A game that is
  // only on the board (typed in, from a puzzle, a position pasted) is not in My games and pays nothing.
  const reviewsPaid = useRef(0)
  const newReviews = review.newReviews
  const reviewedKey = review.state.reviewedKey
  useEffect(() => {
    if (newReviews <= reviewsPaid.current) return
    reviewsPaid.current = newReviews
    const g = library.games.find((x) => gameKey(libraryGameState(x)) === reviewedKey)
    if (g && paid.claim(g.id)) earn({ type: 'review' })
  }, [newReviews, reviewedKey, library.games, paid, earn])

  const [includeClassifications, setIncludeClassifications] = useState(true)
  const reviewResult = review.matchesCurrentGame ? review.state.result : null

  const go = useCallback(
    (id: RouteId) => {
      setMenuOpen(false)
      if (id !== 'board') setSetupMode(false)
      navigate(id)
    },
    [navigate],
  )

  /** Opens the screen a coach block points at and starts the activity where one can be started. */
  const openBlock = useCallback(
    (block: SessionBlock) => {
      switch (block.activity) {
        case 'tactics':
          go('puzzles')
          void rated.next((block.theme as ThemeFilter | undefined) ?? 'any')
          return
        case 'cards':
          go('cards')
          srs.startReview()
          return
        case 'review':
          go('games')
          return
        case 'play':
          go('play')
          return
        case 'endgames':
        case 'strategy': {
          go('courses')
          const c = course.courses.find((x) => x.id === block.course)
          const first = c?.lessons.find((l) => !course.done[`${c.id}/${l.id}`]) ?? c?.lessons[0]
          if (c && first) course.open(c.id, first.id)
          return
        }
        case 'openings':
          go('repertoire')
          return
        case 'whynot':
          go('whynot')
          // The panel's Start takes over when the engine is still loading or a run is already on.
          if (engine.status === 'ready' && !whyNot.active) whyNot.start(whyNotList)
          return
        case 'guess':
          go('guess')
          if (engine.status === 'ready' && !guess.active) void guess.start('any')
          return
        case 'narrated':
          // The student picks the colour and the level on the screen.
          go('narrated')
          return
      }
    },
    [go, rated, srs, course, whyNot, whyNotList, guess, engine.status],
  )

  // Leaving an opening also stops its trap puzzles.
  const exitTrainer = useCallback(() => {
    if (puzzles.choice === 'custom') puzzles.exit()
    trainer.exit()
  }, [puzzles, trainer])
  const trainerForPanel = useMemo(() => ({ ...trainer, exit: exitTrainer }), [trainer, exitTrainer])

  const exportText = useMemo(() => {
    if (pgnModal !== 'export') return ''
    const comments: Record<number, string> = {}
    if (includeClassifications && reviewResult) {
      for (const m of reviewResult.moves) {
        const c = reviewComment(m)
        if (c) comments[m.index] = c
      }
    }
    return exportPgn(game, { comments })
  }, [pgnModal, includeClassifications, reviewResult, game])

  // Dev-only hook so browser automation can read the positions.
  useEffect(() => {
    if (import.meta.env.DEV)
      (window as unknown as { __mirrorGambit?: unknown }).__mirrorGambit = { fen, ply: game.ply, route, session: sessionId, boardFen: games[sessionId ?? 'free'].fen }
  }, [fen, game.ply, route, sessionId, games])

  const turn = turnOf(fen)
  const freeOrientation: 'white' | 'black' = settings.autoFlip ? (turn === 'w' ? 'white' : 'black') : manualOrientation

  const onMoveAlert = useCallback(
    (alert: MoveAlert) => {
      const kind = alert.classification.cls === 'blunder' ? 'bad' : 'warn'
      const action =
        alert.classification.cls === 'blunder' ? { label: 'Take it back', onClick: () => free.jump(alert.moveIndex) } : undefined
      notify({ kind, title: `${CLASS_LABEL[alert.classification.cls]}: ${alert.san}`, body: alert.text, action }, 12000)
    },
    [notify, free],
  )
  const tips = useTips(free, { enabled: sessionId === 'free' && !setupMode, notify: onMoveAlert })

  // The coach's reasons for the last alerted move: the engine's best move before it and its
  // best reply after it, read from the evaluation cache the alert itself was built from.
  const alert = tips.alert
  const lastExplanation = useMemo(() => {
    if (!alert) return null
    const move = game.moves[alert.moveIndex]
    if (!move) return null
    const beforeFen = fenAt(game, alert.moveIndex)
    return explainMove({
      beforeFen,
      uci: move.from + move.to + (move.promotion ?? ''),
      classification: alert.classification,
      bestUci: engine.getCached(beforeFen)?.bestMove ?? null,
      replyUci: engine.getCached(move.after)?.bestMove ?? null,
    })
    // evalVersion: the cache fills in after the alert, so recompute when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert, game, engine.evalVersion])

  // What the board shows from the engine, only when analysis is switched on.
  const bestLine = settings.showAnalysis ? engine.analysis?.lines[0] : undefined
  const evalScore = settings.showAnalysis ? (engine.analysis?.lines[0]?.score ?? engine.getCached(fen)?.score ?? null) : null
  const analysisArrows: Arrow[] = useMemo(() => {
    const best = bestLine?.pv[0]
    if (!best || gameOver) return []
    return [{ startSquare: best.slice(0, 2), endSquare: best.slice(2, 4), color: ANSWER_ARROW }]
  }, [bestLine, gameOver])

  /** The free board as text for Claude: the position on screen and the move that led to it. */
  const coachContext = useCallback(
    (mode: CoachMode) => {
      const sanMoves = game.moves.slice(0, game.ply).map((m) => m.san)
      const live = engine.analysis?.fen === fen ? engine.analysis : null
      const cached = engine.getCached(fen)
      const lines = live?.lines.length ? live.lines : (cached?.lines ?? [])
      const depth = live?.depth ?? cached?.depth
      let lastMove = null
      if (route === 'review' && reviewResult && game.ply > 0) {
        const m = reviewResult.moves[game.ply - 1]
        if (m)
          lastMove = {
            san: m.san,
            mover: m.mover,
            classification: m.classification,
            betterMove: m.betterMove,
            bestReply: m.replyLine[0] ? uciToSan(fen, m.replyLine[0]) : null,
          }
      } else if (alert && alert.moveIndex === game.ply - 1) {
        const move = game.moves[alert.moveIndex]
        const reply = engine.getCached(move.after)?.bestMove
        lastMove = { san: alert.san, mover: alert.mover, classification: alert.classification, betterMove: alert.betterMove, bestReply: reply ? uciToSan(move.after, reply) : null }
      }
      const opening = tips.opening ? `${tips.opening.eco} ${tips.opening.name}` : null
      let text = buildCoachContext({ fen, sanMoves, startFen: game.startFen, opening, lines, depth, lastMove }, mode)
      if (mode === 'game' && reviewResult) {
        const moments = reviewResult.moves
          .filter((m) => isProblem(m.classification.cls))
          .slice(0, 12)
          .map((m) => `- ${m.san} by ${m.mover === 'w' ? 'White' : 'Black'} (move ${Math.floor(m.index / 2) + 1}): ${CLASS_LABEL[m.classification.cls]}${m.betterMove ? `, better was ${m.betterMove}` : ''}`)
        text += `\n\nThe whole game: ${sanMoves.length === game.moves.length ? '' : '(the board shows an earlier move) '}${game.moves.map((m) => m.san).join(' ')}\nMistakes found by the review:\n${moments.join('\n') || '- none'}`
      }
      return text
    },
    [game, fen, engine, route, reviewResult, alert, tips.opening],
  )

  const layers = useMemo(
    () => ({ control: settings.overlayControl, lines: settings.overlayLines, loose: settings.overlayLoose }),
    [settings.overlayControl, settings.overlayLines, settings.overlayLoose],
  )

  const session: BoardSession | null = useMemo(() => {
    switch (sessionId) {
      case 'free':
        return freeSession(free, { orientation: freeOrientation, arrows: route === 'board' ? analysisArrows : [] })
      case 'play':
        return playSession(play, games.play)
      case 'rep':
        return repertoireSession(repertoire, games.rep)
      case 'course':
        return courseSession(course, games.course)
      case 'trainer':
        return trainerSession(trainer, games.trainer)
      case 'puzzle':
        return puzzleSession(puzzles, games.puzzle)
      case 'srs':
        return srsSession(srs, games.srs)
      case 'whynot':
        return whyNotSession(whyNot, games.whynot)
      case 'guess':
        return guessSession(guess, games.guess)
      case 'narrated':
        return narratedSession(narrated, games.narrated)
      case 'otb':
        return otbSession(otb, games.otb)
      default:
        return null
    }
  }, [sessionId, free, freeOrientation, route, analysisArrows, play, repertoire, course, trainer, puzzles, srs, whyNot, guess, narrated, otb, games])

  const boardFen = session?.game.fen ?? fen
  useEffect(() => onBoardFen(boardFen), [boardFen, onBoardFen])

  // Sounds. A move on the board is heard when the session's game goes one ply forward: a move
  // played, a reply from the computer or a step through the move list. A new or loaded game, or
  // a jump back, is silent.
  const sfx = useSfx()
  const sessionGame = session?.game.game
  const sessionGameId = session?.game.gameId
  const heard = useRef<{ key: string; ply: number } | null>(null)
  useEffect(() => {
    if (!sessionGame || sessionGameId === undefined) {
      heard.current = null
      return
    }
    const key = `${sessionId}:${sessionGameId}`
    const prev = heard.current
    heard.current = { key, ply: sessionGame.ply }
    if (!prev || prev.key !== key || sessionGame.ply !== prev.ply + 1) return
    const move = sessionGame.moves[sessionGame.ply - 1]
    if (move) sfx(soundForMove(move))
  }, [sessionGame, sessionGameId, sessionId, sfx])

  // Rewards: a clean solve or a card answered well, the streak bonus, and the new rank. The award
  // that raised the rank plays only the rank's sound; the gains after it play their own.
  const gain = progression.lastGain
  const levelUp = progression.levelUp
  const levelUpSeq = useRef(0)
  useEffect(() => {
    if (!levelUp) return
    levelUpSeq.current = gain?.seq ?? 0
    sfx('levelUp')
    // gain: the award that raised the rank arrives in the same render as the rank; later gains are not it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelUp, sfx])
  useEffect(() => {
    if (!gain || gain.seq === levelUpSeq.current) return
    const e = gain.event
    if (e.type === 'streak') sfx('streak')
    else if ((e.type === 'solve' && e.outcome === 'clean') || (e.type === 'card' && e.grade >= 5)) sfx('solve')
  }, [gain, sfx])

  // In review, the reviewed move's grade sits as a badge on its square.
  const reviewedMove = route === 'review' && reviewResult && game.ply > 0 ? reviewResult.moves[game.ply - 1] : null
  const freeLastMove = lastMoveAt(game)
  const reviewBadge = useMemo(
    () => (reviewedMove && freeLastMove && !preview ? { [freeLastMove.to]: moveBadgeStyle(reviewedMove.classification.cls) } : undefined),
    [reviewedMove, freeLastMove, preview],
  )

  const copyText = useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text)
        notify({ kind: 'good', title: `${what} copied to clipboard` }, 2500)
      } catch {
        notify({ kind: 'warn', title: `Could not copy ${what}`, body: 'Clipboard access was blocked.' })
      }
    },
    [notify],
  )

  const playLine = useCallback(
    (uciMoves: string[]) => {
      let state = game
      for (const uci of uciMoves) {
        const next = playUci(state, uci)
        if (!next) break
        state = next
      }
      if (state !== game) free.setGame(state)
    },
    [game, free],
  )

  const savePositionCard = useCallback(() => {
    const cached = engine.getCached(fen)
    if (!cached?.bestMove) return
    const card = srs.addCard({
      fen,
      playerMove: null,
      bestMove: uciToSan(fen, cached.bestMove),
      cpLoss: 0,
      classification: 'manual',
      explanation: 'A position you chose to practise.',
      source: 'manual',
    })
    notify({ kind: card ? 'good' : 'info', title: card ? 'Saved to your mistake cards' : 'This position is already in your cards' }, 3000)
  }, [engine, fen, srs, notify])

  const saveAlertCard = useCallback(
    (moveIndex: number) => {
      const alert = tips.alert
      if (!alert || alert.moveIndex !== moveIndex || !alert.betterMove) return
      const card = srs.addCard({
        fen: fenAt(game, moveIndex),
        playerMove: alert.san,
        bestMove: alert.betterMove,
        cpLoss: alert.classification.lossCp,
        classification: alert.classification.cls,
        explanation: alert.text,
        source: 'alert',
      })
      notify({ kind: card ? 'good' : 'info', title: card ? 'Saved to your mistake cards' : 'Already in your cards' }, 3000)
    },
    [tips.alert, srs, game, notify],
  )

  const openExport = useCallback(() => setPgnModal('export'), [])
  const openImport = useCallback(() => {
    setPgnText('')
    setPgnError(null)
    setPgnModal('import')
  }, [])
  const flip = useCallback(() => setManualOrientation((o) => (o === 'white' ? 'black' : 'white')), [])
  const startReview = useCallback(() => {
    go('review')
    if (!reviewResult && review.state.status !== 'running') review.start()
  }, [go, reviewResult, review])

  /** Reviews a game from another mode: it is copied onto the board, so the review and the move list match. */
  const reviewState = useCallback(
    (state: GameApi['game'], orientation?: 'white' | 'black', ply?: number) => {
      free.load(ply === undefined ? state : { ...state, ply })
      if (orientation) setManualOrientation(orientation)
      go('review')
      void review.start(state)
    },
    [free, go, review],
  )

  const openLibraryGame = useCallback(
    (g: LibraryGame, ply?: number) => reviewState(libraryGameState(g), g.userColor === 'w' ? 'white' : 'black', ply),
    [reviewState],
  )

  const reviewPlayedGame = useCallback(() => reviewState(games.play.game, play.orientation), [reviewState, games.play.game, play.orientation])

  const reviewSavedGame = useCallback(
    (saved: SavedGame) => {
      try {
        reviewState(importPgn(saved.pgn), saved.userColor === 'w' ? 'white' : 'black')
      } catch (e) {
        notify({ kind: 'warn', title: 'Could not load that game', body: e instanceof Error ? e.message : String(e) })
      }
    },
    [reviewState, notify],
  )

  /** Loads a chess.com game from its URL and reviews it. Throws a readable Error. */
  const loadChessCom = useCallback(
    async (url: string) => {
      const ref = parseChessComUrl(url)
      if (!ref) throw new Error('That does not look like a chess.com game link.')
      const loaded = gameFromChessComJson(await fetchChessComJson(ref.kind, ref.id))
      reviewState(loaded.state)
      notify({ kind: 'good', title: `Loaded ${loaded.white} vs ${loaded.black} (${loaded.result})`, body: loaded.termination || undefined }, 4000)
    },
    [reviewState, notify],
  )

  function doImport() {
    if (parseChessComUrl(pgnText)) {
      loadChessCom(pgnText)
        .then(() => setPgnModal(null))
        .catch((e) => setPgnError(cleanError(e)))
      return
    }
    try {
      const state = importPgn(pgnText)
      free.load(state)
      setPgnModal(null)
      go('board')
      notify({ kind: 'good', title: `Loaded ${state.moves.length} moves from PGN` }, 3000)
    } catch (e) {
      setPgnError(e instanceof Error ? e.message : String(e))
    }
  }

  function downloadPgn() {
    const blob = new Blob([exportText], { type: 'application/x-chess-pgn' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mirror-gambit-${new Date().toISOString().slice(0, 10)}.pgn`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Keyboard: Ctrl+K opens the palette; Left and Right step through the game on the board.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (paletteOpen || pgnModal || setupMode || !session) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (target?.closest('[role="menu"], .nav')) return
      e.preventDefault()
      if (session.canBrowse) session.step(e.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, pgnModal, setupMode, session])

  const engineState = {
    state: engine.status === 'loading' ? ('loading' as const) : engine.status === 'error' ? ('error' as const) : ('ready' as const),
    text: engine.status === 'loading' ? 'Engine loading' : engine.status === 'error' ? 'Engine unavailable' : 'Stockfish 19 ready',
  }

  const commands: Command[] = useMemo(() => {
    const list: Command[] = []
    for (const group of NAV)
      for (const id of group.routes)
        list.push({
          id: `go-${id}`,
          group: 'Go to',
          label: ROUTES[id].label,
          description: ROUTES[id].description,
          keywords: ROUTES[id].keywords,
          icon: ROUTE_ICONS[id],
          run: () => go(id),
        })
    list.push(
      { id: 'play-new', group: 'Play', label: 'New game against the computer', keywords: 'bot ai', icon: ROUTE_ICONS.play, run: () => go('play') },
      { id: 'new-game', group: 'Board', label: 'New game', icon: Plus, run: () => { free.reset(); go('board') } },
      { id: 'undo', group: 'Board', label: 'Undo move', icon: Undo2, enabled: game.ply > 0, run: free.undoMove },
      { id: 'redo', group: 'Board', label: 'Redo move', icon: Redo2, enabled: !isAtEnd(game), run: free.redoMove },
      { id: 'flip', group: 'Board', label: 'Flip board', icon: ArrowUpDown, enabled: !settings.autoFlip, run: flip },
      {
        id: 'analysis',
        group: 'Board',
        label: settings.showAnalysis ? 'Hide engine analysis' : 'Show engine analysis',
        keywords: 'eval bar best move lines',
        icon: Eye,
        run: () => update({ showAnalysis: !settings.showAnalysis }),
      },
      { id: 'review-game', group: 'Board', label: 'Review this game', icon: ROUTE_ICONS.review, enabled: game.moves.length > 0, run: startReview },
      { id: 'import', group: 'Board', label: 'Import PGN', icon: FileUp, run: openImport },
      { id: 'export', group: 'Board', label: 'Export PGN', icon: Download, enabled: game.moves.length > 0, run: openExport },
      { id: 'copy-fen', group: 'Board', label: 'Copy FEN', icon: ClipboardCopy, run: () => void copyText(fen, 'FEN') },
      { id: 'setup', group: 'Board', label: 'Set up a position', keywords: 'fen editor', icon: Crosshair, run: () => { go('board'); setSetupMode(true) } },
      { id: 'due', group: 'Train', label: `Review ${srs.dueCount} due card${srs.dueCount === 1 ? '' : 's'}`, icon: ROUTE_ICONS.cards, enabled: srs.dueCount > 0, run: () => { go('cards'); srs.startReview() } },
    )
    for (const s of PUZZLE_SETS)
      list.push({ id: `puzzles-${s.id}`, group: 'Puzzles', label: `${s.label} puzzles`, keywords: 'tactics', icon: ROUTE_ICONS.puzzles, run: () => { go('puzzles'); puzzles.start(s.id) } })
    for (const o of openings)
      list.push({ id: `opening-${o.id}`, group: 'Openings', label: o.name, description: o.summary, keywords: 'opening line', icon: BookOpen, run: () => { go('openings'); trainer.select(o) } })
    return list
  }, [go, free, game, settings, update, flip, startReview, openImport, openExport, copyText, fen, srs, puzzles, trainer])

  const title = setupMode && route === 'board' ? 'Set up a position' : ROUTES[route].label
  const sub = topBarSub(route, { tips, gameOver, turn, trainer, puzzles, srs, play, settings })

  return (
    <div className="app">
      <Sidebar
        route={route}
        onNavigate={go}
        counts={{ cards: srs.dueCount }}
        engine={engineState}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        rank={progression}
      />
      <div className="main">
        <TopBar title={title} sub={sub} onOpenPalette={() => setPaletteOpen(true)} onOpenMenu={() => setMenuOpen(true)} />
        <UpdateBanner updates={updates} />
        <main className="canvas">
          {route === 'coach' ? (
            <CoachHome coach={coach} progression={progression} onOpenBlock={openBlock} onNavigate={go} boardFen={game.moves.length > 0 ? fen : undefined} />
          ) : route === 'games' ? (
            <MyGamesPanel library={library} engineReady={engine.status === 'ready'} onOpen={openLibraryGame} />
          ) : route === 'progress' ? (
            <ProgressPanel
              puzzleStats={puzzles.stats}
              drillStats={trainer.stats}
              srsDue={srs.dueCount}
              srsTotal={srs.cards.length}
              historyVersion={review.historyVersion}
              onNavigate={go}
            />
          ) : route === 'badges' ? (
            <BadgesPanel progression={progression} streak={coach.streak} />
          ) : route === 'settings' ? (
            <SettingsPanel engineInfo={engine.buildInfo} updates={updates} claude={claude} />
          ) : setupMode && route === 'board' ? (
            <div className="workspace">
              <SetupPanel
                initialFen={fen}
                orientation={freeOrientation}
                onStart={(newFen) => {
                  free.reset(newFen)
                  setSetupMode(false)
                  notify({ kind: 'good', title: 'Playing from your position' }, 2500)
                }}
                onCancel={() => setSetupMode(false)}
              />
              <aside className="side-panel">
                <div className="panel">
                  <div className="panel-body">
                    <h2>Build a position</h2>
                    <p className="muted" style={{ marginTop: 8 }}>
                      Drag pieces from the trays onto the board, or paste a FEN. The app checks that the position is legal
                      before you start, then you play on from there with the engine watching.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          ) : session ? (
            <div className="workspace">
              <section className="board-col" aria-label="Board">
                <div className="board-row">
                  {route === 'board' && settings.showAnalysis && <EvalBar score={evalScore} orientation={session.orientation} />}
                  <Board
                    fen={preview?.fen ?? session.game.fen}
                    orientation={session.orientation}
                    interactive={preview ? false : session.interactive}
                    showLegalDots={settings.legalDots}
                    lastMove={preview ? (preview.lastMove ?? null) : lastMoveOf(session.game)}
                    arrows={preview ? (preview.arrows ?? []) : session.arrows}
                    extraSquareStyles={session.id === 'free' && route === 'review' ? reviewBadge : session.squareStyles}
                    shakeKey={session.shakeKey}
                    onMove={session.onMove}
                    overlay={
                      session.id === 'free' && !preview ? (
                        <BoardOverlay fen={session.game.fen} orientation={session.orientation} layers={layers} />
                      ) : null
                    }
                  />
                </div>

                {preview ? (
                  <div className="controls">
                    <span className="muted">{preview.label}</span>
                    <span className="spacer" />
                    <button className="btn small" onClick={() => setBoardPreview(null)}>
                      <ArrowLeft /> Back to the game
                    </button>
                  </div>
                ) : session.id === 'play' ? (
                  <PlayStrip play={play} />
                ) : session.id === 'free' ? (
                  <div className="controls">
                    <button className="btn small icon" onClick={free.undoMove} disabled={game.ply === 0} aria-label="Undo" title="Undo (Left arrow)">
                      <Undo2 />
                    </button>
                    <button className="btn small icon" onClick={free.redoMove} disabled={isAtEnd(game)} aria-label="Redo" title="Redo (Right arrow)">
                      <Redo2 />
                    </button>
                    <button
                      className="btn small icon"
                      onClick={flip}
                      disabled={settings.autoFlip}
                      aria-label="Flip board"
                      title={settings.autoFlip ? 'Turn off auto flip in Settings to flip by hand' : 'Flip the board'}
                    >
                      <ArrowUpDown />
                    </button>
                    <button className="btn small" onClick={() => free.reset()} disabled={game.moves.length === 0 && game.ply === 0} aria-label="New game">
                      <Plus /> <span className="btn-label">New game</span>
                    </button>
                    <span className="spacer" />
                    {route === 'board' && (
                      <button className="btn small" onClick={startReview} disabled={game.moves.length === 0 || engine.status !== 'ready'}>
                        Review game
                      </button>
                    )}
                    <MenuButton
                      label="Board layers"
                      items={[
                        { label: 'Square control (light: White, dark: Black)', checked: layers.control, onSelect: () => update({ overlayControl: !layers.control }) },
                        { label: 'Pins and skewers', checked: layers.lines, onSelect: () => update({ overlayLines: !layers.lines }) },
                        { label: 'Loose pieces (red: free, amber: underdefended)', checked: layers.loose, onSelect: () => update({ overlayLoose: !layers.loose }) },
                      ]}
                    >
                      <Layers2 /> <span className="btn-label">Layers</span>
                    </MenuButton>
                    <MenuButton
                      label="More game actions"
                      items={[
                        { label: 'Import PGN', icon: FileUp, onSelect: openImport },
                        { label: 'Export PGN', icon: Download, onSelect: openExport, disabled: game.moves.length === 0 },
                        { label: 'Copy FEN', icon: ClipboardCopy, onSelect: () => void copyText(fen, 'FEN') },
                        { label: 'Set up a position', icon: Crosshair, onSelect: () => setSetupMode(true) },
                        {
                          label: 'Save position as a card',
                          icon: Save,
                          onSelect: savePositionCard,
                          disabled: !engine.getCached(fen)?.bestMove,
                          title: "Add this position to your cards; the engine's best move becomes the answer",
                        },
                      ]}
                    >
                      <Ellipsis /> <span className="btn-label">More</span>
                    </MenuButton>
                  </div>
                ) : (
                  <SessionStrip session={session} trainer={trainer} puzzles={puzzles} />
                )}

              </section>

              <aside className="side-panel" aria-label={ROUTES[route].label}>
                <div className="panel">
                  {(session.id === 'free' || session.game.game.moves.length > 0) && (
                  <div className="moves-section">
                    {session.id === 'play' && play.result && (
                      <div className="banner">
                        <div>
                          <strong>{play.result.title}</strong>
                          <div className="muted">{play.result.detail}</div>
                        </div>
                        <div className="actions">
                          <button className="btn small primary" onClick={reviewPlayedGame}>
                            Review game
                          </button>
                          <button className="btn small" onClick={() => play.start(play.userColor, play.level.id, play.liveCoach)}>
                            Play again
                          </button>
                        </div>
                      </div>
                    )}
                    {session.id === 'free' && gameOver && route === 'board' && (
                      <div className="banner">
                        <div>
                          <strong>{gameOver.title}</strong>
                          <div className="muted">{gameOver.detail}</div>
                        </div>
                        <div className="actions">
                          <button className="btn small primary" onClick={startReview}>
                            Review game
                          </button>
                          <button className="btn small" onClick={() => free.reset()}>
                            New game
                          </button>
                        </div>
                      </div>
                    )}
                    <MoveList
                      game={session.game.game}
                      onJump={(ply) => session.canBrowse && session.jump(ply)}
                      markerFor={
                        session.id === 'free' && reviewResult
                          ? (i) => {
                              const m = reviewResult.moves[i]
                              if (!m || !isProblem(m.classification.cls)) return null
                              return <span className={`cls cls-${m.classification.cls}`}>{CLASS_SYMBOL[m.classification.cls]}</span>
                            }
                          : undefined
                      }
                    />
                  </div>
                  )}
                  <div className="panel-body">
                    {route === 'board' && (
                      <>
                        <PositionNotes fen={fen} score={evalScore} />
                        <ClaudeCoach
                          coach={claude}
                          positionKey={fen}
                          context={coachContext}
                          actions={[
                            { mode: 'position', label: 'Explain this position' },
                            ...(alert && alert.moveIndex === game.ply - 1 ? [{ mode: 'move' as const, label: `Explain ${alert.san}` }] : []),
                          ]}
                          onOpenSettings={() => go('settings')}
                        />
                        <AnalysisPanel fen={fen} onPlayLine={playLine}>
                          <TipsSection
                            tips={tips}
                            gameOver={!!gameOver}
                            onTakeBack={(i) => free.jump(i)}
                            onSaveCard={saveAlertCard}
                            explanation={lastExplanation}
                          />
                        </AnalysisPanel>
                      </>
                    )}
                    {route === 'play' && (
                      <PlayPanel play={play} engineReady={engine.status === 'ready'} onReview={reviewPlayedGame} onReviewSaved={reviewSavedGame} />
                    )}
                    {route === 'review' && reviewResult && (
                      <ClaudeCoach
                        coach={claude}
                        positionKey={fen}
                        context={coachContext}
                        actions={[
                          ...(game.ply > 0 ? [{ mode: 'move' as const, label: `Explain ${game.moves[game.ply - 1].san}` }] : []),
                          { mode: 'game', label: 'Summarise the game' },
                        ]}
                        onOpenSettings={() => go('settings')}
                      />
                    )}
                    {route === 'review' && (
                      <ReviewPanel
                        review={review}
                        game={game}
                        onJump={free.jump}
                        onExport={openExport}
                        engineReady={engine.status === 'ready'}
                        preview={boardPreview}
                        onPreview={setBoardPreview}
                        onLoadChessCom={loadChessCom}
                        onAddCards={(result) => {
                          const n = srs.addFromReview(game, result)
                          notify(
                            { kind: n ? 'good' : 'info', title: n ? `Added ${n} card${n === 1 ? '' : 's'} to your mistake cards` : 'Those positions are already in your cards' },
                            4000,
                          )
                        }}
                      />
                    )}
                    {route === 'courses' && <CoursesPanel api={course} />}
                    {route === 'repertoire' && (
                      <RepertoirePanel
                        rep={repertoire}
                        fen={games.rep.fen}
                        boardSans={game.moves.map((m) => m.san)}
                        onBack={games.rep.undoMove}
                        onStart={() => games.rep.reset()}
                      />
                    )}
                    {route === 'openings' && <OpeningsPanel trainer={trainerForPanel} puzzles={puzzles} />}
                    {route === 'puzzles' && <PuzzlesPanel puzzles={puzzles} rated={rated} />}
                    {route === 'cards' && <SrsPanel srs={srs} notify={(t, kind) => notify({ kind: kind ?? 'info', title: t }, 4000)} />}
                    {route === 'whynot' && <WhyNotPanel whyNot={whyNot} items={whyNotList} engineReady={engine.status === 'ready'} onNavigate={go} />}
                    {route === 'guess' && <GuessPanel guess={guess} engineReady={engine.status === 'ready'} />}
                    {route === 'otb' && (
                      <OtbPanel
                        otb={otb}
                        engineReady={engine.status === 'ready'}
                        onReview={(g) => openLibraryGame(g)}
                        onSave={(g) => {
                          const added = library.addGame(g)
                          notify({ kind: added ? 'good' : 'info', title: added ? 'Kept with My games' : 'That game is already in My games' }, 3000)
                          openLibraryGame(g)
                        }}
                      />
                    )}
                    {route === 'narrated' && (
                      <NarratedPanel
                        narrated={narrated}
                        voice={settings.coachVoice}
                        engineReady={engine.status === 'ready'}
                        onReview={() => reviewState(games.narrated.game, narrated.orientation)}
                        onNavigate={go}
                      />
                    )}
                  </div>
                </div>
              </aside>
            </div>
          ) : null}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

      <Modal open={pgnModal === 'import'} title="Import PGN" onClose={() => setPgnModal(null)}>
        <p className="muted" style={{ marginBottom: 10 }}>
          Paste a PGN or a chess.com game link. The moves replace the game on the board.
        </p>
        <textarea value={pgnText} onChange={(e) => setPgnText(e.target.value)} placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5" aria-label="PGN text" />
        {pgnError && <div className="error-text">{pgnError}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={() => setPgnModal(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={doImport} disabled={!pgnText.trim()}>
            Load game
          </button>
        </div>
      </Modal>

      <Modal open={pgnModal === 'export'} title="Export PGN" onClose={() => setPgnModal(null)}>
        <label className="toggle" style={{ marginBottom: 10 }} title={reviewResult ? '' : 'Run a game review first to get move grades'}>
          <input
            type="checkbox"
            checked={includeClassifications && !!reviewResult}
            disabled={!reviewResult}
            onChange={(e) => setIncludeClassifications(e.target.checked)}
          />
          Include move grades as comments{reviewResult ? '' : ' (review the game first)'}
        </label>
        <textarea value={exportText} readOnly aria-label="PGN text" />
        <div className="modal-actions">
          <button className="btn" onClick={() => setPgnModal(null)}>
            Close
          </button>
          <button className="btn" onClick={downloadPgn}>
            Download .pgn
          </button>
          <button className="btn primary" onClick={() => void copyText(exportText, 'PGN')}>
            Copy
          </button>
        </div>
      </Modal>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <LevelUp rank={progression.levelUp} onDismiss={progression.dismissLevelUp} />
    </div>
  )
}

function lastMoveOf(game: GameApi) {
  const m = lastMoveAt(game.game)
  return m ? { from: m.from, to: m.to } : null
}

/** The line under the screen title: the state of whatever the screen is about. */
function topBarSub(
  route: RouteId,
  ctx: {
    tips: ReturnType<typeof useTips>
    gameOver: GameApi['gameOver']
    turn: 'w' | 'b'
    trainer: TrainerApi
    puzzles: PuzzlesApi
    srs: SrsApi
    play: PlayApi
    settings: { openingDetection: boolean }
  },
): string | undefined {
  const { tips, gameOver, turn, trainer, puzzles, srs, play, settings } = ctx
  switch (route) {
    case 'play':
      return play.active ? `You play ${play.userColor === 'w' ? 'White' : 'Black'} against ${play.level.name}` : undefined
    case 'board':
    case 'review': {
      const status = gameOver ? gameOver.title : `${turn === 'w' ? 'White' : 'Black'} to move`
      const opening = settings.openingDetection && tips.opening ? `${tips.opening.eco} ${tips.opening.name}` : null
      return opening ? `${status} · ${opening}` : status
    }
    case 'openings':
      return trainer.opening ? `${trainer.opening.name}${trainer.line && trainer.line.key !== 'main' ? ` · ${trainer.line.name}` : ''}` : `${openings.length} openings`
    case 'puzzles':
      return puzzles.active && puzzles.puzzle ? `${puzzles.puzzle.side === 'w' ? 'White' : 'Black'} to move` : undefined
    case 'cards':
      return `${srs.dueCount} due of ${srs.cards.length}`
    default:
      return undefined
  }
}

/** The control row under the board during a game against the computer. */
function PlayStrip({ play }: { play: PlayApi }) {
  if (!play.active) return <div className="controls"><span className="muted">Choose a level and a colour to start a game</span></div>
  return (
    <div className="controls">
      <span className="muted">{play.result ? 'Game over' : play.thinking ? 'The computer is thinking' : play.userToMove ? 'Your move' : 'Waiting for the computer'}</span>
      <span className="spacer" />
      <button className="btn small" onClick={play.exit}>
        Exit game
      </button>
    </div>
  )
}

/** The control row under the board when a practice mode owns it. */
function SessionStrip({ session, trainer, puzzles }: { session: BoardSession; trainer: TrainerApi; puzzles: PuzzlesApi }) {
  let text = ''
  if (session.id === 'trainer') {
    text = trainer.opening
      ? `${trainer.mode === 'drill' ? 'Drill' : trainer.mode === 'auto' ? 'Autoplay' : 'Step through'} · move ${trainer.index} of ${trainer.moves.length}`
      : 'Pick an opening to start'
  } else if (session.id === 'puzzle') {
    text = puzzles.puzzle ? `${motifGuide(puzzles.puzzle.motif).title} · ${puzzles.puzzle.solution.length > 1 ? `${Math.ceil(puzzles.puzzle.solution.length / 2)} moves to find` : 'one move to find'}` : 'Pick a set to start'
  } else if (session.id === 'course') {
    text = session.interactive ? 'Your move' : 'Read, then press Next'
  } else if (session.id === 'rep') {
    text = session.interactive ? (session.canBrowse ? 'Every move you play is added' : 'Your move') : 'Repertoire'
  } else if (session.id === 'srs') {
    text = session.interactive ? 'Find the best move' : 'Your mistake cards'
  } else if (session.id === 'whynot') {
    text = session.interactive ? 'Play the move you would choose' : session.canBrowse ? 'Step through the line' : 'Why not this move'
  } else if (session.id === 'guess') {
    text = session.interactive ? 'Your guess' : session.canBrowse ? 'The whole game' : 'Guess the move'
  } else if (session.id === 'otb') {
    text = session.interactive ? 'Play the moves here or type them' : 'Fix the move list to go on'
  } else if (session.id === 'narrated') {
    text = session.interactive ? 'Predict the coach\'s move' : session.canBrowse ? 'Game over' : 'The coach is playing'
  }
  return (
    <div className="controls">
      <span className="muted">{text}</span>
      <span className="spacer" />
      {session.canBrowse && (
        <>
          <button className="btn small icon" onClick={() => session.step(-1)} aria-label="Previous move">
            <Undo2 />
          </button>
          <button className="btn small icon" onClick={() => session.step(1)} aria-label="Next move">
            <Redo2 />
          </button>
        </>
      )}
    </div>
  )
}
