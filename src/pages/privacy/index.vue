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
        <text class="pg-nav-title">隐私政策</text>
      </view>
      <view class="pg-nav-side pg-nav-right"></view>
    </view>

    <!-- 占位块：高度 = 状态栏 + 导航内容高 + 底间距。
         没有它，fixed 的导航栏会盖住正文开头。 -->
    <view class="pg-nav-hold" :style="navHoldStyle">
      <view class="pg-nav-hold-inner"></view>
    </view>

    <view class="content">
      <!-- 页头：等宽眉标 + 紧排大标题 + 更新日期。
           眉标（PRIVACY POLICY）与首页 AI MOCK INTERVIEW / 历史页 INTERVIEW LOG
           / 报告页 SCORE REPORT 同一套跨页语言。 -->
      <view class="doc-head">
        <text class="doc-kicker">PRIVACY POLICY</text>
        <text class="doc-head-title">隐私政策</text>
        <text class="doc-head-meta">最近更新：{{ updatedAt }}</text>
      </view>

      <text class="doc-lead">
        「我的面试小屋」是一款模拟面试练习工具。我们只收集为你提供练习与评分所必需的信息，
        不贩卖、不出租你的任何数据。下面是完整的说明。
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

      <!-- 联系方式：指向真实的客服入口，而不是留一个没人看的邮箱。
           凹槽底方卡（$paper-sunken），是全篇唯一有底色的一段 —— 它是一次行动，不是条款。 -->
      <view class="contact-card">
        <text class="contact-title">还有疑问？</text>
        <text class="contact-desc">在「帮助与反馈」页可以直接联系微信客服，工作日 9:00 - 21:00。</text>
        <view class="contact-btn" hover-class="hover-press" @click="goHelp">
          <text class="contact-btn-text">前往帮助与反馈</text>
        </view>
      </view>

      <text class="doc-footnote">本政策适用于「我的面试小屋」微信小程序。继续使用即表示你已阅读并理解上述内容。</text>
      <view class="page-safe-bottom"></view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ICONS } from '@/utils/svg-icons'

/* 更新日期写死成常量：改政策时同步改这里。
   不取 new Date() —— 那样每次打开都显示"今天更新"，等于没有信息量。 */
const updatedAt = '2026 年 9 月 19 日'

const sections = [
  {
    title: '我们收集哪些信息',
    paras: [
      '我们遵循「最少必要」原则，只收集运行本小程序所必需的信息：'
    ],
    items: [
      '微信授权信息：登录时通过微信开放能力获取你的 openid（用于识别账号）。若你授权，还会获取昵称与头像。',
      '你主动填写的内容：昵称、头像、个人简介、教育阶段、目标岗位，以及自定义题目。',
      '面试练习数据：面试记录、你的回答文本、AI 评分与点评报告。',
      '语音数据（仅在开启语音功能时）：录音会经安全通道上传至服务端转写为文字，用于生成面试对话与评分，音频文件转写完成后不长期保存。未开启语音功能时不采集。',
      '设备权限（仅在使用对应功能时申请）：相册/相机用于更换头像（读取你选取或拍摄的图片，图片将上传服务器存储）；麦克风用于语音作答；相册（仅写入）用于保存成绩海报，只写入海报图片、不读取相册内容。拒绝某项授权仅使对应功能不可用，不影响其他功能。',
      '必要的运行信息：用于日志排障的接口错误信息与设备型号，不含你的个人身份标识。'
    ]
  },
  {
    title: '这些信息用来做什么',
    paras: [
      '全部用于实现产品功能本身，不做其他用途：'
    ],
    items: [
      '识别你的账号，让你在不同设备上看到同一份练习记录。',
      '把你的回答交给 AI 生成评分与点评，并据此生成面试报告。',
      '按你选择的目标岗位匹配题目与面试官风格。',
      '统计你的练习进度（场次、时长、连续天数）并展示在「我的」页。'
    ]
  },
  {
    title: '信息的存储与保护',
    paras: [
      '你的数据存储在我们的服务器上，传输过程使用 HTTPS 加密，登录凭证采用带有效期的令牌（token），过期或退出登录后即失效。',
      '接口层对提交内容做类型与长度校验，防止被滥用为文件托管或注入通道。',
      '我们不存储你的微信密码——小程序也无法获取它。'
    ]
  },
  {
    title: '我们如何共享信息',
    paras: [
      '我们不会向任何第三方出售、出租或交换你的个人信息。仅在以下必要情形下会与服务提供方产生数据交互：'
    ],
    items: [
      '微信开放平台：用于微信登录与账号识别（openid）。',
      '云服务商（阿里云）：承载服务器、数据库，以及语音转写与语音合成服务，仅处理为提供服务所必需的数据。',
      'AI 模型服务：你的回答文本会被发送至模型服务以生成评分与点评，仅用于本次生成，不用于训练。'
    ]
  },
  {
    title: '你的权利',
    paras: [
      '你可以随时在「我的 → 设置」中行使以下权利：'
    ],
    items: [
      '查看与修改：在「编辑资料」中修改昵称、头像、简介、教育阶段与目标岗位。',
      '删除：在「隐私与数据 → 清空我的数据」中一键删除全部面试记录与评分报告。该操作不可恢复，删除后云端同步清除。',
      '注销账号：在「隐私与数据 → 注销账号」中删除账号本体，个人资料与全部数据将一并清除且不可恢复；注销后可重新登录并创建新账号。',
      '关闭可选功能：在「互动反馈」中关闭语音播报、震动反馈或面试进度保留。',
      '清除本地缓存：在「隐私与数据 → 存储与缓存」中清理本地数据（不影响账号与云端记录）。'
    ]
  },
  {
    title: '未成年人',
    paras: [
      '本产品面向求职与升学面试练习场景。若你未满 14 周岁，请在监护人陪同下使用，并由监护人阅读并同意本政策后再使用相关功能。'
    ]
  },
  {
    title: '政策的变更',
    paras: [
      '当产品功能或法规要求发生变化时，我们可能更新本政策，并在此页面标注新的更新时间。若涉及对你权利的实质性影响，我们会在小程序内以显著方式提示。'
    ]
  },
  {
    title: '联系我们',
    paras: [
      '如果你对本政策有任何疑问，或希望行使上述权利而操作上遇到困难，可以通过「帮助与反馈」页的微信客服入口联系我们。'
    ]
  }
]

