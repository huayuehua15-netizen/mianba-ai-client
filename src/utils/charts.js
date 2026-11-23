/**
 * 图表配置（供 echart.vue 的 SVG 自绘组件消费）
 * ============================================================================
 * ⚠️ 本文件只是「数据结构载体」，不是 ECharts 配置：
 *    echart.vue 已改为 SVG 自绘（不再是 Canvas 2D、更不依赖 ECharts），
 *    它只读取下面这几个字段——
 *      getRadarOption → radar.indicator[]（name/max）、radar.showValue
 *                       series[0].type、series[0].data[0].value
 *      getLineOption  → xAxis.data、series[0].type、series[0].data
 *    视觉样式（颜色、字重、网格、区域填充、平滑曲线）全部由 echart.vue 自己控制，
 *    在那里与 uni.scss 的单色板对齐。
 *
 * 为什么删掉大量字段（2026-10-10）：
 *    此前文件里留着 tooltip / grid / axisName / splitLine / splitArea / smooth /
 *    lineStyle / itemStyle / areaStyle 等整套 ECharts 配置，以及一个从未被 import
 *    的 getHeatmapOption —— 它们**从不被读取**，却让下一个改图表的人以为改这里有用
 *    （这个文件比没有它更危险）。更糟的是旧注释写着「折线数据点使用低饱和红
 *    #B4453F」——那是**从未实现过的**描述：echart.vue 的节点一直是白心墨环的纯单色，
 *    一旦有人「按注释修复」，就会在黑白体系里引入唯一的彩色点。
 *    现在只留真实被消费的字段，注释如实描述。
 * ============================================================================
 */

/**
 * 雷达图配置
 * @param indicators [{ name, max }]
 * @param values     数值数组（与 indicators 同序）
 * @param opts.showValue true 时标签下附分值（统计页开启；报告页不传 → 行为不变）
 */
export const getRadarOption = (indicators, values, opts = {}) => ({
  radar: {
    indicator: indicators.map(i => ({ name: i.name, max: i.max || 10 })),
    showValue: !!opts.showValue
  },
  series: [{
    type: 'radar',
    data: [{ value: values, name: '能力值' }]
  }]
})

/**
 * 折线图配置（分数趋势）
 * xData: 日期标签数组；yData: 分数数组
 * 注：y 轴量程由 echart.vue 决定（它按数据自适应，不读这里的 min/max）
 */
export const getLineOption = (xData, yData) => ({
  xAxis: { data: xData },
  series: [{ type: 'line', data: yData }]
})
