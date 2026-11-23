<template>
  <!-- v35.3 第二十一批：加载遮罩从「IP 浮动 + 三点 + 文案」升级为**等待凭证票**。
       ============================================================================
       旧版的问题：IP 和三颗点"浮"在空页上，没有任何承载物 ——
       6~60s 的等待里画面是"空的"，既没有纸本语言，也没有可读的等待进度。

       新版把等待做成**一张从机器里吐出来的凭证票**：
         · 白纸票据卡（hairline 描边 + 纸张纹理 + 底部齿孔撕线）—— 纸本语言本体
         · 印章仪式：入场/批阅章在开场 ~260ms 后「盖」到票上（scale 1.8→1 + 旋转落定）
         · 仪器读数：ELAPSED 真实计时（mono + tabular-nums，不跳字宽）——
           等待的诚实反馈，比三颗假点更有"系统在工作"的说服力
         · 滑行轨：8rpx 凹槽轨上的墨块匀速巡游（indeterminate 仪表语言）
         · meta 行（可选）：岗位/难度/轮次等真实上下文，等待也顺带确认信息
       三点动画退役 —— 仪器读数 + 滑行轨已是更强的"活着"信号。

       ===== 保留的历史契约（勿破坏）=====
       ① 页面跳转（redirectTo）前**不要**隐藏本遮罩——遮罩随页面销毁自动消失；
          提前隐藏会在跳转动画期间露出底层被清空的页面。退场不做淡出，同因。
       ② 分阶段文案：内层 :key 绑定 currentTitle，换字时重建节点才能重播动画
          （Vue 同节点改文本不重建）。只给文字节点加 key，不给遮罩加。
       ③ 三个调用方全是长耗时操作（首题 10~60s / 报告 6~25s / 轮询期），
          不需要最小展示时长逻辑。 -->
  <view class="loading-overlay" catchtouchmove="noop">
    <view class="ticket">
      <text class="ticket-eyebrow">{{ eyebrow }}</text>

      <view class="mascot-zone">
        <image class="loading-mascot" src="/static/ip_mianba_smile.png" mode="aspectFit" />
        <!-- 印章仪式：入场/批阅章。落定前 scale(1.8) + 高旋转 + 透明，落定后压在票上。 -->
        <view v-if="stamp" class="stamp" :class="{ 'stamp-landed': stampLanded }">
          <text class="stamp-text">{{ stamp }}</text>
        </view>
      </view>

      <text class="loading-title" :key="currentTitle">{{ currentTitle }}</text>
      <text v-if="sub" class="loading-sub">{{ sub }}</text>

      <!-- 真实上下文行（可选）：岗位 / 难度 / 轮次 -->
      <view class="ticket-meta" v-if="meta && meta.length">
        <view class="meta-row" v-for="(m, i) in meta" :key="i">
          <text class="meta-key">{{ m[0] }}</text>
          <text class="meta-val">{{ m[1] }}</text>
        </view>
      </view>

      <!-- 仪器：真实计时读数 + 滑行轨 -->
      <view class="ticket-meter">
        <view class="meter-head">
          <text class="meter-en">ELAPSED</text>
          <text class="meter-time">{{ elapsedText }}</text>
        </view>
        <view class="meter-track">
          <view class="meter-sweep"></view>
        </view>
      </view>

      <!-- 齿孔撕线：票据被撕下来的物理证据（孔色 = 页面底色 $paper） -->
      <view class="ticket-perf"></view>
    </view>
  </view>
</template>

<script setup>
/**
 * 通用加载遮罩（v35.3 等待凭证票版）。
 * 用于「面试开场等待」「生成报告等待」「报告轮询」等长耗时场景。
 *
 * props：
 *   title / sub / stages —— 与旧版一致（stages 分阶段换标题，到点自动推进）
 *   stamp   —— 印章文字（'入场' / '批阅'），空串不渲染
 *   eyebrow —— 票头等宽眉标（'ENTRANCE · 入场准备' 等）
 *   meta    —— [[label, value], …] 真实上下文行（岗位/难度/轮次）
 */
