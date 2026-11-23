<template>
  <view class="empty-state">
    <view class="empty-frame">
      <image class="empty-mascot" src="/static/ip_mianba_smile.png" mode="aspectFit" />
    </view>
    <text class="empty-text">{{ text }}</text>
    <!-- v32：插槽容器保留，但不再无条件留白。
         原实现给 .empty-slot 写死 `margin-top: 36rpx`，而现网 4 个调用点
         （history / index / positions / custom-questions）**全都没有传插槽内容** ——
         于是每个空态下面都挂着一块 36rpx 的纯空白，点不动、也调不掉。
         单看一处像"故意留的呼吸空间"，但三页空态整体都因此偏下。

         ⚠️ 为什么不用 `$slots.default` 做条件渲染：uni-app 在 mp-weixin 上把
         `<slot>` 编译成 WXML 原生 slot，运行时 `$slots` 是否被填充依赖版本，
         判错时**未来第一个真正传插槽的调用方会静默丢内容** —— 那比多留 36rpx 严重得多。
         改为把留白交给插槽内容自己（组件描述里写明了推荐值），
         没有内容时容器自然塌成 0 高，零风险、零魔法。 -->
    <view class="empty-slot"><slot></slot></view>
  </view>
</template>

<script setup>
/* 只保留 text：原先还有一个 `icon` prop，但模板里图片路径是硬编码的
   （/static/ip_mianba_smile.png，面霸君 IP 是全站固定的空态形象），
   icon 从未被任何一行代码读取 —— 一个「声明了却永远无效」的 prop 会骗人：
   调用方传了以为生效、review 时以为该功能已支持。P2 清理，直接删掉。
   （现网 4 个调用点都没传 icon，删除无兼容影响。） */
defineProps({ text: { type: String, default: '暂无数据' } })</script>

<style lang="scss" scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 96rpx 40rpx;
  /* 空态出现不再硬切，与全站入场语言一致 */
  animation: fadeUp $motion-base $ease-out both;
}

.empty-frame {
  width: 200rpx;
  height: 200rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;
}

.empty-mascot {
  width: 200rpx;
  height: 200rpx;
}

.empty-text {
  font-size: $font-md;
  font-weight: $weight-medium;
  color: $text-2;
  text-align: center;
  line-height: 1.7;
  /* v22：中文加正字距显松散，删 0.5rpx 字距 */
}

/* 引导按钮区：容器自身不带留白 —— 由插槽内容自己写 margin-top。
   这样「没传插槽」时容器塌成 0 高，不会再凭空多出一段空白。
   推荐调用方给按钮加 `margin-top: 36rpx`（原值）。
   flex 布局保留：插槽里放一个按钮或两个并排按钮都能自然居中。 */
.empty-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
