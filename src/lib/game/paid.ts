import * as kv from '../store/kv'
import { SLOW } from '../coach/metrics'
import type { LibraryGame } from '../games/sources'

export const PAID_KEY = 'mirror-gambit.xp-paid.v1'
/** The newest ids are kept; an older one that falls off could only be paid again by a game that old coming back. */
const MAX_PAID = 3000

/** Ids that already paid review XP. Anything that is not a list of strings is dropped. */
export function normalisePaid(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 200))].slice(-MAX_PAID)
}

export interface PaidStore {
  /** True the first time an id is claimed, and saves it at once; false when it already paid. */
  claim: (id: string) => boolean
  /** Marks ids as paid without paying. Used once, the first time this version runs. */
  seed: (ids: string[]) => void
  /** Whether the list existed before this run, so older reviews are not paid retroactively. */
  readonly existed: boolean
}

/** A saved set of paid ids. A reload cannot repay because the set is written on every claim. */
export function createPaidStore(): PaidStore {
  const raw = kv.readJson<unknown>(PAID_KEY, null)
  const ids = new Set(normalisePaid(raw))
  const save = () => kv.setItem(PAID_KEY, JSON.stringify([...ids].slice(-MAX_PAID)))
  return {
    existed: raw !== null,
    claim(id) {
      if (ids.has(id)) return false
      ids.add(id)
      save()
      return true
    },
    seed(list) {
      for (const id of list) ids.add(id)
      save()
    },
  }
}

/**
 * Whether an imported or typed game may pay slow game XP. A game typed in from a scoresheet has no
 * clock the app can see, so it never pays; a game from a site pays when its time class is slow.
 */
export function paysSlowGame(g: Pick<LibraryGame, 'source' | 'timeClass'>): boolean {
  return g.source !== 'otb' && SLOW.has(g.timeClass)
}
