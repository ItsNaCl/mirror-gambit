import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { courses } from './index'

// The engine check (npm run courses:check) judges the chess; this checks the data is playable.
describe('courses', () => {
  for (const course of courses)
    for (const lesson of course.lessons)
      it(`${course.title}: ${lesson.title} is playable`, () => {
        expect(lesson.steps.length).toBeGreaterThan(0)
        for (const step of lesson.steps) {
          const chess = new Chess(step.fen)
          if (step.kind === 'read') {
            for (const [a, b] of step.arrows ?? []) expect(/^[a-h][1-8]$/.test(a) && /^[a-h][1-8]$/.test(b)).toBe(true)
            continue
          }
          // The student moves first and last.
          expect(step.solution.length % 2).toBe(1)
          for (const alt of step.accept ?? []) expect(() => new Chess(step.fen).move({ from: alt.slice(0, 2), to: alt.slice(2, 4) })).not.toThrow()
          for (const uci of step.solution) chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
        }
      })
})
