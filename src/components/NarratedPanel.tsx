import { useState } from 'react'
import { ChartLine, Play, SkipForward, X } from 'lucide-react'
import type { RouteId } from '../app/routes'
import type { NarratedApi } from '../hooks/useNarrated'
import { VOICE_LABEL, type Voice } from '../lib/modes/narrated'
import { PLAY_LEVELS } from '../lib/play/levels'

export interface NarratedPanelProps {
  narrated: NarratedApi
  voice: Voice
  engineReady: boolean
  /** Reviews the finished game on the free board. */
  onReview: () => void
  onNavigate: (id: RouteId) => void
}

export function NarratedPanel({ narrated, voice, engineReady, onReview, onNavigate }: NarratedPanelProps) {
  if (!narrated.active) return <Setup narrated={narrated} voice={voice} engineReady={engineReady} onNavigate={onNavigate} />
  return <Game narrated={narrated} onReview={onReview} />
}

function Setup({ narrated, voice, engineReady, onNavigate }: Omit<NarratedPanelProps, 'onReview'>) {
  const [side, setSide] = useState<'w' | 'b'>('w')
  const [levelId, setLevelId] = useState(3)
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Narrated game</h3>
      <p className="muted small-text">
        The coach plays a whole game against the computer and says what it is thinking after every move. From move 3, before
        each of its moves, you play the move you expect. The coach tells you how close you were, then explains its choice.
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <label className="label" htmlFor="narrated-side">
          Coach plays
        </label>
        <select id="narrated-side" value={side} onChange={(e) => setSide(e.target.value as 'w' | 'b')}>
          <option value="w">White</option>
          <option value="b">Black</option>
        </select>
        <label className="label" htmlFor="narrated-level">
          Against
        </label>
        <select id="narrated-level" value={levelId} onChange={(e) => setLevelId(Number(e.target.value))}>
          {PLAY_LEVELS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <p className="faint small-text" style={{ marginTop: 8 }}>
        Voice: {VOICE_LABEL[voice]}.{' '}
        <button className="btn small ghost" onClick={() => onNavigate('settings')}>
          Change in Settings
        </button>
      </p>
      <button className="btn primary" style={{ marginTop: 6 }} onClick={() => narrated.start(side, levelId)} disabled={!engineReady}>
        <Play /> {engineReady ? 'Start the game' : 'Engine loading'}
      </button>
    </div>
  )
}

function Game({ narrated, onReview }: { narrated: NarratedApi; onReview: () => void }) {
  const { stage, stats, log } = narrated
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>Narrated game</h3>
        <span className="faint small-text tabular" title="Predictions that matched the coach's move, and ones close to it">
          {stats.asked ? `${stats.exact} exact, ${stats.close} close, of ${stats.asked}` : 'No predictions yet'}
        </span>
      </div>
      {stage === 'predict' && (
        <div className="card info" style={{ marginTop: 10 }}>
          <h3>Your prediction</h3>
          <p>Play the move you expect the coach to make. The board does not change until the coach has chosen.</p>
          <button className="btn small ghost" onClick={narrated.skipPrediction}>
            <SkipForward /> Skip this one
          </button>
        </div>
      )}
      {stage === 'done' && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn small primary" onClick={onReview}>
            <ChartLine /> Review this game
          </button>
        </div>
      )}
      {narrated.error && <p className="error-text">{narrated.error}</p>}
      <ol className="narration" aria-live="polite">
        {log.map((e, i) => (
          <li key={`${e.ply}-${e.who}-${i}`} className={`narration-entry ${e.who}`}>
            <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
              <strong className={e.who === 'coach' ? 'mono' : undefined}>{e.narration.title}</strong>
              <span className="faint small-text">{e.who === 'coach' ? 'Coach' : e.who === 'opponent' ? 'Computer' : ''}</span>
            </div>
            {e.narration.lines.map((l, j) => (
              <p key={j} className="small-text" style={{ margin: '4px 0 0' }}>
                {l}
              </p>
            ))}
          </li>
        ))}
      </ol>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn small ghost" onClick={narrated.exit}>
          <X /> {stage === 'done' ? 'Close' : 'Stop the game'}
        </button>
      </div>
    </div>
  )
}
