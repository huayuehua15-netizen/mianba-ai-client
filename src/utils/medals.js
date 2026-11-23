/**
 * 成就勋章：展示信息 + 与后端 medal_meta 的合并逻辑
 *
 * 为什么抽到这里：勋章原本只有「我的」页在用（定义写在 pages/profile 的 computed 里）。
 * 但解锁仪式必须能在**任何页面**播（用户做完面试在报告页、练完在快速练习页就该看到），
 * 所以定义与合并逻辑需要一个全局单点，避免各页面各写一份导致阈值漂移。
 *
 * 判定与达成日期**一律取后端**（/user/stats 的 medal_meta，见 userController.calcMedalMeta），
 * 前端只保留名称/描述/图标这类纯展示信息。这也是为了避免前端拿旧缓存自算解锁状态、
 * 与后端结果打架（上一版就是写死 unlocked，导致每个人看到的勋章一模一样，纯装饰）。
 * ⚠️ 改这里的 id / 阈值必须同步改 server/src/controllers/userController.js 的 MEDAL_DEFS。
 */
export const MEDAL_DEFS = [
  { id: 1, name: '初次登场', desc: '完成首场面试', icon: 'flag' },
  { id: 2, name: '小试牛刀', desc: '完成 3 场面试', icon: 'zap' },
  { id: 3, name: '渐入佳境', desc: '完成 10 场面试', icon: 'star' },
  { id: 4, name: '三日不辍', desc: '连续练习 3 天', icon: 'check' },
  { id: 5, name: '持之以恒', desc: '连续练习 7 天', icon: 'flame' },
  { id: 6, name: '习惯养成', desc: '连续练习 21 天', icon: 'calendar' },
  { id: 7, name: '百炼成钢', desc: '累计 50 场面试', icon: 'sword' },
  { id: 8, name: '全能选手', desc: '累计作答 100 题', icon: 'trophy' },
  { id: 9, name: '表达大师', desc: '平均分 85+', icon: 'mic' },
  { id: 10, name: '五维均衡', desc: '五项维度均 7+', icon: 'target' },
  { id: 11, name: '沉浸时刻', desc: '累计练习 60 分钟', icon: 'clock' }
]

/**
 * 把后端 medal_meta 合并成完整勋章列表（含未解锁项与进度）
 * @param {object} stats userStore.stats
 * @returns {Array<{id,name,desc,icon,unlocked,date,progress}>}
 */
export const buildMedals = (stats) => {
  const meta = (stats && stats.medal_meta) || {}
  return MEDAL_DEFS.map((d) => {
    const m = meta[d.id] || {}
    return {
      ...d,
      unlocked: !!m.unlocked,
      date: m.date || null,
      progress: typeof m.progress === 'number' ? m.progress : 0
    }
  })
}
