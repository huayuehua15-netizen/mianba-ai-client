<template>
  <view class="page" :style="pageStyle">
    <!-- 自定义导航栏：全局 .pg-nav（样式在 App.vue） -->
    <view class="pg-nav" :style="navBarStyle">
      <view class="pg-nav-side pg-nav-left">
        <view
          class="pg-nav-back-tile"
          :class="{ pressed: backPressed }"
          hover-class="none"
          @touchstart="backPressed = true"
          @touchend="backPressed = false"
          @touchcancel="backPressed = false"
          @click="goBack"
        >
          <image class="pg-nav-back" :src="ICONS['arrow-left']" mode="aspectFit" />
        </view>
      </view>
      <view class="pg-nav-center">
        <text class="pg-nav-title">帮助与反馈</text>
      </view>
      <view class="pg-nav-side pg-nav-right"></view>
    </view>

    <!-- 占位块：与 fixed 导航栏等高，避免正文被盖住 -->
    <view class="pg-nav-hold" :style="navHoldStyle">
      <view class="pg-nav-hold-inner"></view>
    </view>

    <view class="content">
      <!-- 页头：等宽眉标 + 两行大标题 + 一句引导。
           标题拆成两行（"遇到问题 / 了？"）会断得难看，改为整句紧排，
           行宽用 max-width 控制 —— 标题右缘留白比断字重要。 -->
      <view class="pg-head">
        <text class="pg-kicker">HELP</text>
        <text class="pg-title">遇到问题了？</text>
        <text class="pg-sub">先看看常见问题，不行就直接找我们</text>
      </view>

      <!-- 快捷联系：两个入口，通栏发丝线分隔（不用卡片包裹）。
           图标用墨色线性（不再垫黑方块）—— 与设置页的目录行同一语言。 -->
      <view class="quick-actions">
        <button class="qa-item" open-type="contact" hover-class="hover-press">
          <view class="qa-icon"><image class="qa-icon-img" :src="ICONS['help-circle']" mode="aspectFit" /></view>
          <view class="qa-info">
            <text class="qa-title">联系微信客服</text>
            <text class="qa-desc">人工在线，工作日 9:00 - 21:00</text>
          </view>
          <image class="qa-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
        </button>
        <button class="qa-item" open-type="feedback" hover-class="hover-press">
          <view class="qa-icon"><image class="qa-icon-img" :src="ICONS['edit-pen']" mode="aspectFit" /></view>
          <view class="qa-info">
            <text class="qa-title">意见反馈</text>
            <text class="qa-desc">填写问卷，帮我们做得更好</text>
          </view>
          <image class="qa-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
        </button>
      </view>

      <!-- 常见问题 -->
      <view class="faq-group">
        <view class="group-title">
          <text class="group-index">FAQ</text>
          <text class="group-title-text">常见问题</text>
          <view class="group-line"></view>
        </view>
        <view class="faq-list">
          <view v-for="(item, idx) in faqs" :key="idx" class="faq-item" hover-class="hover-press" :class="{ 'is-open': openIdx === idx }" @click="toggle(idx)">
            <view class="faq-q">
              <!-- 序号：等宽两位，把问题列表排成目录；展开时转朱砂（"这一条正开着"） -->
              <text class="faq-q-index">{{ String(idx + 1).padStart(2, '0') }}</text>
              <text class="faq-q-text">{{ item.q }}</text>
              <!-- 展开钮：收起 = 发丝描边方圆角 + 黑加号；展开 = 墨材质 + 白减号。
                   状态有明确的形态反馈，不只是换个图标。
                   帧序列用项目自己的 plus/minus 几何（19 宽），与静态图标严格同尺寸。 -->
              <view class="faq-toggle" :class="{ on: openIdx === idx }">
                <morph-icon
                  class="faq-toggle-icon"
                  frames="plus-minus"
                  frames-alt="plus-minus-white"
                  :active="openIdx === idx"
                  :size="24"
                  :fallback="ICONS['plus']"
                  :fallback-alt="ICONS['minus-white']"
                />
              </view>
            </view>
            <!-- 答案：不套卡、不加竖线、不做凹陷。就是缩进的文字本身，
                 上方一条 hairline 与问题分开。克制即质感。
                 背景/圆角/内边距放在 view 上（block），text 只管文字 ——
                 text 是 inline，垂直 padding 不撑开行盒，文字会上下溢出被裁。
                 展开/收起：常驻 DOM + 内联 style 驱动 max-height/opacity 过渡。
                 不用 class 切换：小程序里同一渲染周期内「A 去 class + B 加 class」
                 时，渲染层常跳过过渡直接设终值，切问题时旧答案会"啪"地消失。 -->
            <view
              class="faq-a-wrap"
              :style="{ maxHeight: openIdx === idx ? '600rpx' : '0', opacity: openIdx === idx ? 1 : 0 }"
            >
              <view class="faq-a">
                <text class="faq-a-text">{{ item.a }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="page-safe-bottom"></view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ICONS } from '@/utils/svg-icons'
