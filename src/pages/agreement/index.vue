<template>
  <view class="page" :style="pageStyle">
    <!-- 固定吸顶导航栏：滚动时返回键常驻，不再跟内容一起滚走。
         造型：返回箭头套 64rpx 圆角方底座（样式在 App.vue 的 .pg-nav-back-tile）。 -->
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
        <text class="pg-nav-title">用户协议</text>
      </view>
      <view class="pg-nav-side pg-nav-right"></view>
    </view>

    <!-- 占位块：高度 = 状态栏 + 导航内容高 + 底间距。
         没有它，fixed 的导航栏会盖住正文开头。 -->
    <view class="pg-nav-hold" :style="navHoldStyle">
      <view class="pg-nav-hold-inner"></view>
    </view>

    <view class="content">
      <!-- 页头：等宽眉标 + 紧排大标题 + 更新日期（与隐私政策页完全同构） -->
      <view class="doc-head">
        <text class="doc-kicker">USER AGREEMENT</text>
        <text class="doc-head-title">用户协议</text>
        <text class="doc-head-meta">最近更新：{{ updatedAt }}</text>
      </view>

      <text class="doc-lead">
        欢迎使用我的面试小屋。本协议是你与本小程序运营者之间关于使用本产品服务的约定。
        你开始使用本产品即视为已阅读并同意本协议；数据收集与保护规则另见《隐私政策》。
      </text>

      <view class="doc-section" v-for="(sec, i) in sections" :key="i">
        <text class="doc-num">{{ String(i + 1).padStart(2, '0') }}</text>
        <text class="doc-title">{{ sec.title }}</text>
        <view class="doc-body">
          <text v-for="(p, j) in sec.paras" :key="j" class="doc-para">{{ p }}</text>
          <view v-if="sec.items" class="doc-list">
            <view v-for="(it, k) in sec.items" :key="k" class="doc-item">
              <view class="doc-dot"></view>
              <text class="doc-text">{{ it }}</text>
            </view>
          </view>
        </view>
      </view>

      <text class="doc-footnote">本协议适用于「我的面试小屋」微信小程序。若你不同意本协议的任何条款，请停止使用本产品。</text>
      <view class="page-safe-bottom"></view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ICONS } from '@/utils/svg-icons'

/* 更新日期写死成常量：改协议时同步改这里（与隐私政策页同一约定）。 */
const updatedAt = '2026 年 9 月 19 日'

const sections = [
  {
    title: '服务性质与范围',
    paras: [
      '「我的面试小屋」是一款学习辅助工具，通过 AI 大模型模拟面试官与你进行多轮对话练习，并生成五维评分报告。',
      '本产品提供的一切评分、点评、建议均为 AI 生成内容，仅供学习参考，不构成任何录用承诺、职业评价、职业规划建议或考试辅导保证。'
    ],
    items: [
      '本产品与微信、任何招聘平台、院校或用人单位均无关联，不代表任何面试官或招聘方的立场。',
      'AI 生成的评分不具有任何官方效力，真实招聘结果取决于招聘方的独立评估。'
    ]
  },
  {
    title: '账号与使用',
    paras: [
      '本产品通过微信授权登录，账号仅限本人使用。你可以随时在「设置」中退出登录或注销账号。'
    ],
    items: [
      '不得提交违反法律法规、危害国家安全、侵犯他人权益的内容（含昵称、头像、简介、题目与作答）。',
      '不得将本产品用于代考、作弊、代写等违背诚实信用原则的用途。',
      '不得利用技术手段批量调用接口、爬取数据或干扰服务正常运行。'
    ]
  },
  {
    title: 'AI 生成内容说明',
    paras: [
      '面试题目、追问、点评与评分由大模型自动生成，可能存在偏差或错误。请结合自身实际情况理性判断，针对性练习。'
    ],
    items: [
      '你对提交的内容（作答、自定义题目、个人资料）合法性负责。',
      '为保障内容安全，你提交的文本与 AI 输出会经过内容安全检测；命中违规的内容会被拒绝并提示修改。'
    ]
  },
  {
    title: '知识产权',
    paras: [
      '本产品的界面设计、题库组织与代码归运营者所有。你在使用中输入的内容（如自定义题目、作答文本）的权利归你本人，运营者仅为提供服务所必需而存储与处理，相关规则见《隐私政策》。'
    ]
  },
  {
    title: '数据的存储与删除',
    paras: [
      '你的面试记录与评分报告存储于运营者服务器，用于跨设备同步与历史回顾。你可以随时行使以下权利（操作路径见《隐私政策》）：'
    ],
    items: [
      '清空我的数据：一键删除全部面试记录与评分报告。',
      '注销账号：删除账号本体与全部数据，操作不可恢复。'
    ]
  },
  {
    title: '免责与责任限制',
    paras: [
      '因不可抗力、基础库变更、第三方服务（云服务、AI 模型服务）中断或升级维护导致服务暂时不可用的，运营者不承担由此产生的损失。',
      '对 AI 生成内容的准确性、完整性不作担保；你因依赖 AI 生成内容做出的决策，由你自行承担相应后果。'
    ]
  },
  {
    title: '协议的变更',
    paras: [
      '产品功能或法规要求变化时，本协议可能随之更新，并在本页面标注更新时间。若变更涉及你的重大权利，我们会在小程序内以显著方式提示。继续使用即视为接受更新后的协议。'
    ]
  },
  {
    title: '联系我们',
    paras: [
      '如果你对本协议有任何疑问，可以通过「帮助与反馈」页的微信客服入口联系我们。'
    ]
  }
]

