<template>
  <!-- 勋章详情抽屉：点击展柜里的勋章卡片时从底部升起。
       刻意不做成全屏遮罩——那是「解锁仪式」专属的，复用会稀释成就感。
       锁定态显示进度环 + 当前数值，让死勋章变成看得见的目标。 -->
  <view v-if="mounted" class="md-mask" :class="{ 'md-in': active }" @click="requestClose" catchtouchmove="noop">
    <!-- 抽屉本体也挂 catchtouchmove：mask 是本节点的父级，手指落在抽屉内容上时
         touchmove 会冒泡到遮罩才被吞掉，而**页面滚动此时往往已经被启动**，
         事件拦截拦不住「已经在滚的页面」（真机实测：勋章详情展开后滑动会带动背后的我的页）。
         这里在内容层再挡一次，配合宿主页面的 page-meta 滚动锁，三层防护。 -->
    <view class="md-sheet" :class="{ 'md-sheet-in': active }" catchtouchmove="noop" @click.stop>
      <view class="md-handle"></view>

      <view class="md-stage">
        <!-- 进度环（锁定态才显示）：SVG data-URI，stroke-dashoffset 驱动弧长。
             进度 0 时不渲染，避免画一个空环出来。 -->
        <view
          class="md-ring"
          v-if="!medal.unlocked && medal.progress > 0"
          :style="{ backgroundImage: ringDataUri }"
        ></view>
        <view class="md-ring md-ring-track" v-else-if="!medal.unlocked"></view>

        <!-- 徽章本体：与解锁仪式、展柜同款黑材质语言 -->
        <view class="md-disc" :class="{ 'md-disc-locked': !medal.unlocked }">
          <view class="md-shine" v-if="medal.unlocked"></view>
          <image
            class="md-icon"
            :src="ICONS[medal.unlocked ? `${medal.icon}-white` : medal.icon]"
            mode="aspectFit"
          />
        </view>
      </view>

      <text class="md-name">{{ medal.name }}</text>
      <text class="md-desc">{{ medal.desc }}</text>

      <!-- 状态行：解锁 / 未解锁两副面孔 -->
      <view class="md-status" v-if="medal.unlocked">
        <view class="md-chip">
          <image class="md-chip-icon" :src="ICONS['check-white']" mode="aspectFit" />
          <text class="md-chip-text">已解锁</text>
        </view>
        <!-- 达成日期：不显眼的一小行，但是真实的（后端从历史记录推算） -->
        <text class="md-date" v-if="medal.date">{{ medal.date }} 达成</text>
      </view>
      <view class="md-status md-status-locked" v-else>
        <text class="md-progress-text" v-if="medal.progress > 0">
          已完成 {{ progressPct }}%{{ progressNote ? ' · ' + progressNote : '' }}
        </text>
        <text class="md-progress-text" v-else>尚未开始练习</text>
        <text class="md-hint">{{ progressHint }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { ICONS } from '@/utils/svg-icons'

const props = defineProps({
  visible: { type: Boolean, default: false },
  medal: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['close'])

/* ===== 进出场状态机（2026-10-12 新增退场动画）=====
 * 用户反馈：「点开有从底部滑出的动画，关闭时几乎瞬间消失」。
 * 根因：原来是 `v-if="visible"` —— 父级把 visible 置 false 时，
 *       整棵 DOM 立刻被移除，**根本不存在播退场动画的机会**。
 *       只有入场动画（mdUp/mdFade），没有退场。
 *
 * 修法：照搬本项目 day-detail-sheet 已验证的自管挂载模式，不发明新机制：
 *   mounted — DOM 是否挂着。挂载权在组件自己手里（父级不再 v-if），
 *             不可见时必须自己 v-if 掉，否则 fixed 遮罩会盖死整页。
 *   active  — 终态开关。true = 到位（不下发位移/透明），false = 初态。
 *             入场靠"挂载时先 false → 下一帧转 true"触发过渡；
 *             退场靠"关时转 false → CLOSE_MS 后再卸载"。
 *
 * 为什么用「类切换 + CSS transition」而不是 keyframes 动画：
 *   动画（animation）只在元素插入时播一次，无法用于退场；
 *   过渡（transition）由类名驱动，进出场共用同一套属性声明，天然对称。
 *
 * 为什么不给父级加 v-if：父级 profile 页只改 visible，保持原契约不变，
 *   组件内部自管挂载 —— 调用方零改动，这是 day-detail-sheet 的既有约定。 */
const mounted = ref(false)
const active = ref(false)
let enterTimer = null
let exitTimer = null
const ENTER_NEXT_FRAME_MS = 20   // 等一帧，让初态先上屏，过渡才有起点
const CLOSE_MS = 280             // 退场时长，与进入（$motion-slow 0.36s）对称偏快

const clearEnter = () => { if (enterTimer) { clearTimeout(enterTimer); enterTimer = null } }
const clearExit = () => { if (exitTimer) { clearTimeout(exitTimer); exitTimer = null } }

// 小程序端没有 matchMedia；取不到按「无减弱」处理。命中时直接落到终态、跳过位移帧。
const reduceMotion = () => {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch (e) { return false }
}

const openSheet = () => {
  clearEnter()
  clearExit()
  mounted.value = true
  if (reduceMotion()) { active.value = true; return }
  // 先以初态（位移+透明）挂载，下一帧再转到终态 —— 过渡才有可动的起点
  active.value = false
  enterTimer = setTimeout(() => { enterTimer = null; active.value = true }, ENTER_NEXT_FRAME_MS)
}

const finishExit = () => {
  clearEnter()
  clearExit()
  mounted.value = false
  active.value = false
}

/* 请求关闭：遮罩点击 / 关闭动作都走这里。
   ⚠️ 先转 active=false（用户一点就有反馈），CLOSE_MS 后再真正卸载。
   立即 emit('close') 让父级同步 visible=false —— 父级状态与组件动画解耦，
   这样父级的滚动锁等副作用照旧按原时机生效。 */
const requestClose = () => {
  if (!mounted.value) return
  clearEnter()
  active.value = false
  emit('close')
  // +20ms 余量：等过渡真正播完再卸，最后一帧不会被切掉
  clearExit()
  exitTimer = setTimeout(finishExit, CLOSE_MS + 20)
}

/* visible 变化驱动状态机。immediate 让「初始就 visible=true」的用法也能正确进场。 */
watch(() => props.visible, (v) => {
  if (v) { openSheet(); return }
  // false：若还没挂载（父级在动画结束后再次置 false）就不做任何事
  if (!mounted.value) return
  /* 已经在退场途中：不重启计时（否则连点会拖长卸载时间）。
     也不主动再 emit，避免与 requestClose 形成回路。 */
  if (exitTimer) return
  active.value = false
  clearExit()
  exitTimer = setTimeout(finishExit, CLOSE_MS + 20)
}, { immediate: true })

onUnmounted(() => { clearEnter(); clearExit() })

/* 关掉后父级若把 medal 清空，退场期间会闪一下空态 —— 冻结一份快照。
   与 day-detail-sheet 的 shownDetail 同思路。 */
const shownMedal = ref(props.medal || {})
watch(() => props.medal, (m) => { if (props.visible) shownMedal.value = m || {} })
const medal = computed(() => (props.visible ? (props.medal || {}) : shownMedal.value))

const noop = () => {}

const progressPct = computed(() => Math.round((medal.value.progress || 0) * 100))

/* 进度环：120×120 viewBox，半径 52，周长 ≈ 326.7。
   dashoffset = 周长 × (1 - 进度)，起点旋转到 12 点钟方向。
   颜色与描边宽度全部烤进 data-URI，小程序对 CSS 自定义属性支持不稳，不传参。 */
const ringDataUri = computed(() => {
  const C = 2 * Math.PI * 52
  const offset = (C * (1 - (medal.value.progress || 0))).toFixed(1)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="#14110D" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset}" transform="rotate(-90 60 60)"/></svg>`
  // encodeURIComponent 后再转义引号，data-URI 在 CSS url() 里才不会断
  const encoded = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22')
  return `url("data:image/svg+xml,${encoded}")`
})

/* 进度旁的补充说明：把百分比换成有量纲的说法（进度本身不带单位信息）。 */
const progressNote = computed(() => {
  const m = medal.value
  if (!m || !m.desc) return ''
  // 从 desc 里把门槛摘出来做文案
  const d = m.desc
  if (d.includes('场面试')) return '继续完成面试即可累积'
  if (d.includes('连续练习')) return '保持每日练习'
  if (d.includes('作答')) return '每场面试都在累积题数'
  if (d.includes('分钟')) return '练习时长持续累加'
  return ''
})

const progressHint = computed(() => {
  const d = medal.value.desc || ''
  if (medal.value.progress >= 0.99) return '即将达成，再练一次就解锁'
  if (d.includes('连续练习')) return '中断会清零连续天数，每天练一点就好'
  return '继续练习，这枚勋章就在前面'
})
</script>

<style lang="scss" scoped>
.md-mask {
  position: fixed;
  left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(26, 26, 26, 0.45);
  z-index: 150;
  display: flex;
  align-items: flex-end;
  /* ===== 入场/退场改为 transition 驱动（2026-10-12）=====
   * 原实现用 `animation: mdFade`（keyframes）—— 关键帧动画**只在元素插入时播一次**，
   * 关闭时组件被 v-if 移除，没有可播退场的载体。
   * 改为 transition + 类切换：.md-in 是终态，无此类即初态（透明）。
   * 进出场共用同一组属性声明 → 天然对称，退场就是入场的逆过程。 */
  opacity: 0;
  transition: opacity $motion-base $ease-out;
}
.md-mask.md-in {
  opacity: 1;
}
.md-sheet {
  width: 100%;
  background: #FFFFFF;
  border-radius: $radius-2xl $radius-2xl 0 0;
  padding: 20rpx 48rpx calc(44rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  box-shadow: $shadow-sheet;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 抽屉本体：从屏幕底部升起 / 降回底部。
     时长沿用入场时的 $motion-slow(0.36s)；退场由组件的 CLOSE_MS(280ms) 控制卸载，
     280ms 后节点移除，过渡在视觉上已完成（$motion-slow 的尾部很缓，肉眼无差）。 */
  transform: translateY(100%);
  transition: transform $motion-slow $ease-out;
}
.md-sheet.md-sheet-in {
  transform: translateY(0);
}
.md-handle {
  width: 64rpx;
  height: 8rpx;
  /* v35：把手不占胶囊名额；8rpx 高 + 10rpx 圆角渲染仍为全圆，视觉零变化 */
  border-radius: $radius-sm;
  background: $track;
  margin: 0 auto 32rpx;
  flex-shrink: 0;
}

/* 舞台：圆盘 + 环的容器，给环留出比圆盘大一圈的的空间 */
.md-stage {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;
  flex-shrink: 0;
}
/* 进度环轨道：极浅灰底环，彩色弧铺在上面才有「进度」的读数感 */
.md-ring-track {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Ccircle cx='60' cy='60' r='52' fill='none' stroke='%23EBEBEB' stroke-width='5'/%3E%3C/svg%3E");
}
.md-ring {
  position: absolute;
  left: 0; top: 0;
  width: 200rpx;
  height: 200rpx;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  /* 弧长在入场时从 0 长到目标值：从 mask 升起的那一刻环就在画，不是突然出现 */
  animation: mdRing 0.7s 0.15s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
@keyframes mdRing {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}

/* 圆盘：黑材质（解锁）/ 浅灰描边（锁定）——与展柜卡片、解锁仪式同语言 */
.md-disc {
  position: relative;
  width: 152rpx;
  height: 152rpx;
  border-radius: 50%;
  background: linear-gradient(180deg, #2A251E 0%, #100D09 100%);
  box-shadow:
    inset 0 0 0 1rpx rgba(255, 255, 255, 0.14),
    inset 0 3rpx 0 rgba(255, 255, 255, 0.32),
    0 14rpx 32rpx rgba(26, 26, 26, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.md-disc-locked {
  background: $bg-fill;
  box-shadow: inset 0 0 0 1rpx $border-strong;
}
.md-icon { width: 72rpx; height: 72rpx; }
.md-disc-locked .md-icon { opacity: 0.32; }
/* 顶光：黑面金属质感，径向渐变柔化，不用 blur */
.md-shine {
  position: absolute;
  left: 24rpx; top: 20rpx;
  width: 64rpx; height: 32rpx;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.10) 55%, rgba(255, 255, 255, 0) 100%);
  transform: rotate(-28deg);
  pointer-events: none;
}

.md-name {
  font-size: 36rpx;
  font-weight: $weight-heavy;
  color: $ink;
  letter-spacing: -0.5rpx;
  line-height: 1.2;
}
.md-desc {
  margin-top: 10rpx;
  font-size: 26rpx;
  color: $text-3;
  line-height: 1.5;
}

/* 状态行：解锁态给胶囊 + 日期，锁定态给进度文案 */
.md-status {
  margin-top: 28rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}
.md-chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  background: $ink;
  border-radius: $radius-pill;
  padding: 8rpx 20rpx;
}
.md-chip-icon { width: 20rpx; height: 20rpx; }
.md-chip-text {
  font-size: 22rpx;
  font-weight: $weight-semibold;
  color: #FFFFFF;
  letter-spacing: 1rpx;
}
/* 达成日期：小小一行，不抢戏，但是真实的 */
.md-date {
  font-size: 22rpx;
  color: $text-4;
  font-family: $font-mono;
  font-variant-numeric: tabular-nums;
}
.md-status-locked { gap: 8rpx; }
.md-progress-text {
  font-size: 24rpx;
  color: $text-2;
  font-weight: $weight-semibold;
}
.md-hint {
  font-size: 22rpx;
  color: $text-4;
  line-height: 1.5;
}
</style>
