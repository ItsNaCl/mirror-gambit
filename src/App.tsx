import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Arrow } from 'react-chessboard'
import { AnalysisPanel } from './components/AnalysisPanel'
import { Board } from './components/Board'
import { EvalBar } from './components/EvalBar'
import { MoveList } from './components/MoveList'
import { Modal } from './components/Modal'
import { OpeningsPanel } from './components/OpeningsPanel'
import { PlayPanel } from './components/PlayPanel'
import { ProgressPanel } from './components/ProgressPanel'
import { PuzzlesPanel } from './components/PuzzlesPanel'
import { ReviewPanel } from './components/ReviewPanel'
import { SetupPanel } from './components/SetupPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { SrsPanel } from './components/SrsPanel'
import { TipsSection } from './components/TipsSection'
import { ToastStack, useToasts } from './components/Toast'
import { EngineProvider, useEngine } from './hooks/useEngine'
import { useGame, type GameApi } from './hooks/useGame'
import { useSettings } from './hooks/useSettings'
import { usePlay } from './hooks/usePlay'
import { usePuzzles } from './hooks/usePuzzles'
import { useReview } from './hooks/useReview'
import { useSrs } from './hooks/useSrs'
import { useTips, type MoveAlert } from './hooks/useTips'
import { useTrainer } from './hooks/useTrainer'
import { CLASS_LABEL, CLASS_SYMBOL } from './lib/analysis/classify'
import { fenAt, isAtEnd, lastMoveAt, playUci, turnOf, uciToSan } from './lib/chess/game'
import { exportPgn, importPgn } from './lib/chess/pgn'
import type { SavedGame } from './lib/play/savedGames'
import { reviewComment } from './lib/review/review'

type Tab = 'analysis' | 'play' | 'openings' | 'puzzles' | 'cards' | 'review' | 'progress' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'analysis', label: 'Analysis' },
  { id: 'play', label: 'Play' },
  { id: 'openings', label: 'Openings' },
  { id: 'puzzles', label: 'Puzzles' },
  { id: 'cards', label: 'Cards' },
  { id: 'review', label: 'Review' },
  { id: 'progress', label: 'Progress' },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const gameApi = useGame()
  return (
    <EngineProvider fen={gameApi.fen}>
      <Workspace gameApi={gameApi} />
    </EngineProvider>
  )
}

