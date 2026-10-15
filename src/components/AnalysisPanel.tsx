import type { ReactNode } from 'react'
import { useEngine } from '../hooks/useEngine'
import { useSettings } from '../hooks/useSettings'
import { uciLineToSan } from '../lib/chess/game'
import { formatScore } from '../lib/engine/uci'

export interface AnalysisPanelProps {
  fen: string
  /** Plays the given UCI moves on the board (clicking a move in a line). */
  onPlayLine: (uciMoves: string[]) => void
  /** Rendered above the engine lines (tips, hints, opening name). */
  children?: ReactNode
}

export function AnalysisPanel({ fen, onPlayLine, children }: AnalysisPanelProps) {
  const { settings, update } = useSettings()
  const { analysis, status, statusText } = useEngine()
  const sideToMove = fen.split(' ')[1] === 'b' ? 'Black' : 'White'

  return (
    <div>
      <div className="setting-row" style={{ paddingTop: 0 }}>
        <div>
          <div className="label">Show analysis</div>
          <div className="desc">Off by default so you think before you look.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.showAnalysis}
          aria-label="Show analysis"
          className={'switch' + (settings.showAnalysis ? ' on' : '')}
          onClick={() => update({ showAnalysis: !settings.showAnalysis })}
        />
      </div>

      {children}

      {settings.showAnalysis ? (
        <>
          <div className="section-title">Engine lines ({sideToMove} to move)</div>
          {status === 'error' && <div className="card bad">{statusText}</div>}
          {status === 'loading' && <div className="card">Loading Stockfish… the full build is about 100 MB, so the first load takes a moment.</div>}
          {status === 'ready' && (!analysis || analysis.lines.length === 0) && (
            <div className="card muted">Thinking…</div>
          )}
          {analysis && analysis.lines.length > 0 && (
            <div className="lines">
              {analysis.lines.map((line) => {
                const sans = uciLineToSan(fen, line.pv)
                const whiteBetter = line.score.type === 'mate' ? line.score.value > 0 : line.score.value >= 0
                return (
                  <div className="line" key={line.multipv}>
                    <span className={'score ' + (whiteBetter ? 'white' : 'black')}>{formatScore(line.score)}</span>
                    <span className="pv">
                      {sans.map((san, i) => (
                        <span
                          key={i}
                          className="san"
                          title="Click to play this line up to here"
                          onClick={() => onPlayLine(line.pv.slice(0, i + 1))}
                        >
                          {san}{' '}
                        </span>
                      ))}
                    </span>
                    <span className="depth">d{line.depth}</span>
                  </div>
                )
              })}
            </div>
          )}
          <p className="small-text muted" style={{ marginTop: 10 }}>
            Scores are from White's point of view: positive means White is better. M3 means mate in 3 moves. Click a
            move in a line to play it on the board.
          </p>
        </>
      ) : (
        <div className="card">
          <h3>Analysis is hidden</h3>
          <p className="small-text muted">
            Work out your own move first. The engine keeps running in the background so blunder alerts and hints still
            work. Flip the switch above whenever you want to see what it thinks.
          </p>
        </div>
      )}

      <p className="small-text muted" style={{ marginTop: 14 }}>
        {statusText}
      </p>
    </div>
  )
}
