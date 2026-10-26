import { endgames } from './endgames.ts'
import { strategy } from './strategy.ts'
import type { Course } from './types.ts'

export type { Course, Lesson, ReadStep, Step, TaskStep, Verdict } from './types.ts'

export const courses: Course[] = [endgames, strategy]