function Workspace({ gameApi }: { gameApi: GameApi }) {
  const { settings, update } = useSettings()
  const { game, fen, gameOver } = gameApi
  const engine = useEngine()
  const { toasts, notify, dismiss } = useToasts()

  const [tab, setTab] = useState<Tab>('analysis')
  const [manualOrientation, setManualOrientation] = useState<'white' | 'black'>('white')
  const [setupMode, setSetupMode] = useState(false)
  const [pgnModal, setPgnModal] = useState<'import' | 'export' | null>(null)
  const [pgnText, setPgnText] = useState('')
  const [pgnError, setPgnError] = useState<string | null>(null)

  const trainerRaw = useTrainer(gameApi)
  const puzzlesRaw = usePuzzles(gameApi, engine)
  const srsRaw = useSrs(gameApi)
  const playRaw = usePlay(gameApi, engine)
  // Only one mode may drive the board at a time: starting one exits the others.
  const trainer = useMemo(
    () => ({
      ...trainerRaw,
      select: (o: Parameters<typeof trainerRaw.select>[0]) => { puzzlesRaw.exit(); srsRaw.exit(); playRaw.exit(); trainerRaw.select(o) },
      exit: () => { puzzlesRaw.exit(); trainerRaw.exit() },
    }),
    [trainerRaw, puzzlesRaw, srsRaw, playRaw],
  )
  const puzzles = useMemo(
    () => ({ ...puzzlesRaw, start: (c: Parameters<typeof puzzlesRaw.start>[0]) => { trainerRaw.exit(); srsRaw.exit(); playRaw.exit(); puzzlesRaw.start(c) } }),
    [puzzlesRaw, trainerRaw, srsRaw, playRaw],
  )
  const srs = useMemo(
    () => ({ ...srsRaw, startReview: () => { trainerRaw.exit(); puzzlesRaw.exit(); playRaw.exit(); srsRaw.startReview() } }),
    [srsRaw, trainerRaw, puzzlesRaw, playRaw],
  )
  const play = useMemo(
    () => ({ ...playRaw, start: (c: 'w' | 'b', level: number) => { trainerRaw.exit(); puzzlesRaw.exit(); srsRaw.exit(); playRaw.start(c, level) } }),
    [playRaw, trainerRaw, puzzlesRaw, srsRaw],
  )
  const srsActive = srs.active
  const puzzleActive = puzzles.active && !srsActive
  const trainerActive = trainer.active && !puzzleActive && !srsActive
  const playActive = play.active && !trainerActive && !puzzleActive && !srsActive
  const playLive = playActive && !play.result
  const review = useReview(gameApi, engine)
  const [includeClassifications, setIncludeClassifications] = useState(true)
  const reviewResult = review.matchesCurrentGame ? review.state.result : null

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

  // Dev-only hook so browser automation can read the current position.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __mirrorGambit?: unknown }).__mirrorGambit = { fen, ply: game.ply }
  }, [fen, game.ply])

  const turn = turnOf(fen)
  const orientation: 'white' | 'black' = srsActive
    ? srs.orientation
    : playActive
    ? play.orientation
    : puzzleActive
    ? puzzles.orientation
    : trainerActive
    ? trainer.boardOrientation
    : settings.autoFlip
      ? turn === 'w'
        ? 'white'
        : 'black'
      : manualOrientation
  const lastMove = lastMoveAt(game)

  const onMoveAlert = useCallback(
    (alert: MoveAlert) => {
      const kind = alert.classification.cls === 'blunder' ? 'bad' : 'warn'
      const action =
        alert.classification.cls === 'blunder'
          ? { label: 'Take it back', onClick: () => gameApi.jump(alert.moveIndex) }
          : undefined
      notify({ kind, title: `${CLASS_LABEL[alert.classification.cls]}: ${alert.san}`, body: alert.text, action }, 12000)
    },
    [notify, gameApi],
  )
  const tips = useTips(gameApi, { enabled: !setupMode && !trainerActive && !puzzleActive && !srsActive && !playLive, notify: onMoveAlert })

  // Left/right arrow keys step through the game (or through the opening line in the trainer).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (pgnModal || setupMode) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      if (playLive) return
      if (srsActive) {
        if (srs.userToMove) return
        if (e.key === 'ArrowLeft') gameApi.undoMove()
        else gameApi.redoMove()
        return
      }
      if (puzzleActive) {
        if (puzzles.status === 'playing') return
        if (e.key === 'ArrowLeft') gameApi.undoMove()
        else gameApi.redoMove()
        return
      }
      if (trainerActive) {
        if (trainer.mode === 'drill') return
        if (e.key === 'ArrowLeft') trainer.prev()
        else trainer.next()
        return
      }
      if (e.key === 'ArrowLeft') gameApi.undoMove()
      else gameApi.redoMove()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameApi, pgnModal, setupMode, trainerActive, trainer, puzzleActive, puzzles, srsActive, srs, playLive])

  const copyText = useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text)
        notify({ kind: 'good', title: `${what} copied to clipboard` }, 2500)
      } catch {
        notify({ kind: 'warn', title: `Could not copy ${what}`, body: 'Your browser blocked clipboard access.' })
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
      if (state !== game) gameApi.setGame(state)
    },
    [game, gameApi],
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
    notify({ kind: card ? 'good' : 'info', title: card ? 'Saved to your review deck' : 'This position is already in your deck' }, 3000)
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
      notify({ kind: card ? 'good' : 'info', title: card ? 'Saved to your review deck' : 'Already in your deck' }, 3000)
    },
    [tips.alert, srs, game, notify],
  )

  const openReview = useCallback(() => {
    setTab('review')
    if (!reviewResult && review.state.status !== 'running') review.start()
  }, [reviewResult, review])

  const reviewSavedGame = useCallback(
    (saved: SavedGame) => {
      try {
        const state = importPgn(saved.pgn)
        playRaw.exit()
        gameApi.load(state)
        setManualOrientation(saved.userColor === 'w' ? 'white' : 'black')
        setTab('review')
        review.start(state)
      } catch (e) {
        notify({ kind: 'warn', title: 'Could not load that game', body: e instanceof Error ? e.message : String(e) })
      }
    },
    [playRaw, gameApi, review, notify],
  )

  function openExport() {
    setPgnModal('export')
  }

  function openImport() {
    setPgnText('')
    setPgnError(null)
    setPgnModal('import')
  }

  function doImport() {
    try {
      const state = importPgn(pgnText)
      gameApi.load(state)
      setPgnModal(null)
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

  const statusText = useMemo(() => {
    if (gameOver) return gameOver.title
    return `${turn === 'w' ? 'White' : 'Black'} to move`
  }, [gameOver, turn])

  const engineBadge =
    engine.status === 'loading' ? 'Engine loading…' : engine.status === 'error' ? 'Engine unavailable' : 'Engine ready'

  // What the board shows from the engine, only when analysis is switched on.
  const bestLine = settings.showAnalysis ? engine.analysis?.lines[0] : undefined
  const evalScore = settings.showAnalysis ? (engine.analysis?.lines[0]?.score ?? engine.getCached(fen)?.score ?? null) : null
  const arrows: Arrow[] = useMemo(() => {
    const best = bestLine?.pv[0]
    if (!best || gameOver) return []
    return [{ startSquare: best.slice(0, 2), endSquare: best.slice(2, 4), color: 'rgba(91, 156, 255, 0.8)' }]
  }, [bestLine, gameOver])

  if (setupMode) {
    return (
      <div className="app">
        <Header status="Position setup" engine={engineBadge} />
        <main className="layout">
          <SetupPanel
            initialFen={fen}
            orientation={orientation}
            onStart={(newFen) => {
              gameApi.reset(newFen)
              setSetupMode(false)
              notify({ kind: 'good', title: 'Playing from your position' }, 2500)
            }}
            onCancel={() => setSetupMode(false)}
          />
          <aside className="panel">
            <div className="panel-body">
              <h3>Position setup</h3>
              <p className="muted small-text">
                Build any position you want to practise, then press <b>Play from this position</b>. The app checks
                that the position is legal before you start.
              </p>
            </div>
          </aside>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <Header
        status={statusText}
        engine={engineBadge}
        opening={tips.opening ? `${tips.opening.eco} ${tips.opening.name}` : undefined}
      />
      <main className="layout">
        <section className="left">
          <div className="board-row">
            {settings.showAnalysis && <EvalBar score={evalScore} orientation={orientation} />}
            <Board
              fen={fen}
              orientation={orientation}
              interactive={playActive ? playLive && play.userToMove && !play.thinking : srsActive ? !!srs.userToMove : puzzleActive ? puzzles.solverToMove : trainerActive ? trainer.mode === 'drill' && trainer.userToMove : !gameOver}
              showLegalDots={settings.legalDots}
              lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
              arrows={playLive ? [] : srsActive ? srs.arrows : puzzleActive ? puzzles.arrows : trainerActive ? trainer.arrows : arrows}
              extraSquareStyles={srsActive ? srs.squareStyles : puzzleActive ? puzzles.squareStyles : trainerActive ? trainer.hintSquareStyles : undefined}
              shakeKey={trainer.shakeKey + puzzles.shakeKey}
              onMove={playActive ? play.onBoardMove : srsActive ? srs.onBoardMove : puzzleActive ? puzzles.onBoardMove : trainerActive ? trainer.onBoardMove : gameApi.move}
            />
          </div>

          {playActive ? (
            <div className="controls">
              <span className="small-text muted">
                Playing {play.userColor === 'w' ? 'White' : 'Black'} vs {play.level.name}
                {play.thinking ? ' · computer is thinking…' : ''}
              </span>
              <span className="spacer" />
              <button className="btn small" onClick={play.takeBack} disabled={!play.canTakeBack}>
                ↶ Take back
              </button>
              <button className="btn small" onClick={play.exit}>
                Exit game
              </button>
            </div>
          ) : srsActive ? (
            <div className="controls">
              <span className="small-text muted">Mistake review: find the best move</span>
              <span className="spacer" />
              <button className="btn small" onClick={srs.exit}>
                Exit review
              </button>
            </div>
          ) : puzzleActive ? (
            <div className="controls">
              <span className="small-text muted">Puzzle: {puzzles.puzzle?.motif.replace(/_/g, ' ')} · {puzzles.puzzle?.side === 'w' ? 'White' : 'Black'} to move</span>
              <span className="spacer" />
              <button className="btn small" onClick={puzzles.exit}>
                Exit puzzles
              </button>
            </div>
          ) : trainerActive ? (
            <div className="controls">
              <span className="small-text muted">
                Opening trainer: {trainer.opening?.name}
                {trainer.mode === 'drill' ? ' (drill)' : trainer.mode === 'auto' ? ' (autoplay)' : ' (step through)'}
              </span>
              <span className="spacer" />
              <button
                className="btn small"
                onClick={() => setManualOrientation((o) => (o === 'white' ? 'black' : 'white'))}
                disabled
                title="The board faces the side you are studying"
              >
                ⇅ Flip
              </button>
              <button className="btn small" onClick={trainer.exit}>
                Exit trainer
              </button>
            </div>
          ) : (
          <div className="controls">
            <button className="btn" onClick={gameApi.undoMove} disabled={game.ply === 0} title="Undo (Left arrow)">
              ← Undo
            </button>
            <button className="btn" onClick={gameApi.redoMove} disabled={isAtEnd(game)} title="Redo (Right arrow)">
              Redo →
            </button>
            <button className="btn" onClick={() => gameApi.reset()} disabled={game.moves.length === 0 && game.ply === 0}>
              Reset
            </button>
            <button
              className="btn"
              onClick={() => setManualOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              disabled={settings.autoFlip}
              title={settings.autoFlip ? 'Turn off auto flip to flip manually' : 'Flip the board'}
            >
              ⇅ Flip
            </button>
            <label className="toggle">
              <input type="checkbox" checked={settings.autoFlip} onChange={(e) => update({ autoFlip: e.target.checked })} />
              Auto flip
            </label>
            <label className="toggle">
              <input type="checkbox" checked={settings.legalDots} onChange={(e) => update({ legalDots: e.target.checked })} />
              Move dots
            </label>
            <span className="spacer" />
            <button className="btn small" onClick={openImport}>
              Import PGN
            </button>
            <button className="btn small" onClick={openExport}>
              Export PGN
            </button>
            <button className="btn small" onClick={() => copyText(fen, 'FEN')}>
              Copy FEN
            </button>
            <button className="btn small" onClick={() => setSetupMode(true)}>
              Set up position
            </button>
            <button
              className="btn small"
              onClick={savePositionCard}
              disabled={!engine.getCached(fen)?.bestMove}
              title="Add this position to your review deck; the engine's best move becomes the answer"
            >
              Save this position
            </button>
          </div>
          )}

          {playActive && play.result && (
            <div className="banner">
              <div>
                <strong>{play.result.title}</strong>
                <div className="small-text muted">{play.result.detail}</div>
              </div>
              <div className="actions">
                <button className="btn primary" onClick={openReview}>
                  Review game
                </button>
                <button className="btn" onClick={() => play.start(play.userColor, play.level.id)}>
                  Play again
                </button>
              </div>
            </div>
          )}

          {gameOver && !trainerActive && !puzzleActive && !srsActive && !playActive && (
            <div className="banner">
              <div>
                <strong>{gameOver.title}</strong>
                <div className="small-text muted">{gameOver.detail}</div>
              </div>
              <div className="actions">
                <button className="btn primary" onClick={openReview}>
                  Review game
                </button>
                <button className="btn" onClick={() => gameApi.reset()}>
                  New game
                </button>
              </div>
            </div>
          )}

          <MoveList
            game={game}
            onJump={(ply) => {
              if (playActive) {
                if (play.result) gameApi.jump(ply)
              } else if (srsActive) {
                if (!srs.userToMove) gameApi.jump(ply)
              } else if (puzzleActive) {
                if (puzzles.status !== 'playing') gameApi.jump(ply)
              } else if (!trainerActive) gameApi.jump(ply)
              else if (trainer.mode !== 'drill') trainer.goTo(ply)
            }}
            markerFor={
              reviewResult
                ? (i) => {
                    const m = reviewResult.moves[i]
                    if (!m || m.classification.cls === 'good' || m.classification.cls === 'great') return null
                    return <span className={`cls cls-${m.classification.cls}`}>{CLASS_SYMBOL[m.classification.cls]}</span>
                  }
                : undefined
            }
          />
        </section>

        <aside className="panel">
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === 'cards' && srs.dueCount > 0 && <span className="badge">{srs.dueCount}</span>}
              </button>
            ))}
          </nav>
          <div className="panel-body">
            {tab === 'analysis' && (
              <AnalysisPanel fen={fen} onPlayLine={playLine}>
                <TipsSection tips={tips} gameOver={!!gameOver} onTakeBack={(i) => gameApi.jump(i)} onSaveCard={saveAlertCard} />
              </AnalysisPanel>
            )}
            {tab === 'play' && (
              <PlayPanel play={play} engineReady={engine.status === 'ready'} onReview={openReview} onReviewSaved={reviewSavedGame} />
            )}
            {tab === 'openings' && <OpeningsPanel trainer={trainer} puzzles={puzzles} />}
            {tab === 'puzzles' && <PuzzlesPanel puzzles={puzzles} />}
            {tab === 'cards' && <SrsPanel srs={srs} notify={(title, kind) => notify({ kind: kind ?? 'info', title }, 4000)} />}
            {tab === 'review' && (
              <ReviewPanel
                review={review}
                game={game}
                onJump={gameApi.jump}
                onExport={openExport}
                engineReady={engine.status === 'ready'}
                onAddCards={(result) => {
                  const n = srs.addFromReview(game, result)
                  notify({ kind: n ? 'good' : 'info', title: n ? `Added ${n} card${n === 1 ? '' : 's'} to your review deck` : 'Those positions are already in your deck' }, 4000)
                }}
              />
            )}
            {tab === 'progress' && (
              <ProgressPanel
                puzzleStats={puzzles.stats}
                drillStats={trainer.stats}
                srsDue={srs.dueCount}
                srsTotal={srs.cards.length}
                historyVersion={review.historyVersion}
              />
            )}
            {tab === 'settings' && <SettingsPanel engineInfo={engine.buildInfo} />}
          </div>
        </aside>
      </main>

      <Modal open={pgnModal === 'import'} title="Import PGN" onClose={() => setPgnModal(null)}>
        <p className="small-text muted">Paste a PGN below. The moves will replace the current game.</p>
        <textarea value={pgnText} onChange={(e) => setPgnText(e.target.value)} placeholder="1. e4 e5 2. Nf3 ..." />
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
        <label className="toggle small-text" style={{ marginBottom: 8 }} title={reviewResult ? '' : 'Run a game review first to get classifications'}>
          <input
            type="checkbox"
            checked={includeClassifications && !!reviewResult}
            disabled={!reviewResult}
            onChange={(e) => setIncludeClassifications(e.target.checked)}
          />
          Include move classifications as comments{reviewResult ? '' : ' (review the game first)'}
        </label>
        <textarea value={exportText} readOnly />
        <div className="modal-actions">
          <button className="btn" onClick={() => setPgnModal(null)}>
            Close
          </button>
          <button className="btn" onClick={downloadPgn}>
            Download .pgn
          </button>
          <button className="btn primary" onClick={() => copyText(exportText, 'PGN')}>
            Copy
          </button>
        </div>
      </Modal>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}

function Header({ status, engine, opening }: { status: string; engine: string; opening?: string }) {
  return (
    <header className="app-header">
      <h1>♞ Mirror Gambit</h1>
      {opening && <span className="muted small-text">{opening}</span>}
      <div className="status">
        <span>{status}</span>
        <span>·</span>
        <span>{engine}</span>
      </div>
    </header>
  )
}
