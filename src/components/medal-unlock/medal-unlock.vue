<template>
  <!-- 成就解锁仪式：全屏遮罩 + 中央徽章弹出 + 闪光 + 粒子爆发。
       遮罩常驻、class 切换（不用 v-if），出入场才有连续过渡。
       支持队列：一次达成多枚勋章时逐枚播放， tap 跳到下一枚。

       v2 动画升级（参考市面高水平解锁动画，不照搬）：
       - 闪光先行：落地瞬间一道白光爆开，徽章紧随其后砸进光里，比「干弹一下」有冲击力；
       - 扫光：落定后一道斜光扫过黑面，是勋章「被点亮」的瞬间；
       - 呼吸浮动：落定后极缓慢的上下浮动，让它「活着」而不是一张死图；
       - 状态拆分：遮罩/舞台绑 active（整场常亮），徽章/文案绑 visible（逐枚重播），
         多枚切换时背景不再跟着闪。 -->
  <view class="ceremony-mask" :class="{ show: active }" @click="onTap">
    <view class="ceremony-stage" :class="{ show: active }">
      <!-- 光环：两圈错时扩散，呼应徽章落定的一刻 -->
      <view class="halo halo-1" :class="{ pop: visible }"></view>
      <view class="halo halo-2" :class="{ pop: visible }"></view>

      <!-- 粒子爆发：12 颗向四周飞散，角度预先抖动好，避免机械对称 -->
      <view class="burst">
        <view
          v-for="(p, i) in particles"
          :key="i"
          class="burst-particle"
          :style="visible ? (p.style + p.fly) : p.style"
        ></view>
      </view>

      <!-- 徽章本体：黑材质圆 + 白色图标，落定带回弹 -->
      <view class="medal-badge" :class="{ pop: visible }">
        <!-- 落地闪光：徽章砸进光里的那一刻 -->
        <view class="medal-flash" :class="{ pop: visible }"></view>
        <view class="medal-badge-inner">
          <image class="medal-icon" :src="ICONS[current.iconWhite] || ICONS[current.icon]" mode="aspectFit" />
        </view>
        <!-- 静态顶光：黑面的金属质感基底 -->
        <view class="medal-shine"></view>
        <!-- 扫光：落定后斜向划过，勋章被「点亮」 -->
        <view class="medal-sweep" :class="{ pop: visible }"></view>
      </view>

      <!-- 文案：细线 → 标签 → 名称 → 解锁条件，错时浮入 -->
      <view class="ceremony-words" :class="{ show: visible }">
        <view class="ceremony-rule"></view>
        <text class="ceremony-eyebrow">成就解锁</text>
        <text class="ceremony-name">{{ current.name }}</text>
        <text class="ceremony-desc">{{ current.desc }}</text>
      </view>

      <!-- 计数（队列里还有几枚）+ 操作提示 -->
      <view class="ceremony-foot" :class="{ show: visible }">
        <text v-if="queue.length > 1" class="ceremony-count">{{ queueIndex + 1 }} / {{ queue.length }}</text>
        <text v-else class="ceremony-count-space"></text>
        <text class="ceremony-tap">{{ queue.length > 1 ? '轻点屏幕，看下一枚' : '轻点屏幕，继续练习' }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { ICONS } from '@/utils/svg-icons'

const props = defineProps({
  // 队列：[{ name, desc, icon, iconWhite }]，逐枚播放
  queue: { type: Array, default: () => [] }
})
const emit = defineEmits(['finish'])

/* 两态分离：
   active = 整场仪式是否进行（控制遮罩与舞台，多枚之间不闪烁）；
   visible = 当前这枚的弹出态（控制徽章/闪光/扫光/粒子/文案，逐枚重播）。 */
const active = ref(false)
const visible = ref(false)
const queueIndex = ref(0)
let showTimer = null

const current = computed(() => props.queue[queueIndex.value] || {})

/* 12 颗粒子，角度均布 + 确定性抖动（sin/i 种子），飞散自然而不像打印机。
   style 只写尺寸；终态位移通过 :style 在 .pop 时绑定，避免小程序对
   CSS 自定义属性（--tx）支持不稳导致粒子不动。 */
const particles = computed(() => {
  const n = 12
  return Array.from({ length: n }, (_, i) => {
    const base = (Math.PI * 2 * i) / n
    const jitter = Math.sin(i * 17.3) * 0.4
    const angle = base + jitter
    const dist = 96 + (Math.cos(i * 9.7) * 0.5 + 0.5) * 52
    const x = Math.cos(angle) * dist
    const y = Math.sin(angle) * dist
    const size = 8 + (i % 3) * 5
    // 错时飞出（0~90ms），避免 12 颗同时出发像打印机；收起时无延迟，退场干净
    const delay = (i % 4) * 0.03
    return {
      style: `width: ${size}rpx; height: ${size}rpx;`,
      fly: `transform: translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${i % 2 ? 0.7 : 1}); opacity: ${i % 3 ? 0.9 : 0.65}; transition-delay: ${delay}s;`
    }
  })
})

const play = (index = 0) => {
  if (index >= props.queue.length) {
    visible.value = false
    active.value = false
    emit('finish')
    return
  }
  queueIndex.value = index
  active.value = true
  // 下一枚先复位再出场，回弹动画才会重新触发（class 必须经历一次 false→true）
  visible.value = false
  clearTimeout(showTimer)
  showTimer = setTimeout(() => { visible.value = true }, 40)
}

const onTap = () => {
  // 切换中的连点必须忽略：visible 收回的 40ms 窗口内再点一次，
  // queueIndex 已推进，会算出下一个的下一个——直接跳过中间一枚勋章
  if (!visible.value) return
  const next = queueIndex.value + 1
  if (next < props.queue.length) {
    play(next)
  } else {
    visible.value = false
    active.value = false
    emit('finish')
  }
}

defineExpose({ play, onTap, active })
onUnmounted(() => clearTimeout(showTimer))
</script>

<style lang="scss" scoped>
.ceremony-mask {
  position: fixed;
  left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(26, 26, 26, 0);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.24s $ease-out, background-color 0.24s $ease-out, visibility 0.24s;
  z-index: 200;
}
.ceremony-mask.show {
  opacity: 1;
  visibility: visible;
  background: rgba(26, 26, 26, 0.42);
}

/* 舞台绑 active：多枚勋章之间只换徽章，背景不跟着闪 */
.ceremony-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 560rpx;
  padding: 72rpx 0 40rpx;
  opacity: 0;
  transform: scale(0.86);
  transition: opacity 0.28s $ease-out, transform 0.36s $ease-smooth;
}
.ceremony-stage.show {
  opacity: 1;
  transform: scale(1);
}

