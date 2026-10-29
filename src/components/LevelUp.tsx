import { X } from 'lucide-react'
import { rankPlace, RANKS, type Rank } from '../lib/game/xp'
import { Confetti } from './Confetti'
import { PieceMark } from './PieceMark'

/** The new rank flare. Lives in the shell, so a rank reached on any screen is seen. */
export function LevelUp({ rank, onDismiss }: { rank: Rank | null; onDismiss: () => void }) {
  return (
    <>
      {rank && (
        <div className="level-up" role="status">
          <PieceMark piece={rank.id} />
          <div>
            <div className="faint small-text">New rank</div>
            <div className="rank-name">{rank.label}</div>
            <div className="muted small-text">
              Rank {rankPlace(rank)} of {RANKS.length}
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
