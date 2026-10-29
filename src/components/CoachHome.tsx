import { useLayoutEffect, useRef } from 'react'
import { Award, Check, ChevronRight, Grid3x3, Play, SkipForward } from 'lucide-react'
import { Chessboard } from 'react-chessboard'
import type { RouteId } from '../app/routes'
import type { CoachApi } from '../hooks/useCoach'
import { useCountUp } from '../hooks/useCountUp'
import type { ProgressionApi } from '../hooks/useProgression'
import { ACTIVITY_LABEL, nextBand } from '../lib/coach/curriculum'
import { describeMetrics } from '../lib/coach/metrics'
import type { SessionBlock } from '../lib/coach/planner'
import { xpFor } from '../lib/game/xp'
import { Confetti } from './Confetti'
import { KnightMark } from './KnightMark'

export interface CoachHomeProps {
  coach: CoachApi
  progression: ProgressionApi
  /** Opens the screen and starts the activity for a block. */
  onOpenBlock: (block: SessionBlock) => void
  onNavigate: (id: RouteId) => void
  /** A game left on the free board, shown small so the student can pick it back up. */
  boardFen?: string
}

const BUDGETS = [20, 30, 45, 60]

function earnedDate(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : ` Earned ${new Date(t).toLocaleDateString()}.`
}

