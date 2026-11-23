<template>
  <view class="question-bubble">
    <view class="bubble-header">
      <view class="avatar">AI</view>
      <view class="meta">
        <text class="name">面试官</text>
        <text class="type" v-if="questionType && questionType !== '专业知识'">{{ questionType }}</text>
        <text class="follow-up" v-if="isFollowUp">追问 {{ followUpIndex }}/2</text>
      </view>
    </view>
    <view class="bubble-content">
      <typing-text :text="question" v-if="useTyping" />
      <text v-else>{{ question }}</text>
    </view>
    <view class="audio-btn" v-if="showAudio" @click="playQuestion">
      <text>{{ playing ? '🔊 播放中' : '🔊 播放' }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { textToSpeech, playAudio } from '@/utils/audio'

const props = defineProps({
  question: { type: String, required: true },
  questionType: { type: String, default: '' },
  isFollowUp: { type: Boolean, default: false },
  followUpIndex: { type: Number, default: 1 },
  // 是否在本题出现时自动朗读（仅最新一题自动播放，避免刷屏）
  autoSpeak: { type: Boolean, default: false }
})

const useTyping = ref(true)
// 语音播报按钮仅在微信小程序端可用（依赖同声传译插件）
const showAudio = ref(true)
// #ifndef MP-WEIXIN
showAudio.value = false
// #endif
const playing = ref(false)

// 读取"语音播报"设置（profile 页持久化）
const voiceBroadcastEnabled = () => {
  try {
    const v = uni.getStorageSync('voiceBroadcast')
    return v === '' || v === null || v === undefined ? true : !!v
  } catch (e) {
    return true
  }
}

const playQuestion = async () => {
  // #ifdef MP-WEIXIN
  try {
    playing.value = true
    const filename = await textToSpeech(props.question)
    playAudio(filename)
  } catch (e) {
    uni.showToast({ title: '语音播报暂不可用', icon: 'none' })
  } finally {
    setTimeout(() => { playing.value = false }, 1500)
  }
  // #endif
}

onMounted(() => {
  if (props.autoSpeak && showAudio.value && voiceBroadcastEnabled()) {
    setTimeout(playQuestion, 400)
  }
})
</script>

<style lang="scss" scoped>
.question-bubble { display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 20rpx; }
.bubble-header { display: flex; align-items: center; margin-bottom: 8rpx; }
.avatar { width: 56rpx; height: 56rpx; border-radius: 50%; background: linear-gradient(135deg, #5B8FF9, #7B61FF); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22rpx; font-weight: 600; margin-right: 12rpx; }
.meta { display: flex; align-items: center; gap: 10rpx; }
.name { font-size: 24rpx; color: #666; }
.type { font-size: 20rpx; color: #5B8FF9; background: #f0f5ff; padding: 2rpx 10rpx; border-radius: 10rpx; }
.follow-up { font-size: 20rpx; color: #ff9800; background: #fff3e0; padding: 2rpx 10rpx; border-radius: 10rpx; }
.bubble-content { background: #fff; border-radius: 0 16rpx 16rpx 16rpx; padding: 20rpx 24rpx; max-width: 75%; font-size: 28rpx; color: #1a1a1a; line-height: 1.6; box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04); }
.audio-btn { margin-top: 8rpx; margin-left: 68rpx; font-size: 22rpx; color: #5B8FF9; }
</style>
