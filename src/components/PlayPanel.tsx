import { useState } from 'react'
import { Flag, RotateCcw, X } from 'lucide-react'
import type { PlayApi } from '../hooks/usePlay'
import { levelById, PLAY_LEVELS } from '../lib/play/levels'
import { outcomeFor, recordByLevel, type SavedGame } from '../lib/play/savedGames'

export interface PlayPanelProps {
  play: PlayApi
  engineReady: boolean
  /** Opens the review for the game on the board. */
  onReview: () => void
  /** Loads a saved game onto the board and reviews it. */
  onReviewSaved: (game: SavedGame) => void
}

const OUTCOME_TEXT = { win: 'Won', loss: 'Lost', draw: 'Draw' } as const

export function PlayPanel({ play, engineReady, onReview, onReviewSaved }: PlayPanelProps) {
  if (play.active) return <PlayInGame play={play} onReview={onReview} />
  return <PlaySetup play={play} engineReady={engineReady} onReviewSaved={onReviewSaved} />
}

function PlaySetup({ play, engineReady, onReviewSaved }: { play: PlayApi; engineReady: boolean; onReviewSaved: (g: SavedGame) => void }) {
  const [levelId, setLevelId] = useState(play.level.id)
  const [color, setColor] = useState<'w' | 'b' | 'random'>('w')
  const [coach, setCoach] = useState(play.liveCoach)
  const records = recordByLevel(play.savedGames)

  function begin() {
    const c = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color
    play.start(c, levelId, coach)
  }

  return (
    <div>
      <p className="small-text muted" style={{ marginTop: 0 }}>
        Play a full game against Stockfish. Pick a level that wins most of the time but not always. When the game ends you
        can review every move, and finished games are saved below so you can review them later.
      </p>

      <div className="section-title">Difficulty</div>
      <div className="opening-list">
        {PLAY_LEVELS.map((l) => {
          const r = records[l.id]
          return (
            <button key={l.id} className={'opening-item' + (levelId === l.id ? ' active' : '')} onClick={() => setLevelId(l.id)} aria-pressed={levelId === l.id}>
              <span className="name">
                {l.id}. {l.name}
              </span>
              <span className="rate">
                {l.blurb}
                {r ? ` · ${r.win}W ${r.loss}L ${r.draw}D` : ''}
              </span>
            </button>
          )
        })}
      </div>

      <div className="section-title">Your colour</div>
      <div className="row">
        {(['w', 'b', 'random'] as const).map((c) => (
          <button key={c} className={'btn small' + (color === c ? ' active' : '')} onClick={() => setColor(c)}>
            {c === 'random' ? 'Random' : <><span className={'side-chip ' + (c === 'w' ? 'white' : 'black')} /> {c === 'w' ? 'White' : 'Black'}</>}
          </button>
        ))}
      </div>

      <label className="toggle small-text" style={{ marginTop: 12 }} title="Slower: the engine checks each of your moves before replying">
        <input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} />
        Live coach: warn me right after an inaccuracy, mistake or blunder
      </label>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={begin} disabled={!engineReady} title={engineReady ? '' : 'Waiting for the engine'}>
          Start game
        </button>
        {!engineReady && <span className="small-text muted">Waiting for the engine…</span>}
      </div>

      <div className="section-title">Past games</div>
      {play.savedGames.length === 0 ? (
        <p className="small-text muted">Finished games will appear here.</p>
      ) : (
        <div className="saved-games">
          {play.savedGames.map((g) => {
            const outcome = outcomeFor(g.result, g.userColor)
            return (
              <div key={g.id} className="saved-game">
                <div>
                  <div>
                    <span className={`outcome outcome-${outcome}`}>{OUTCOME_TEXT[outcome]}</span> vs {levelById(g.levelId).name} as{' '}
                    {g.userColor === 'w' ? 'White' : 'Black'}
                  </div>
                  <div className="small-text muted">
                    {new Date(g.date).toLocaleString()} · {Math.ceil(g.moveCount / 2)} moves · {g.reason}
                  </div>
                </div>
                <span className="spacer" style={{ flex: 1 }} />
                <button className="btn small" onClick={() => onReviewSaved(g)} disabled={!engineReady}>
                  Review
                </button>
                <button className="btn small" onClick={() => play.deleteSaved(g.id)} title="Delete this game" aria-label="Delete this game">
                  <X />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PlayInGame({ play, onReview }: { play: PlayApi; onReview: () => void }) {
  const [confirmResign, setConfirmResign] = useState(false)
  const you = play.userColor === 'w' ? 'White' : 'Black'

  if (play.result) {
    const outcome = outcomeFor(play.result.result, play.userColor)
    return (
      <div>
        <div className={'card ' + (outcome === 'win' ? 'good' : outcome === 'loss' ? 'bad' : 'info')}>
          <h3>{play.result.title}</h3>
          <p className="small-text">{play.result.detail}</p>
          <p className="small-text muted">The game is saved under Past games.</p>
        </div>
        <div className="row">
          <button className="btn primary" onClick={onReview}>
            Review game
          </button>
          <button className="btn" onClick={() => play.start(play.userColor, play.level.id, play.liveCoach)}>
            Play again
          </button>
          <button className="btn" onClick={play.exit}>
            Change level
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="card info">
        <h3>
          You are {you} vs {play.level.name}
        </h3>
        <p className="small-text">
          {play.error
            ? `The engine had a problem: ${play.error}`
            : play.thinking
              ? 'The computer is thinking…'
              : play.userToMove
                ? 'Your move.'
                : 'Waiting for the computer…'}
        </p>
      </div>
      {play.coachAlert && (
        <div className={'card ' + (play.coachAlert.cls === 'blunder' ? 'bad' : 'warn')}>
          <h3>Coach</h3>
          <p className="small-text">{play.coachAlert.text}</p>
          <div className="row">
            <button className="btn small primary" onClick={play.takeBack} disabled={!play.canTakeBack}>
              <RotateCcw /> Take it back
            </button>
            <button className="btn small" onClick={play.dismissCoach}>
              Keep playing
            </button>
          </div>
        </div>
      )}
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={play.takeBack} disabled={!play.canTakeBack} title="Undo your last move and the computer's reply">
          <RotateCcw /> Take back
        </button>
        {confirmResign ? (
          <>
            <button className="btn danger" onClick={() => { play.resign(); setConfirmResign(false) }}>
              Yes, resign
            </button>
            <button className="btn" onClick={() => setConfirmResign(false)}>
              Keep playing
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => setConfirmResign(true)}>
            <Flag /> Resign
          </button>
        )}
      </div>
      <p className="small-text muted">
        {play.liveCoach
          ? 'The live coach checks each of your moves and warns you about mistakes. Analysis stays hidden.'
          : 'Blunder alerts and analysis are off during the game so you can think for yourself. Review the game afterwards to see every mistake.'}
      </p>
    </div>
  )
}
