import { ref, watch, onUnmounted } from 'vue'

/**
 * 数字滚动动效（v7 微交互）
 * 数据从 0 缓动到目标值（easeOutCubic），非数字值（如 '--'）直接透传。
 *
 * 用法：
 *   const total = useCountUp(computed(() => stats.value?.total_interviews || 0))
 *   <text>{{ total }}</text>
 *
 * 说明：使用 setTimeout 驱动而非 requestAnimationFrame，
 * 兼容微信小程序主线程（无 rAF）；fps 默认 32ms ≈ 30fps。
 *
 * ===== v31 性能修正（重要）=====
 * 小程序端每次 ref 写入 ≈ 一次 setData，而 setData 是跨线程的序列化传输，
 * 开销远大于普通 JS 计算。统计页一度同时挂 5 个 useCountUp（另 +2 个在
 * day-detail-sheet），全部无错峰、同帧启动、各跑 900~1000ms：
 *     5 × (1000ms ÷ 16ms) ≈ 310 次/秒 setData
 * 低端安卓机上统计页卡片肉眼可见地"抽搐"。
 *
 * 两处修正：
 *  1) fps 默认 16 → 32（60fps → 30fps）：数字滚动的观感损失几乎为零
 *     （末位仍在动就够了），setData 频率直接减半。
 *  2) 新增 delay 错峰：多个数字依次启动，读起来像"数据逐项到位"，
 *     而不是"一起炸出来"。错峰用「负起点」实现，不额外起定时器。
 *
 * 用法：
 *   const total = useCountUp(computed(() => stats.value?.total_interviews || 0))
 *   <text>{{ total }}</text>
 *
 *   // 多实例场景请务必错峰（推荐 delay 按 80~100ms 递增）
 *   const a = useCountUp(ca, { delay: 0 })
 *   const b = useCountUp(cb, { delay: 80 })
 */
export function useCountUp(target, opts = {}) {
  const { duration = 800, delay = 0, fps = 32 } = opts
  // decimals 支持传函数：单位会在分钟/小时间切换的场景（练习时长）需要动态小数位
  const getDecimals = typeof opts.decimals === 'function' ? opts.decimals : () => (opts.decimals || 0)
  const display = ref(0)
  let timer = null

  const animateTo = (val) => {
    if (timer) clearTimeout(timer)
    const t = Number(val)
    // 非数字（'--' 等占位）直接显示原值
    if (Number.isNaN(t)) {
      display.value = val
      return
    }
    // 错峰：起点前移 delay 毫秒，首帧 p<=0 时空转等待，不改动最终总时长
    const start = Date.now() - delay
    const decimals = getDecimals()
    const step = () => {
      const raw = Date.now() - start
      if (raw < 0) { timer = setTimeout(step, fps); return }  // 错峰等待中
      const p = Math.min(raw / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      display.value = Number((t * eased).toFixed(decimals))
      if (p < 1) timer = setTimeout(step, fps)
      else display.value = t
    }
    step()
  }

  watch(target, (v) => animateTo(v), { immediate: true })

  onUnmounted(() => { if (timer) clearTimeout(timer) })

  return display
}
