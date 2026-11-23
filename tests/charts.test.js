import { describe, expect, it } from 'vitest'

import { getLineOption, getRadarOption } from '../src/utils/charts.js'

describe('charts', () => {
  it('雷达图默认 max=10、不显示数值', () => {
    const option = getRadarOption([{ name: '表达' }, { name: '逻辑', max: 20 }], [8, 15])

    expect(option.radar.indicator).toEqual([
      { name: '表达', max: 10 },
      { name: '逻辑', max: 20 }
    ])
    expect(option.radar.showValue).toBe(false)
    expect(option.series[0].type).toBe('radar')
    expect(option.series[0].data[0].value).toEqual([8, 15])
  })

  it('雷达图可按统计页需要显示数值', () => {
    const option = getRadarOption([{ name: '表达' }], [8], { showValue: true })
    expect(option.radar.showValue).toBe(true)
  })

  it('雷达图不修改传入的 indicators 数组', () => {
    const indicators = [{ name: '表达' }]
    getRadarOption(indicators, [8])
    expect(indicators).toEqual([{ name: '表达' }])
  })

  it('折线图只保留真实被消费的字段', () => {
    const option = getLineOption(['10-01', '10-02'], [70, 82])

    expect(option.xAxis.data).toEqual(['10-01', '10-02'])
    expect(option.series[0].type).toBe('line')
    expect(option.series[0].data).toEqual([70, 82])
    expect(option).not.toHaveProperty('tooltip')
    expect(option).not.toHaveProperty('grid')
  })
})
