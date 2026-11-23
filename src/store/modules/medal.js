import { defineStore } from 'pinia'
import { buildMedals } from '@/utils/medals'

/**
 * 成就解锁：全局检测 + 仪式队列
 *
 * 为什么要独立成 store（2026-10-08 重构）：
 *   旧实现的检测与弹窗都写在 pages/profile/index.vue 的 onShow 里 —— 于是
 *   **只有打开「我的」页才会播解锁仪式**。用户做完面试跳到报告页时，勋章其实
 *   早在后端算出来了，却看不到任何反馈；等他哪天顺手点开「我的」才突然弹出来，
 *   而弹出来的那个日期又和当下对不上。成就的价值就在「达成瞬间的反馈」，
 *   延迟到逛个人中心才给 = 奖励发错了时间点。
 *
 * 现在的分工：
 *   - **检测**：全局副作用。任何页面把 stats 拉到 userStore 后调 `detect()` 即可，
 *     不依赖页面。触发点由 userStore.fetchStats 统一挂（见 store/modules/user.js）。
 *   - **展示**：`<medal-ceremony-host>` 组件挂在用户真实会停留的页面
 *     （首页 / 报告页 / 我的页 / 快速练习页）。为什么不挂 App.vue：
 *     小程序端 App.vue 的 template **不参与页面渲染**，社区要靠 @uni-ku/root
 *     这类插件才能做全局组件 —— 为一个成就弹窗引构建插件不划算。
 *
 * 跨端一致性：seen 集合落本地存储，与后端 unlocked 做 diff，
 * 所以「在另一台手机上达成的勋章」下次启动只补一次，不会重复播。
 */
const SEEN_KEY = 'medalSeen'

const loadSeen = () => {
  try {
    const v = uni.getStorageSync(SEEN_KEY)
    return Array.isArray(v) ? v.filter((id) => typeof id === 'number') : []
  } catch (e) { return [] }
}

export const useMedalStore = defineStore('medal', {
  state: () => ({
    // 已播放过仪式的勋章 id（响应式副本，供「我的」页计算"新解锁"角标等）
    seenIds: loadSeen(),
    // 待播仪式队列（空 = 不显示）。宿主组件 watch 它来起动画。
    queue: [],
    // 最近一次检测到的新解锁（页面可用它做轻提示，可选）
    lastUnlocked: []
  }),

  getters: {
    hasCeremony: (s) => s.queue.length > 0
  },

  actions: {
    saveSeen(ids) {
      this.seenIds = ids
      try { uni.setStorageSync(SEEN_KEY, ids) } catch (e) { /* 存储异常忽略 */ }
    },

    /**
     * 检测新解锁（幂等，可被任意页面调用）
     * @param {object} stats userStore.stats —— 由调用方传入而不是本 store 自己去取，
     *   避免 medal store 与 user store 互相 import 形成循环依赖（ESM 下就没有 require 兜底）
     * @returns {Array} 本次新解锁的勋章（已截断到最多 3 枚）
     */
    detect(stats) {
      const medals = buildMedals(stats)
      const unlocked = medals.filter((m) => m.unlocked)
      if (unlocked.length === 0) return []

      const seen = this.seenIds || []
      const seenSet = new Set(seen)
      const fresh = unlocked.filter((m) => !seenSet.has(m.id))

      // 无论用户是否看完都先整体落盘：半路退出小程序不会下次重复弹同一批
      this.saveSeen(unlocked.map((m) => m.id))

      // 老用户升级到「有勋章检测」的版本时会一次性补发，最多播 3 枚；
      // 真新用户逐枚达成，一次最多 1~2 枚，不受此限制。
      const capped = (seen.length === 0 && fresh.length > 3) ? fresh.slice(0, 3) : fresh
      if (capped.length) {
        this.lastUnlocked = capped
        this.queue = capped.map((m) => ({
          name: m.name,
          desc: m.desc,
          icon: m.icon,
          iconWhite: `${m.icon}-white`
        }))
      }
      return capped
    },

    /** 仪式播完（或用户点完最后一张）时清空队列 */
    finish() {
      // 延迟清空：同步清会让组件的 current 变空对象，
      // 勋章名称/描述在 0.24s 退场动画里就消失了（观感是"文案先没、黑罩子才退"）
      setTimeout(() => { this.queue = [] }, 320)
    }
  }
})
