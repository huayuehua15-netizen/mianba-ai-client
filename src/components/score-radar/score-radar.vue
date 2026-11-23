<template>
  <view class="score-radar">
    <echart :option="radarOption" :height="280" />
    <!-- 注：2026-10-08 曾在此处加过一行「各项满分 10 分」的量程说明，用户看过真机后
         认为多余，已移除。图内刻度（2/4/6/8/10）更早也因观感杂乱移除。
         现在雷达图就是纯粹的图形 + 五个维度标签 + 分值，不再有任何解释性文字。 -->
  </view>
</template>

<script setup>
/**
 * 能力雷达图（报告页 / 统计页共用）
 * ============================================================================
 * 本组件只做两件事：把 scores 整理成 option、按需染色。
 *
 * v35（仅报告页）：多边形按**等级色**染色 —— 这是「87 分 A 级」与「64 分 C 级」
 * 在图上能一眼分开的前提。着色之所以发生在这里而不是页面的 CSS 里，是因为
 * echart 把 SVG 拼成 data-URL 交给 <image> 渲染，**页面样式穿不透**它。
 *
 * ⚠️ 向后兼容契约（统计页是既有基线，必须一动不动）：
 *   · props 语义与默认值保持兼容，只新增一个带默认值的可选 tone；
 *   · 只有 `tone === 'grade'` 时才往 option.radar 里塞颜色字段；
 *     缺省 `tone = 'mono'` → option 里不含任何颜色字段 → echart 走原来的常量，
 *     输出与 v34 逐字节一致。
 */
import { computed } from 'vue'
import Echart from '@/components/echart/echart.vue'
import { getRadarOption } from '@/utils/charts'
/* 等级印泥色与五维均值→等级口径统一收口到 utils/grades.js
   （与 uni.scss 的 $grade-* 手工对齐：canvas/SVG 无法读取 SCSS 变量） */
import { GRADE_INK, gradeForDimAvg } from '@/utils/grades'
const gradeOf = gradeForDimAvg

const props = defineProps({
  // [{ name: '表达逻辑', score: 8 }]  score 取值 0-10
  scores: { type: Array, default: () => [] },
  // 标签下是否附分值：统计页开启，报告页不开启（默认 false，行为不变）
  showValue: { type: Boolean, default: false },
  /* 着色模式：
   *   'mono' （默认）单色墨 —— 与 v34 完全一致，统计页走这条；
   *   'grade'       按五维均值的等级取色（S金/A朱/B青/C赭/D灰），报告页走这条。
   * 新增 prop 是可选的、有默认值的，因此既有调用方零改动、零行为变化。 */
  tone: { type: String, default: 'mono' }
})

/* 五维均值 → 等级（gradeOf）：口径统一收口到 utils/grades.js 的 gradeForDimAvg
 * （0-10 量纲：S≥9 / A≥8 / B≥7 / C≥6）。用**均值**而不是最高维，是因为雷达图表达的
 * 是整体能力面而不是单项尖峰。 */

const radarOption = computed(() => {
  const list = props.scores || []
  const indicators = list.map((s) => ({ name: s.name, max: 10 }))
  const values = list.map((s) => s.score)
  const base = getRadarOption(indicators, values, { showValue: props.showValue })

  // 单色模式：原样返回（一个字节都不多），保证统计页是既有基线
  if (props.tone !== 'grade' || !values.length) return base

  const avg = values.reduce((a, b) => a + (Number(b) || 0), 0) / values.length
  const rgba = (alpha) => {
    const hex = (GRADE_INK[gradeOf(avg)] || GRADE_INK.D).replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }

  return {
    ...base,
    radar: {
      ...base.radar,
      /* 描边用实色等级墨；填充用同色的两个低透明度端点（中心略浓 → 边缘淡）。
         12% 是任务要求的量级：在米白纸上足够看出"有色"，又不至于盖住网格与标签。 */
      strokeColor: GRADE_INK[gradeOf(avg)],
      fillIn: rgba(0.12),
      fillOut: rgba(0.04),
      /* 网格线调淡：让数据多边形的形状跳出来。
         外层边界仍由 echart 的 GRID 常量画（那是"坐标系边框"，不能一起淡掉）。 */
      gridSoft: 'rgba(23,19,14,0.035)'
    }
  }
})
</script>

<style lang="scss" scoped>
.score-radar {
  padding: 8rpx 0;
}
</style>
