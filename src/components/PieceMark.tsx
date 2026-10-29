import type { Rank } from '../lib/game/xp'
import { KnightMark } from './KnightMark'

/** A rank's piece, drawn inline so it takes the current colour. The knight is the one the quest track uses. */
export function PieceMark({ piece, size = 32 }: { piece: Rank['id']; size?: number }) {
  if (piece === 'knight') return <KnightMark size={size} />
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" fill="currentColor">
      <path d="M9 27h14v-2.2c0-1-.6-1.8-1.6-1.8H10.6c-1 0-1.6.8-1.6 1.8V27z" />
      {piece === 'pawn' && (
        <>
          <circle cx="16" cy="9.5" r="3.6" />
          <path d="M13.6 12.5h4.8l-.6 2.5h-3.6z" />
          <path d="M12.2 22.5c0-3.4 1.4-5.8 2.6-7.5h2.4c1.2 1.7 2.6 4.1 2.6 7.5z" />
        </>
      )}
      {piece === 'bishop' && (
        <>
          <circle cx="16" cy="5.6" r="1.6" />
          <path d="M16 7.4c3 2.2 4.8 5.2 4.8 8.2 0 2.2-1 3.6-2.4 4.4H13.6c-1.4-.8-2.4-2.2-2.4-4.4 0-3 1.8-6 4.8-8.2zm-.8 4.6v2.4h-2.4v1.6h2.4v2.4h1.6V16h2.4v-1.6h-2.4V12z" />
          <path d="M12.4 20.6h7.2l.8 1.9H11.6z" />
        </>
      )}
      {piece === 'rook' && (
        <>
          <path d="M10 5h3v2.6h2V5h2v2.6h2V5h3v5.2l-1.6 1.6v8.4l1.4 1.6H10.2l1.4-1.6v-8.4L10 10.2z" />
        </>
      )}
      {piece === 'queen' && (
        <>
          <circle cx="8.4" cy="8.6" r="1.6" />
          <circle cx="12.4" cy="6" r="1.6" />
          <circle cx="16" cy="5" r="1.6" />
          <circle cx="19.6" cy="6" r="1.6" />
          <circle cx="23.6" cy="8.6" r="1.6" />
          <path d="M9.2 10.6 11.4 17l1.6-9.2 3 8.6 3-8.6L20.6 17l2.2-6.4 .4 10.2H8.8z" />
        </>
      )}
      {piece === 'king' && (
        <>
          <path d="M15 3.5h2V6h2.4v2H17v2.6h-2V8h-2.4V6H15z" />
          <path d="M12 11.4h8l1.6 3.4v6H10.4v-6z" />
          <path d="M10.4 21.6h11.2v1.4H10.4z" />
        </>
      )}
    </svg>
  )
}
