import { Award, Check, Lock } from 'lucide-react'
import type { ProgressionApi } from '../hooks/useProgression'
import { BADGES, rankPlace, RANKS } from '../lib/game/xp'
import { PieceMark } from './PieceMark'

export interface BadgesPanelProps {
  progression: ProgressionApi
  /** The training streak in days, for the streak badges' progress. */
  streak: number
}

function earnedDate(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 'Earned' : `Earned ${new Date(t).toLocaleDateString()}`
}

/** The rank ladder and every badge, earned or still to come. */
export function BadgesPanel({ progression, streak }: BadgesPanelProps) {
  const { rank, next, progress, xp, progression: p, badges } = progression
  const place = rankPlace(rank)
  const pct = Math.round(progress * 100)

  return (
    <div className="page badges-page">
      <section className="panel panel-body rank-hero">
        <span className="rank-hero-piece">
          <PieceMark piece={rank.id} size={56} />
        </span>
        <div className="rank-hero-text">
          <div className="faint small-text">Your rank</div>
          <div className="rank-hero-name">{rank.label}</div>
          <div className="muted">
            Rank {place} of {RANKS.length}. <span className="tabular">{xp}</span> XP in all.
          </div>
          <div className="rank-bar large" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress to the next rank">
            <span className="rank-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="faint small-text">
            {next ? (
              <>
                <span className="tabular">{next.xp - xp}</span> XP to {next.label}.
              </>
            ) : (
              'The top rank. Nothing above it but the rating.'
            )}
          </div>
        </div>
      </section>

      <div className="page-grid">
        <section className="panel panel-body span-4">
          <h2>The ladder</h2>
          <p className="faint small-text" style={{ margin: '2px 0 10px' }}>
            XP comes from finished quests, clean solves, cards, reviewed games and slow games.
          </p>
          <ol className="rank-ladder">
            {RANKS.map((r, i) => {
              const state = r.id === rank.id ? 'current' : xp >= r.xp ? 'reached' : 'ahead'
              return (
                <li key={r.id} className={`rank-step ${state}`} aria-current={state === 'current' ? 'true' : undefined}>
                  <span className="rank-step-piece">
                    <PieceMark piece={r.id} size={22} />
                  </span>
                  <span className="rank-step-name">{r.label}</span>
                  <span className="faint small-text tabular">{i === 0 ? 'Start' : `${r.xp} XP`}</span>
                  <span className="rank-step-mark">{state === 'reached' ? <Check /> : null}</span>
                </li>
              )
            })}
          </ol>
        </section>

        <section className="panel panel-body span-8">
          <div className="row" style={{ alignItems: 'baseline' }}>
            <h2 style={{ margin: 0 }}>Badges</h2>
            <span className="spacer" />
            <span className="faint small-text tabular">
              {badges.length} of {BADGES.length}
            </span>
          </div>
          <ul className="badge-grid">
            {BADGES.map((b) => {
              const at = p.badges[b.id]
              const prog = b.progress(p, streak)
              return (
                <li key={b.id} className={`badge-card${at ? ' earned' : ''}`}>
                  <span className="badge-icon">{at ? <Award /> : <Lock />}</span>
                  <div className="badge-text">
                    <strong>{b.label}</strong>
                    <div className="muted small-text">{b.how}.</div>
                    <div className="faint small-text">
                      {at ? (
                        earnedDate(at)
                      ) : prog.target > 1 ? (
                        <>
                          <span className="tabular">{Math.min(prog.value, prog.target)}</span> of <span className="tabular">{prog.target}</span>
                        </>
                      ) : (
                        'Not yet'
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
