import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { isProblem } from '../lib/analysis/classify'
import { fenAt, newGame, playSan, type GameState, type PromotionPiece } from '../lib/chess/game'
import { movesMatch, outcomeOf, srsGrade, themeForMove, type Outcome } from '../lib/practice/practice'
import type { ReviewResult } from '../lib/review/review'
import {
  createCard,
  dueCards,
  hasDuplicate,
  mergeCards,
  parseCardsJson,
  sm2Update,
  type NewCardInput,
  type SrsCard,
} from '../lib/srs/srs'
import { useAttempt, useHintDecorations } from './useAttempt'
import type { GameApi } from './useGame'

const CARDS_KEY = 'mirror-gambit.srs-cards.v1'

function loadCards(): SrsCard[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY)
    if (!raw) return []
    return parseCardsJson(raw)
  } catch {
    return []
  }
}

/** asking: looking for the move · solved: found it · revealed: gave up, best move shown */
export type SessionStatus = 'asking' | 'solved' | 'revealed'

export interface ReviewSession {
  card: SrsCard
  status: SessionStatus
  outcome: Outcome | null
  grade: number | null
  message: string | null
}

function bestUci(card: SrsCard): string | null {
  try {
    const mv = new Chess(card.fen).move(card.bestMove)
    return mv.from + mv.to + (mv.promotion ?? '')
  } catch {
    return null
  }
}

export function useSrs(gameApi: GameApi) {
  const { setGame } = gameApi
  const attempt = useAttempt()
  const [cards, setCards] = useState<SrsCard[]>(loadCards)
  const [session, setSession] = useState<ReviewSession | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    try {
      localStorage.setItem(CARDS_KEY, JSON.stringify(cards))
    } catch {
      /* ignore */
    }
  }, [cards])

  // Re-evaluate "due" every minute so the badge stays fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const due = useMemo(() => dueCards(cards, now), [cards, now])

  const addCard = useCallback(
    (input: NewCardInput): SrsCard | null => {
      if (hasDuplicate(cards, input.fen, input.playerMove)) return null
      const card = createCard(input)
      setCards((list) => [...list, card])
      return card
    },
    [cards],
  )

  /** Creates one card per inaccuracy, mistake or blunder of a reviewed game. Returns how many were added. */
  const addFromReview = useCallback((game: GameState, result: ReviewResult): number => {
    let added = 0
    setCards((list) => {
      const out = [...list]
      for (const m of result.moves) {
        if (!isProblem(m.classification.cls) || !m.betterMove) continue
        const fen = fenAt(game, m.index)
        if (hasDuplicate(out, fen, m.san)) continue
        out.push(
          createCard({
            fen,
            playerMove: m.san,
            bestMove: m.betterMove,
            cpLoss: m.classification.lossCp,
            classification: m.classification.cls,
            explanation:
              m.classification.reason === 'missed-mate'
                ? 'You missed a forced checkmate here.'
                : m.classification.reason === 'allowed-mate'
                  ? 'Your move allowed a forced checkmate.'
                  : `Your move lost about ${(m.classification.lossCp / 100).toFixed(1)} pawns.`,
            source: 'review',
          }),
        )
        added++
      }
      return out
    })
    return added
  }, [])

  const removeCard = useCallback((id: string) => setCards((list) => list.filter((c) => c.id !== id)), [])

  const exportJson = useCallback(() => JSON.stringify({ app: 'mirror-gambit', version: 1, cards }, null, 2), [cards])

  const importJson = useCallback((text: string): number => {
    const imported = parseCardsJson(text)
    let added = 0
    setCards((list) => {
      const merged = mergeCards(list, imported)
      added = merged.added
      return merged.cards
    })
    return added
  }, [])

  const showCard = useCallback(
    (card: SrsCard) => {
      setSession({ card, status: 'asking', outcome: null, grade: null, message: null })
      attempt.reset()
      setGame(newGame(card.fen))
    },
    [setGame, attempt],
  )

  const startReview = useCallback(() => {
    const next = dueCards(cards)[0]
    if (next) showCard(next)
  }, [cards, showCard])

  const nextCard = useCallback(() => {
    const current = session?.card.id
    const next = dueCards(cards).find((c) => c.id !== current) ?? null
    if (next) showCard(next)
    else setSession(null)
  }, [cards, session, showCard])

  const exit = useCallback(() => setSession(null), [])

  /** Grades the card with SM-2 and shows the result. */
  const finish = useCallback(
    (gaveUp: boolean) => {
      if (!session) return
      const rec = attempt.record(gaveUp)
      const grade = srsGrade(rec)
      const outcome = outcomeOf(rec)
      setCards((list) => list.map((c) => (c.id === session.card.id ? sm2Update(c, grade) : c)))
      if (gaveUp) setGame((g) => playSan(g, session.card.bestMove) ?? g)
      const comesBack = grade < 3 ? 'It comes back in 4 hours.' : 'It moves to a longer interval.'
      setSession({
        ...session,
        status: gaveUp ? 'revealed' : 'solved',
        outcome,
        grade,
        message: gaveUp
          ? `The best move was ${session.card.bestMove}. ${session.card.explanation} ${comesBack}`
          : outcome === 'clean'
            ? `Clean: first try, no hints. ${comesBack}`
            : `Assisted: ${rec.wrongTries} wrong ${rec.wrongTries === 1 ? 'try' : 'tries'}${rec.maxHintLevel ? `, hints up to level ${rec.maxHintLevel}` : ''}. ${comesBack}`,
      })
    },
    [session, setGame, attempt],
  )

  const onBoardMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      if (!session || session.status !== 'asking') return false
      const chess = new Chess(gameApi.fen)
      let san: string
      try {
        san = chess.move({ from, to, promotion }).san
      } catch {
        return false
      }
      if (movesMatch(from + to + (promotion ?? ''), san, bestUci(session.card), session.card.bestMove)) {
        setGame((g) => playSan(g, session.card.bestMove) ?? g)
        finish(false)
        return true
      }
      attempt.wrong()
      setSession({
        ...session,
        message: `Not quite, try again. (${san} is not it.${session.card.playerMove && san === session.card.playerMove ? ' That is what you played in the game.' : ''})`,
      })
      return false
    },
    [session, gameApi.fen, setGame, finish, attempt],
  )

  const giveUp = useCallback(() => finish(true), [finish])

  const asking = session?.status === 'asking'
  const expected = session ? bestUci(session.card) : null
  const hints = useHintDecorations(attempt.hintLevel, expected, session && expected ? themeForMove(session.card.fen, expected) : '', !!asking)

  const orientation: 'white' | 'black' = session?.card.fen.split(' ')[1] === 'b' ? 'black' : 'white'
  const revealArrow: Arrow[] = useMemo(() => {
    if (!session || session.status !== 'revealed' || !expected) return []
    return [{ startSquare: expected.slice(0, 2), endSquare: expected.slice(2, 4), color: 'rgba(79, 196, 138, 0.9)' }]
  }, [session, expected])

  return {
    cards,
    due,
    dueCount: due.length,
    session,
    active: session !== null,
    orientation,
    attempt,
    hintText: hints.text,
    squareStyles: hints.squareStyles,
    arrows: asking ? hints.arrows : revealArrow,
    revealArrow,
    addCard,
    addFromReview,
    removeCard,
    exportJson,
    importJson,
    startReview,
    nextCard,
    exit,
    giveUp,
    onBoardMove,
    userToMove: asking,
  }
}

export type SrsApi = ReturnType<typeof useSrs>
