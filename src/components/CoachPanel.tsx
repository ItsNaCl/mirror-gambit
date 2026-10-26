import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Lightbulb, Pause, Play } from 'lucide-react'
import { ANSWER_ARROW } from '../lib/ui/boardColors'
import type { Arrow } from 'react-chessboard'
import { CLASS_LABEL, CLASS_SYMBOL, isProblem, MOVE_CLASSES, type MoveClass } from '../lib/analysis/classify'
import { fenAt, moveLabel, type GameState } from '../lib/chess/game'
import { coachNote, lineText, type LineLesson } from '../lib/coach/coach'
import type { ReviewResult } from '../lib/review/review'

/** A temporary position shown on the board instead of the game (a coach line or the best move). */
export interface BoardPreview {
  fen: string
  lastMove?: { from: string; to: string } | null
  arrows?: Arrow[]
  /** Short caption shown above the board controls. */
  label: string
}

export interface CoachPanelProps {
  result: ReviewResult
  game: GameState
  onJump: (ply: number) => void
  preview: BoardPreview | null
  onPreview: (p: BoardPreview | null) => void
}

const LINE_STEP_MS = 1100
const GAME_STEP_MS = 2200
const BEST_ARROW = ANSWER_ARROW
const DANGER_ARROW = 'rgba(239, 107, 126, 0.9)'

type LineKind = 'better' | 'danger'

interface LinePlayback {
  kind: LineKind
  lesson: LineLesson
  startFen: string
  /** Steps shown so far (0 = start position with an arrow for the first move). */
  shown: number
  playing: boolean
}

/**
 * The coach: steps through the reviewed game one move at a time, explains each move,
 * and can play the better line (or the danger the move allowed) a few moves forward
 * on the board so missed tactics are visible.
 */
