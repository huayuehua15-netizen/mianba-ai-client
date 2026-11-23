import { describe, expect, it } from 'vitest'

import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatTime,
  gradeColor,
  scoreToGrade
} from '../src/utils/format.js'

describe('format', () => {
  it('日期补零到 YYYY-MM-DD', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(formatDate('2026-01-05T10:00:00')).toBe('2026-01-05')
  })

  it('空值与非法日期返回空串，不出现 Invalid Date', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate(null)).toBe('')
    expect(formatDate('bad')).toBe('')
  })

  it('日期时间补零到 YYYY-MM-DD HH:mm', () => {
    expect(formatDateTime(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05 09:07')
    expect(formatDateTime('bad')).toBe('')
  })

  it('时长按分秒展示', () => {
    expect(formatDuration(0)).toBe('0秒')
    expect(formatDuration(5)).toBe('5秒')
    expect(formatDuration(65)).toBe('1分5秒')
    expect(formatDuration(120)).toBe('2分0秒')
  })

  it('计时器补零到 mm:ss', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(65)).toBe('01:05')
    expect(formatTime(600)).toBe('10:00')
  })

  it('分数转等级覆盖边界', () => {
    expect(scoreToGrade(90)).toBe('S')
    expect(scoreToGrade(80)).toBe('A')
    expect(scoreToGrade(70)).toBe('B')
    expect(scoreToGrade(60)).toBe('C')
    expect(scoreToGrade(59.9)).toBe('D')
    expect(scoreToGrade(undefined)).toBe('D')
  })

  it('废弃的 gradeColor 固定返回单色墨黑', () => {
    expect(gradeColor()).toBe('#1A1A1A')
  })
})
