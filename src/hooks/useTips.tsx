import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_POSITION } from 'chess.js'
import { classifyMove, describeClassification, isProblem, type Classification } from '../lib/analysis/classify'
import { fenAt, uciToSan } from '../lib/chess/game'
import { computeHint, type HintResult } from '../lib/tips/hint'
import { detectOpening, type DetectedOpening } from '../lib/tips/openingDetect'
import { checkPrinciples, type PrincipleId, type PrincipleReminder } from '../lib/tips/principles'
import type { GameApi } from './useGame'
import { useEngine } from './useEngine'
import { useSettings } from './useSettings'

export interface MoveAlert {
  moveIndex: number
  san: string
  mover: 'w' | 'b'
  classification: Classification
  betterMove: string | null
  text: string
}

export interface TipsState {
  opening: DetectedOpening | null
  alert: MoveAlert | null
  principle: PrincipleReminder | null
  hintLevel: 0 | 1 | 2 | 3
  hint: HintResult | null
  requestHint: () => void
  /** True while the engine is still working on the eval needed for the last move's alert. */
  checkingMove: boolean
}

interface PendingCheck {
  moveIndex: number
  beforeFen: string
  afterFen: string
  mover: 'w' | 'b'
  san: string
  uci: string
}

export interface UseTipsOptions {
  /** Set false to silence tips (e.g. while the opening trainer is driving the board). */
  enabled: boolean
  notify?: (alert: MoveAlert) => void
}

/** Minimum depth we want on the position after a move before judging it. */
const ALERT_MIN_DEPTH = 12
const BEFORE_MIN_DEPTH = 8

export function useTips(gameApi: GameApi, { enabled, notify }: UseTipsOptions): TipsState {
  const { settings } = useSettings()
  const engine = useEngine()
  const { game, gameId, fen } = gameApi

  const [pending, setPending] = useState<PendingCheck | null>(null)
  const [alert, setAlert] = useState<MoveAlert | null>(null)
  const [principle, setPrinciple] = useState<PrincipleReminder | null>(null)
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2 | 3>(0)
  const shownPrinciples = useRef(new Set<PrincipleId>())
  const prev = useRef<{ moves: typeof game.moves; ply: number; gameId: number }>({ moves: game.moves, ply: game.ply, gameId })

  // Detect a brand new game or a newly played move.
  useEffect(() => {
    const p = prev.current
    prev.current = { moves: game.moves, ply: game.ply, gameId }
    if (gameId !== p.gameId) {
      shownPrinciples.current.clear()
      setPending(null)
      setAlert(null)
      setPrinciple(null)
      return
    }
    const isNewMove = game.moves !== p.moves && game.ply === game.moves.length && game.ply === p.ply + 1
    if (!isNewMove || !enabled) return
    const index = game.ply - 1
    const move = game.moves[index]
    const uci = move.from + move.to + (move.promotion ?? '')
    setPending({ moveIndex: index, beforeFen: fenAt(game, index), afterFen: move.after, mover: move.color, san: move.san, uci })

    if (settings.principleReminders && game.startFen === DEFAULT_POSITION) {
      const reminders = checkPrinciples(game.moves, index)
      const fresh = reminders.find((r) => !shownPrinciples.current.has(r.id))
      if (fresh) {
        shownPrinciples.current.add(fresh.id)
        setPrinciple(fresh)
      }
    }
  }, [game, gameId, enabled, settings.principleReminders])

  // Once the engine has looked at both positions, judge the move.
  useEffect(() => {
    if (!pending) return
    if (!settings.blunderAlerts) {
      setPending(null)
      return
    }
    const after = engine.getCached(pending.afterFen)
    if (!after || after.depth < Math.min(ALERT_MIN_DEPTH, settings.depth)) return
    const before = engine.getCached(pending.beforeFen)
    if (!before || before.depth < BEFORE_MIN_DEPTH) {
      setPending(null)
      return
    }
    const classification = classifyMove({
      before: before.score,
      after: after.score,
      mover: pending.mover,
      playedBestMove: before.bestMove === pending.uci,
    })
    const betterMove = before.bestMove && before.bestMove !== pending.uci ? uciToSan(pending.beforeFen, before.bestMove) : null
    const next: MoveAlert = {
      moveIndex: pending.moveIndex,
      san: pending.san,
      mover: pending.mover,
      classification,
      betterMove,
      text: describeClassification(classification, betterMove),
    }
    setAlert(next)
    setPending(null)
    if (isProblem(classification.cls)) notify?.(next)
  }, [pending, engine, engine.evalVersion, settings.blunderAlerts, settings.depth, notify])

  // Hints reset whenever the position changes.
  useEffect(() => setHintLevel(0), [fen])
  const requestHint = useCallback(() => setHintLevel((l) => (l >= 3 ? 3 : ((l + 1) as 1 | 2 | 3))), [])
  const hint = useMemo(() => {
    if (hintLevel === 0) return null
    const a = engine.analysis
    return computeHint(fen, a?.lines ?? [], a?.depth ?? 0)
  }, [hintLevel, engine.analysis, fen])

  const opening = useMemo(() => {
    if (!settings.openingDetection || game.startFen !== DEFAULT_POSITION) return null
    return detectOpening(game.moves.slice(0, game.ply).map((m) => m.san))
  }, [settings.openingDetection, game])

  return { opening, alert, principle, hintLevel, hint, requestHint, checkingMove: pending !== null }
}