/** Today: the four numbers that matter, the session as a quest track, and the habit to carry into it. */
export function CoachHome({ coach, progression, onOpenBlock, onNavigate, boardFen }: CoachHomeProps) {
  const { plan, metrics, active, current, done, streak, todayMinutes, exit } = coach
  const { lastGain, badges } = progression
  const next = nextBand(plan.band)
  const rating = metrics?.rating ?? null
  const blocks = active ? active.blocks : plan.blocks
  const index = active ? active.index : -1

  return (
    <div className="page today">
      <div className="figures" role="list">
        <Figure label="Rating" value={rating} caption={metrics?.ratingClass ? `From your ${metrics.ratingClass} games` : 'Import games or set it in Settings'} />
        <Figure
          label="Hung per game"
          value={metrics?.hungPerGame ?? null}
          decimals={1}
          caption={metrics ? `Last ${metrics.games} games` : 'Needs reviewed games'}
          trend={metrics?.hungTrend ?? null}
        />
        <Figure label="Minutes today" value={todayMinutes} caption={`Plan ${plan.minutes} min. ${streak ? `Streak ${streak} ${streak === 1 ? 'day' : 'days'}, keep it going.` : 'The streak starts with today.'}`} />
        <Figure label="XP today" value={progression.xpToday} caption={`${progression.rank.label}, ${progression.xp} XP in all`} reward pop={lastGain?.xp ?? null} popKey={lastGain?.seq ?? 0} />
      </div>

      <div className="page-grid">
        <section className="panel span-8 panel-body quests">
          <div className="row" style={{ alignItems: 'baseline' }}>
            <h2 style={{ margin: 0 }}>{done ? 'Done for today' : active ? 'Session in progress' : "Today's quests"}</h2>
            <span className="spacer" />
            {!active && (
              <label className="faint small-text" style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
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
          <p className="lead" style={{ margin: '8px 0 0' }}>
            {plan.notes[0]}
          </p>

          <QuestRail blocks={blocks} index={index} done={!!done} credited={active?.credited ?? []} onOpen={onOpenBlock} coach={coach} />

          <div className="row" style={{ marginTop: 14 }}>
            {!active && (
              <button className="btn primary" onClick={coach.start}>
                <Play /> Start the session
              </button>
            )}
            {active && !done && current && (
              <span className="muted">
                Quest {active.index + 1} of {active.blocks.length}. Press Done when you finish, and the minutes count towards the week.
              </span>
            )}
            {done && (
              <>
                <span className="muted">Every quest done. See you tomorrow, or add something from the sidebar.</span>
                <span className="spacer" />
                <button className="btn small" onClick={coach.finish}>
                  Clear
                </button>
              </>
            )}
          </div>

          {(metrics || plan.notes.length > 1) && (
            <div className="quests-notes">
              {(metrics ? describeMetrics(metrics) : []).concat(plan.notes.slice(1)).map((line, i) => (
                <p key={i} className="muted">
                  {line}
                </p>
              ))}
            </div>
          )}
          {!metrics && (
            <p className="muted" style={{ marginTop: 12 }}>
              The coach has not seen your games yet. Import and review them, and the plan sharpens.{' '}
              <button className="btn small" style={{ marginLeft: 8 }} onClick={() => onNavigate('games')}>
                My games <ChevronRight />
              </button>
            </p>
          )}
        </section>

        <div className="span-4 stack">
          <section className="card accent habit">
            <h3>Habit of the day</h3>
            <p>{plan.habit.text}</p>
            <p className="faint small-text">Say it before every move in today's game. Habits beat knowledge at this level.</p>
          </section>

          {boardFen && (
            <section className="panel panel-body board-peek">
              <div className="board-peek-board" aria-hidden="true">
                <Chessboard
                  options={{
                    id: 'today-board',
                    position: boardFen,
                    allowDragging: false,
                    showNotation: false,
                    showAnimations: false,
                    darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
                    lightSquareStyle: { backgroundColor: 'var(--board-light)' },
                    boardStyle: { borderRadius: '6px', overflow: 'hidden' },
                  }}
                />
              </div>
              <button className="btn small" onClick={() => onNavigate('board')}>
                <Grid3x3 /> Back to the board
              </button>
            </section>
          )}

          <section className="panel panel-body">
            <h2>Badges</h2>
            {badges.length ? (
              <div className="chips">
                {badges.map((b) => (
                  <span key={b.id} className="chip" title={`${b.how}.${earnedDate(b.earnedAt)}`}>
                    <Award /> {b.label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">None yet. The first one comes with your first finished quest.</p>
            )}
          </section>

          <section className="panel panel-body">
            <h2>Leaving this band</h2>
            <p className="faint small-text" style={{ margin: '2px 0 8px' }}>
              {plan.band.label}
              {next ? `, then ${next.label.toLowerCase()}` : ', the top band'}
            </p>
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

      {/* Fires when the last quest completes. Clearing the day empties the key, which is quiet. */}
      <Confetti fire={done ? 'done' : ''} />
    </div>
  )
}

interface QuestRailProps {
  blocks: SessionBlock[]
  /** The current block, or -1 before the session starts. */
  index: number
  done: boolean
  credited: number[]
  onOpen: (block: SessionBlock) => void
  coach: CoachApi
}

/** The session's blocks as cards on a rail. The knight stands on the current one and hops to the next. */
function QuestRail({ blocks, index, done, credited, onOpen, coach }: QuestRailProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const knightRef = useRef<HTMLDivElement>(null)
  // The knight's place is measured from the cards, so it follows them whatever their height.
  const at = done ? blocks.length - 1 : Math.max(0, index)
  useLayoutEffect(() => {
    const list = listRef.current
    const place = () => {
      const card = list?.children[at] as HTMLElement | undefined
      if (card && knightRef.current) knightRef.current.style.transform = `translateY(${card.offsetTop + 6}px)`
    }
    place()
    if (!list || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(place)
    ro.observe(list)
    return () => ro.disconnect()
  }, [at, blocks])

  return (
    <div className="quest-track">
      {index >= 0 && (
        <div ref={knightRef} className={`quest-knight${done ? ' done' : ''}`} aria-hidden="true">
          <span className="quest-knight-hop" key={at}>
            <KnightMark />
          </span>
        </div>
      )}
      <ol className="quest-rail" ref={listRef}>
        {blocks.map((b, i) => {
          const state = index < 0 ? 'planned' : i < index ? 'done' : i === index ? 'current' : 'planned'
          // A done quest shows what it paid: the minutes credited, or nothing when it was skipped.
          const earned = state === 'done' ? (credited[i] > 0 ? xpFor({ type: 'block', minutes: credited[i] }) : 0) : null
          return (
            <li key={`${b.activity}-${i}`} className={`quest ${state}`}>
              <div className="quest-text">
                <div className="row" style={{ gap: 8 }}>
                  <strong className="quest-title">{ACTIVITY_LABEL[b.activity]}</strong>
                  <span className="faint tabular">{b.minutes} min</span>
                  {state === 'done' && credited[i] > 0 && <span className="faint small-text">({credited[i]} done)</span>}
                </div>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  {b.reason}
                </p>
              </div>
              <div className="quest-side">
                {earned === null ? (
                  <span className="quest-xp">+{xpFor({ type: 'block', minutes: b.minutes })} XP</span>
                ) : earned > 0 ? (
                  <span className="quest-xp earned">+{earned} XP</span>
                ) : (
                  <span className="faint small-text">Skipped</span>
                )}
                <div className="plan-actions">
                  {state === 'current' && (
                    <>
                      <button className="btn small primary" onClick={() => onOpen(b)}>
                        <Play /> Open
                      </button>
                      <button className="btn small" onClick={coach.complete}>
                        <Check /> Done
                      </button>
                      <button className="btn small ghost" onClick={coach.skip} aria-label="Skip this quest">
                        <SkipForward />
                      </button>
                    </>
                  )}
                  {state === 'done' && (
                    <button className="btn small ghost" onClick={() => coach.goTo(i)}>
                      Redo
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

interface FigureProps {
  label: string
  value: number | null
  decimals?: number
  caption: string
  /** Change against the earlier games: below zero is better for a mistake count. */
  trend?: number | null
  /** XP: the reward colour. */
  reward?: boolean
  /** A gain to flash beside the number. */
  pop?: number | null
  popKey?: number
}

function Figure({ label, value, decimals = 0, caption, trend, reward, pop, popKey }: FigureProps) {
  const scale = 10 ** decimals
  const shown = useCountUp(value === null ? 0 : Math.round(value * scale)) / scale
  return (
    <div className={`figure${reward ? ' reward' : ''}`} role="listitem">
      <div className="label">{label}</div>
      <div className="value">
        {value === null ? '–' : shown.toFixed(decimals)}
        {trend !== null && trend !== undefined && trend !== 0 && (
          <span className={`trend ${trend < 0 ? 'down' : 'up'}`} title="Against the games before these">
            {trend < 0 ? '' : '+'}
            {trend.toFixed(decimals)}
          </span>
        )}
        {pop ? (
          <span className="xp-pop" key={popKey}>
            +{pop}
          </span>
        ) : null}
      </div>
      <div className="caption">{caption}</div>
    </div>
  )
}