const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/profile/index' })
}
const goHelp = () => uni.navigateTo({ url: '/pages/help/index' })

/* 导航栏几何（与全站同一套实测逻辑） */
const navMetrics = ref({ statusBar: 44, capsuleGap: 96 })
/* 返回键按压态：hover-class 在 fixed 元素上偶发不触发，用 touch 事件自己控 */
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
/* 占位块只注入状态栏高度，内容高与底间距由 WXSS 的 rpx 承担 */
const navHoldStyle = computed(() => ({
  paddingTop: navMetrics.value.statusBar + 'px'
}))
/* 状态栏高度写进 CSS 变量，供 .pg-nav-center 让标题在内容区居中 */
const pageStyle = computed(() => ({
  '--nav-pad-top': navMetrics.value.statusBar + 'px'
}))
/* v30：模块级同步初始化，保证首帧几何就是真值（见 about 页同处注释）。
   原先放 onMounted → 首帧用兜底值 → 整页"跳一下"、转场留错位残影。 */
initNavMetrics()
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 隐私政策 · 一册条文（v34）
 * ============================================================================
 * 本页的导航 / 页头 / 分节 / 条目 / 页脚排版已全部在 App.vue 的 .doc-* 系列里，
 * 与用户协议页共用同一份实现（两页曾是逐字相同的两份拷贝，改一处忘一处）。
 * 本页只保留两处独有内容：
 *   ① 页头之上的等宽英文眉标（PRIVACY POLICY）—— 跨页统一感的来源
 *   ② 收尾的联系卡（协议页没有这一段）
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

/* 底部留白：页尾的 .page-safe-bottom 已经给了 $safe-bottom-gap + env()，
   这里不再叠 padding，避免安全区算两次。 */
.content { padding: $sp-4 $page-padding 0; }

/* ===== 等宽英文眉标 =====
 * 与首页 AI MOCK INTERVIEW / 历史页 INTERVIEW LOG / 报告页 SCORE REPORT 同语言：
 * 等宽全大写 + 大字距 + 朱砂。它是"这是第几册"的标记，不是装饰。
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

/* ===== 联系卡 =====
 * 全篇唯一有底色的一段：它是「读完条款后可以做点什么」的落点。
 * 凹槽底（$paper-sunken）无描边 —— 纸本里"内凹"比"描边"更轻。 */
.contact-card {
  margin-top: $sp-7;
  background: $paper-sunken;
  border-radius: $radius-lg;
  box-shadow: $emboss-2;
  padding: $sp-5;
}
.contact-title {
  display: block;
  font-size: 30rpx;
  font-weight: $weight-bold;
  color: $text-1;
  letter-spacing: -0.3rpx;
}
.contact-desc {
  display: block;
  margin-top: $sp-2;
  font-size: 26rpx;
  color: $text-2;
  line-height: $reading-line;
}
/* 按钮：墨色方圆（$radius-btn 20rpx），不是胶囊 */
.contact-btn {
  margin-top: $sp-4;
  height: 88rpx;
  border-radius: $radius-btn;
  background: $ink;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.contact-btn-text {
  font-size: 29rpx;
  font-weight: $weight-bold;
  color: $on-ink-1;
  letter-spacing: 0.4rpx;
}
</style>