import { ref, onUnmounted } from 'vue'

const props = defineProps({
  title: { type: String, default: '加载中' },
  sub: { type: String, default: '' },
  stages: { type: Array, default: () => [] },
  stamp: { type: String, default: '' },
  eyebrow: { type: String, default: 'PLEASE WAIT' },
  meta: { type: Array, default: () => [] }
})

const currentTitle = ref(props.title)
const timers = []
if (props.stages && props.stages.length) {
  props.stages.forEach(([ms, text]) => {
    timers.push(setTimeout(() => { currentTitle.value = text }, ms))
  })
}

/* 印章落定：卡片 fadeIn（0.16s）之后 ~260ms 盖下 —— 先看清票据，再盖章。 */
const stampLanded = ref(false)
if (props.stamp) {
  timers.push(setTimeout(() => { stampLanded.value = true }, 260))
}

/* 真实计时：100ms 步进，mm:ss.d 等宽读数（tabular-nums 保证不跳字宽）。
   等待的诚实反馈 —— 用户能看出"系统确实在跑"，而不是三颗假点在循环。 */
const elapsedText = ref('00:00.0')
const startedAt = Date.now()
const meterTimer = setInterval(() => {
  const t = (Date.now() - startedAt) / 1000
  const mm = String(Math.floor(t / 60)).padStart(2, '0')
  const ss = String(Math.floor(t % 60)).padStart(2, '0')
  const d = Math.floor((t % 1) * 10)
  elapsedText.value = `${mm}:${ss}.${d}`
}, 100)

onUnmounted(() => {
  timers.forEach(clearTimeout)
  if (meterTimer) clearInterval(meterTimer)
})

/* catchtouchmove 需要一个事件处理函数才能生效。
   全屏遮罩期间底下的页面仍在，手指滑动会带动页面滚动（用户看到遮罩是静止的、
   背后内容却在动，观感是"卡住"）。与 confirm-sheet / day-detail-sheet 的做法对齐。 */
const noop = () => {}
</script>

<style lang="scss" scoped>
/* 纯纸色不透明底：必须完全盖住底层页面（含被清空的对话区），
   半透明在页面切换瞬间会透出残影。
   ⚠️ 不要为了"退场淡出"把它改成半透明 —— 本组件的关键用法就是
   跳转（redirectTo）前不隐藏、随页面销毁消失。 */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background: $bg-page;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn $motion-fast $ease-out both;
}

/* ===== 等待凭证票 =====
   白纸卡：hairline 描边 + 纸张纹理（与页面同配方），底部齿孔撕线。
   宽度收到 560rpx —— 票据要"窄于屏"才有从机器里吐出来的感觉。 */
.ticket {
  position: relative;
  width: 560rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx 44rpx 52rpx;
  background: $paper-card;
  border: 1rpx solid $rule;
  border-radius: $radius-lg;
  box-shadow: 0 6rpx 24rpx rgba(23, 19, 14, 0.06);
  overflow: hidden;
  background-image: repeating-linear-gradient(
    92deg,
    rgba(23, 19, 14, 0.014) 0rpx,
    rgba(23, 19, 14, 0.014) 1rpx,
    transparent 1rpx,
    transparent 4rpx
  );
}
.ticket-eyebrow {
  font-family: $font-mono;
  font-size: 18rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.6rpx;
}

/* ===== 吉祥物 + 印章 ===== */
.mascot-zone {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 28rpx;
  width: 200rpx;
  height: 200rpx;
}
.loading-mascot {
  width: 172rpx;
  height: 172rpx;
  animation: loadingFloat 2.4s ease-in-out infinite;
}
/* 呼吸光晕：吉祥物背后，只动 opacity（合成层）。暖墨而非冷黑。 */
.loading-mascot::before {
  content: '';
  position: absolute;
  top: -20rpx;
  left: -20rpx;
  right: -20rpx;
  bottom: -20rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(23, 19, 14, 0.07) 0%, rgba(23, 19, 14, 0) 70%);
  z-index: -1;
  animation: haloBreathe 3.2s ease-in-out infinite;
}

