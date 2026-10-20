import { useMemo } from 'react'
import type { ReviewApi } from '../hooks/useReview'
import { CLASS_LABEL, CLASS_SYMBOL, isProblem } from '../lib/analysis/classify'
import { moveLabel, type GameState } from '../lib/chess/game'
import { formatScore, scoreToCp, type Score } from '../lib/engine/uci'
import { REVIEW_DEPTH, type ReviewResult } from '../lib/review/review'
import { ChessComImport } from './ChessComImport'
import { CoachPanel, type BoardPreview } from './CoachPanel'

export interface ReviewPanelProps {
  review: ReviewApi
  game: GameState
  onJump: (ply: number) => void
  onExport: () => void
  engineReady: boolean
  /** Adds every inaccuracy, mistake and blunder to the spaced-repetition deck. */
  onAddCards?: (result: ReviewResult) => void
  /** Coach lines shown on the board instead of the game. */
  preview: BoardPreview | null
  onPreview: (p: BoardPreview | null) => void
  /** Loads a chess.com game by URL and reviews it. */
  onLoadChessCom: (url: string) => Promise<void>
}

export function ReviewPanel({ review, game, onJump, onExport, engineReady, onAddCards, preview, onPreview, onLoadChessCom }: ReviewPanelProps) {
  const { state, start, cancel, matchesCurrentGame } = review

  if (state.status === 'running') {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>Reviewing your game…</h3>
        <p className="small-text muted">
          Analysing position {state.current} of {state.total} at depth {REVIEW_DEPTH}.
        </p>
        <div className="progress">
          <div style={{ width: `${Math.round(state.progress * 100)}%` }} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  const canStart = engineReady && game.moves.length > 0
  const startButton = (
    <button className="btn primary" onClick={() => start()} disabled={!canStart} title={!engineReady ? 'Waiting for the engine' : ''}>
      {state.result ? 'Review again' : 'Review game'}
    </button>
  )

  if (state.status === 'error') {
    return (
      <div>
        <div className="card bad">
          <h3>Review failed</h3>
          <p className="small-text">{state.error}</p>
        </div>
        {startButton}
      </div>
    )
  }

  if (!state.result || !matchesCurrentGame) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>Game review</h3>
        <p className="small-text muted">
          The engine looks at every position of the game at depth {REVIEW_DEPTH}, rates each move, and shows you where the
          game turned. {state.result && !matchesCurrentGame ? 'The game has changed since the last review.' : ''}
        </p>
        {game.moves.length === 0 ? <p className="small-text muted">Play or load a game first.</p> : startButton}
        <div style={{ marginTop: 14 }}>
          <ChessComImport onLoad={onLoadChessCom} disabled={!engineReady} />
        </div>
      </div>
    )
  }

  return (
    <ReviewResults
      result={state.result}
      game={game}
      onJump={onJump}
      onExport={onExport}
      onAddCards={onAddCards}
      startButton={startButton}
      preview={preview}
      onPreview={onPreview}
      onLoadChessCom={onLoadChessCom}
    />
  )
}

function ReviewResults({
  result,
  game,
  onJump,
  onExport,
  onAddCards,
  startButton,
  preview,
  onPreview,
  onLoadChessCom,
}: {
  result: ReviewResult
  game: GameState
  onJump: (ply: number) => void
  onExport: () => void
  onAddCards?: (result: ReviewResult) => void
  startButton: React.ReactNode
  preview: BoardPreview | null
  onPreview: (p: BoardPreview | null) => void
  onLoadChessCom: (url: string) => Promise<void>
}) {
  const problems = result.moves.filter((m) => isProblem(m.classification.cls))

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Game review</h3>
        {startButton}
      </div>

      <div className="section-title">Evaluation over the game (click to jump)</div>
      <EvalGraph evals={result.evals} ply={game.ply} onJump={onJump} />

      <CoachPanel result={result} game={game} onJump={onJump} preview={preview} onPreview={onPreview} />

      <div className="section-title">Moves to learn from</div>
      {problems.length === 0 ? (
        <p className="small-text muted">No inaccuracies, mistakes or blunders. Nice game!</p>
      ) : (
        <div className="lines">
          {problems.map((m) => {
            const { number, isWhite } = moveLabel(game.startFen, m.index)
            return (
              <div
                key={m.index}
                className="line"
                style={{ cursor: 'pointer' }}
                onClick={() => onJump(m.index + 1)}
                title="Jump to this position"
              >
                <span className={`score cls-${m.classification.cls}`}>{CLASS_SYMBOL[m.classification.cls]}</span>
                <span className="pv">
                  {number}.{isWhite ? '' : '..'} {m.san} <span className="muted">· {CLASS_LABEL[m.classification.cls]}</span>
                  {m.betterMove && <span className="muted">. Better: {m.betterMove}</span>}
                </span>
                <span className="depth">{formatScore(m.evalAfter)}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" onClick={onExport}>
          Export PGN with comments
        </button>
        {onAddCards && problems.length > 0 && (
          <button className="btn primary" onClick={() => onAddCards(result)}>
            Add {problems.length} mistake{problems.length === 1 ? '' : 's'} to review deck
          </button>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <ChessComImport onLoad={onLoadChessCom} />
      </div>
    </div>
  )
}

/** Clickable SVG graph of the evaluation across the game. */
export function EvalGraph({ evals, ply, onJump }: { evals: Score[]; ply: number; onJump: (ply: number) => void }) {
  const W = 400
  const H = 120
  const CAP = 500 // centipawns shown at the edge of the graph

  const points = useMemo(
    () =>
      evals.map((s, i) => {
        const cp = Math.max(-CAP, Math.min(CAP, scoreToCp(s)))
        const x = evals.length > 1 ? (i / (evals.length - 1)) * W : 0
        const y = H / 2 - (cp / CAP) * (H / 2)
        return { x, y }
      }),
    [evals],
  )
  if (points.length === 0) return null

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${path} L${W},${H / 2} L0,${H / 2} Z`
  const cx = points[Math.min(ply, points.length - 1)]?.x ?? 0

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    onJump(Math.round(ratio * (evals.length - 1)))
  }

  return (
    <svg className="eval-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={handleClick} role="img" aria-label="Evaluation graph">
      <rect x={0} y={0} width={W} height={H / 2} fill="#f0f0f0" opacity={0.12} />
      <path d={area} fill="#ffffff" opacity={0.75} />
      <path d={path} fill="none" stroke="#5b9cff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#5b9cff" strokeWidth={0.5} opacity={0.6} />
      <line x1={cx} x2={cx} y1={0} y2={H} stroke="#ef6b6b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
