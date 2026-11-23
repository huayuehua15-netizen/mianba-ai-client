/**
 * 格式化工具
 *
 * ⚠️ 为什么这里全部手写补零、不用 `toLocaleDateString`（P2 修复说明，2026-10-08）：
 * 微信小程序各端 JS 引擎（iOS JavaScriptCore / Android V8）对 `Intl` 与 locale 参数的
 * 支持不一致，`toLocaleDateString('zh-CN')` 可能输出 `2026/10/8`、`2026年10月8日`，
 * 甚至忽略 locale 参数 —— 同一字段在不同机型上长得不一样。
 * 项目里 `interview-card.vue` 与 `history/index.vue` 曾各自直接用 toLocaleDateString
 * （且一处带 locale 一处不带），渲染的是同一事实却格式不同。
 * 现在统一收敛到本文件：所有日期显示都走 formatDate / formatDateTime。
 * 另外补了非法日期守卫：`new Date('bad')` 会让 toLocaleDateString 直接显示 "Invalid Date"。
 */
export const formatDate = (date) => {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''   // 非法日期：宁可不显示，也不显示 "Invalid Date"
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const formatDateTime = (date) => {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const formatDuration = (seconds) => {
  if (!seconds) return '0秒'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}分${s}秒` : `${s}秒`
}

export const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const scoreToGrade = (score) => {
  if (score >= 90) return 'S'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  return 'D'
}

/* ⚠️ gradeColor —— 已废弃，**不要使用**（v30 处置）。
 *
 * 原实现返回马卡龙彩虹色（#9c27b0 紫 / #4caf50 绿 / #2196f3 蓝 / #ff9800 橙 / #f44336 红），
 * 与本项目 v22 起的**单色纪律**直接冲突：全站层次只由 1rpx hairline 与浅填充承担，
 * 语义色仅限 $success/$warning/$danger 三档状态用途。一旦有人 import 它，
 * 页面上会立刻出现一块破坏色板的彩色。
 *
 * 现状：**零可达引用**。唯一调用方曾是 score-circle 组件，
 * 而报告页的分数早已改用 hero 黑材质卡 + useCountUp 滚动（见 pages/report/index.vue），
 * 该组件在 v31 已彻底删除。现存的几处提及（如 echart.vue 的注释）只是
 * 在引用一段**已不存在的历史实现**，不是活的依赖。
 *
 * 为什么保留函数而不是删除：删文件/删导出属于功能决策，不在本轮范围。
 * 但**必须让"误用它"变得不可能**——所以改为返回单色刻度值。
 * 需要"按等级区分视觉"时，正确做法是用 .tag-* / .pill-badge.* 全局类
 * （它们走 $ink/$ash 单色阶 + 字重区分），而不是给文字上色。 */
export const gradeColor = () => '#1A1A1A'
