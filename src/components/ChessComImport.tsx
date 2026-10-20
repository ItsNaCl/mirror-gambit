import { useState } from 'react'
import { cleanError } from '../lib/desktop'
import { parseChessComUrl } from '../lib/import/chesscom'

/** "Paste a chess.com link" box in the Review tab. */
export function ChessComImport({ onLoad, disabled }: { onLoad: (url: string) => Promise<void>; disabled?: boolean }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = parseChessComUrl(url) !== null

  async function load() {
    setBusy(true)
    setError(null)
    try {
      await onLoad(url)
      setUrl('')
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>Review a chess.com game</h3>
      <p className="small-text muted">Paste the link of a game or its review, for example https://www.chess.com/game/live/123456789.</p>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid && !busy) void load()
          }}
          placeholder="https://www.chess.com/game/live/…"
          style={{ flex: 1, minWidth: 0 }}
          aria-label="chess.com game link"
        />
        <button className="btn primary" onClick={() => void load()} disabled={!valid || busy || disabled}>
          {busy ? 'Loading…' : 'Load and review'}
        </button>
      </div>
      {url.trim() && !valid && <div className="small-text muted" style={{ marginTop: 6 }}>That does not look like a chess.com game link.</div>}
      {error && <div className="error-text">{error}</div>}
    </div>
  )
}