/* ===== 徽章：黑材质圆，落定带回弹 =====
   v2：起始收到 0.12 并延迟 0.1s，让闪光先爆、徽章后砸进光里，
   有「光等徽章」的先后关系，比同时出发有戏剧性。 */
.medal-badge {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  border-radius: 50%;
  background: linear-gradient(180deg, #2A251E 0%, #100D09 100%);
  box-shadow:
    inset 0 0 0 1rpx rgba(255, 255, 255, 0.14),
    inset 0 3rpx 0 rgba(255, 255, 255, 0.32),
    0 24rpx 56rpx rgba(0, 0, 0, 0.34);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transform: scale(0.12);
  opacity: 0;
  transition: transform 0.5s 0.1s $ease-bounce, opacity 0.2s 0.1s $ease-out;
}
.medal-badge.pop {
  transform: scale(1);
  opacity: 1;
  /* 落定后缓慢呼吸浮动：徽章「活着」，不是一张死图。
     animation 接管 transform，所以浮动期间 keyframes 里必须自己保持 scale(1)。 */
  animation: badgeFloat 2.8s 1.1s ease-in-out infinite;
}
@keyframes badgeFloat {
  0%, 100% { transform: translateY(0) scale(1); }
  50%      { transform: translateY(-7rpx) scale(1.015); }
}
.medal-badge-inner {
  width: 132rpx;
  height: 132rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.medal-icon { width: 96rpx; height: 96rpx; }

/* 落地闪光：徽章落定的一刻白光爆开又迅速收回。
   不用 filter:blur（小程序支持不稳），用径向渐变把边缘柔化。 */
.medal-flash {
  position: absolute;
  left: -30rpx; top: -30rpx; right: -30rpx; bottom: -30rpx;
  border-radius: 50%;
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.35) 38%, rgba(255, 255, 255, 0) 70%);
  opacity: 0;
  pointer-events: none;
  z-index: 3;
}
.medal-flash.pop {
  animation: flashOut 0.62s 0.08s $ease-out both;
}
@keyframes flashOut {
  0%   { opacity: 0; transform: scale(0.4); }
  32%  { opacity: 0.9; transform: scale(1.05); }
  100% { opacity: 0; transform: scale(1.6); }
}

