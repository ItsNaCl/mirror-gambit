import { Fragment, type ReactNode } from 'react'

/**
 * Plain-language definitions for the few chess terms that still appear in the
 * opening commentary. Hover (or tap) a dotted word to see its meaning.
 */
export const GLOSSARY: Record<string, string> = {
  pin: 'A piece that cannot move (or should not move) because a more valuable piece sits behind it on the same line.',
  pinned: 'Stuck in place: moving this piece would expose a more valuable piece behind it.',
  pins: 'Freezes a piece in place: moving it would expose a more valuable piece behind it.',
  fork: 'One piece attacking two things at once, so only one can be saved.',
  forking: 'Attacking two things at once with one piece.',
  'doubled pawns': 'Two pawns of the same colour on the same file. They cannot protect each other.',
  'doubled c-pawns': 'Two white pawns stacked on the c-file. They cannot protect each other.',
  'in-between move': 'A surprise move played before the obvious recapture, usually a check or a bigger threat.',
  'in-between check': 'A surprise check played before the obvious recapture.',
  gambit: 'Giving up a pawn (or more) on purpose to get faster development or an attack.',
  'long diagonal': 'The diagonal from corner to corner (a1 to h8, or h1 to a8). A bishop there sees across the whole board.',
  'open file': 'A file with no pawns on it, where a rook can see all the way down.',
  'the exchange': 'Trading a rook for a bishop or knight; the rook is worth more.',
  'pawn structure': 'The shape your pawns make. It decides which squares are strong or weak for the rest of the game.',
  'bishop pair': 'Having both bishops while the opponent does not. In open positions it is a small plus.',
  'discovered check': 'Moving one piece uncovers a check from another piece behind it.',
  tempo: 'One move of time. Gaining a tempo means making a useful move that also forces the opponent to waste theirs.',
  'with tempo': 'While forcing the opponent to spend a move reacting, so you gain time.',
}

const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length)
const PATTERN = new RegExp(`\\b(${TERMS.map((t) => t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')})\\b`, 'gi')

/** Wraps glossary terms in a dotted span with a title tooltip. */
export function Glossed({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  let key = 0
  for (const match of text.matchAll(PATTERN)) {
    const start = match.index ?? 0
    const word = match[0]
    const def = GLOSSARY[word.toLowerCase()]
    if (!def) continue
    if (start > last) parts.push(<Fragment key={key++}>{text.slice(last, start)}</Fragment>)
    parts.push(
      <abbr key={key++} className="gloss" title={def}>
        {word}
      </abbr>,
    )
    last = start + word.length
  }
  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
  return <>{parts}</>
}
