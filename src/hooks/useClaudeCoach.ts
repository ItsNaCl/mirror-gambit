import { useCallback, useEffect, useState } from 'react'
import { addUsage, monthOf, type MonthUsage } from '../lib/coach/usage'
import { cleanError, desktop, type CoachAnswer, type CoachModel, type CoachRequest, type CoachStatus } from '../lib/desktop'
import * as kv from '../lib/store/kv'

const USAGE_KEY = 'mirror-gambit.claude-usage.v1'

function loadUsage(): MonthUsage | null {
  try {
    const raw = kv.getItem(USAGE_KEY)
    if (!raw) return null
    const u = JSON.parse(raw) as Partial<MonthUsage>
    return typeof u.month === 'string' && typeof u.dollars === 'number' && typeof u.questions === 'number' ? (u as MonthUsage) : null
  } catch {
    return null
  }
}

export type AskResult = CoachAnswer | { ok: false; error: string }

/**
 * The optional Claude coach: key and model live in the desktop shell, the monthly spend lives
 * here. With a monthly limit set, asking stops once this month's estimated spend reaches it.
 */
export function useClaudeCoach(monthlyCap: number) {
  const bridge = desktop()
  const [status, setStatus] = useState<CoachStatus | null>(null)
  const [usage, setUsage] = useState<MonthUsage | null>(loadUsage)

  const refresh = useCallback(async () => {
    if (!bridge) return
    try {
      setStatus(await bridge.coach.status())
    } catch {
      setStatus(null)
    }
  }, [bridge])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const thisMonth = usage && usage.month === monthOf() ? usage : null
  const overCap = monthlyCap > 0 && (thisMonth?.dollars ?? 0) >= monthlyCap

  const ask = useCallback(
    async (request: CoachRequest): Promise<AskResult> => {
      if (!bridge) return { ok: false, error: 'The Claude coach works in the desktop app.' }
      if (overCap) return { ok: false, error: 'This month’s Claude limit is reached. You can raise it in Settings.' }
      try {
        const answer = await bridge.coach.ask(request)
        if (answer.ok) {
          setUsage((prev) => {
            const next = addUsage(prev, answer.model, answer.usage)
            kv.setItem(USAGE_KEY, JSON.stringify(next))
            return next
          })
        }
        return answer
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    },
    [bridge, overCap],
  )

  const setKey = useCallback(
    async (key: string) => {
      if (!bridge) return { ok: false, error: 'The Claude coach works in the desktop app.' }
      const r = await bridge.coach.setKey(key)
      await refresh()
      return r
    },
    [bridge, refresh],
  )

  const clearKey = useCallback(async () => {
    if (!bridge) return
    await bridge.coach.clearKey()
    await refresh()
  }, [bridge, refresh])

  const setModel = useCallback(
    async (model: CoachModel) => {
      if (!bridge) return
      await bridge.coach.setModel(model)
      await refresh()
    },
    [bridge, refresh],
  )

  return {
    /** False in the browser build. */
    available: !!bridge,
    ready: !!status?.hasKey,
    status,
    usage: thisMonth,
    monthlyCap,
    overCap,
    ask,
    setKey,
    clearKey,
    setModel,
  }
}

export type ClaudeCoachApi = ReturnType<typeof useClaudeCoach>
