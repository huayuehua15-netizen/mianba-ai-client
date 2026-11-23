<!--
  菜单行小图标（v13）
  全部 24x24 viewBox，stroke 2，round cap。
  颜色由父组件通过 CSS 控制（currentColor）。
  5 个图标：
    ic-gear       设置        齿轮
    ic-help       帮助        圆 + 问号
    ic-info       关于        圆 + i
    ic-trash      清除缓存    垃圾桶
    ic-trash-x    清空数据    圆 + ×（危险）
-->
<template>
  <view class="icon-24" :class="danger ? 'icon-24-danger' : ''">
    <!-- 1. 齿轮：设置 -->
    <svg v-if="name === 'gear'" viewBox="0 0 24 24" width="24" height="24" fill="none"
         stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>

    <!-- 2. 圆 + 问号：帮助 -->
    <svg v-else-if="name === 'help'" viewBox="0 0 24 24" width="24" height="24" fill="none"
         stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.6-2.4 2.3-2.4 4.3" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>

    <!-- 3. 圆 + i：关于 -->
    <svg v-else-if="name === 'info'" viewBox="0 0 24 24" width="24" height="24" fill="none"
         stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <circle cx="12" cy="7.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>

    <!-- 4. 垃圾桶：清除缓存 -->
    <svg v-else-if="name === 'trash'" viewBox="0 0 24 24" width="24" height="24" fill="none"
         stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>

    <!-- 5. 圆 + ×：清空数据（危险） -->
    <svg v-else-if="name === 'trash-x'" viewBox="0 0 24 24" width="24" height="24" fill="none"
         stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  </view>
</template>

<script setup>
defineProps({
  name: { type: String, required: true },   // gear | help | info | trash | trash-x
  danger: { type: Boolean, default: false }
})
</script>

<style lang="scss" scoped>
.icon-24 {
  width: 40rpx;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8B7BBF;          /* 默认灰紫 */
}
.icon-24-danger { color: #C8526B; }
</style>