// 显式引入：模板直接用了 <morph-icon>，原先靠 pages.json 的 globalStyle.usingComponents
// 才能工作。全局注册块已删除（14 个组件被注入全部 12 个页面，约 121KB 源码），
// 补 import 后由组件自身注册，行为不变且不再拖累其它 11 个页面。
import MorphIcon from '@/components/morph-icon/morph-icon.vue'

const openIdx = ref(-1)
const toggle = (idx) => { openIdx.value = openIdx.value === idx ? -1 : idx }

const faqs = [
  // P2 修复：原文案让用户去点「重新提问」，但全项目没有这个控件
  // （面试页的重试入口是失败 toast + 直接重新发送）。指导性文案必须与实现一致，
  // 否则用户卡住时会去找一个不存在的按钮。
  { q: '面试卡顿或一直显示「思考中」？', a: '请先检查网络是否正常。AI 生成回答需要几秒到十几秒，若超过 30 秒仍无响应，可退出面试页后重新进入，再重新发送你的回答。连续多次失败请稍后再试。' },
  { q: '语音播报 / 语音作答用不了？', a: '语音作答通过手机原生录音后上传服务端转写为文字，语音播报由服务端合成后播放。若无法使用，请检查是否已授予小程序麦克风权限（手机系统设置中允许），并确认网络正常。语音不可用时系统会自动降级为纯文字作答，不影响面试流程。' },
  { q: '面试中途退出，进度会丢吗？', a: '不会。开启「保留面试进度」后，中途退出会自动保存当前进度，下次进入面试页可继续作答。该开关在「我的 → 设置 → 互动反馈」中可随时关闭。' },
  { q: '评分报告要多久生成？', a: '面试结束后 AI 需要逐个回顾你的作答并评分，通常需要 10-30 秒。若报告还没准备好，页面会提示重试；生成完毕后会自动展示。' },
  { q: '如何彻底删除我的数据？', a: '在「我的 → 设置 → 隐私与数据 → 清空我的数据」可一键删除全部面试记录与评分报告，该操作不可恢复，删除后云端同步清除。' },
  { q: '我的得分为什么这么低 / 分数怎么算？', a: '报告从表达逻辑、专业深度、应变能力、语言流畅度、结构完整性五个维度评分，由 AI 结合你的实际作答综合给出。具体维度得分与评语见报告页，可针对性练习提升。' }
]

const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/profile/index' })
}

const navMetrics = ref({ statusBar: 44, capsuleGap: 96 })
const initNavMetrics = () => {
  try {
    const win = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
    const statusBar = win.statusBarHeight || 44
    let capsuleGap = 96
    // #ifdef MP-WEIXIN
    try {
      const rect = uni.getMenuButtonBoundingClientRect()
      if (rect && rect.width > 0) capsuleGap = win.windowWidth - rect.left + 14
    } catch (e) {}
    // #endif
    navMetrics.value = { statusBar, capsuleGap }
  } catch (e) {}
}
/* v30：模块级同步初始化，保证首帧几何就是真值（见 about 页同处注释）。
   原先放 onMounted → 首帧用兜底值 → 整页"跳一下"、转场留错位残影。 */
initNavMetrics()
const navBarStyle = computed(() => ({
  paddingTop: navMetrics.value.statusBar + 'px',
  paddingRight: navMetrics.value.capsuleGap + 'px'
}))
/* ===== v33 吸顶导航配套 =====
 * backPressed：hover-class 在 fixed 元素上偶发不触发，改用 touch 事件自己控按压态。
 * navHoldStyle：占位块只注入状态栏高度，内容高与底间距由 WXSS 的 rpx 承担。
 * pageStyle：把状态栏高度写进 CSS 变量，供 .pg-nav-center 让标题在内容区居中。 */
