import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Chess, type Square } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { courses, type Course, type Lesson, type Step } from '../courses'
import { newGame, playUci, type PromotionPiece } from '../lib/chess/game'
import { themeForMove } from '../lib/practice/practice'
import * as kv from '../lib/store/kv'
import { ANSWER_ARROW } from '../lib/ui/boardColors'
import { useAttempt, useHintDecorations } from './useAttempt'
import type { GameApi } from './useGame'

const PROGRESS_KEY = 'mirror-gambit.course-progress.v1'
const REPLY_DELAY_MS = 650
const READ_ARROW = 'rgba(250, 250, 250, 0.75)'
const READ_SQUARE: CSSProperties = { boxShadow: 'inset 0 0 0 3px rgba(159, 211, 90, 0.85)' }

export type TaskState = 'asking' | 'wrong' | 'replying' | 'solved' | 'revealed'

function loadProgress(): Record<string, true> {
  try {
    return JSON.parse(kv.getItem(PROGRESS_KEY) ?? '{}') as Record<string, true>
  } catch {
    return {}
  }
}

/** Plays through a course lesson on its own board. */
export function useCourse(gameApi: GameApi) {
  const { setGame, game } = gameApi
  const [courseId, setCourseId] = useState<string | null>(null)
  const [lessonId, setLessonId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [ply, setPly] = useState(0) // moves of the current task already played
  const [task, setTask] = useState<TaskState>('asking')
  const [message, setMessage] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [done, setDone] = useState<Record<string, true>>(loadProgress)
  const attempt = useAttempt()

  const course: Course | null = courses.find((c) => c.id === courseId) ?? null
  const lesson: Lesson | null = course?.lessons.find((l) => l.id === lessonId) ?? null
  const step: Step | null = lesson?.steps[index] ?? null

  const showStep = useCallback(
    (s: Step | null | undefined) => {
      if (!s) return
      setGame(newGame(s.fen))
      setPly(0)
      setTask('asking')
      setMessage(null)
      attempt.reset()
    },
    [setGame, attempt],
  )

  const open = useCallback(
    (cId: string, lId: string) => {
      const c = courses.find((x) => x.id === cId)
      const l = c?.lessons.find((x) => x.id === lId)
      if (!l) return
      setCourseId(cId)
      setLessonId(lId)
      setIndex(0)
      showStep(l.steps[0])
    },
    [showStep],
  )

  const markDone = useCallback((key: string) => {
    setDone((prev) => {
      const next = { ...prev, [key]: true as const }
      kv.setItem(PROGRESS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const goTo = useCallback(
    (i: number) => {
      if (!lesson) return
      const clamped = Math.max(0, Math.min(lesson.steps.length - 1, i))
      setIndex(clamped)
      showStep(lesson.steps[clamped])
    },
    [lesson, showStep],
  )

  const next = useCallback(() => {
    if (!lesson || !course) return
    if (index < lesson.steps.length - 1) return goTo(index + 1)
    markDone(`${course.id}/${lesson.id}`)
    // Finished: on to the next lesson of the course, or back to the list.
    const i = course.lessons.findIndex((l) => l.id === lesson.id)
    const following = course.lessons[i + 1]
    if (following) open(course.id, following.id)
    else setLessonId(null)
  }, [lesson, course, index, goTo, markDone, open])

  const exit = useCallback(() => setLessonId(null), [])

  const isTask = step?.kind === 'task'
  const solutionLength = step?.kind === 'task' ? step.solution.length : 0
  // While replies are being played the state follows the move count: back to the student on their
  // turn, solved once the line is done.
  const state: TaskState = task === 'replying' ? (ply >= solutionLength ? 'solved' : ply % 2 === 0 ? 'asking' : 'replying') : task
  const userToMove = isTask && (state === 'asking' || state === 'wrong') && ply % 2 === 0 && ply < solutionLength
  const expected = step?.kind === 'task' && userToMove ? step.solution[ply] : null

  const advance = useCallback(
    (uci: string) => {
      setGame((g) => playUci(g, uci) ?? g)
      setPly((p) => p + 1)
    },
    [setGame],
  )

  // The app plays the replies (and continues a revealed solution) after a short pause.
  useEffect(() => {
    if (step?.kind !== 'task' || (state !== 'replying' && state !== 'revealed') || ply >= step.solution.length) return
    const t = window.setTimeout(() => advance(step.solution[ply]), state === 'revealed' ? 1200 : REPLY_DELAY_MS)
    return () => clearTimeout(t)
  }, [step, state, ply, advance])

  const onBoardMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece): boolean => {
      if (step?.kind !== 'task' || !expected) return false
      const uci = from + to + (promotion ?? '')
      const ok = uci === expected || (ply === 0 && (step.accept ?? []).includes(uci))
      if (ok) {
        attempt.nextMove()
        setMessage(null)
        // An accepted alternative ends the task: the stored line no longer applies after it.
        if (uci !== expected) {
          advance(uci)
          setPly(step.solution.length)
          setTask('solved')
          return true
        }
        advance(uci)
        setTask('replying')
        return true
      }
      let san = uci
      try {
        san = new Chess(game.moves.length ? game.moves[game.ply - 1].after : step.fen).move({ from, to, promotion }).san
      } catch {
        return false
      }
      setShakeKey((k) => k + 1)
      attempt.wrong()
      setTask('wrong')
      setMessage(`${san} is not it. Try again.`)
      return false
    },
    [step, expected, ply, attempt, advance, game],
  )

  const giveUp = useCallback(() => {
    if (step?.kind !== 'task') return
    setTask('revealed')
    setMessage('Here is the solution, move by move.')
  }, [step])

  const hintFen = useMemo(() => (game.ply > 0 ? game.moves[game.ply - 1].after : (step?.fen ?? '')), [game, step])
  const hints = useHintDecorations(attempt.hintLevel, expected, expected ? themeForMove(hintFen, expected) : '', !!expected)

  const arrows: Arrow[] = useMemo(() => {
    if (!step) return []
    if (step.kind === 'read') return (step.arrows ?? []).map(([a, b]) => ({ startSquare: a, endSquare: b, color: READ_ARROW }))
    if (state === 'revealed' && ply < step.solution.length) {
      const u = step.solution[ply]
      return [{ startSquare: u.slice(0, 2), endSquare: u.slice(2, 4), color: ANSWER_ARROW }]
    }
    return expected ? hints.arrows : []
  }, [step, state, ply, expected, hints.arrows])

  const squareStyles = useMemo(() => {
    if (step?.kind === 'read') return Object.fromEntries((step.squares ?? []).map((s) => [s, READ_SQUARE]))
    return expected ? hints.squareStyles : undefined
  }, [step, expected, hints.squareStyles])

  const finished = step?.kind === 'read' || state === 'solved' || (state === 'revealed' && ply >= solutionLength)
  const orientation: 'white' | 'black' = step?.fen.split(' ')[1] === 'b' ? 'black' : 'white'

  return {
    courses,
    course,
    lesson,
    step,
    index,
    task: state,
    message,
    finished,
    done,
    open,
    goTo,
    next,
    exit,
    attempt,
    hintText: hints.text,
    giveUp,
    userToMove: !!expected,
    arrows,
    squareStyles,
    shakeKey,
    orientation,
    onBoardMove,
    active: lesson !== null,
  }
}

export type CourseApi = ReturnType<typeof useCourse>
