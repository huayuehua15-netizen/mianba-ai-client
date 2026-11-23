import { describe, expect, it } from 'vitest'

import {
  GRADE_INK,
  GRADE_INK_LIT,
  gradeForDimAvg,
  gradeForScore,
  gradeInk,
  gradeInkLit
} from '../src/utils/grades.js'

describe('grades', () => {
  it('百分制分数按 90/80/70/60 分档', () => {
    expect(gradeForScore(90)).toBe('S')
    expect(gradeForScore(89.9)).toBe('A')
    expect(gradeForScore(80)).toBe('A')
    expect(gradeForScore(79.9)).toBe('B')
    expect(gradeForScore(70)).toBe('B')
    expect(gradeForScore(69.9)).toBe('C')
    expect(gradeForScore(60)).toBe('C')
    expect(gradeForScore(59.9)).toBe('D')
  })

  it('非数字分数统一回退到 D', () => {
    expect(gradeForScore('90')).toBe('D')
    expect(gradeForScore(null)).toBe('D')
    expect(gradeForScore(undefined)).toBe('D')
  })

  it('五维均分按 9/8/7/6 分档', () => {
    expect(gradeForDimAvg(9)).toBe('S')
    expect(gradeForDimAvg(8)).toBe('A')
    expect(gradeForDimAvg(7)).toBe('B')
    expect(gradeForDimAvg(6)).toBe('C')
    expect(gradeForDimAvg(5.9)).toBe('D')
    expect(gradeForDimAvg(NaN)).toBe('D')
  })

  it('等级取色未知等级回退 D', () => {
    expect(gradeInk('S')).toBe(GRADE_INK.S)
    expect(gradeInk('X')).toBe(GRADE_INK.D)
    expect(gradeInkLit('A')).toBe(GRADE_INK_LIT.A)
    expect(gradeInkLit()).toBe(GRADE_INK_LIT.D)
  })
})
