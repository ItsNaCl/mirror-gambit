import { caroKann } from './caroKann.ts'
import { dutch } from './dutch.ts'
import { english } from './english.ts'
import { french } from './french.ts'
import { friedLiver } from './friedLiver.ts'
import { italian } from './italian.ts'
import { kingsIndian } from './kingsIndian.ts'
import { london } from './london.ts'
import { nimzo } from './nimzo.ts'
import { petrov } from './petrov.ts'
import { qgd } from './qgd.ts'
import { queensGambit } from './queensGambit.ts'
import { ruyLopez } from './ruyLopez.ts'
import { scandinavian } from './scandinavian.ts'
import { scholarsMate } from './scholarsMate.ts'
import { scotch } from './scotch.ts'
import { sicilian } from './sicilian.ts'
import { slav } from './slav.ts'
import { vienna } from './vienna.ts'
import type { Opening, OpeningGroup } from './types.ts'

export type { Opening, OpeningGroup, LineMove, Branch, Trap, MainLine } from './types.ts'
export { allLines, fullLine } from './types.ts'

/** All openings in display order. Content lives in the sibling data files, not in UI code. */
export const openings: Opening[] = [
  italian,
  ruyLopez,
  scotch,
  vienna,
  queensGambit,
  london,
  english,
  sicilian,
  french,
  caroKann,
  scandinavian,
  petrov,
  qgd,
  slav,
  kingsIndian,
  nimzo,
  dutch,
  friedLiver,
  scholarsMate,
]

export const GROUP_LABELS: Record<OpeningGroup, string> = {
  white: 'Playing White',
  'black-vs-e4': 'Playing Black against 1.e4',
  'black-vs-d4': 'Playing Black against 1.d4',
  'trap-line': 'Trap lines every beginner should know',
}

export function openingById(id: string): Opening | undefined {
  return openings.find((o) => o.id === id)
}
