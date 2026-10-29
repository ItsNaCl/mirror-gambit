/** Finished games against the computer, kept so they can be reviewed later. */
export interface SavedGame {
  id: string
  /** ISO timestamp of when the game ended. */
  date: string
  levelId: number
  userColor: 'w' | 'b'
  result: '1-0' | '0-1' | '1/2-1/2'
  /** Plain-language reason, e.g. "Checkmate" or "You resigned". */
  reason: string
  moveCount: number
  pgn: string
}

export type PlayerOutcome = 'win' | 'loss' | 'draw'

const KEY = 'mirror-gambit.play-games.v1'
export const MAX_SAVED_GAMES = 50

/** The length a game against the computer needs to count as a slow game for the coach. */
export const SLOW_GAME_PLIES = 40
/** 20 moves each counts; a shorter game counts only when it was played out rather than resigned. */
export function countsAsSlowGame(plies: number, resigned: boolean): boolean {
  return plies >= SLOW_GAME_PLIES || (!resigned && plies >= SLOW_GAME_PLIES / 2)
}

export function outcomeFor(result: SavedGame['result'], userColor: 'w' | 'b'): PlayerOutcome {
  if (result === '1/2-1/2') return 'draw'
  return (result === '1-0') === (userColor === 'w') ? 'win' : 'loss'
}

function isSavedGame(x: unknown): x is SavedGame {
  const g = x as Partial<SavedGame> | null
  return !!g && typeof g.id === 'string' && typeof g.pgn === 'string' && typeof g.date === 'string' && (g.userColor === 'w' || g.userColor === 'b')
}

export function loadSavedGames(): SavedGame[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isSavedGame) : []
  } catch {
    return []
  }
}

/** Newest first, capped at MAX_SAVED_GAMES. */
export function addSavedGame(list: SavedGame[], game: SavedGame): SavedGame[] {
  return [game, ...list.filter((g) => g.id !== game.id)].slice(0, MAX_SAVED_GAMES)
}

export function storeSavedGames(list: SavedGame[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage may be unavailable; the history just will not persist */
  }
}

/** Wins, losses and draws per level, for the level picker. */
export function recordByLevel(list: SavedGame[]): Record<number, Record<PlayerOutcome, number>> {
  const out: Record<number, Record<PlayerOutcome, number>> = {}
  for (const g of list) {
    const r = (out[g.levelId] ??= { win: 0, loss: 0, draw: 0 })
    r[outcomeFor(g.result, g.userColor)]++
  }
  return out
}
