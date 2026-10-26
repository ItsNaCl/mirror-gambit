import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import type { Arrow } from 'react-chessboard'
import { hintView, MAX_HINT_LEVEL, shouldPulse, type AttemptRecord, type HintLevel } from '../lib/practice/practice'
import { useSettings } from './useSettings'
import { ANSWER_ARROW, HINT_FROM, HINT_TO } from '../lib/ui/boardColors'

const FROM_STYLE: CSSProperties = { boxShadow: `inset 0 0 0 4px ${HINT_FROM}` }
const TO_STYLE: CSSProperties = { boxShadow: `inset 0 0 0 4px ${HINT_TO}` }

/**
 * Per-exercise attempt state shared by puzzles, opening drills and review cards:
 * unlimited wrong tries, an attempt counter for the current move, and hint levels
 * that only ever go up when the student clicks Hint.
 */
export function useAttempt() {
  const { settings } = useSettings()
  const [wrongThisMove, setWrongThisMove] = useState(0)
  const [totalWrong, setTotalWrong] = useState(0)
  const [hintLevel, setHintLevel] = useState<HintLevel>(0)
  const [maxHint, setMaxHint] = useState<HintLevel>(0)

  /** New exercise: clear everything. */
  const reset = useCallback(() => {
    setWrongThisMove(0)
    setTotalWrong(0)
    setHintLevel(0)
    setMaxHint(0)
  }, [])

  /** The current move was solved: the next move starts with a fresh counter and no hint. */
  const nextMove = useCallback(() => {
    setWrongThisMove(0)
    setHintLevel(0)
  }, [])

  const wrong = useCallback(() => {
    setWrongThisMove((n) => n + 1)
    setTotalWrong((n) => n + 1)
  }, [])

  const hint = useCallback(() => {
    setHintLevel((l) => {
      const next = Math.min(MAX_HINT_LEVEL, l + 1) as HintLevel
      setMaxHint((m) => (next > m ? next : m))
      return next
    })
  }, [])

  const record = useCallback(
    (gaveUp: boolean): AttemptRecord => ({ wrongTries: totalWrong, maxHintLevel: maxHint, gaveUp }),
    [totalWrong, maxHint],
  )

  const pulse = shouldPulse(wrongThisMove, hintLevel, settings.autoHintAfter)

  // Memoised so the object only changes when the student does something; hooks that
  // depend on it (for example the drill's reply timer) are not reset on every render.
  return useMemo(
    () => ({ wrongThisMove, totalWrong, hintLevel, maxHint, pulse, reset, nextMove, wrong, hint, record }),
    [wrongThisMove, totalWrong, hintLevel, maxHint, pulse, reset, nextMove, wrong, hint, record],
  )
}

export type AttemptApi = ReturnType<typeof useAttempt>

/** Board decorations (square highlights and arrow) for the current hint level. */
export function useHintDecorations(level: HintLevel, uci: string | null, theme: string, active: boolean) {
  return useMemo(() => {
    const view = hintView(active ? level : 0, uci, theme)
    const squareStyles: Record<string, CSSProperties> = {}
    if (view.highlightFrom) squareStyles[view.highlightFrom] = FROM_STYLE
    if (view.highlightTo) squareStyles[view.highlightTo] = TO_STYLE
    const arrows: Arrow[] = view.arrow ? [{ startSquare: view.arrow.from, endSquare: view.arrow.to, color: ANSWER_ARROW }] : []
    return { text: view.text, squareStyles, arrows }
  }, [level, uci, theme, active])
}
