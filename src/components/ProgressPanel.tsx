import { useMemo } from 'react'
import type { RouteId } from '../app/routes'
import type { PuzzleStats } from '../hooks/usePuzzles'
import type { DrillStats } from '../hooks/useTrainer'
import { CLASS_LABEL, MOVE_CLASSES } from '../lib/analysis/classify'
import { solvedCount } from '../lib/practice/practice'
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
  onNavigate: (id: RouteId) => void
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)

/** One sentence on the trend: the last games against the first ones, each with its own count. */
export function accuracyTrend(history: GameRecord[]): string {
  if (history.length === 0) return 'Review a game and your accuracy starts showing here.'
  if (history.length < 4) {
    const n = history.length
    return `${mean(history.map((r) => r.accuracy))}% accuracy across your ${n} reviewed game${n === 1 ? '' : 's'}. Review a few more to see a trend.`
  }
  const k = Math.min(5, Math.floor(history.length / 2))
  const first = mean(history.slice(0, k).map((r) => r.accuracy))
  const last = mean(history.slice(-k).map((r) => r.accuracy))
  const diff = last - first
  const change = diff === 0 ? 'the same as' : `${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} points from`
  return `${last}% accuracy over your last ${k} games, ${change} your first ${k}.`
}

export function ProgressPanel({ puzzleStats, drillStats, srsDue, srsTotal, historyVersion, onNavigate }: ProgressPanelProps) {
  // historyVersion is the signal that the stored history changed.
  const history = useMemo(() => loadHistory().sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), [historyVersion])
  const avg = mean(history.map((r) => r.accuracy))
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

  const puzzleTotals = PUZZLE_SETS.reduce(
    (acc, s) => {
      const st = puzzleStats[s.id]
      if (st) {
        acc.solved += solvedCount(st)
        acc.clean += st.clean
        acc.failed += st.failed
      }
      return acc
    },
    { solved: 0, clean: 0, failed: 0 },
  )
  // Drilled openings first (most tries first), then the rest, capped to the height of the puzzles table.
  const drillRows = [...openings]
    .sort((a, b) => (drillStats[b.id]?.attempts ?? 0) - (drillStats[a.id]?.attempts ?? 0))
    .slice(0, PUZZLE_SETS.length)

  return (
    <div className="page">
      <p className="lead">{accuracyTrend(history)}</p>

      <div className="figures" role="list">
        <Figure label="Games reviewed" value={String(history.length)} caption={history.length ? 'Both sides count' : 'None yet'} />
        <Figure label="Average accuracy" value={history.length ? String(avg) : '–'} unit={history.length ? '%' : undefined} caption="Best, great or good moves" />
        <Figure
          label="Puzzles solved"
          value={String(puzzleTotals.solved)}
          caption={puzzleTotals.solved ? `${puzzleTotals.clean} clean, ${puzzleTotals.failed} given up` : 'None yet'}
        />
        <Figure label="Cards due" value={String(srsDue)} unit={`of ${srsTotal}`} caption={srsDue ? 'Ready to review' : 'Nothing due now'} />
      </div>

      <div className="page-grid">
        <section className="panel span-8 panel-body">
          <div className="panel-head">
            <h2>Accuracy per game</h2>
            {history.length > 0 && <span className="faint small-text">{history.length} games, oldest first</span>}
          </div>
          <AccuracyChart records={history} />
          {history.length === 0 && (
            <div className="row" style={{ marginTop: 12 }}>
              <span className="muted">Play a game on the board, then review it. Each review adds a point.</span>
              <span className="spacer" />
              <button className="btn small" onClick={() => onNavigate('board')}>
                Go to the board
              </button>
            </div>
          )}
        </section>

        <section className="panel span-4 panel-body">
          <div className="panel-head">
            <h2>All reviewed moves</h2>
          </div>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Grade</th>
                <th>White</th>
                <th>Black</th>
              </tr>
            </thead>
            <tbody>
              {MOVE_CLASSES.map((c) => (
                <tr key={c}>
                  <td>
                    <span className={`grade-dot cls-${c}`} aria-hidden="true" /> {CLASS_LABEL[c]}
                  </td>
                  <td className={totals.w[c] ? '' : 'zero'}>{totals.w[c]}</td>
                  <td className={totals.b[c] ? '' : 'zero'}>{totals.b[c]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel span-6 panel-body">
          <div className="panel-head">
            <h2>Puzzles by motif</h2>
            <button className="card-link" onClick={() => onNavigate('puzzles')}>
              Puzzles
            </button>
          </div>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Set</th>
                <th>Clean</th>
                <th>Assisted</th>
                <th>Given up</th>
                <th>Best streak</th>
              </tr>
            </thead>
            <tbody>
              {PUZZLE_SETS.map((s) => {
                const st = puzzleStats[s.id]
                return (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <Num v={st?.clean ?? 0} />
                    <Num v={st?.assisted ?? 0} />
                    <Num v={st?.failed ?? 0} />
                    <Num v={st?.bestStreak ?? 0} />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        <section className="panel span-6 panel-body">
          <div className="panel-head">
            <h2>Opening drills</h2>
            <button className="card-link" onClick={() => onNavigate('openings')}>
              Openings
            </button>
          </div>
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
                {drillRows.map((o) => {
                  const s = drillStats[o.id]
                  if (!s?.attempts)
                    return (
                      <tr key={o.id}>
                        <td>{o.name}</td>
                        <td className="zero">–</td>
                        <td className="zero">0</td>
                        <td className="zero">–</td>
                      </tr>
                    )
                  return (
                    <tr key={o.id}>
                      <td>{o.name}</td>
                      <Num v={s.correct} />
                      <Num v={s.attempts} />
                      <td>{Math.round((100 * s.correct) / s.attempts)}%</td>
                    </tr>
                  )
                })}
              </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}

function Num({ v }: { v: number }) {
  return <td className={v ? '' : 'zero'}>{v}</td>
}

function Figure({ label, value, unit, caption }: { label: string; value: string; unit?: string; caption: string }) {
  return (
    <div className="figure" role="listitem">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="caption">{caption}</div>
    </div>
  )
}

/** Accuracy per reviewed game: one line in the data hue, three faint gridlines. */
function AccuracyChart({ records }: { records: GameRecord[] }) {
  const W = 640
  const H = 220
  const L = 36
  const R = 12
  const T = 12
  const B = 24
  const n = records.length
  if (n === 0) {
    // The empty chart keeps its frame, so the panel reads as a chart waiting for data.
    return (
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="No reviewed games yet">
        {[0, 50, 100].map((v) => {
          const yy = T + (1 - v / 100) * (H - T - B)
          return (
            <g key={v}>
              <line x1={L} x2={W - R} y1={yy} y2={yy} stroke="var(--line)" strokeWidth={1} />
              <text x={L - 8} y={yy + 4} fontSize={11} fill="var(--faint)" textAnchor="end">
                {v}%
              </text>
            </g>
          )
        })}
        <text x={(L + W - R) / 2} y={T + (H - T - B) * 0.25 + 5} fontSize={13} fill="var(--muted)" textAnchor="middle">
          No reviewed games yet
        </text>
      </svg>
    )
  }
  const x = (i: number) => (n === 1 ? (L + W - R) / 2 : L + (i / (n - 1)) * (W - L - R))
  const y = (acc: number) => T + (1 - acc / 100) * (H - T - B)
  const path = records.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(r.accuracy).toFixed(1)}`).join(' ')
  const last = records[n - 1]
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Accuracy over ${n} reviewed games, latest ${last.accuracy}%`}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
          <text x={L - 8} y={y(v) + 4} fontSize={11} fill="var(--faint)" textAnchor="end">
            {v}%
          </text>
        </g>
      ))}
      <text x={L} y={H - 6} fontSize={11} fill="var(--faint)">
        {new Date(records[0].date).toLocaleDateString()}
      </text>
      {n > 1 && (
        <text x={W - R} y={H - 6} fontSize={11} fill="var(--faint)" textAnchor="end">
          {new Date(last.date).toLocaleDateString()}
        </text>
      )}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {records.map((r, i) => (
        <circle key={r.id} cx={x(i)} cy={y(r.accuracy)} r={i === n - 1 ? 4 : 2.5} fill="var(--accent)">
          <title>
            {new Date(r.date).toLocaleDateString()}: {r.accuracy}% (White {r.white.accuracy}%, Black {r.black.accuracy}%)
          </title>
        </circle>
      ))}
      <text x={x(n - 1)} y={y(last.accuracy) - 10} fontSize={12} fill="var(--text)" textAnchor={n === 1 ? 'middle' : 'end'}>
        {last.accuracy}%
      </text>
    </svg>
  )
}
