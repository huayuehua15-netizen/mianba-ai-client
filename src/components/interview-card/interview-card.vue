<template>
  <view class="interview-card" :class="'card-' + gradeKey" hover-class="hover-press" @click="$emit('click')">
    <!-- 左侧等级色竖条：卡片唯一的彩色，一眼分级 -->
    <view class="card-rail" v-if="data.total_score != null"></view>

    <!-- 左侧主信息：岗位名 + 属性印章 + 单行元信息 -->
    <view class="card-main">
      <view class="card-title-row">
        <text class="position">{{ data.position_name }}</text>
        <text class="type-seal" v-if="data.interview_type">{{ data.interview_type }}</text>
      </view>
      <view class="card-meta">
        <text class="meta-item">{{ data.completed_rounds }}/{{ data.total_rounds }} 轮</text>
        <text class="meta-sep">·</text>
        <text class="meta-item">{{ formatTime(data.started_at) }}</text>
      </view>
    </view>

    <!-- 右侧结果：有分数显示「等宽分数 + 等级印章」；无分数退回状态 -->
    <view class="card-result" v-if="data.total_score != null">
      <text class="result-num">{{ data.total_score }}</text>
      <view class="grade-badge" :class="'g-' + gradeKey">
        <text class="grade-badge-text">{{ data.grade || 'D' }}</text>
      </view>
    </view>
    <view class="card-state" v-else>
      <view class="state-dot" :class="data.status"></view>
      <text class="state-text">{{ statusText }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { formatDate } from '@/utils/format'
const props = defineProps({ data: { type: Object, required: true } })
defineEmits(['click'])
const statusText = computed(() => ({ completed: '已完成', in_progress: '进行中', interrupted: '已中断' }[props.data.status] || props.data.status))

/* v35 新增：等级归一化。
   历史数据里 grade 可能是小写、也可能是空（旧记录没存），
   统一收敛到 S/A/B/C/D 五个 key，供 CSS 的 .card-* / .g-* 选色。
   ⚠️ 不要在这里"推断"等级 —— 分数与等级的对应关系属于后端口径，
   前端只做大小写与空值归集，避免出现「前端算的和后端报告不一致」。 */
const gradeKey = computed(() => {
  const g = String(props.data.grade || '').toUpperCase()
  return ['S', 'A', 'B', 'C', 'D'].includes(g) ? g : 'D'
})

/* 日期统一走 utils/format 的手写补零实现：
   旧实现用 `toLocaleDateString('zh-CN')`，与历史页的 `toLocaleDateString()`
   格式不同且平台相关（同一字段换机型会变样）。 */
const formatTime = (d) => formatDate(d)
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 面试记录卡 v35 —— 纸本朱砂 · 压印版
 * ----------------------------------------------------------------------------
 * v34 的问题：S 级和 D 级都长得一样（黑徽章 + 黑数字），一眼分不出好坏。
 * v35 给每张卡一条**等级色竖轨**（贴在左边缘），徽章也用等级色。
 * 竖轨只有 6rpx 宽 —— 足够让人一眼扫出"这场考得好不好"，
 * 又不会变成廉价彩色卡片。
 *
 * 层次仍靠发丝线 + 底色差，**卡片本身没有投影**（纸本铁律）。
 * ============================================================================ */
.interview-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 26rpx 30rpx 26rpx 32rpx;
  margin-bottom: 14rpx;
  border-radius: $radius-lg;
  background: $paper-card;
  border: 1rpx solid $rule;
  overflow: hidden;
  transition: opacity $motion-fast $ease-smooth, transform $motion-fast $ease-smooth;
}

/* 等级色竖轨：贴左边缘，圆角跟随卡片 */
.card-rail {
  position: absolute;
  left: 0;
  top: 16rpx;
  bottom: 16rpx;
  width: 6rpx;
  border-radius: 0 3rpx 3rpx 0;
}
.card-s .card-rail { background: $grade-s; }
.card-a .card-rail { background: $grade-a; }
.card-b .card-rail { background: $grade-b; }
.card-c .card-rail { background: $grade-c; }
.card-d .card-rail { background: $grade-d; }

.card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12rpx; }

.card-title-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}

.position {
  font-family: $font-display;
  font-size: 31rpx;
  font-weight: $weight-bold;
  color: $text-1;
  line-height: 1.3;
  letter-spacing: -0.5rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 100%;
}

/* 招聘类型：朱砂描边小方标。只描边不填充——填满会与等级色抢重量 */
.type-seal {
  font-family: $font-mono;
  font-size: 18rpx;
  font-weight: $weight-bold;
  color: $verm;
  border: 1rpx solid $verm-line;
  border-radius: $radius-xs;
  padding: 2rpx 8rpx;
  flex-shrink: 0;
  letter-spacing: 0.4rpx;
}

.card-meta { display: flex; align-items: center; gap: 10rpx; }
/* 元信息走等宽：轮次 8/8 与日期都是"读数"，等宽下不会跳动 */
.meta-item {
  font-family: $font-mono;
  font-size: 21rpx;
  color: $text-3;
  font-weight: $weight-regular;
  font-variant-numeric: tabular-nums;
}
.meta-sep { font-size: 20rpx; color: $text-4; flex-shrink: 0; }

/* 右侧分数：等宽巨数字 + 等级印章 */
.card-result { display: flex; align-items: center; gap: 14rpx; flex-shrink: 0; }
.result-num {
  @include readout(46rpx);
  font-weight: $weight-heavy;
  color: $text-1;
}
.grade-badge {
  width: $grade-badge-size;
  height: $grade-badge-size;
  border-radius: $radius-badge;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 描边 + 浅底：比纯色填充更"印刷"，也不抢左边竖轨的注意力 */
  border: 1.5rpx solid currentColor;
  background: rgba(255, 255, 255, 0.6);
}
.grade-badge-text {
  font-family: $font-mono;
  font-size: 21rpx;
  font-weight: $weight-black;
  line-height: 1;
}
/* 等级色（v35）：不再用灰阶 —— 灰阶在米白纸面上区分度太低 */
.g-S { color: $grade-s; background: $grade-s-soft; }
.g-A { color: $grade-a; background: $grade-a-soft; }
.g-B { color: $grade-b; background: $grade-b-soft; }
.g-C { color: $grade-c; background: $grade-c-soft; }
.g-D { color: $grade-d; background: $grade-d-soft; }

/* 无分数时的状态点：进行中给朱砂脉冲（与首页 resume 条目同源） */
.card-state { display: flex; align-items: center; gap: 12rpx; flex-shrink: 0; }
.state-dot {
  position: relative;
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: $text-4;
}
.state-dot.completed { background: $ink; }
.state-dot.interrupted { background: $ash; }
.state-dot.in_progress { background: $verm; }
/* 脉冲环走伪元素，只动 transform + opacity（全在合成层，不触发重绘）。
   这张卡在 tabBar 首屏常驻播放，用 box-shadow 做动画会持续重绘。 */
.state-dot.in_progress::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  border-radius: 50%;
  background: rgba(192, 57, 43, 0.34);
  animation: pulseDot 1.8s $ease-out infinite;
}
.state-text {
  font-size: 22rpx;
  font-weight: $weight-medium;
  color: $text-3;
}

@keyframes pulseDot {
  0%   { transform: scale(1);   opacity: 0.55; }
  70%  { transform: scale(2.6); opacity: 0; }
  100% { transform: scale(2.6); opacity: 0; }
}
</style>
