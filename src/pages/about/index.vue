<template>
  <view class="page" :style="pageStyle">
    <!-- 导航栏：全局 .pg-nav（样式在 App.vue） -->
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
        <text class="pg-nav-title">关于小程序</text>
      </view>
      <view class="pg-nav-side pg-nav-right"></view>
    </view>

    <!-- 占位块：与 fixed 导航栏等高，避免正文被盖住 -->
    <view class="pg-nav-hold" :style="navHoldStyle">
      <view class="pg-nav-hold-inner"></view>
    </view>

    <view class="content">
      <!-- 眉标：等宽英文小字，与首页 AI MOCK INTERVIEW / 历史页 INTERVIEW LOG
           / 报告页 SCORE REPORT 同一套跨页语言。 -->
      <text class="pg-kicker">ABOUT</text>

      <!-- 品牌块：墨色面板（$ink-gradient + 双内亮边 + 接地投影三件套）。
           全页唯一深色实体 —— 关于页的视觉锚点，其余内容全部落在纸面上。
           溢出同心圆保留（与首页 hero 同一装饰语言），是纸上的压印。 -->
      <view class="brand">
        <view class="brand-ring r1"></view>
        <view class="brand-ring r2"></view>
        <image class="brand-logo" src="/static/ip_mianba_smile.png" mode="aspectFit" />
        <text class="brand-name">我的面试小屋</text>
        <text class="brand-slogan">AI 驱动的实时面试模拟</text>
        <view class="brand-foot">
          <text class="brand-ver">v1.0.0</text>
          <view class="brand-seal" v-if="userStore.isLoggedIn">
            <text class="brand-seal-text">已登录</text>
          </view>
        </view>
      </view>

      <!-- 长文区：与隐私政策 / 用户协议共用同一套「册子」排版 ——
           朱砂等宽序号 → 大字标题 → 放松行高的正文。不上卡片：
           一页小册子不该是两张白卡。 -->
      <view class="about-section">
        <text class="doc-num">01</text>
        <text class="about-title">我们是谁</text>
        <text class="about-text">
          「我的面试小屋」是一款基于大语言模型的实时对话式 AI 面试模拟小程序。从岗位选取、模拟作答到五维评分报告，全流程由 AI 驱动，帮你随时随地进行面试练习，找到表达短板。
        </text>
      </view>

      <view class="about-section">
        <text class="doc-num">02</text>
        <text class="about-title">评分维度</text>
        <text class="about-text">总分由五个维度加权得出，权重越高，对最终分数的影响越大。</text>

        <!-- 维度刻度：名称 + 轨道 + 等宽占比。
             轨道用 $paper-sunken 凹槽、填充用墨 —— 靠**长度**表达高低，
             圆点只是刻度起点（色值由数据内联给出，保留原语义）。 -->
        <view class="dim-list">
          <view v-for="(d, idx) in dimensions" :key="idx" class="dim-row">
            <view class="dim-head">
              <text class="dim-dot" :style="{ background: d.color }"></text>
              <text class="dim-name">{{ d.name }}</text>
              <text class="dim-weight">{{ d.weight }}%</text>
            </view>
            <view class="dim-track">
              <view class="dim-bar-fill" :style="{ width: d.weight + '%' }"></view>
            </view>
          </view>
        </view>
      </view>

      <!-- 页脚：发丝线之上的一段版权小字，册子的版权页 -->
      <view class="footer-info">
        <text class="footer-text">@2026 我的面试小屋 · 微信小程序开发大赛作品</text>
        <text class="footer-text">本应用为 AI 学习辅助工具</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useUserStore } from '@/store/modules/user'
import { ICONS } from '@/utils/svg-icons'

const userStore = useUserStore()

