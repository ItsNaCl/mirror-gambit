import { ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react'
import type { RouteId } from '../app/routes'
import type { WhyNotApi } from '../hooks/useWhyNot'
import { CLASS_LABEL } from '../lib/analysis/classify'
import { formatScore, scoreFor } from '../lib/engine/uci'
import { TAG_LABEL } from '../lib/games/profile'
import { verdict, type LineReport, type WhyNotItem } from '../lib/modes/whyNot'

export interface WhyNotPanelProps {
  whyNot: WhyNotApi
  /** Positions from the student's own games, newest first. */
  items: WhyNotItem[]
  engineReady: boolean
  onNavigate: (id: RouteId) => void
}

export function WhyNotPanel({ whyNot, items, engineReady, onNavigate }: WhyNotPanelProps) {
  if (!whyNot.active) return <Intro whyNot={whyNot} items={items} engineReady={engineReady} onNavigate={onNavigate} />
  return <Exercise whyNot={whyNot} />
}

function Intro({ whyNot, items, engineReady, onNavigate }: WhyNotPanelProps) {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Why not this move</h3>
      <p className="muted small-text">
        A position from one of your games, just before a move that cost you. Play the move you would choose now. The engine
        answers it on the board, you see what it allowed, and then the better move and its line sit next to yours. The
        point is the comparison, not the score.
      </p>
      {items.length ? (
        <>
          <p className="small-text">
            <span className="tabular">{items.length}</span> positions ready, newest games first.
          </p>
          <button className="btn primary" onClick={() => whyNot.start(items)} disabled={!engineReady}>
            {engineReady ? 'Start' : 'Engine loading'}
          </button>
        </>
      ) : (
        <>
          <p className="small-text">No positions yet. Import your games and run the review, and your own mistakes show up here.</p>
          <button className="btn" onClick={() => onNavigate('games')}>
            My games <ChevronRight />
          </button>
        </>
      )}
    </div>
  )
}

function Exercise({ whyNot }: { whyNot: WhyNotApi }) {
  const { item, stage, comparison, error, playback } = whyNot
  if (!item) return null
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>Why not this move</h3>
        <span className="faint small-text tabular">
          {whyNot.index + 1} of {whyNot.total}
        </span>
      </div>
      <p className="muted small-text" style={{ margin: '4px 0 10px' }}>
        {item.label}. Move {item.moveLabel}, {item.side === 'w' ? 'White' : 'Black'} to play.
      </p>

      {stage === 'asking' && (
        <div className="card info">
          <h3>Your move</h3>
          <p>Play the move you would choose here. Check first: what does the opponent threaten, and what can you take?</p>
          {error && <p className="error-text">{error}</p>}
        </div>
      )}
      {stage === 'thinking' && (
        <div className="card info">
          <h3>Checking your idea</h3>
          <p>The engine is looking at your move and at the position before it.</p>
        </div>
      )}
      {stage === 'compare' && comparison && (
        <>
          <p className="lead" style={{ margin: '0 0 10px' }}>
            {verdict(comparison)}
          </p>
          <div className="compare">
            <LineCard title="Your idea" report={comparison.tried} side={item.side} points={comparison.explanation?.points ?? []} active={playback?.which === 'tried'} />
            {comparison.best && <LineCard title="Better" report={comparison.best} side={item.side} points={comparison.best.lesson.insights.map((i) => i.text)} active={playback?.which === 'best'} good />}
          </div>
          {comparison.sameAsGame && item.tags.some((t) => t !== 'other') && (
            <p className="faint small-text" style={{ marginTop: 8 }}>
              The review filed this one under: {item.tags.filter((t) => t !== 'other').map((t) => TAG_LABEL[t].toLowerCase()).join(', ')}.
            </p>
          )}
          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            {playback?.playing ? (
              <button className="btn small" onClick={whyNot.pauseLine}>
                <Pause /> Pause
              </button>
            ) : (
              <button className="btn small" onClick={() => whyNot.playLine('tried')}>
                <Play /> Your line
              </button>
            )}
            {comparison.best && !playback?.playing && (
              <button className="btn small primary" onClick={() => whyNot.playLine('best')}>
                <Play /> Better line
              </button>
            )}
            <button className="btn small" onClick={whyNot.tryAgain}>
              <RotateCcw /> Try another move
            </button>
          </div>
        </>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn small ghost" onClick={whyNot.exit}>
          <X /> Stop
        </button>
        <span className="spacer" />
        <button className="btn small" onClick={whyNot.next}>
          {stage === 'compare' ? 'Next position' : 'Skip'} <ChevronRight />
        </button>
      </div>
    </div>
  )
}

interface LineCardProps {
  title: string
  report: LineReport
  side: 'w' | 'b'
  points: string[]
  active: boolean
  good?: boolean
}

function LineCard({ title, report, side, points, active, good }: LineCardProps) {
  // The score is shown from the student's side, so "+1.5" is always good news for them.
  const mine = formatScore(scoreFor(report.score, side))
  return (
    <section className={`compare-col${good ? ' good' : ''}${active ? ' active' : ''}`}>
      <div className="faint small-text">{title}</div>
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <span className="compare-move">{report.san}</span>
        <span className={`cls cls-${report.cls}`}>{CLASS_LABEL[report.cls]}</span>
        <span className="spacer" />
        <span className="tabular small-text">{mine}</span>
      </div>
      <div className="compare-line">{report.text}</div>
      {points.length > 0 && (
        <ul className="compare-points">
          {points.slice(0, 3).map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