const backPressed = ref(false)
const navHoldStyle = computed(() => ({
  paddingTop: navMetrics.value.statusBar + 'px'
}))
const pageStyle = computed(() => ({
  '--nav-pad-top': navMetrics.value.statusBar + 'px'
}))
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 帮助与反馈 · 一册问答（v34）
 * ============================================================================
 * 版面意图：这一页是「先找客服 / 再读 FAQ」的两段结构。
 *   · 页头沿用长文页的「等宽眉标 + 紧排大标题 + 一句引导」三行制
 *   · 快捷入口用通栏发丝线分隔，不套卡片（与设置页目录行同一语言）
 *   · FAQ 是一份**可展开的目录**：等宽序号 + semibold 问题 + 凹槽方钮
 *   · 答案退一档（26rpx / $text-muted），靠字重与颜色建立层级，不靠框线
 * ========================================================================== */
.page {
  min-height: 100vh;
  background: $paper;
  /* v35 纸张纹理（与首页同配方）：极淡斜向条纹，把纯色底"做旧"一点 */
  background-image: repeating-linear-gradient(
    92deg,
    rgba(23, 19, 14, 0.014) 0rpx,
    rgba(23, 19, 14, 0.014) 1rpx,
    transparent 1rpx,
    transparent 4rpx
  );
  padding: 0 $page-padding 0;
  box-sizing: border-box;
}