const dimensions = [
  /* v30：色阶收进「可见区间」。
     原第 5 档是 #EBEBEB —— 它就是 .dim-bar 轨道的底色，落在白卡($bg-card:#FFFFFF)上
     对比度只有 **1.10:1**，16rpx 的圆点**肉眼完全看不见**：
     5 行「评分维度」里只有 4 行有视觉标记，第 5 行（结构完整性）看起来像漏渲染。
     整套色阶是「权重越高颜色越深」的有意设计，但最浅一档不能浅到与底色同色。
     改为 $rule-strong 刻度（1.43:1）—— 仍是全组最浅、仍读作"最轻的维度"，
     但已经能看见。四档之间的明度差依然单调递增。
     v35 第十四批：整套从中性灰换成暖墨阶（$ink / $ink-soft / $mauve / $ash / $rule-strong），
     中性灰在暖米白纸面上会读作"脏"，暖墨阶才与纸是一个色系。 */
  { name: '表达逻辑', weight: 25, color: '#17130E' },
  { name: '专业深度', weight: 30, color: '#4A443C' },
  { name: '应变能力', weight: 20, color: '#877D71' },
  { name: '语言流畅度', weight: 15, color: '#C2B8AC' },
  { name: '结构完整性', weight: 10, color: '#D2C8B8' }
]

const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/profile/index' })
}

