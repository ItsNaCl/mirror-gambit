import { useCallback, useMemo, useState } from 'react'
import type { Square } from 'chess.js'
import { newGame, playMove, type PromotionPiece } from '../lib/chess/game'
import type { LibraryGame } from '../lib/games/sources'
import { otbGame, parseMoves, todayLocal, type OtbDetails } from '../lib/modes/otb'
import type { GameApi } from './useGame'

/**
 * Over the board entry. The moves are typed from the scoresheet, or played on the board, and
 * the two stay in step: the text is the source, the board shows where it has got to.
 */
export function useOtb(gameApi: GameApi) {
  const { setGame, game } = gameApi
  const [text, setText] = useState('')
  const [details, setDetails] = useState<OtbDetails>({ userColor: 'w', opponent: '', date: todayLocal(), result: '1-0' })
  const parsed = useMemo(() => parseMoves(text), [text])

  const setMoves = useCallback(
    (t: string) => {
      setText(t)
      setGame(parseMoves(t).state)
    },
    [setGame],
  )

  /** A move on the board is written to the text, so the scoresheet can be finished either way. */
  const onBoardMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      // Stepping back through the list is for checking; a new move goes at the end only.
      if (parsed.error || game.ply !== parsed.state.moves.length) return false
      const next = playMove(parsed.state, from, to, promotion)
      if (!next) return false
      const san = next.moves[next.moves.length - 1].san
      const moveNo = Math.floor((next.moves.length - 1) / 2) + 1
      const prefix = next.moves.length % 2 === 1 ? `${moveNo}. ` : ''
      setMoves(`${text.trimEnd()}${text.trim() ? ' ' : ''}${prefix}${san}`)
      return true
    },
    [parsed, game.ply, text, setMoves],
  )

  const update = useCallback((patch: Partial<OtbDetails>) => setDetails((d) => ({ ...d, ...patch })), [])

  const reset = useCallback(() => {
    setText('')
    setDetails({ userColor: 'w', opponent: '', date: todayLocal(), result: '1-0' })
    setGame(newGame())
  }, [setGame])

  /** The entered game as a library game. */
  const toLibraryGame = useCallback((): LibraryGame => otbGame(parsed.sans, details), [parsed.sans, details])

  return {
    text,
    setMoves,
    parsed,
    details,
    update,
    reset,
    toLibraryGame,
    onBoardMove,
    orientation: (details.userColor === 'b' ? 'black' : 'white') as 'white' | 'black',
    /** The board takes moves while the text reads cleanly and shows its last position. */
    interactive: parsed.error === null && game.ply === parsed.state.moves.length,
  }
}

export type OtbApi = ReturnType<typeof useOtb>
