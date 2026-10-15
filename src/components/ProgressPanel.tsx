import { useMemo } from 'react'
import type { PuzzleStats } from '../hooks/usePuzzles'
import type { DrillStats } from '../hooks/useTrainer'
import { CLASS_LABEL, CLASS_SYMBOL, MOVE_CLASSES } from '../lib/analysis/classify'
import { loadHistory, type GameRecord } from '../lib/progress/history'
import { PUZZLE_SETS } from '../lib/puzzles/puzzles'
import { openings } from '../openings'

export interface ProgressPanelProps {
  puzzleStats: PuzzleStats
  drillStats: Record<string, DrillStats>
  srsDue: number
  srsTotal: number
  /** Bump to re-read the review history. */
  historyVersion: number
}

export function ProgressPanel({ puzzleStats, drillStats, srsDue, srsTotal, historyVersion }: ProgressPanelProps) {
  const history = useMemo(() => loadHistory().sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), [historyVersion])
  const avg = history.length ? Math.round(history.reduce((n, r) => n + r.accuracy, 0) / history.length) : 0
  const totals = useMemo(() => {
    const t = { w: Object.fromEntries(MOVE_CLASSES.map((c) => [c, 0])), b: Object.fromEntries(MOVE_CLASSES.map((c) => [c, 0])) } as Record<'w' | 'b', Record<string, number>>
    for (const r of history) {
      for (const c of MOVE_CLASSES) {
        t.w[c] += r.white.counts[c] ?? 0
        t.b[c] += r.black.counts[c] ?? 0
      }
    }
    return t
  }, [history])

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Your progress</h3>
      <p className="small-text muted">Everything here is stored only in this browser.</p>

      <div className="row" style={{ gap: 10, marginBottom: 12 }}>
        <Stat label="Games reviewed" value={String(history.length)} />
        <Stat label="Average accuracy" value={history.length ? `${avg}%` : '–'} />
        <Stat label="Review cards due" value={`${srsDue} / ${srsTotal}`} />
      </div>

      <div className="section-title">Accuracy per game (best, great or good moves)</div>
      {history.length === 0 ? (
        <p className="small-text muted">Review a game and it will appear here.</p>
      ) : (
        <AccuracyChart records={history} />
      )}

      {history.length > 0 && (
        <>
          <div className="section-title">All reviewed moves</div>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Move type</th>
                <th>White</th>
                <th>Black</th>
              </tr>
            </thead>
            <tbody>
              {MOVE_CLASSES.map((c) => (
                <tr key={c}>
                  <td>
                    <span className={`cls-${c}`}>{CLASS_SYMBOL[c]}</span> {CLASS_LABEL[c]}
                  </td>
                  <td>{totals.w[c]}</td>
                  <td>{totals.b[c]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="section-title">Puzzles by motif</div>
      <table className="summary-table">
        <thead>
          <tr>
            <th>Set</th>
            <th>Clean</th>
            <th>Assisted</th>
            <th>Failed</th>
            <th>Streak</th>
            <th>Best</th>
          </tr>
        </thead>
        <tbody>
          {PUZZLE_SETS.map((s) => {
            const st = puzzleStats[s.id]
            return (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td>{st?.clean ?? 0}</td>
                <td>{st?.assisted ?? 0}</td>
                <td>{st?.failed ?? 0}</td>
                <td>{st?.streak ?? 0}</td>
                <td>{st?.bestStreak ?? 0}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="section-title">Opening drills</div>
      {Object.keys(drillStats).length === 0 ? (
        <p className="small-text muted">No drills yet. Open the Openings tab, pick an opening and choose Drill.</p>
      ) : (
        <table className="summary-table">
          <thead>
            <tr>
              <th>Opening</th>
              <th>Correct</th>
              <th>Tries</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {openings
              .filter((o) => drillStats[o.id]?.attempts)
              .map((o) => {
                const s = drillStats[o.id]
                return (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td>{s.correct}</td>
                    <td>{s.attempts}</td>
                    <td>{Math.round((100 * s.correct) / s.attempts)}%</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ flex: 1, margin: 0, textAlign: 'center', padding: '10px 8px' }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      <div className="small-text muted">{label}</div>
    </div>
  )
}

/** Simple SVG line chart of accuracy over reviewed games. */
function AccuracyChart({ records }: { records: GameRecord[] }) {
  const W = 400
  const H = 140
  const PAD = 24
  const n = records.length
  const x = (i: number) => (n === 1 ? W / 2 : PAD + (i / (n - 1)) * (W - 2 * PAD))
  const y = (acc: number) => H - PAD - (acc / 100) * (H - 2 * PAD)
  const path = records.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(r.accuracy).toFixed(1)}`).join(' ')
  return (
    <svg className="eval-graph" viewBox={`0 0 ${W} ${H}`} style={{ height: 150 }} role="img" aria-label="Accuracy over time">
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} stroke="#3a4150" strokeWidth={0.5} />
          <text x={2} y={y(v) + 3} fontSize={8} fill="#9aa3b2">
            {v}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#5b9cff" strokeWidth={2} />
      {records.map((r, i) => (
        <circle key={r.id} cx={x(i)} cy={y(r.accuracy)} r={3} fill="#5b9cff">
          <title>
            {new Date(r.date).toLocaleDateString()}: {r.accuracy}% (White {r.white.accuracy}%, Black {r.black.accuracy}%)
          </title>
        </circle>
      ))}
    </svg>
  )
}
