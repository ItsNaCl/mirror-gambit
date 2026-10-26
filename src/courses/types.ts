/**
 * Courses: short lessons that mix explanation with positions to solve. Every position, solution
 * and verdict is checked against Stockfish by scripts/check-courses.mjs (npm run courses:check),
 * because the text is written by hand and must not teach something the engine disagrees with.
 */

/** What the position should be worth, checked by the engine. */
export interface Verdict {
  result: 'win' | 'draw'
  /** The side that wins (for result 'win'). */
  side?: 'w' | 'b'
}

export interface ReadStep {
  kind: 'read'
  fen: string
  text: string
  /** Arrows drawn on the board, [from, to]. */
  arrows?: [string, string][]
  /** Squares to highlight. */
  squares?: string[]
  verdict?: Verdict
}

export interface TaskStep {
  kind: 'task'
  fen: string
  prompt: string
  /** UCI moves: the student's moves at even indices, the replies (played by the app) at odd ones. */
  solution: string[]
  /** Other first moves that are just as good and are accepted. */
  accept?: string[]
  /** Shown once the task is solved. */
  success: string
  verdict?: Verdict
}

export type Step = ReadStep | TaskStep

export interface Lesson {
  id: string
  title: string
  summary: string
  steps: Step[]
}

export interface Course {
  id: string
  title: string
  summary: string
  level: 'Beginner' | 'Intermediate'
  lessons: Lesson[]
}
