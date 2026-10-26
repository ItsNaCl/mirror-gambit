import { useMemo } from 'react'
import { describePosition, verdictFor } from '../lib/coach/explain'
import { analyzePosition } from '../lib/coach/features'
import type { Score } from '../lib/engine/uci'

/**
 * "What stands out": the few things a coach would point at in this position, read from the
 * board alone (loose pieces, pins, kings, pawns, outposts). It gives nothing of the engine
 * away, so it shows even while analysis is hidden; the verdict in words only shows with it.
 */
export function PositionNotes({ fen, score }: { fen: string; score: Score | null }) {
  const notes = useMemo(() => describePosition(analyzePosition(fen)), [fen])
  const verdict = score ? verdictFor(score) : null
  return (
    <section className="position-notes" aria-label="What stands out">
      <div className="panel-head" style={{ marginBottom: 6 }}>
        <h2>What stands out</h2>
        {verdict && <span className="verdict">{verdict.label}</span>}
      </div>
      {notes.length === 0 ? (
        <p className="muted">A quiet, balanced position. Improve your worst-placed piece.</p>
      ) : (
        <ul className="notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
