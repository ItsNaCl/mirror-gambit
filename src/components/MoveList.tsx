import { useEffect, useRef, type ReactNode } from 'react'
import { moveLabel, type GameState } from '../lib/chess/game'

export interface MoveListProps {
  game: GameState
  onJump: (ply: number) => void
  /** Optional marker rendered after move i (e.g. a classification symbol). */
  markerFor?: (moveIndex: number) => ReactNode
}

export function MoveList({ game, onJump, markerFor }: MoveListProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [game.ply])

  if (game.moves.length === 0) {
    return (
      <div className="movelist">
        <span className="empty">No moves yet. Play a move on the board, or load a PGN.</span>
      </div>
    )
  }

  const items: ReactNode[] = []
  game.moves.forEach((move, i) => {
    const { number, isWhite } = moveLabel(game.startFen, i)
    if (isWhite || i === 0) {
      items.push(
        <span key={`n${i}`} className="num">
          {number}.{isWhite ? '' : '..'}
        </span>,
      )
    }
    const ply = i + 1
    const active = ply === game.ply
    items.push(
      <button
        key={`m${i}`}
        ref={active ? activeRef : undefined}
        className={'move' + (active ? ' active' : '')}
        onClick={() => onJump(ply)}
        title={`Go to move ${number}${isWhite ? '' : '...'} ${move.san}`}
      >
        {move.san}
        {markerFor?.(i)}
      </button>,
    )
  })

  return <div className="movelist">{items}</div>
}