/* 顶光：一道斜向高光压在黑面上，是「金属质感」的基底（静态常驻）。 */
.medal-shine {
  position: absolute;
  left: 22rpx; top: 18rpx;
  width: 88rpx; height: 44rpx;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.10) 55%, rgba(255, 255, 255, 0) 100%);
  transform: rotate(-28deg);
  pointer-events: none;
  z-index: 2;
}

/* 扫光：落定后一道斜光从左划到右，勋章被「点亮」的瞬间。
   父级 overflow:hidden + 圆角，扫光不会溢出徽章边缘。 */
.medal-sweep {
  position: absolute;
  left: 0;
  top: -40rpx;
  width: 56rpx;
  height: 280rpx;
  background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.42) 45%, rgba(255,255,255,0.58) 55%, rgba(255,255,255,0) 100%);
  transform: translateX(-220rpx) rotate(-28deg);
  opacity: 0;
  pointer-events: none;
  z-index: 2;
}
.medal-sweep.pop {
  animation: sweepAcross 1s 0.62s $ease-out both;
}
@keyframes sweepAcross {
  0%   { opacity: 0; transform: translateX(-220rpx) rotate(-28deg); }
  18%  { opacity: 1; }
  82%  { opacity: 1; }
  100% { opacity: 0; transform: translateX(420rpx) rotate(-28deg); }
}

/* ===== 光环：两圈错时扩散 ===== */
.halo {
  position: absolute;
  top: 72rpx;
  width: 200rpx;
  height: 200rpx;
  border-radius: 50%;
  border: 2rpx solid rgba(255, 255, 255, 0);
  opacity: 0;
  pointer-events: none;
}
.halo.pop {
  animation: haloOut 1s $ease-out forwards;
}
.halo-2.pop { animation-delay: 0.14s; }
@keyframes haloOut {
  0%   { transform: scale(0.55); opacity: 0; border-color: rgba(255, 255, 255, 0.55); }
  18%  { opacity: 1; }
  100% { transform: scale(1.9); opacity: 0; border-color: rgba(255, 255, 255, 0); }
}

/* ===== 粒子爆发 =====
   基础态在 CSS 里（opacity:0、缩小到 0.4）；终态位移/透明度由 :style 内联绑定，
   切换 visible 即触发 transition。不使用 CSS 自定义属性（小程序支持不稳）。 */
.burst {
  position: absolute;
  top: 72rpx;
  width: 200rpx;
  height: 200rpx;
  pointer-events: none;
}
.burst-particle {
  position: absolute;
  left: 50%; top: 50%;
  margin-left: -6rpx;
  margin-top: -6rpx;
  border-radius: 50%;
  /* 仪式底色是深色遮罩，粒子必须是浅色才看得见 */
  background: #FFFFFF;
  opacity: 0;
  transform: translate(0, 0) scale(0.4);
  transition: transform 0.62s $ease-out, opacity 0.62s $ease-out;
}

/* ===== 文案：错时浮入（逐枚重播，绑 visible） ===== */
.ceremony-words {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 44rpx;
  opacity: 0;
  transform: translateY(16rpx);
  transition: opacity 0.3s 0.18s $ease-out, transform 0.3s 0.18s $ease-out;
}
.ceremony-words.show { opacity: 1; transform: translateY(0); }
/* 编辑式细线：名称上方的短规则，是「这页被排过版」的细节，
   配 6rpx 字距的标签，仪式感不靠堆装饰 */
.ceremony-rule {
  width: 40rpx;
  height: 2rpx;
  background: rgba(255, 255, 255, 0.4);
  margin-bottom: 22rpx;
}
.ceremony-eyebrow {
  font-size: 24rpx;
  font-weight: $weight-semibold;
  color: rgba(255, 255, 255, 0.62);
  letter-spacing: 6rpx;
  text-indent: 6rpx;
}
.ceremony-name {
  margin-top: 16rpx;
  font-size: 48rpx;
  font-weight: $weight-heavy;
  color: #FFFFFF;
  letter-spacing: -0.5rpx;
}
.ceremony-desc {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.66);
  font-weight: $weight-medium;
}

.ceremony-foot {
  margin-top: 48rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  opacity: 0;
  transition: opacity 0.3s 0.34s $ease-out;
}
.ceremony-foot.show { opacity: 1; }
.ceremony-count {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.5);
  font-variant-numeric: tabular-nums;
}
/* 占位：单枚时没有计数行，但保持纵向间距不跳变 */
.ceremony-count-space { height: 1rpx; }
.ceremony-tap {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.44);
}
</style>