/* 印章：朱砂描边小方章，落定动画 = 本页的"签名时刻"。
   落定前：scale(1.8) rotate(-22deg) opacity 0（举在半空）；
   落定后：scale(1) rotate(-8deg) opacity 0.96（盖下），缓动带一点回弹。 */
.stamp {
  position: absolute;
  right: -6rpx;
  top: 6rpx;
  width: 92rpx;
  height: 92rpx;
  border-radius: $radius-sm;
  border: 3rpx solid $verm;
  background: rgba(192, 57, 43, 0.06);
  box-shadow: inset 0 0 0 2rpx rgba(192, 57, 43, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  opacity: 0;
  transform: scale(1.8) rotate(-22deg);
  transition: opacity $motion-base $ease-out, transform 0.34s $ease-bounce;
  pointer-events: none;
}
.stamp-landed {
  opacity: 0.96;
  transform: scale(1) rotate(-8deg);
}
.stamp-text {
  font-family: $font-mono;
  font-size: 34rpx;
  font-weight: $weight-black;
  color: $verm;
  line-height: 1;
}

@keyframes loadingFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-10rpx); }
}
@keyframes haloBreathe {
  0%, 100% { opacity: 0.55; transform: scale(0.94); }
  50%      { opacity: 1;    transform: scale(1.06); }
}

/* ===== 文案 ===== */
.loading-title {
  margin-top: 26rpx;
  font-size: $font-lg;
  font-weight: $weight-bold;
  color: $text-1;
  animation: titleIn $motion-slow $ease-out both;
}
@keyframes titleIn {
  from { opacity: 0; transform: translateY(8rpx); }
  to   { opacity: 1; transform: none; }
}
.loading-sub {
  margin-top: 12rpx;
  font-size: $font-sm;
  color: $text-3;
  line-height: 1.6;
  text-align: center;
}

/* ===== 真实上下文行 ===== */
.ticket-meta {
  width: 100%;
  margin-top: 26rpx;
  border-top: 1rpx solid $rule;
}
.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 14rpx 2rpx;
  border-bottom: 1rpx solid $rule;
}
.meta-row:last-child { border-bottom: none; }
.meta-key {
  font-size: 21rpx;
  color: $text-3;
  font-weight: $weight-medium;
  flex-shrink: 0;
}
.meta-val {
  font-family: $font-mono;
  font-size: 22rpx;
  font-weight: $weight-bold;
  color: $text-1;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* ===== 仪器：真实计时 + 滑行轨 ===== */
.ticket-meter {
  width: 100%;
  margin-top: 24rpx;
}
.meter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.meter-en {
  @include mono-label;
}
.meter-time {
  @include readout(30rpx);
  color: $text-1;
}
/* 滑行轨：凹槽底 + 墨块匀速巡游（indeterminate）。
   墨块 30% 宽，keyframes 平移一整个轨宽再回卷 —— 与真实计时同读作"仪器在跑"。 */
.meter-track {
  height: 8rpx;
  border-radius: 4rpx;
  background: $paper-sunken;
  box-shadow: $emboss-1;
  margin-top: 14rpx;
  overflow: hidden;
  position: relative;
}
.meter-sweep {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 30%;
  border-radius: 4rpx;
  background: linear-gradient(90deg, rgba(23, 19, 14, 0) 0%, $ink 30%, $ink 70%, rgba(23, 19, 14, 0) 100%);
  animation: meterSweep 1.6s $ease-smooth infinite;
}
@keyframes meterSweep {
  0%   { left: -30%; }
  100% { left: 100%; }
}

/* ===== 齿孔撕线 =====
   孔色 = 页面底色 $paper：像票据底部被冲出一排孔，撕下来就是这张等待凭证。 */
.ticket-perf {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 12rpx;
  background-image: radial-gradient(
    circle at 50% 100%,
    $paper 0rpx,
    $paper 5rpx,
    transparent 5rpx
  );
  background-size: 22rpx 12rpx;
  background-repeat: repeat-x;
  background-position: center bottom;
  opacity: 0.9;
  pointer-events: none;
}
</style>
