import type { AttemptApi } from '../hooks/useAttempt'
import { MAX_HINT_LEVEL } from '../lib/practice/practice'

const NEXT_HINT_LABEL = ['Hint: theme', 'Hint: which piece', 'Hint: which square', 'Hint: show the move', 'All hints shown']

export interface HintBarProps {
  attempt: AttemptApi
  /** Text for the current hint level (null when no hint is shown). */
  hintText: string | null
  onGiveUp: () => void
  giveUpLabel?: string
}

/** Attempt counter, Hint button (one level deeper per click) and Give up. Hints never appear unless clicked. */
export function HintBar({ attempt, hintText, onGiveUp, giveUpLabel = 'Give up' }: HintBarProps) {
  const { wrongThisMove, hintLevel, pulse, hint } = attempt
  return (
    <div>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="small-text muted" title="Wrong tries on the move you are looking for now">
          Attempts on this move: {wrongThisMove}
        </span>
        <span className="spacer" style={{ flex: 1 }} />
        <button
          className={'btn small' + (pulse ? ' pulse' : '')}
          onClick={hint}
          disabled={hintLevel >= MAX_HINT_LEVEL}
          title={pulse ? 'A hint is available if you want one' : 'Each click shows a little more'}
        >
          💡 {NEXT_HINT_LABEL[hintLevel]}
        </button>
        <button className="btn small" onClick={onGiveUp} title="Show the solution move by move. Counts as failed.">
          {giveUpLabel}
        </button>
      </div>
      {hintText && (
        <div className="hint-box small-text">
          <strong>Hint {hintLevel}/4:</strong> {hintText}
        </div>
      )}
    </div>
  )
}
