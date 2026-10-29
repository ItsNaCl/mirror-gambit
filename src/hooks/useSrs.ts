import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { groupCards, groupQueue, type CardGroup } from '../lib/srs/groups'
import {
  buildWoodpeckerSet,
  currentCycle,
  cycleTrend,
  normaliseWoodpecker,
  recordWoodpecker,
  remaining,
  setCards as woodpeckerCards,
  startCycle,
  summariseCycles,
  WOODPECKER_CYCLES,
  type WoodpeckerSet,
} from '../lib/srs/woodpecker'
import { useAttempt, useHintDecorations } from './useAttempt'
import { useLatest } from './useLatest'
import type { GameApi } from './useGame'
import * as kv from '../lib/store/kv'
import { ANSWER_ARROW } from '../lib/ui/boardColors'

const CARDS_KEY = 'mirror-gambit.srs-cards.v1'
const WOODPECKER_KEY = 'mirror-gambit.woodpecker.v1'

/** What is being drilled: the due cards, one pattern, or a pass of the Woodpecker set. */
export interface ReviewQueue {
  kind: 'due' | 'group' | 'woodpecker'
  label: string
  /** Cards still to show, in order. */
  ids: string[]
}

function loadCards(): SrsCard[] {
  try {
    const raw = kv.getItem(CARDS_KEY)
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

export interface SrsOptions {
  /** Called with the SM-2 grade (0 to 5) each time a card is finished. */
  onGrade?: (grade: number, card: SrsCard) => void
}

export function useSrs(gameApi: GameApi, options: SrsOptions = {}) {
  const { setGame } = gameApi
  const attempt = useAttempt()
  const onGrade = useLatest(options.onGrade)
  const [cards, setCards] = useState<SrsCard[]>(loadCards)
  const [session, setSession] = useState<ReviewSession | null>(null)
  const [queue, setQueue] = useState<ReviewQueue | null>(null)
  const [woodpecker, setWoodpecker] = useState<WoodpeckerSet | null>(() => normaliseWoodpecker(kv.readJson<unknown>(WOODPECKER_KEY, null)))
  // When the card on screen was shown, for the time a Woodpecker pass takes.
  const shownAt = useRef(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    try {
      kv.setItem(CARDS_KEY, JSON.stringify(cards))
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
  const groups = useMemo<CardGroup[]>(() => groupCards(cards, now), [cards, now])

  const saveWoodpecker = useCallback((set: WoodpeckerSet | null) => {
    setWoodpecker(set)
    try {
      if (set) kv.setItem(WOODPECKER_KEY, JSON.stringify(set))
      else kv.removeItem(WOODPECKER_KEY)
    } catch {
      /* ignore */
    }
  }, [])

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
      shownAt.current = Date.now()
      setGame(newGame(card.fen))
    },
    [setGame, attempt],
  )

  /** Starts a drill through the given cards, first one on the board. */
  const startQueue = useCallback(
    (q: ReviewQueue) => {
      const byId = new Map(cards.map((c) => [c.id, c]))
      const ids = q.ids.filter((id) => byId.has(id))
      const first = ids[0] ? byId.get(ids[0]) : undefined
      if (!first) return
      setQueue({ ...q, ids: ids.slice(1) })
      showCard(first)
    },
    [cards, showCard],
  )

  const startReview = useCallback(() => {
    startQueue({ kind: 'due', label: 'Due cards', ids: dueCards(cards).map((c) => c.id) })
  }, [cards, startQueue])

  /** Drills one pattern: its due cards first, then the rest. */
  const startGroup = useCallback(
    (key: string) => {
      const g = groups.find((x) => x.key === key)
      if (g) startQueue({ kind: 'group', label: g.label, ids: groupQueue(g) })
    },
    [groups, startQueue],
  )

  /** Continues the Woodpecker pass under way, or opens the next one; builds the set the first time. */
  const startWoodpecker = useCallback(() => {
    const base = woodpecker ?? buildWoodpeckerSet(cards)
    if (!base) return
    if (!currentCycle(base) && base.cycles.filter((c) => c.finishedAt).length >= WOODPECKER_CYCLES) return
    const set = startCycle(base)
    if (set !== woodpecker) saveWoodpecker(set)
    startQueue({ kind: 'woodpecker', label: `Woodpecker pass ${set.cycles.length}`, ids: remaining(set, cards) })
  }, [woodpecker, cards, saveWoodpecker, startQueue])

  /** Throws the set away so a new one is built from the newest mistakes. */
  const resetWoodpecker = useCallback(() => saveWoodpecker(null), [saveWoodpecker])

  const nextCard = useCallback(() => {
    const byId = new Map(cards.map((c) => [c.id, c]))
    // The due drill picks up cards that came due meanwhile; a group or a pass keeps its list.
    const ids = queue?.kind === 'due' || !queue ? dueCards(cards).filter((c) => c.id !== session?.card.id).map((c) => c.id) : queue.ids
    const next = ids.map((id) => byId.get(id)).find((c): c is SrsCard => !!c)
    if (next) {
      setQueue((q) => (q ? { ...q, ids: ids.filter((id) => id !== next.id) } : q))
      showCard(next)
    } else {
      setSession(null)
      setQueue(null)
    }
  }, [cards, queue, session, showCard])

  const exit = useCallback(() => {
    setSession(null)
    setQueue(null)
  }, [])

  /** Grades the card with SM-2 and shows the result. */
  const finish = useCallback(
    (gaveUp: boolean) => {
      if (!session) return
      const rec = attempt.record(gaveUp)
      const grade = srsGrade(rec)
      const outcome = outcomeOf(rec)
      setCards((list) => list.map((c) => (c.id === session.card.id ? sm2Update(c, grade) : c)))
      onGrade.current?.(grade, session.card)
      if (queue?.kind === 'woodpecker' && woodpecker) {
        const seconds = Math.min(600, Math.max(0, Math.round((Date.now() - shownAt.current) / 1000)))
        saveWoodpecker(recordWoodpecker(woodpecker, cards, session.card.id, outcome, seconds))
      }
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
    [session, setGame, attempt, onGrade, queue, woodpecker, cards, saveWoodpecker],
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
    return [{ startSquare: expected.slice(0, 2), endSquare: expected.slice(2, 4), color: ANSWER_ARROW }]
  }, [session, expected])

  const canBuildWoodpecker = useMemo(() => buildWoodpeckerSet(cards) !== null, [cards])

  const woodpeckerView = useMemo(() => {
    if (!woodpecker) return null
    const cycle = currentCycle(woodpecker)
    const size = woodpeckerCards(woodpecker, cards).length
    const finished = woodpecker.cycles.filter((c) => c.finishedAt).length
    // The method is a fixed number of passes; after them the set is done until it is rebuilt.
    const complete = !cycle && finished >= WOODPECKER_CYCLES
    return {
      set: woodpecker,
      size,
      pass: woodpecker.cycles.length,
      /** Cards left in the pass under way, the whole set before the next pass, nothing once the set is complete. */
      left: cycle ? remaining(woodpecker, cards).length : complete ? 0 : size,
      inProgress: cycle !== null,
      complete,
      cycles: summariseCycles(woodpecker),
      trend: cycleTrend(woodpecker),
    }
  }, [woodpecker, cards])

  return {
    cards,
    due,
    dueCount: due.length,
    session,
    queue,
    /** Cards still to come in the current drill. */
    queueLeft: queue?.ids.length ?? 0,
    groups,
    woodpecker: woodpeckerView,
    canBuildWoodpecker,
    startGroup,
    startWoodpecker,
    resetWoodpecker,
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
