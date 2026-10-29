import { X } from 'lucide-react'
import { RANKS, type Rank } from '../lib/game/xp'
import { Confetti } from './Confetti'
import { KnightMark } from './KnightMark'

/** The new rank flare. Lives in the shell, so a rank reached on any screen is seen. */
export function LevelUp({ rank, onDismiss }: { rank: Rank | null; onDismiss: () => void }) {
  return (
    <>
      {rank && (
        <div className="level-up" role="status">
          <KnightMark />
          <div>
            <div className="faint small-text">New rank</div>
            <div className="rank-name">{rank.label}</div>
            <div className="muted small-text">
              Rank {RANKS.findIndex((r) => r.id === rank.id) + 1} of {RANKS.length}
            </div>
          </div>
          <button className="btn icon ghost" onClick={onDismiss} aria-label="Dismiss">
            <X />
          </button>
        </div>
      )}
      <Confetti fire={rank?.id ?? ''} />
    </>
  )
}
