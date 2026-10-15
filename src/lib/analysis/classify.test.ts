import { describe, expect, it } from 'vitest'
import { classForLoss, classifyMove, isProblem } from './classify'
import type { Score } from '../engine/uci'

const cp = (value: number): Score => ({ type: 'cp', value })
const mate = (value: number): Score => ({ type: 'mate', value })

describe('classForLoss: the six-level beginner scale', () => {
  it('maps centipawn loss to classes at the exact boundaries', () => {
    expect(classForLoss(0)).toBe('best')
    expect(classForLoss(1)).toBe('great')
    expect(classForLoss(30)).toBe('great')
    expect(classForLoss(31)).toBe('good')
    expect(classForLoss(80)).toBe('good')
    expect(classForLoss(81)).toBe('inaccuracy')
    expect(classForLoss(150)).toBe('inaccuracy')
    expect(classForLoss(151)).toBe('mistake')
    expect(classForLoss(300)).toBe('mistake')
    expect(classForLoss(301)).toBe('blunder')
    expect(classForLoss(1000)).toBe('blunder')
  })

  it('treats negative loss (an improvement) as best', () => {
    expect(classForLoss(-50)).toBe('best')
  })

  it('flags only inaccuracy, mistake and blunder as problems', () => {
    expect(isProblem('best')).toBe(false)
    expect(isProblem('great')).toBe(false)
    expect(isProblem('good')).toBe(false)
    expect(isProblem('inaccuracy')).toBe(true)
    expect(isProblem('mistake')).toBe(true)
    expect(isProblem('blunder')).toBe(true)
  })
})

describe('classifyMove thresholds (mover = White)', () => {
  const w = 'w' as const
  it('best when nothing is lost or the engine move was played', () => {
    expect(classifyMove({ before: cp(30), after: cp(30), mover: w }).cls).toBe('best')
    expect(classifyMove({ before: cp(30), after: cp(-300), mover: w, playedBestMove: true }).cls).toBe('best')
  })
  it('great for 1 to 30 lost', () => {
    expect(classifyMove({ before: cp(30), after: cp(29), mover: w })).toMatchObject({ cls: 'great', lossCp: 1 })
    expect(classifyMove({ before: cp(30), after: cp(0), mover: w })).toMatchObject({ cls: 'great', lossCp: 30 })
  })
  it('good for 31 to 80 lost', () => {
    expect(classifyMove({ before: cp(30), after: cp(-1), mover: w })).toMatchObject({ cls: 'good', lossCp: 31 })
    expect(classifyMove({ before: cp(30), after: cp(-50), mover: w })).toMatchObject({ cls: 'good', lossCp: 80 })
  })
  it('inaccuracy for 81 to 150 lost', () => {
    expect(classifyMove({ before: cp(30), after: cp(-51), mover: w })).toMatchObject({ cls: 'inaccuracy', lossCp: 81 })
    expect(classifyMove({ before: cp(30), after: cp(-120), mover: w })).toMatchObject({ cls: 'inaccuracy', lossCp: 150 })
  })
  it('mistake for 151 to 300 lost', () => {
    expect(classifyMove({ before: cp(30), after: cp(-121), mover: w })).toMatchObject({ cls: 'mistake', lossCp: 151 })
    expect(classifyMove({ before: cp(30), after: cp(-270), mover: w })).toMatchObject({ cls: 'mistake', lossCp: 300 })
  })
  it('blunder over 300 lost', () => {
    expect(classifyMove({ before: cp(30), after: cp(-271), mover: w })).toMatchObject({ cls: 'blunder', lossCp: 301 })
  })
  it('never punishes an improvement', () => {
    expect(classifyMove({ before: cp(-100), after: cp(200), mover: w })).toMatchObject({ cls: 'best', lossCp: 0 })
  })
})

describe('classifyMove from Black perspective', () => {
  const b = 'b' as const
  it('flips the sign so Black losing advantage counts as a loss', () => {
    // Black was +2.0 (eval -200 for White) and is now equal: Black lost 200 -> mistake.
    expect(classifyMove({ before: cp(-200), after: cp(0), mover: b })).toMatchObject({ cls: 'mistake', lossCp: 200 })
    // White's eval went down: good for Black.
    expect(classifyMove({ before: cp(0), after: cp(-50), mover: b }).cls).toBe('best')
  })
})

describe('classifyMove with mates', () => {
  it('missing a forced mate is a blunder', () => {
    expect(classifyMove({ before: mate(3), after: cp(500), mover: 'w' })).toMatchObject({ cls: 'blunder', reason: 'missed-mate' })
    expect(classifyMove({ before: mate(-2), after: cp(-900), mover: 'b' })).toMatchObject({ cls: 'blunder', reason: 'missed-mate' })
  })
  it('allowing a forced mate is a blunder', () => {
    expect(classifyMove({ before: cp(50), after: mate(-4), mover: 'w' })).toMatchObject({ cls: 'blunder', reason: 'allowed-mate' })
    expect(classifyMove({ before: cp(-50), after: mate(2), mover: 'b' })).toMatchObject({ cls: 'blunder', reason: 'allowed-mate' })
  })
  it('delivering checkmate (mate in 0 after the move) is best', () => {
    expect(classifyMove({ before: mate(1), after: mate(0), mover: 'w' }).cls).toBe('best')
  })
  it('keeping a mate is best, a slower mate is still great', () => {
    expect(classifyMove({ before: mate(3), after: mate(2), mover: 'w' }).cls).toBe('best')
    expect(classifyMove({ before: mate(2), after: mate(5), mover: 'w' }).cls).toBe('great')
  })
  it('does not blame moves in an already lost (mated) position', () => {
    expect(classifyMove({ before: mate(-2), after: mate(-1), mover: 'w' }).cls).toBe('good')
  })
})
