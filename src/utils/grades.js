/**
 * 等级语义色 —— JS 侧唯一事实源（v35 第十四批抽取）
 * ============================================================================
 * 为什么必须存在：SCSS 变量进不了 JS。凡是需要把等级色塞进 `:style` 内联样式
 * 或 canvas/SVG 字面量的地方（首页进度轨、雷达图多边形），都从这里取色。
 *
 * ⚠️ 同步铁律：本表与 uni.scss 的 $grade-* 一一对应。改任何一边必须同步另一边
 * （audit-design.mjs 的 ALLOWED 白名单里登记了这些色值，改完重跑审计确认）。
 *
 * 用法边界（v35 铁律）：等级色只用于印章 / 徽章 / 分数读数 / 进度条填充 /
 * 雷达多边形，**不得**大面积铺色作背景。
 */

/** 五级印泥色：S 鎏金 / A 朱砂 / B 墨青 / C 赭石 / D 石灰 */
export const GRADE_INK = {
  S: '#A8842C', // 鎏金
  A: '#C0392B', // 朱砂（与主强调色同源）
  B: '#2C5F52', // 墨青
  C: '#96603A', // 赭石
  D: '#7E7468'  // 石灰
}

/**
 * 等级色 · 墨面提亮版（v35.1 第十五批提升为全局）。
 * 一级 GRADE_INK 是为纸面调的，压在墨面板（首页 hero / 报告总分卡）上对比度
 * 只有 3:1 左右 —— 「5.9 分 D 级」的印章/进度轨会糊进黑卡里。
 * 与 uni.scss 的 $grade-*-lit 一一对应；只用于深色卡片内部。
 */
export const GRADE_INK_LIT = {
  S: '#D9B45A', // 鎏金提亮
  A: '#E8664F', // 朱砂提亮
  B: '#5FAA8E', // 墨青提亮
  C: '#C4895D', // 赭石提亮
  D: '#A1968A'  // 石灰提亮（D 级也要在黑卡上看得见）
}

/** 百分制（0-100）→ 等级。口径与统计页/首页一致：S90 / A80 / B70 / C60。 */
export const gradeForScore = (score) => {
  if (typeof score !== 'number') return 'D'
  if (score >= 90) return 'S'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}

/** 五维均值（0-10 量纲）→ 等级。口径与 score-radar 一致：S≥9 / A≥8 / B≥7 / C≥6。 */
export const gradeForDimAvg = (avg) => {
  if (typeof avg !== 'number') return 'D'
  if (avg >= 9) return 'S'
  if (avg >= 8) return 'A'
  if (avg >= 7) return 'B'
  if (avg >= 6) return 'C'
  return 'D'
}

/** 等级取色（未知等级回石灰 D） */
export const gradeInk = (g) => GRADE_INK[g] || GRADE_INK.D

/** 墨面提亮取色（未知等级回石灰提亮 D） */
export const gradeInkLit = (g) => GRADE_INK_LIT[g] || GRADE_INK_LIT.D
