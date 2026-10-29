import { newGame, playSan, type GameState } from '../chess/game'
import type { LibraryGame } from '../games/sources'

/**
 * Over the board entry: a game typed in from a scoresheet, checked move by move, so it can be
 * reviewed and kept with the imported games. Pure pieces: parsing the text and shaping the game.
 */

export interface ParsedMoves {
  state: GameState
  /** The SAN moves accepted, as chess.js writes them. */
  sans: string[]
  /** The first move that did not work, or null when every token played. */
  error: { index: number; token: string; message: string } | null
}

/** Move numbers, results, comments and the usual scoresheet spellings are tolerated. */
export function tokensOf(text: string): string[] {
  return text
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[,;]+|[,;]+$/g, ''))
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(t))
    .map(normaliseToken)
}

/** 0-0, O-O-O with zeros, lowercase castling, "e.p.", trailing "!?" marks: all read as the move meant. */
function normaliseToken(t: string): string {
  let s = t.replace(/[!?]+$/g, '').replace(/\s*e\.p\.?$/i, '')
  if (/^0-0-0$|^o-o-o$/i.test(s)) s = 'O-O-O'
  else if (/^0-0$|^o-o$/i.test(s)) s = 'O-O'
  return s
}

/** Plays the moves one after another from the start position, stopping at the first that does not fit. */
export function parseMoves(text: string): ParsedMoves {
  const tokens = tokensOf(text)
  let state = newGame()
  const sans: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const next = playSan(state, tokens[i])
    if (!next) {
      const moveNo = Math.floor(i / 2) + 1
      const who = i % 2 === 0 ? 'White' : 'Black'
      return { state, sans, error: { index: i, token: tokens[i], message: `Move ${moveNo}, ${who}: "${tokens[i]}" is not a legal move here.` } }
    }
    state = next
    sans.push(next.moves[next.moves.length - 1].san)
  }
  return { state, sans, error: null }
}

export interface OtbDetails {
  userColor: 'w' | 'b'
  opponent: string
  /** YYYY-MM-DD, local. */
  date: string
  result: '1-0' | '0-1' | '1/2-1/2'
}

/** A short stable hash, so the same moves on the same day get the same id. */
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** The entered game as a library game, so the review and the profile treat it like an imported one. */
export function otbGame(sans: string[], d: OtbDetails): LibraryGame {
  const me = 'Me'
  const them = d.opponent.trim() || 'Opponent'
  return {
    id: `otb:${hash(`${d.date}|${d.userColor}|${sans.join(' ')}`)}`,
    source: 'otb',
    url: '',
    date: new Date(`${d.date}T12:00:00`).toISOString(),
    white: d.userColor === 'w' ? me : them,
    black: d.userColor === 'b' ? me : them,
    userColor: d.userColor,
    result: d.result,
    // A game played over the board had a real clock; the coach counts it as slow.
    timeClass: 'classical',
    sans: sans.join(' '),
  }
}

/** Today in local time, for the date field's default. */
export function todayLocal(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
