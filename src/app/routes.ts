import { useCallback, useEffect, useState } from 'react'

export type RouteId = 'play' | 'board' | 'review' | 'games' | 'openings' | 'puzzles' | 'cards' | 'progress' | 'settings'

export interface RouteDef {
  id: RouteId
  label: string
  /** One line for the command palette. */
  description: string
  /** Extra words the command palette matches on. */
  keywords?: string
}

export interface NavGroup {
  label: string
  routes: RouteId[]
}

export const ROUTES: Record<RouteId, RouteDef> = {
  play: { id: 'play', label: 'Play the computer', description: 'A game against Stockfish at your level, with a coach if you want one', keywords: 'bot ai vs game opponent' },
  board: { id: 'board', label: 'Board', description: 'Play both sides with the engine watching', keywords: 'analysis play game pgn fen engine' },
  review: { id: 'review', label: 'Game review', description: 'Every move of this game rated, with the turning points', keywords: 'analyse accuracy mistakes blunders' },
  games: { id: 'games', label: 'My games', description: 'Import your Lichess or chess.com games and see where your points go', keywords: 'import lichess chesscom profile weaknesses stats' },
  openings: { id: 'openings', label: 'Openings', description: 'Learn opening lines move by move and drill them', keywords: 'trainer drill repertoire lines traps' },
  puzzles: { id: 'puzzles', label: 'Puzzles', description: 'Forks, pins, mates and endgames', keywords: 'tactics' },
  cards: { id: 'cards', label: 'Mistake cards', description: 'Your own mistakes, brought back on a schedule', keywords: 'srs spaced repetition review deck' },
  progress: { id: 'progress', label: 'Progress', description: 'Accuracy over time and practice stats', keywords: 'stats history' },
  settings: { id: 'settings', label: 'Settings', description: 'Engine, tips and hints', keywords: 'preferences options' },
}

export const NAV: NavGroup[] = [
  { label: 'Play', routes: ['play', 'board', 'review', 'games'] },
  { label: 'Train', routes: ['puzzles', 'openings', 'cards'] },
  { label: 'You', routes: ['progress', 'settings'] },
]

export const DEFAULT_ROUTE: RouteId = 'board'

export function parseHash(hash: string): RouteId {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return id in ROUTES ? (id as RouteId) : DEFAULT_ROUTE
}

/** A tiny hash router: the screen lives in the URL so links and the back button work. */
export function useRoute(): [RouteId, (id: RouteId) => void] {
  const [route, setRoute] = useState<RouteId>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigate = useCallback((id: RouteId) => {
    if (parseHash(window.location.hash) !== id || !window.location.hash) window.location.hash = `/${id}`
    setRoute(id)
  }, [])
  return [route, navigate]
}