/* v30：初始化必须**模块级同步执行**，不能放 onMounted。
 *
 * 这是首页那个 bug 的同族问题（用户实锤：从首页进详情页再点继续，
 * 转场瞬间顶部露出错位内容）：`onMounted` 里才测几何 →
 * 首帧用兜底 44/96 渲染 → 挂载后再跳成真值 → 整页"跳一下"，
 * 并在转场时留下错位残影。
 *
 * 面试页的注释早就写明这条规则，这里与它对齐：
 *   「几何必须在首帧就是真实值：初始化在模块级同步执行，而不是丢到 onMounted。」
 *
 * 保留 initNavMetrics 供 onShow 等场景复用（几何可能因旋转/分屏变化）。 */
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
 * 关于 · 一本小册子（v34）
 * ============================================================================
 * 版面意图：这一页讲"我们是谁、分数怎么算"，本质是一篇短文 + 一张规格表。
 *   · 等宽眉标 ABOUT 起头，与其余三篇长文页同语言
 *   · 品牌块是全页唯一的墨色实体（深色例外的标准三件套）
 *   · 正文区去卡片，改用「朱砂序号 → 标题 → 放松行高正文」的册子排版
 *   · 评分维度做成**规格表**：名称 + 占比一行，行下一条细刻度表达权重长度
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
  padding: 0 $page-padding calc(#{$safe-bottom-gap} + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

/* v32：底部留白只在 .page 上给一次，.content 不再叠一层 */
.content { padding: $sp-1 0 0; }

/* ===== 眉标 =====
 * 等宽全大写 + 大字距 + 朱砂：本设计系统"这是哪一册"的标记。 */
.pg-kicker {
  display: block;
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.8rpx;
  padding: $sp-2 0 $sp-3;
}

/* ===== 品牌块（墨色面板）=====
 * 材质：$ink-gradient（158° 三段暖黑）+ $ink-edge（双内亮边）+ $ink-shadow（接地投影）。
 * 这是全站深色实体的唯一配方，与首页 hero / 报告页总分卡同源。 */
.brand {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 52rpx 32rpx $sp-6;
  margin-bottom: $sp-7;
  border-radius: $radius-xl;
  background: $ink-gradient;
  box-shadow: $ink-edge, $ink-shadow;
}
/* 溢出同心圆：被 overflow 裁切，给纯色底加空间纵深（与首页 hero 同装饰） */
.brand-ring {
  position: absolute;
  border-radius: 50%;
  border: 1rpx solid $on-ink-line;
  pointer-events: none;
  z-index: 1;
}
.brand-ring.r1 { width: 460rpx; height: 460rpx; left: -170rpx; top: -210rpx; }
.brand-ring.r2 { width: 660rpx; height: 660rpx; right: -270rpx; bottom: -370rpx; border-color: rgba(255, 255, 255, 0.05); }

.brand-logo {
  width: 168rpx;
  height: 168rpx;
  margin-bottom: 26rpx;
  position: relative;
  z-index: 2;
}
.brand-name {
  font-family: $font-display;
  font-size: $font-3xl;
  font-weight: $weight-black;
  color: $on-ink-1;
  letter-spacing: -2rpx;
  line-height: 1.1;
  position: relative;
  z-index: 2;
}
.brand-slogan {
  font-size: $font-sm;
  color: $on-ink-2;
  margin-top: 14rpx;
  letter-spacing: 0.2rpx;
  position: relative;
  z-index: 2;
}
.brand-foot {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-top: 26rpx;
  position: relative;
  z-index: 2;
}
/* 版本号：等宽读数（"v1.0.0" 是数字，必须 tabular-nums） */
.brand-ver {
  font-family: $font-mono;
  font-size: 21rpx;
  font-weight: $weight-regular;
  color: $on-ink-3;
  letter-spacing: 0.6rpx;
  font-variant-numeric: tabular-nums;
}
/* 已登录：墨面上的"小印章"——细描边小方标，不是白胶囊。
   白胶囊在墨底上是 iOS 系统标签，纸本要的是压印。 */
.brand-seal {
  padding: 5rpx 12rpx;
  border-radius: $radius-xs;
  border: 1rpx solid rgba(255, 255, 255, 0.28);
}
.brand-seal-text {
  font-size: 19rpx;
  font-weight: $weight-semibold;
  color: $on-ink-1;
  letter-spacing: 0.8rpx;
}

/* ===== 正文分节：与隐私 / 协议页同一套 .doc-* 语言 =====
 * 序号（.doc-num，全局已定义）+ 标题 + 正文。
 * 节与节之间只用 64rpx 留白分隔，不加线 —— 册子靠留白断章。 */
.about-section {
  margin-bottom: $sp-7;
}
.about-section:last-of-type { margin-bottom: $sp-6; }

.about-title {
  display: block;
  margin-top: 8rpx;
  font-family: $font-display;
  font-size: 40rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  line-height: 1.24;
  letter-spacing: -1rpx;
}
/* 正文：$reading-line(1.78) 与法务页同档；颜色退到 $text-2。
   ⚠️ 中文一律无衬线（宋体在小程序端回退 SimSun 会发脏）。 */
.about-text {
  display: block;
  margin-top: $sp-3;
  font-size: $font-md;
  color: $text-2;
  line-height: $reading-line;
}

/* ===== 评分维度：规格表 =====
 * 每项两行：上行「刻度点 + 名称 …… 占比」，下行一条 6rpx 凹槽刻度。
 * 为什么不用横向进度条排一行：五个名字长度不一（最长 5 字），
 * 横排时轨道起点参差、读数对不齐；改成上下结构后，
 * 所有轨道同起同止，5 条刻度横向可比 —— 这张表才读得像尺子。 */
.dim-list {
  margin-top: $sp-5;
  border-top: 1rpx solid $rule;
}
.dim-row {
  padding: $sp-3 0;
  border-bottom: 1rpx solid $rule;
}
.dim-head {
  display: flex;
  align-items: center;
  margin-bottom: 14rpx;
}
/* 刻度点：极小方点（8rpx），是"这一档的位置标记"，不是装饰 */
.dim-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: $radius-xs;
  margin-right: 14rpx;
  flex-shrink: 0;
}
.dim-name {
  flex: 1;
  min-width: 0;
  font-size: $font-md;
  font-weight: $weight-semibold;
  color: $text-1;
  letter-spacing: -0.2rpx;
}
/* 占比：等宽读数（百分数是"仪器读数"，必须 tabular-nums） */
.dim-weight {
  @include readout(26rpx);
  font-weight: $weight-bold;
  color: $text-2;
  flex-shrink: 0;
  margin-left: $sp-3;
}
/* 刻度轨：凹槽底 + 压印 + 墨色填充，靠长度表达权重 */
.dim-track {
  height: 6rpx;
  border-radius: 3rpx;
  background: $paper-sunken;
  box-shadow: $emboss-1;
  overflow: hidden;
}
.dim-bar-fill {
  height: 100%;
  border-radius: 3rpx;
  background: $ink;
  transition: width 0.8s $ease-smooth;
}

/* ===== 页脚 =====
 * 一条发丝线之上的版权小字，像册子末页的版权页脚注。 */
.footer-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding-top: $sp-5;
  border-top: 1rpx solid $rule;
}
.footer-text {
  font-size: $font-xs;
  color: $text-4;
  line-height: 1.9;
  letter-spacing: 0.2rpx;
}
</style>
