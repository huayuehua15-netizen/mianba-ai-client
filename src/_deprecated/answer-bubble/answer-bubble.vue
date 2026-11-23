<template>
  <view class="answer-bubble">
    <view class="bubble-content">
      <text>{{ answer }}</text>
    </view>
    <view class="bubble-meta" v-if="duration">
      <text>用时 {{ duration }}秒</text>
    </view>
  </view>
</template>

<script setup>
defineProps({ answer: { type: String, default: '' }, duration: { type: Number, default: 0 } })
</script>

<style lang="scss" scoped>
.answer-bubble { display: flex; flex-direction: column; align-items: flex-end; margin-bottom: 20rpx; }
.bubble-content { background: linear-gradient(135deg, #5B8FF9, #7B61FF); color: #fff; border-radius: 16rpx 0 16rpx 16rpx; padding: 20rpx 24rpx; max-width: 75%; font-size: 28rpx; line-height: 1.6; }
.bubble-meta { margin-top: 6rpx; font-size: 20rpx; color: #999; margin-right: 8rpx; }
</style>