export function CoachPanel({ result, game, onJump, preview, onPreview }: CoachPanelProps) {
  const ply = game.ply
  const move = ply > 0 ? result.moves[ply - 1] : null
  const fenBefore = ply > 0 ? fenAt(game, ply - 1) : game.startFen
  const fenAfter = fenAt(game, ply)
  const note = useMemo(() => (move ? coachNote(move, fenBefore, fenAfter) : null), [move, fenBefore, fenAfter])
  const [line, setLine] = useState<LinePlayback | null>(null)
  const [autoGame, setAutoGame] = useState(false)
  const [pauseOnMistakes, setPauseOnMistakes] = useState(true)

  // A new move (or leaving the review) drops any line being shown.
  useEffect(() => {
    setLine(null)
  }, [ply])
  useEffect(() => () => onPreview(null), [onPreview])

  // Mirror the line playback onto the board.
  useEffect(() => {
    if (!line) {
      onPreview(null)
      return
    }
    const { lesson, startFen, shown, kind } = line
    const color = kind === 'better' ? BEST_ARROW : DANGER_ARROW
    const label = `${kind === 'better' ? 'Better line' : 'The danger'}: ${lineText(startFen, lesson.steps)}`
    if (shown === 0) {
      const first = lesson.steps[0]
      onPreview({ fen: startFen, label, arrows: first ? [{ startSquare: first.from, endSquare: first.to, color }] : [] })
      return
    }
    const step = lesson.steps[shown - 1]
    const next = lesson.steps[shown]
    onPreview({
      fen: step.fenAfter,
      lastMove: { from: step.from, to: step.to },
      arrows: next ? [{ startSquare: next.from, endSquare: next.to, color }] : [],
      label,
    })
  }, [line, onPreview])

  // Autoplay inside a line.
  useEffect(() => {
    if (!line?.playing) return
    if (line.shown >= line.lesson.steps.length) {
      setLine((l) => (l ? { ...l, playing: false } : l))
      return
    }
    const t = window.setTimeout(() => setLine((l) => (l ? { ...l, shown: l.shown + 1 } : l)), LINE_STEP_MS)
    return () => clearTimeout(t)
  }, [line])

  // Play-by-play through the game, pausing on mistakes so the coach can be read.
  useEffect(() => {
    if (!autoGame || line) return
    if (ply >= game.moves.length) {
      setAutoGame(false)
      return
    }
    const current = ply > 0 ? result.moves[ply - 1] : null
    if (pauseOnMistakes && current && isProblem(current.classification.cls)) {
      setAutoGame(false)
      return
    }
    const t = window.setTimeout(() => onJump(ply + 1), GAME_STEP_MS)
    return () => clearTimeout(t)
  }, [autoGame, line, ply, game.moves.length, pauseOnMistakes, result.moves, onJump])

  function startLine(kind: LineKind) {
    if (!note) return
    const lesson = kind === 'better' ? note.better : note.allowed
    if (!lesson || lesson.steps.length === 0) return
    setAutoGame(false)
    setLine({ kind, lesson, startFen: kind === 'better' ? fenBefore : fenAfter, shown: 0, playing: true })
  }

  function showBestMove() {
    if (!note?.better?.steps[0]) return
    const first = note.better.steps[0]
    setAutoGame(false)
    setLine({ kind: 'better', lesson: { ...note.better, steps: [first] }, startFen: fenBefore, shown: 0, playing: false })
  }

  const stepLine = (delta: number) =>
    setLine((l) => (l ? { ...l, playing: false, shown: Math.max(0, Math.min(l.lesson.steps.length, l.shown + delta)) } : l))

  /** Next move of a class for a side, after the current one (wrapping to the start). */
  function jumpToClass(cls: MoveClass, side: 'w' | 'b') {
    const list = result.moves.filter((m) => m.classification.cls === cls && m.mover === side)
    if (list.length === 0) return
    const next = list.find((m) => m.index + 1 > ply) ?? list[0]
    setAutoGame(false)
    onJump(next.index + 1)
  }

  const label = move ? moveLabel(game.startFen, move.index) : null
  const cls = move?.classification.cls

  return (
    <div>
      <div className="coach-controls">
        <button className="btn small" onClick={() => onJump(0)} disabled={ply === 0} title="Start of the game" aria-label="Start of the game">
          <ChevronsLeft />
        </button>
        <button className="btn small" onClick={() => onJump(ply - 1)} disabled={ply === 0} title="Previous move (Left arrow)" aria-label="Previous move">
          <ChevronLeft />
        </button>
        <button className={'btn small' + (autoGame ? ' active' : '')} onClick={() => setAutoGame((a) => !a)} disabled={ply >= game.moves.length && !autoGame}>
          {autoGame ? <><Pause /> Pause</> : <><Play /> Play-by-play</>}
        </button>
        <button className="btn small" onClick={() => onJump(ply + 1)} disabled={ply >= game.moves.length} title="Next move (Right arrow)" aria-label="Next move">
          <ChevronRight />
        </button>
        <button className="btn small" onClick={() => onJump(game.moves.length)} disabled={ply >= game.moves.length} title="End of the game" aria-label="End of the game">
          <ChevronsRight />
        </button>
        <label className="toggle small-text" title="Stop the play-by-play on inaccuracies, mistakes and blunders">
          <input type="checkbox" checked={pauseOnMistakes} onChange={(e) => setPauseOnMistakes(e.target.checked)} />
          Pause on mistakes
        </label>
      </div>

      {!move || !note ? (
        <div className="card info">
          <h3>Coach</h3>
          <p className="small-text">
            Press Next or Play-by-play to go through the game move by move. For every move the coach explains what happened, and
            for mistakes it can play the better line on the board.
          </p>
        </div>
      ) : (
        <div className={`card coach-card cls-border-${cls}`}>
          <h3>
            <span className={`cls-${cls}`}>{CLASS_SYMBOL[cls!]}</span> {label!.number}
            {label!.isWhite ? '.' : '...'} {note.headline}
          </h3>
          {note.body.map((p, i) => (
            <p key={i} className="small-text">
              {p}
            </p>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            {note.better && (
              <>
                <button className="btn small" onClick={showBestMove}>
                  <Lightbulb /> Show best move
                </button>
                <button className="btn small primary" onClick={() => startLine('better')}>
                  <Play /> Play best line
                </button>
              </>
            )}
            {note.allowed && isProblem(cls!) && (
              <button className="btn small" onClick={() => startLine('danger')}>
                ⚠ Show the danger
              </button>
            )}
          </div>
        </div>
      )}

      {line && preview && (
        <div className="card coach-line">
          <div className="small-text">
            <strong>{line.kind === 'better' ? 'Better line' : 'The danger'}</strong> ({line.shown}/{line.lesson.steps.length})
          </div>
          <div className="coach-line-moves small-text">
            {line.lesson.steps.map((s, i) => (
              <button
                key={i}
                className={'move' + (i === line.shown - 1 ? ' active' : '')}
                onClick={() => setLine((l) => (l ? { ...l, playing: false, shown: i + 1 } : l))}
              >
                {s.san}
              </button>
            ))}
          </div>
          {line.lesson.insights
            .filter((x) => x.ply < line.shown)
            .map((x, i) => (
              <p key={i} className="small-text coach-insight">
                👉 {x.text}
              </p>
            ))}
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn small" onClick={() => stepLine(-1)} disabled={line.shown === 0} aria-label="Previous move of the line">
              <ChevronLeft />
            </button>
            <button className="btn small" onClick={() => setLine((l) => (l ? { ...l, playing: !l.playing, shown: l.shown >= l.lesson.steps.length ? 0 : l.shown } : l))}>
              {line.playing ? <Pause aria-label="Pause" /> : <Play aria-label="Play" />}
            </button>
            <button className="btn small" onClick={() => stepLine(1)} disabled={line.shown >= line.lesson.steps.length} aria-label="Next move of the line">
              <ChevronRight />
            </button>
            <span className="spacer" style={{ flex: 1 }} />
            <button className="btn small" onClick={() => setLine(null)}>
              Back to the game
            </button>
          </div>
        </div>
      )}

      <div className="section-title">Summary (click a number to jump to those moves)</div>
      <table className="summary-table">
        <thead>
          <tr>
            <th>Move type</th>
            <th>White</th>
            <th>Black</th>
          </tr>
        </thead>
        <tbody>
          {MOVE_CLASSES.map((c) => (
            <tr key={c} className={cls === c ? 'current' : ''}>
              <td>
                <span className={`cls-${c}`}>{CLASS_SYMBOL[c]}</span> {CLASS_LABEL[c]}
              </td>
              {(['w', 'b'] as const).map((side) => (
                <td key={side} className={cls === c && move?.mover === side ? 'current-cell' : ''}>
                  {result.summary[side][c] > 0 ? (
                    <button className="link-btn" onClick={() => jumpToClass(c, side)} title={`Jump to ${side === 'w' ? "White's" : "Black's"} next ${CLASS_LABEL[c].toLowerCase()}`}>
                      {result.summary[side][c]}
                    </button>
                  ) : (
                    0
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
