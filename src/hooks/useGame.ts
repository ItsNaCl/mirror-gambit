import { useCallback, useMemo, useState } from 'react'
import type { Square } from 'chess.js'
import {
  chessAt,
  currentFen,
  jumpTo,
  newGame,
  playMove,
  playSan,
  redo,
  undo,
  type GameState,
  type PromotionPiece,
} from '../lib/chess/game'
import { getGameOver } from '../lib/chess/gameOver'

export function useGame() {
  const [game, setGame] = useState<GameState>(() => newGame())
  const fen = currentFen(game)
  // chess.js instance with the full history up to the current ply (repetition rules need it).
  const chess = useMemo(() => chessAt(game), [game])
  const gameOver = useMemo(() => getGameOver(chess), [chess])

  const move = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      const next = playMove(game, from, to, promotion)
      if (!next) return false
      setGame(next)
      return true
    },
    [game],
  )

  const moveSan = useCallback(
    (san: string): boolean => {
      const next = playSan(game, san)
      if (!next) return false
      setGame(next)
      return true
    },
    [game],
  )

  // Increments whenever a brand new game starts (reset or load), so per-game state can be cleared.
  const [gameId, setGameId] = useState(1)

  const undoMove = useCallback(() => setGame((g) => undo(g)), [])
  const redoMove = useCallback(() => setGame((g) => redo(g)), [])
  const jump = useCallback((ply: number) => setGame((g) => jumpTo(g, ply)), [])
  const reset = useCallback((startFen?: string) => {
    setGame(newGame(startFen))
    setGameId((id) => id + 1)
  }, [])
  const load = useCallback((state: GameState) => {
    setGame(state)
    setGameId((id) => id + 1)
  }, [])

  return { game, gameId, fen, chess, gameOver, move, moveSan, undoMove, redoMove, jump, reset, load, setGame }
}

export type GameApi = ReturnType<typeof useGame>
