import type { TipsState } from '../hooks/useTips'
import { useSettings } from '../hooks/useSettings'
import { CLASS_LABEL, isProblem } from '../lib/analysis/classify'

export interface TipsSectionProps {
  tips: TipsState
  gameOver: boolean
  /** Undo the move the last alert was about. */
  onTakeBack: (moveIndex: number) => void
  /** Save the position before the alerted move as a review card. */
  onSaveCard?: (moveIndex: number) => void
}

export function TipsSection({ tips, gameOver, onTakeBack, onSaveCard }: TipsSectionProps) {
  const { settings } = useSettings()
  const { opening, alert, principle, hint, hintLevel, requestHint, checkingMove } = tips
  const problem = alert ? isProblem(alert.classification.cls) : false
  const cardKind = !alert ? '' : alert.classification.cls === 'blunder' ? 'bad' : problem ? 'warn' : 'good'

  return (
    <div style={{ marginTop: 12 }}>
      {settings.openingDetection && opening && (
        <div className="card info">
          <h3>
            {opening.name} <span className="muted small-text">· {opening.eco}</span>
          </h3>
        </div>
      )}

      {settings.blunderAlerts && alert && (
        <div className={`card ${cardKind}`}>
          <h3>
            {CLASS_LABEL[alert.classification.cls]}: {alert.san}
          </h3>
          <p className={'small-text' + (problem ? '' : ' muted')}>{alert.text || 'That was the engine’s top choice.'}</p>
          {problem && (
            <div className="row" style={{ marginTop: 6 }}>
              {alert.classification.cls === 'blunder' && (
                <button className="btn small primary" onClick={() => onTakeBack(alert.moveIndex)}>
                  Take it back
                </button>
              )}
              {onSaveCard && (
                <button className="btn small" onClick={() => onSaveCard(alert.moveIndex)} title="Add this position to your spaced-repetition review deck">
                  Save for review
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {settings.blunderAlerts && !alert && checkingMove && <p className="small-text muted">Checking your last move…</p>}

      {settings.principleReminders && principle && (
        <div className="card warn">
          <h3>{principle.title}</h3>
          <p className="small-text">{principle.body}</p>
        </div>
      )}

      {settings.hints && !gameOver && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Need a hint?</h3>
            <button className="btn small" onClick={requestHint} disabled={hintLevel >= 3 || hint?.kind === 'none'}>
              {hintLevel === 0 ? 'Hint' : hintLevel === 1 ? 'More' : hintLevel === 2 ? 'Show the move' : 'Hint'}
            </button>
          </div>
          {hintLevel > 0 && hint && (
            <div className="small-text" style={{ marginTop: 8 }}>
              {hint.kind === 'thinking' && <span className="muted">Still thinking, ask again in a moment…</span>}
              {hint.kind === 'none' && <span>{hint.text}</span>}
              {hint.kind === 'tactic' && hint.levels.slice(0, hintLevel).map((t, i) => <p key={i}>{t}</p>)}
            </div>
          )}
          {hintLevel === 0 && (
            <p className="small-text muted" style={{ margin: '6px 0 0' }}>
              Hints are only shown when you ask, in three steps, so nothing is spoiled.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