const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/profile/index' })
}

/* 导航栏几何（与隐私政策页同一套实测逻辑） */
const navMetrics = ref({ statusBar: 44, capsuleGap: 96 })
/* 返回键按压态：hover-class 在 fixed 元素上偶发不触发，用 touch 事件自己控。 */
const backPressed = ref(false)
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
const navBarStyle = computed(() => ({
  paddingTop: navMetrics.value.statusBar + 'px',
  paddingRight: navMetrics.value.capsuleGap + 'px'
}))
/* 占位块与导航栏同高（状态栏 + 88rpx 内容 + 16rpx 底间距）。
   88/16rpx 换算成 px：750rpx 设计稿 → 1rpx = windowWidth/750 px。
   这里直接用 rpx 交给 WXSS 渲染更稳，所以只把状态栏高度作为 px 注入。 */
const navHoldStyle = computed(() => ({
  paddingTop: navMetrics.value.statusBar + 'px'
}))
/* 把状态栏高度写进 CSS 变量，供 .pg-nav-center 让标题在内容区居中 */
const pageStyle = computed(() => ({
  '--nav-pad-top': navMetrics.value.statusBar + 'px'
}))
/* v30：模块级同步初始化，保证首帧几何就是真值（见 about 页同处注释）。
   原先放 onMounted → 首帧用兜底值 → 整页"跳一下"、转场留错位残影。 */
initNavMetrics()
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 用户协议 · 一册条文（v34）
 * ============================================================================
 * 本页的导航 / 页头 / 分节 / 条目 / 页脚排版全部在 App.vue 的 .doc-* 系列里，
 * 与隐私政策页共用同一份实现。本页只多一样东西：
 *   页头之上的等宽英文眉标（USER AGREEMENT）。
 *
 * 为什么协议页不该有自己的视觉：它与隐私政策页是同一件事的两个附件。
 * 一旦两页各自定义正文样式，行高/字号就会漂移 —— 从协议页跳到隐私页会看到
 * 同一个正文字号却松紧不同，而没有任何守卫能发现。
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
}

/* 底部留白：页尾的 .page-safe-bottom 已给 $safe-bottom-gap + env()，这里不叠 padding */
.content { padding: $sp-4 $page-padding 0; }

/* ===== 等宽英文眉标 =====
 * 与首页 / 历史页 / 报告页 / 隐私政策页同语言：等宽全大写 + 大字距 + 朱砂。
 * ⚠️ 必须在页面内定义（不能 @extend App.vue 的类：scoped 下解析不到，会构建失败）。 */
.doc-kicker {
  display: block;
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.8rpx;
  margin-bottom: 14rpx;
}
</style>
