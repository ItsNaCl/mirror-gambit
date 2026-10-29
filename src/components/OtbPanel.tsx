import { ChartLine, Save, Trash2 } from 'lucide-react'
import type { OtbApi } from '../hooks/useOtb'
import type { LibraryGame } from '../lib/games/sources'

export interface OtbPanelProps {
  otb: OtbApi
  engineReady: boolean
  /** Reviews the entered game on the free board without keeping it. */
  onReview: (game: LibraryGame) => void
  /** Keeps the game with My games and reviews it. */
  onSave: (game: LibraryGame) => void
}

export function OtbPanel({ otb, engineReady, onReview, onSave }: OtbPanelProps) {
  const { parsed, details } = otb
  const plies = parsed.sans.length
  const toMove = parsed.state.moves.length % 2 === 0 ? 'White' : 'Black'
  const ready = plies >= 2 && parsed.error === null
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Enter a game</h3>
      <p className="muted small-text">
        Type the moves from your scoresheet, or play them on the board. Each move is checked as you go. Then review the game,
        or keep it with My games so the coach learns from it too.
      </p>
      <textarea
        value={otb.text}
        onChange={(e) => otb.setMoves(e.target.value)}
        placeholder="1. e4 e5 2. Nf3 Nc6 3. Bc4"
        aria-label="Moves"
        rows={5}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{ width: '100%', fontFamily: 'var(--mono)' }}
      />
      {parsed.error ? (
        <p className="error-text" style={{ marginTop: 6 }}>
          {parsed.error.message}
        </p>
      ) : (
        <p className="faint small-text" style={{ marginTop: 6 }}>
          {plies ? `${plies} ${plies === 1 ? 'move' : 'moves'} read, ${toMove} to move.` : 'Nothing entered yet. The board shows where the moves have got to.'}
        </p>
      )}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <label className="label" htmlFor="otb-color">
          You played
        </label>
        <select id="otb-color" value={details.userColor} onChange={(e) => otb.update({ userColor: e.target.value as 'w' | 'b' })}>
          <option value="w">White</option>
          <option value="b">Black</option>
        </select>
        <label className="label" htmlFor="otb-result">
          Result
        </label>
        <select id="otb-result" value={details.result} onChange={(e) => otb.update({ result: e.target.value as '1-0' | '0-1' | '1/2-1/2' })}>
          <option value="1-0">White won</option>
          <option value="0-1">Black won</option>
          <option value="1/2-1/2">Draw</option>
        </select>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <input value={details.opponent} onChange={(e) => otb.update({ opponent: e.target.value })} placeholder="Opponent" aria-label="Opponent" style={{ flex: 1, minWidth: 140 }} />
        <input type="date" value={details.date} onChange={(e) => otb.update({ date: e.target.value || details.date })} aria-label="Date played" />
      </div>

      <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={() => onSave(otb.toLibraryGame())} disabled={!ready || !engineReady} title={ready ? '' : 'Enter at least one move for each side first'}>
          <Save /> Keep and review
        </button>
        <button className="btn" onClick={() => onReview(otb.toLibraryGame())} disabled={!ready || !engineReady}>
          <ChartLine /> Review only
        </button>
        <span className="spacer" />
        <button className="btn ghost" onClick={otb.reset} disabled={!otb.text && !details.opponent} aria-label="Clear the game">
          <Trash2 /> Clear
        </button>
      </div>
    </div>
  )
}
