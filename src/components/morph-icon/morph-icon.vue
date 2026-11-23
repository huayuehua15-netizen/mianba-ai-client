<template>
  <!-- 动态图标：状态切换时播放 morphicons 烘焙好的变形帧序列。
       渲染走 <image src="data:image/svg+xml,...">（项目已验证路线）——
       小程序没有 DOM，canvas 又因同层渲染问题被明令禁用（见 echart.vue 的 v27.8 注释），
       image + data URI 是唯一稳妥的选择。

       双层结构：色值烘焙在 data URI 里，CSS 无法改色。当同一图标的**颜色也随状态变化**
       （如 FAQ 展开钮：白底黑加号 → 黑底白减号），就用 frames + framesAlt 两套同形状、
       不同颜色的序列叠放，靠 opacity 交叉淡入 —— 形状由帧序列负责，颜色由透明度负责，
       两者都与状态同步，不会出现"白底上画白图标"的隐形空档。 -->
  <view class="morph-wrap" :style="sizeStyle">
    <image class="morph-img" :src="srcMain" mode="aspectFit" :style="mainStyle" />
    <image v-if="hasAlt" class="morph-img is-overlay" :src="srcAlt" mode="aspectFit" :style="altStyle" />
  </view>
</template>

<script setup>
/**
 * morph-icon —— 动态（可变形）图标组件
 * ============================================================================
 * 用法：
 *   <morph-icon frames="mic-keyboard" :active="isVoice" :size="44" />
 *   <morph-icon frames="plus-minus" frames-alt="plus-minus-white" :active="isOpen" :size="26" />
 *
 * 【帧序列从哪来】
 *   utils/morph-icons.js（由项目内的图标生成脚本产出），
 *   变形算法来自 https://github.com/guillermolg00/morphicons 的纯核心。
 *   帧在**构建期**烘焙好，运行期只做"换 src"，真机零计算风险。
 *
 * 【方向语义】
 *   active=false → 停在序列**首帧**（from 图标）
 *   active=true  → 播放到序列**末帧**（to 图标）
 *   首/末帧是精确曲线（canonicalD），静止态与静态图标逐笔一致，不会因折线弦差缺笔。
 *
 * 【降级策略（重要）】
 *   帧序列缺失时本组件**静默退回静态图标**（fallback 属性传 ICONS 里的 data URI）。
 *   绝不因为动画资源缺失而让界面出现空白。
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { getMorphFrames, MORPH_FRAME_MS } from '@/utils/morph-icons'

const props = defineProps({
  /** 帧序列键名（utils/morph-icons.js 的 MORPH_FRAMES 键） */
  frames: { type: String, required: true },
  /** 备用颜色帧序列（同形状不同色）；用于"颜色也随状态变"的场景 */
  framesAlt: { type: String, default: '' },
  /** 状态：false = 首帧(from)，true = 末帧(to) */
  active: { type: Boolean, default: false },
  /** 显示尺寸（rpx）。不传则由外部 class 控制 */
  size: { type: [Number, String], default: 0 },
  /** 降级用的静态图标 data URI（帧缺失时使用） */
  fallback: { type: String, default: '' },
  /** 备用色的降级静态图标 */
  fallbackAlt: { type: String, default: '' },
  /** 是否播放动画；关掉就只切换首/末帧（省电/无障碍场景） */
  animated: { type: Boolean, default: true }
})

const seq = computed(() => getMorphFrames(props.frames))
const seqAlt = computed(() => (props.framesAlt ? getMorphFrames(props.framesAlt) : []))
const hasFrames = computed(() => seq.value.length > 1)
const hasAlt = computed(() => seqAlt.value.length > 1)

/** 当前显示的帧下标 */
const idx = ref(0)
let timer = null

const clearTimer = () => {
  if (timer) { clearTimeout(timer); timer = null }
}

/**
 * 播放到目标状态。
 * 用 setTimeout 逐帧推进而非 requestAnimationFrame ——
 * 与项目既有的 useCountUp.js 同一取舍：小程序主线程没有可靠的 rAF。
 */
const playTo = (toActive) => {
  clearTimer()
  const list = seq.value
  if (!hasFrames.value) { idx.value = 0; return }

  const last = list.length - 1
  if (!props.animated) { idx.value = toActive ? last : 0; return }

  const target = toActive ? last : 0
  let cur = idx.value
  if (cur === target) return

  const step = () => {
    cur += target > cur ? 1 : -1
    idx.value = cur
    if (cur === target) { timer = null; return }
    timer = setTimeout(step, MORPH_FRAME_MS)
  }
  step()
}

watch(() => props.active, (v) => playTo(v), { immediate: true })
watch(() => props.frames, () => { clearTimer(); idx.value = 0; playTo(props.active) })

onUnmounted(clearTimer)

const frameAt = (list) => list[Math.min(idx.value, list.length - 1)]

const srcMain = computed(() => (hasFrames.value ? frameAt(seq.value) : props.fallback || ''))
const srcAlt = computed(() => {
  if (hasAlt.value) return frameAt(seqAlt.value)
  return props.fallbackAlt || props.fallback || ''
})

/* 颜色层：active 时显示备用色（如黑底白图标）。
   过渡时长与 FAQ 容器背景一致（0.24s），颜色与底色同步变化。 */
const mainStyle = computed(() => (hasAlt.value ? { opacity: props.active ? 0 : 1 } : {}))
const altStyle = computed(() => ({ opacity: props.active ? 1 : 0 }))

const sizeStyle = computed(() => {
  if (!props.size) return {}
  const s = typeof props.size === 'number' ? props.size + 'rpx' : props.size
  return { width: s, height: s }
})
</script>

<style scoped>
/* ⚠️ 尺寸约定（改前先读）：
 *   宿主节点（<morph-icon class="...">）的宽高由**页面 CSS** 决定（如 .mode-icon 34rpx），
 *   本组件内部一律 width/height:100% 跟随宿主，**不自己定尺寸**。
 *
 *   另有 size 属性：传了就把它写成宿主的**内联** style。
 *   内联 style 优先级高于页面 class，所以**只有当 size 与页面 class 尺寸一致时**才该传；
 *   不一致会导致内层比宿主大（溢出）或小（缩在中间），切换瞬间看着像"跳一下"。
 *   因此默认不传 size（推荐用法），让页面 CSS 单独负责尺寸。
 *   当前唯一传 size 的是帮助页 FAQ（:size="24"，与 .faq-toggle-icon 的 24rpx 一致）。
 */
.morph-wrap {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
}
.morph-img {
  display: block;
  width: 100%;
  height: 100%;
  transition: opacity 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.morph-img.is-overlay {
  position: absolute;
  left: 0;
  top: 0;
}
</style>
