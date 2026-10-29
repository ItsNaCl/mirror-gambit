import { Check, ChevronRight, Flame, Play, SkipForward } from 'lucide-react'
import type { RouteId } from '../app/routes'
import type { CoachApi } from '../hooks/useCoach'
import { ACTIVITY_LABEL, nextBand } from '../lib/coach/curriculum'
import { describeMetrics } from '../lib/coach/metrics'
import type { SessionBlock } from '../lib/coach/planner'

export interface CoachHomeProps {
  coach: CoachApi
  /** Opens the screen and starts the activity for a block. */
  onOpenBlock: (block: SessionBlock) => void
  onNavigate: (id: RouteId) => void
}

const BUDGETS = [20, 30, 45, 60]

export function CoachHome({ coach, onOpenBlock, onNavigate }: CoachHomeProps) {
  const { plan, metrics, active, current, done, streak, todayMinutes, exit } = coach
  const next = nextBand(plan.band)
  const metricLines = metrics ? describeMetrics(metrics) : []

  return (
    <div className="page">
      <p className="lead">{plan.notes[0]}</p>

      <div className="figures" role="list">
        <Figure label="Streak" value={String(streak)} unit={streak === 1 ? 'day' : 'days'} caption={streak ? 'Keep it going' : 'Starts with today'} icon={<Flame />} />
        <Figure label="Today" value={String(todayMinutes)} unit="min" caption={`Plan: ${plan.minutes} min`} />
        <Figure label="Band" value={plan.band.label} caption={next ? `Next: ${next.label.toLowerCase()}` : 'The top band'} small />
        <Figure label="Rating" value={metrics?.rating ? String(metrics.rating) : '–'} caption={metrics?.ratingClass ? `From your ${metrics.ratingClass} games` : 'Import games or set it in Settings'} />
      </div>

      <div className="page-grid">
        <section className="panel span-8 panel-body">
          <div className="row" style={{ alignItems: 'baseline' }}>
            <h2 style={{ margin: 0 }}>{done ? 'Done for today' : active ? 'Session in progress' : "Today's session"}</h2>
            <span className="spacer" />
            {!active && (
              <label className="faint small-text" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                Time today
                <select value={coach.budget ?? ''} onChange={(e) => coach.setBudget(e.target.value ? Number(e.target.value) : null)} aria-label="Minutes available today">
                  <option value="">Coach picks</option>
                  {BUDGETS.map((b) => (
                    <option key={b} value={b}>
                      {b} min
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <ol className="plan-list">
            {(active ? active.blocks : plan.blocks).map((b, i) => {
              const state = !active ? 'planned' : i < active.index ? 'done' : i === active.index ? 'current' : 'planned'
              return (
                <li key={`${b.activity}-${i}`} className={`plan-block ${state}`}>
                  <div className="plan-mark">{state === 'done' ? <Check /> : <span className="tabular">{i + 1}</span>}</div>
                  <div className="plan-text">
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{ACTIVITY_LABEL[b.activity]}</strong>
                      <span className="faint tabular">{b.minutes} min</span>
                      {state === 'done' && active && active.credited[i] > 0 && <span className="faint small-text">({active.credited[i]} done)</span>}
                    </div>
                    <p className="muted" style={{ margin: '4px 0 0' }}>
                      {b.reason}
                    </p>
                  </div>
                  <div className="plan-actions">
                    {state === 'current' && (
                      <>
                        <button className="btn small primary" onClick={() => onOpenBlock(b)}>
                          <Play /> Open
                        </button>
                        <button className="btn small" onClick={coach.complete}>
                          <Check /> Done
                        </button>
                        <button className="btn small ghost" onClick={coach.skip} aria-label="Skip this block">
                          <SkipForward />
                        </button>
                      </>
                    )}
                    {state === 'done' && active && (
                      <button className="btn small ghost" onClick={() => coach.goTo(i)}>
                        Redo
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="row" style={{ marginTop: 12 }}>
            {!active && (
              <button className="btn primary" onClick={coach.start}>
                <Play /> Start the session
              </button>
            )}
            {active && !done && current && (
              <span className="muted">
                Block {active.index + 1} of {active.blocks.length}. Press Done when you finish, and the minutes count towards the week.
              </span>
            )}
            {done && (
              <>
                <span className="muted">Every block done. See you tomorrow, or add something from the sidebar.</span>
                <span className="spacer" />
                <button className="btn small" onClick={coach.finish}>
                  Clear
                </button>
              </>
            )}
          </div>
        </section>

        <div className="span-4 stack">
          <section className="card info">
            <h3>Habit of the day</h3>
            <p>{plan.habit.text}</p>
            <p className="faint small-text">Say it before every move in today's game. Habits beat knowledge at this level.</p>
          </section>

          <section className="panel panel-body">
            <h2>What your games say</h2>
            {metricLines.length ? (
              metricLines.map((line, i) => <p key={i}>{line}</p>)
            ) : (
              <p className="muted">
                Nothing yet. Import your games and review them, and the coach reads them here.{' '}
                <button className="btn small" style={{ marginLeft: 8 }} onClick={() => onNavigate('games')}>
                  My games <ChevronRight />
                </button>
              </p>
            )}
            {plan.notes.slice(1).map((n, i) => (
              <p key={`n${i}`} className="muted">
                {n}
              </p>
            ))}
          </section>

          <section className="panel panel-body">
            <h2>Leaving this band</h2>
            <ul className="exit-list">
              {exit.map((e) => (
                <li key={e.id} className={e.met ? 'met' : ''}>
                  <span className="plan-mark">{e.met ? <Check /> : null}</span>
                  <span>
                    {e.label}: {e.direction === 'atLeast' ? 'at least' : 'at most'} <span className="tabular">{e.target}</span>
                    {e.value !== null && (
                      <span className="faint">
                        {' '}
                        (now <span className="tabular">{e.value}</span>)
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {Object.keys(plan.weekRemaining).length > 0 && (
              <p className="faint small-text" style={{ marginTop: 10 }}>
                Still owed this week after today:{' '}
                {Object.entries(plan.weekRemaining)
                  .map(([a, m]) => `${ACTIVITY_LABEL[a as keyof typeof ACTIVITY_LABEL].toLowerCase()} ${m} min`)
                  .join(', ')}
                .
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function Figure({ label, value, unit, caption, icon, small }: { label: string; value: string; unit?: string; caption: string; icon?: React.ReactNode; small?: boolean }) {
  return (
    <div className="figure" role="listitem">
      <div className="label">{label}</div>
      <div className="value" style={small ? { fontSize: 16, lineHeight: '28px' } : undefined}>
        {icon}
        {value}
        {unit && <small>{unit}</small>}
      </div>
      <div className="caption">{caption}</div>
    </div>
  )
}
