<template>
  <view class="dimension-bar">
    <view class="dim-header">
      <text class="dim-name">{{ label }}</text>
      <text class="dim-score" :style="{ color }">{{ score }}/10</text>
    </view>
    <view class="dim-track">
      <view class="dim-fill" :style="{ width: percent + '%', background: color }"></view>
    </view>
    <text class="dim-comment" v-if="comment">{{ comment }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, default: '' },
  score: { type: Number, default: 0 },
  comment: { type: String, default: '' },
  color: { type: String, default: '#1A1A1A' }
})

const percent = computed(() => Math.max(0, Math.min(100, (props.score / 10) * 100)))
</script>

<style lang="scss" scoped>
.dimension-bar {
  margin-bottom: $sp-5;

  .dim-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12rpx;

    .dim-name {
      font-size: 28rpx;
      color: $text-1;
      font-weight: $weight-semibold;
    }

    .dim-score {
      font-size: 28rpx;
      font-weight: $weight-bold;
      font-variant-numeric: tabular-nums;
    }
  }

  .dim-track {
    height: 14rpx;
    background: $bg-fill;
    border-radius: $radius-pill;
    overflow: hidden;

    .dim-fill {
      height: 100%;
      border-radius: $radius-pill;
      transition: width $motion-slow $ease-out;
    }
  }

  .dim-comment {
    display: block;
    font-size: 24rpx;
    color: $text-2;
    margin-top: 10rpx;
    line-height: 1.6;
  }
}
</style>