/* v32：底部安全区改走 $safe-bottom-gap，留白统一放在 .content 的 padding-bottom */
.content { padding: $sp-1 0 calc(#{$safe-bottom-gap} + env(safe-area-inset-bottom)); }

/* ===== 页头 =====
 * 三行制与关于 / 隐私 / 协议页完全同构：
 *   等宽眉标（HELP）→ 大标题 → 引导句。
 * 这一页原先把标题与引导做成左右分栏，导致中文标题被挤成两行
 * （"遇到问题 / 了？"），断字位置难看；改回纵向三行后标题整句紧排。 */
.pg-head {
  padding: $sp-2 0 $sp-5;
}
.pg-kicker {
  display: block;
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.8rpx;
  margin-bottom: 14rpx;
}
.pg-title {
  display: block;
  font-family: $font-display;
  font-size: $font-3xl;
  font-weight: $weight-black;
  color: $text-1;
  letter-spacing: -2rpx;
  line-height: 1.1;
}
.pg-sub {
  display: block;
  font-size: $font-sm;
  color: $text-3;
  margin-top: 14rpx;
  line-height: 1.5;
}

/* ===== 快捷联系入口 =====
 * 两个入口同一份发丝线语言，不用卡片包裹：
 * 一条上边线 + 行间线 + 一条下边线，就是这份"联系页"的目录。 */
.quick-actions {
  border-top: 1rpx solid $rule;
  margin-bottom: $sp-7;
}
.qa-item {
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
  display: flex;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: $sp-4 4rpx;
  border-bottom: 1rpx solid $rule;
  border-radius: 0;
  background: transparent;
  font-size: inherit;
  line-height: inherit;
  text-align: left;
  box-sizing: border-box;
}
/* 小程序 button 自带 ::after 描边，必须清掉，否则行间会多出一条线 */
.qa-item::after { border: none; }
/* 图标列：与设置页目录行同刻度（48rpx 列 + 34rpx 图标），
   全部用墨色线性图标 —— 墨底白图标在纸面上会变成两块黑方块。 */
.qa-icon {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 22rpx;
  flex-shrink: 0;
}
.qa-icon-img { width: 34rpx; height: 34rpx; }
.qa-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.qa-title {
  font-size: 30rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  line-height: 1.35;
  letter-spacing: -0.3rpx;
}
.qa-desc { font-size: 23rpx; color: $text-3; margin-top: 8rpx; line-height: 1.45; }
.qa-arrow { width: 15rpx; height: 15rpx; flex-shrink: 0; margin-left: 12rpx; }

/* ===== FAQ 分组 =====
 * 眉标 = 等宽英文（FAQ）+ 中文标题 + 延伸发丝线，与设置页 01/02 同一配方。
 * 这里的序号用 "FAQ" 而不是 01 —— 它标的是"这是哪一栏"，不是第几条。 */
.faq-group { margin-bottom: 28rpx; }
.group-title {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  padding: 0 4rpx $sp-3;
}
.group-index {
  font-family: $font-mono;
  font-size: 20rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.4rpx;
  flex-shrink: 0;
}
.group-title-text {
  @include sec-heading;
  flex-shrink: 0;
}
.group-line {
  flex: 1;
  height: 1rpx;
  background: $rule;
  transform: translateY(-6rpx);
}

/* ===== FAQ 列表 =====
 * 上下边线 + 行间线，不套卡片。展开项只把整行底色沉到凹槽（$paper-sunken），
 * 是"这一条被翻开了"的最轻提示。 */
.faq-list { border-top: 1rpx solid $rule; }
.faq-item {
  padding: $sp-4 4rpx;
  border-bottom: 1rpx solid $rule;
  transition: background-color $motion-fast $ease-out, opacity $motion-fast $ease-out;
}
.faq-item:last-child { border-bottom: none; }
.faq-item.is-open { background: $paper-sunken; }

.faq-q { display: flex; align-items: flex-start; }
/* 序号：等宽两位，问题列表排成目录。
   展开时由 $text-4 转朱砂 —— 「这一条正开着」用本系统唯一彩色的盖章位表达。 */
.faq-q-index {
  font-family: $font-mono;
  font-size: 20rpx;
  font-weight: $weight-bold;
  color: $text-4;
  margin-right: $sp-2;
  flex-shrink: 0;
  padding-top: 6rpx;
  font-variant-numeric: tabular-nums;
  letter-spacing: 1rpx;
  transition: color $motion-fast $ease-out;
}
.faq-item.is-open .faq-q-index { color: $verm; }
/* 问题：semibold 墨色。层级的第一层由字重承担（答案退到 regular + $text-muted）。 */
.faq-q-text {
  flex: 1;
  font-size: $font-md;
  color: $text-1;
  font-weight: $weight-semibold;
  padding-right: $sp-3;
  line-height: 1.55;
  letter-spacing: -0.2rpx;
}
.faq-item.is-open .faq-q-text { font-weight: $weight-bold; }

/* 展开钮：收起 = 发丝描边方圆角 + 墨加号（安静的存在）；
   展开 = 墨材质方圆角 + 白减号（状态锚点）。
   ⚠️ 方形而非圆形 —— 纸本风拒绝大胶囊与圆钮。
   图标在 24 网格里主体约 19，容器 44rpx 时视觉尺寸约 22rpx。 */
.faq-toggle {
  width: 44rpx;
  height: 44rpx;
  border-radius: $radius-xs;
  border: 1rpx solid $rule-strong;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
  margin-top: 2rpx;
  transition: background $motion-base $ease-out, border-color $motion-base $ease-out;
}
.faq-toggle-icon { width: 24rpx; height: 24rpx; display: block; }
/* 展开态走深色实体三件套（$ink-gradient + $ink-edge），与全站墨面板同源 */
.faq-toggle.on {
  background: $ink-gradient;
  border-color: transparent;
  box-shadow: $ink-edge;
}

/* 答案展开/收起：常驻 DOM，max-height 由内联 style 驱动（见模板注释）。
   高度上限 600rpx 覆盖最长答案（实测最长约 7 行 ≈ 330rpx，余量充足）；
   上限不能过大，否则收起时"从 600 走到实际内容高度"这段不可见位移会吃掉
   前半段过渡，观感像卡一下才动。透明度同步过渡，避免文字边缘先暴露。 */
.faq-a-wrap {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-height 0.34s cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 0.24s ease-out;
}

/* 答案：不套卡、不加竖线、不做凹陷。一条 hairline 分开问与答，
   缩进与问题文字起点对齐，剩下的全交给排版。 */
.faq-a {
  margin-top: 20rpx;
  margin-left: 36rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid $rule;
}
/* 答案退一档：26rpx + $text-muted + $reading-line。
   ⚠️ 字号保持 26rpx 不动 —— 它是与问题（28rpx）的层级差，
   且 .faq-a-wrap 的 maxHeight 是按最长答案 ~7 行 × 26rpx 估的 600rpx。 */
.faq-a-text {
  display: block;
  font-size: 26rpx;
  color: $text-muted;
  line-height: $reading-line;
}
</style>
