import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Chessboard, defaultPieces, type Arrow } from 'react-chessboard'
import type { Square } from 'chess.js'
import {
  checkedKingSquare,
  isLegalMove,
  legalMovesFrom,
  needsPromotion,
  turnOf,
  type PromotionPiece,
} from '../lib/chess/game'

export interface BoardProps {
  fen: string
  orientation: 'white' | 'black'
  /** When false the pieces cannot be moved (e.g. while viewing an older position). */
  interactive: boolean
  showLegalDots: boolean
  lastMove?: { from: string; to: string } | null
  arrows?: Arrow[]
  extraSquareStyles?: Record<string, CSSProperties>
  /** Increment to play a short "shake" animation (used when a drill move is wrong). */
  shakeKey?: number
  /** Return true if the move was accepted. */
  onMove: (from: Square, to: Square, promotion?: PromotionPiece) => boolean
}

const LAST_MOVE_STYLE: CSSProperties = { background: 'rgba(255, 213, 0, 0.35)' }
const SELECTED_STYLE: CSSProperties = { background: 'rgba(91, 156, 255, 0.55)' }
const CHECK_STYLE: CSSProperties = {
  background: 'radial-gradient(circle, rgba(239, 60, 60, 0.9) 0%, rgba(239, 60, 60, 0.55) 45%, transparent 72%)',
}
const DOT_STYLE: CSSProperties = {
  background: 'radial-gradient(circle, rgba(20, 20, 20, 0.35) 23%, transparent 25%)',
}
const CAPTURE_STYLE: CSSProperties = {
  background: 'radial-gradient(circle, transparent 60%, rgba(20, 20, 20, 0.35) 62%, rgba(20, 20, 20, 0.35) 76%, transparent 78%)',
}

export function Board({
  fen,
  orientation,
  interactive,
  showLegalDots,
  lastMove,
  arrows,
  extraSquareStyles,
  shakeKey,
  onMove,
}: BoardProps) {
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [shaking, setShaking] = useState(false)
  const turn = turnOf(fen)

  useEffect(() => {
    setSelected(null)
    setPromotion(null)
  }, [fen, interactive])

  useEffect(() => {
    if (!shakeKey) return
    setShaking(true)
    const t = setTimeout(() => setShaking(false), 400)
    return () => clearTimeout(t)
  }, [shakeKey])

  const isOwnPiece = (pieceType: string | undefined | null) => !!pieceType && pieceType[0] === turn

  function tryMove(from: Square, to: Square): boolean {
    if (!interactive) return false
    if (!isLegalMove(fen, from, to)) return false
    if (needsPromotion(fen, from, to)) {
      setPromotion({ from, to })
      setSelected(null)
      return false
    }
    setSelected(null)
    return onMove(from, to)
  }

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {}
    if (lastMove) {
      styles[lastMove.from] = LAST_MOVE_STYLE
      styles[lastMove.to] = LAST_MOVE_STYLE
    }
    const check = checkedKingSquare(fen)
    if (check) styles[check] = CHECK_STYLE
    if (selected) {
      styles[selected] = SELECTED_STYLE
      if (showLegalDots) {
        for (const m of legalMovesFrom(fen, selected)) {
          styles[m.to] = m.isCapture() || m.isEnPassant() ? CAPTURE_STYLE : DOT_STYLE
        }
      }
    }
    return { ...styles, ...extraSquareStyles }
  }, [fen, lastMove, selected, showLegalDots, extraSquareStyles])

  const options = {
    id: 'main-board',
    position: fen,
    boardOrientation: orientation,
    squareStyles,
    arrows: arrows ?? [],
    allowDrawingArrows: true,
    showAnimations: true,
    animationDurationInMs: 180,
    allowDragging: interactive,
    darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
    lightSquareStyle: { backgroundColor: 'var(--board-light)' },
    boardStyle: { borderRadius: '6px', overflow: 'hidden', boxShadow: '0 6px 24px rgba(0,0,0,0.45)' },
    canDragPiece: ({ piece }: { piece: { pieceType: string } }) => interactive && isOwnPiece(piece.pieceType),
    onPieceDrag: ({ square }: { square: string | null }) => {
      if (square) setSelected(square as Square)
    },
    onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare) {
        setSelected(null)
        return false
      }
      return tryMove(sourceSquare as Square, targetSquare as Square)
    },
    onSquareClick: ({ square, piece }: { square: string; piece: { pieceType: string } | null }) => {
      if (!interactive) return
      const sq = square as Square
      if (selected) {
        if (sq === selected) {
          setSelected(null)
          return
        }
        if (isLegalMove(fen, selected, sq)) {
          tryMove(selected, sq)
          return
        }
      }
      setSelected(isOwnPiece(piece?.pieceType) ? sq : null)
    },
  }

  const promoPieces: PromotionPiece[] = ['q', 'r', 'b', 'n']

  return (
    <div className={'board-wrap' + (shaking ? ' shake' : '')}>
      <Chessboard options={options} />
      {promotion && (
        <div className="promotion-picker" role="dialog" aria-label="Choose promotion piece">
          {promoPieces.map((p) => {
            const render = defaultPieces[`${turn}${p.toUpperCase()}`]
            return (
              <button
                key={p}
                title={`Promote to ${p === 'q' ? 'queen' : p === 'r' ? 'rook' : p === 'b' ? 'bishop' : 'knight'}`}
                onClick={() => {
                  onMove(promotion.from, promotion.to, p)
                  setPromotion(null)
                }}
              >
                {render ? render() : p.toUpperCase()}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
