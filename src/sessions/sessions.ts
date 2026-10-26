import type { CSSProperties } from 'react'
import type { Square } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import type { RouteId } from '../app/routes'
import type { GameApi } from '../hooks/useGame'
import type { PlayApi } from '../hooks/usePlay'
import type { CourseApi } from '../hooks/useCourse'
import type { RepertoireApi } from '../hooks/useRepertoire'
import type { PuzzlesApi } from '../hooks/usePuzzles'
import type { SrsApi } from '../hooks/useSrs'
import type { TrainerApi } from '../hooks/useTrainer'
import type { PromotionPiece } from '../lib/chess/game'

export type SessionId = 'free' | 'play' | 'rep' | 'course' | 'trainer' | 'puzzle' | 'srs'

/**
 * Everything the board needs from whichever mode owns it. Exactly one session drives the
 * board at a time, and each session has its own game, so switching screens never moves
 * pieces in another mode's game.
 */
export interface BoardSession {
  id: SessionId
  game: GameApi
  orientation: 'white' | 'black'
  interactive: boolean
  arrows: Arrow[]
  squareStyles?: Record<string, CSSProperties>
  shakeKey: number
  onMove: (from: Square, to: Square, promotion?: PromotionPiece) => boolean
  /** Whether the move list and the arrow keys may move through the game right now. */
  canBrowse: boolean
  jump: (ply: number) => void
  step: (dir: -1 | 1) => void
}

/** Which session owns the board on each screen. */
export function sessionFor(route: RouteId, puzzles: Pick<PuzzlesApi, 'active' | 'choice'>): SessionId | null {
  switch (route) {
    case 'play':
      return 'play'
    case 'repertoire':
      return 'rep'
    case 'courses':
      return 'course'
    case 'board':
    case 'review':
      return 'free'
    case 'openings':
      // An opening's trap puzzles run inside the openings screen.
      return puzzles.active && puzzles.choice === 'custom' ? 'puzzle' : 'trainer'
    case 'puzzles':
      return 'puzzle'
    case 'cards':
      return 'srs'
    default:
      return null
  }
}

function browse(game: GameApi) {
  return {
    jump: (ply: number) => game.jump(ply),
    step: (dir: -1 | 1) => (dir < 0 ? game.undoMove() : game.redoMove()),
  }
}

const noop = () => {}

export function freeSession(game: GameApi, opts: { orientation: 'white' | 'black'; arrows: Arrow[] }): BoardSession {
  return {
    id: 'free',
    game,
    orientation: opts.orientation,
    interactive: !game.gameOver,
    arrows: opts.arrows,
    shakeKey: 0,
    onMove: game.move,
    canBrowse: true,
    ...browse(game),
  }
}

export function playSession(play: PlayApi, game: GameApi): BoardSession {
  // While the game is running the board is the game: no stepping back, no engine arrows.
  const live = play.active && !play.result
  const canBrowse = !live
  return {
    id: 'play',
    game,
    orientation: play.orientation,
    interactive: live && play.userToMove && !play.thinking,
    arrows: [],
    shakeKey: 0,
    onMove: play.onBoardMove,
    canBrowse,
    ...(canBrowse ? browse(game) : { jump: noop, step: noop }),
  }
}

export function repertoireSession(rep: RepertoireApi, game: GameApi): BoardSession {
  const orientation = rep.rep?.color === 'b' ? 'black' : 'white'
  if (rep.mode === 'drill')
    return {
      id: 'rep',
      game,
      orientation,
      interactive: rep.userToMove,
      arrows: rep.arrows,
      squareStyles: rep.squareStyles,
      shakeKey: rep.shakeKey,
      onMove: rep.onDrillMove,
      // A drill hides the way ahead.
      canBrowse: false,
      jump: noop,
      step: noop,
    }
  // Build (and Gaps): every move played on the board is added to the repertoire.
  return {
    id: 'rep',
    game,
    orientation,
    interactive: rep.active && rep.mode === 'build',
    arrows: [],
    shakeKey: 0,
    onMove: rep.onBuildMove,
    canBrowse: true,
    ...browse(game),
  }
}

export function courseSession(course: CourseApi, game: GameApi): BoardSession {
  return {
    id: 'course',
    game,
    orientation: course.orientation,
    interactive: course.userToMove,
    arrows: course.arrows,
    squareStyles: course.squareStyles,
    shakeKey: course.shakeKey,
    onMove: course.onBoardMove,
    // Steps are moved through with Back and Next, not the move list.
    canBrowse: false,
    jump: noop,
    step: noop,
  }
}

export function trainerSession(trainer: TrainerApi, game: GameApi): BoardSession {
  const drilling = trainer.mode === 'drill'
  return {
    id: 'trainer',
    game,
    orientation: trainer.boardOrientation,
    interactive: trainer.active && drilling && trainer.userToMove,
    arrows: trainer.arrows,
    squareStyles: trainer.hintSquareStyles,
    shakeKey: trainer.shakeKey,
    onMove: trainer.onBoardMove,
    // In step and autoplay modes the move list walks the opening line; a drill hides the way ahead.
    canBrowse: trainer.active && !drilling,
    jump: (ply) => trainer.goTo(ply),
    step: (dir) => (dir < 0 ? trainer.prev() : trainer.next()),
  }
}

export function puzzleSession(puzzles: PuzzlesApi, game: GameApi): BoardSession {
  const canBrowse = puzzles.active && puzzles.status !== 'playing'
  return {
    id: 'puzzle',
    game,
    orientation: puzzles.orientation,
    interactive: puzzles.solverToMove,
    arrows: puzzles.arrows,
    squareStyles: puzzles.squareStyles,
    shakeKey: puzzles.shakeKey,
    onMove: puzzles.onBoardMove,
    canBrowse,
    ...(canBrowse ? browse(game) : { jump: noop, step: noop }),
  }
}

export function srsSession(srs: SrsApi, game: GameApi): BoardSession {
  const canBrowse = srs.active && !srs.userToMove
  return {
    id: 'srs',
    game,
    orientation: srs.orientation,
    interactive: !!srs.userToMove,
    arrows: srs.arrows,
    squareStyles: srs.squareStyles,
    shakeKey: 0,
    onMove: srs.onBoardMove,
    canBrowse,
    ...(canBrowse ? browse(game) : { jump: noop, step: noop }),
  }
}
