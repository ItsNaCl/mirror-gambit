import { useState } from 'react'
import { ChevronRight, ExternalLink, RotateCcw, X } from 'lucide-react'
import type { GuessApi } from '../hooks/useGuess'
import { GRADE_LABEL, playerLine, type GuessGrade } from '../lib/modes/guessTheMove'

export interface GuessPanelProps {
  guess: GuessApi
  engineReady: boolean
}

const GRADE_CLASS: Record<GuessGrade, string> = { match: 'best', equal: 'great', close: 'good', off: 'inaccuracy', bad: 'mistake' }

export function GuessPanel({ guess, engineReady }: GuessPanelProps) {
  if (!guess.active) return <Intro guess={guess} engineReady={engineReady} />
  if (guess.stage === 'done') return <Done guess={guess} />
  return <Play guess={guess} />
}

function Intro({ guess, engineReady }: GuessPanelProps) {
  const [bucket, setBucket] = useState<string>('any')
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Guess the move</h3>
      <p className="muted small-text">
        A game by a strong player in one of your openings. From move 6 you play their side: find the move, then see the move
        they played and how the two compare. A different move that keeps the position is as good as theirs.
      </p>
      {guess.set && guess.set.games.length > 0 ? (
        <div className="import-row">
          <select value={bucket} onChange={(e) => setBucket(e.target.value)} aria-label="Opening" style={{ flex: 1 }}>
            <option value="any">Any opening</option>
            {guess.buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <button className="btn primary" onClick={() => void guess.start(bucket)} disabled={!engineReady || guess.stage === 'loading'}>
            {!engineReady ? 'Engine loading' : guess.stage === 'loading' ? 'Loading' : 'Start'}
          </button>
        </div>
      ) : guess.set ? (
        <p className="small-text">No model games are in this build.</p>
      ) : (
        <p className="small-text muted">Loading the games.</p>
      )}
      {guess.error && <p className="error-text">{guess.error}</p>}
      {guess.set && (
        <p className="faint small-text" style={{ marginTop: 10 }}>
          {guess.set.games.length} games from the {guess.set.source.split(',')[0]}. Each one was checked with Stockfish: the side you play never gave more than a pawn away.
        </p>
      )}
    </div>
  )
}

function Header({ guess }: { guess: GuessApi }) {
  const m = guess.model
  if (!m) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>Guess the move</h3>
        <span className="faint small-text tabular">
          {Math.min(guess.at, guess.total)} of {guess.total}
        </span>
      </div>
      <p className="muted small-text" style={{ margin: '4px 0 0' }}>
        {m.opening}. You play {m.side === 'w' ? 'White' : 'Black'}: {playerLine(m, m.side)} against {playerLine(m, m.side === 'w' ? 'b' : 'w')}, {m.timeControl.replace('+', ' + ')}, {m.date}.
      </p>
    </div>
  )
}

function Play({ guess }: { guess: GuessApi }) {
  const { stage, feedback, summary } = guess
  return (
    <div>
      <Header guess={guess} />
      {stage === 'guessing' && (
        <div className="card info">
          <h3>Move {guess.moveNumber}. Your move.</h3>
          <p>Play what you would play here. Look for checks, captures and threats first, then the plan.</p>
          {guess.error && <p className="error-text">{guess.error}</p>}
        </div>
      )}
      {stage === 'thinking' && (
        <div className="card info">
          <h3>Checking your move</h3>
          <p>The engine is comparing it with the move that was played.</p>
        </div>
      )}
      {stage === 'feedback' && feedback && (
        <div className={`card ${feedback.grade === 'match' || feedback.grade === 'equal' ? 'good' : feedback.grade === 'bad' ? 'bad' : 'warn'}`}>
          <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
            <h3 style={{ margin: 0 }}>{feedback.headline}</h3>
          </div>
          <p style={{ marginTop: 6 }}>
            <span className={`cls cls-${GRADE_CLASS[feedback.grade]}`}>{GRADE_LABEL[feedback.grade]}</span>{' '}
            <span className="faint small-text tabular">+{feedback.points}</span>
          </p>
          {feedback.reasons.map((r, i) => (
            <p key={i}>{r}</p>
          ))}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small primary" onClick={guess.next} autoFocus>
              {guess.at < guess.total ? 'Next move' : 'Finish'} <ChevronRight />
            </button>
          </div>
        </div>
      )}
      <p className="faint small-text" style={{ marginTop: 10 }}>
        Score so far: <span className="tabular">{summary.points}</span> of <span className="tabular">{summary.max}</span>
        {summary.guesses ? `, ${summary.matches} ${summary.matches === 1 ? 'move' : 'moves'} matched` : ''}.
      </p>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn small ghost" onClick={guess.exit}>
          <X /> Stop
        </button>
      </div>
    </div>
  )
}

function Done({ guess }: { guess: GuessApi }) {
  const { summary, model, grades } = guess
  return (
    <div>
      <Header guess={guess} />
      <div className="card good">
        <h3>
          {summary.percent}% of the master's play
        </h3>
        <p>
          <span className="tabular">{summary.points}</span> of <span className="tabular">{summary.max}</span> points over {summary.guesses} moves, {summary.matches} of them the move that was played.
        </p>
        <p className="faint small-text">
          {summary.percent >= 80 ? 'That is strong. Pick a harder opening or play the other side.' : summary.percent >= 55 ? 'Solid. The misses are the plans to study: step back through the game and look at them.' : 'Every miss here is a pattern to learn. Step back through the game and compare your idea with the move played.'}
        </p>
      </div>
      <div className="chips" aria-label="Grades per move">
        {grades.map((g, i) => (
          <span key={i} className={`cls cls-${GRADE_CLASS[g]}`} title={GRADE_LABEL[g]}>
            {GRADE_LABEL[g]}
          </span>
        ))}
      </div>
      <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn small primary" onClick={() => void guess.start(model?.bucket ?? 'any')}>
          <RotateCcw /> Another game
        </button>
        {model?.url && (
          <a className="btn small" href={model.url} target="_blank" rel="noreferrer">
            <ExternalLink /> On Lichess
          </a>
        )}
        <span className="spacer" />
        <button className="btn small ghost" onClick={guess.exit}>
          <X /> Close
        </button>
      </div>
    </div>
  )
}
