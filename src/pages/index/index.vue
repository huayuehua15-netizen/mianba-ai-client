<template>
  <view class="page">
    <!-- 状态栏占位 -->
    <view class="status-bar" :style="{ height: statusBar + 'px' }"></view>

    <!-- ===== 页头：微型仪器顶部 =====
         编辑式排版：问候语用巨字（承重），名字降为次级（不抢），
         右侧是「连续天数」的仪表读数而不是一句话——把状态变成读数。 -->
    <view class="header anim-in" :style="{ paddingRight: capsuleGap + 'px' }">
      <view class="user-info" hover-class="hover-press" @click="onUserInfoTap">
        <view class="avatar-wrap">
          <image
            class="avatar"
            :src="userStore.userInfo?.avatar_url || '/static/default-avatar.png'"
            mode="aspectFill"
            @error="onAvatarError"
          />
        </view>
        <view class="user-detail">
          <view class="greeting-row">
            <text class="greeting">{{ greeting }}</text>
          </view>
          <view class="name-row">
            <text class="username">{{ userStore.userInfo?.nickname || '同学' }}</text>
            <!-- 连续天数：等宽读数 + 朱砂火苗，只在有数据时出现 -->
            <view class="streak-chip" v-if="userStore.isLoggedIn && userStore.stats?.streak_days">
              <image class="streak-icon" :src="ICONS.flame" mode="aspectFit" />
              <text class="streak-num">{{ userStore.stats.streak_days }}</text>
              <text class="streak-unit">天</text>
            </view>
            <text class="streak-hint" v-else-if="!userStore.isLoggedIn">未登录</text>
          </view>
        </view>
      </view>
      <view class="header-settings" hover-class="hover-press" @click="goSettings">
        <image class="settings-icon" :src="ICONS.setting" mode="aspectFit" />
      </view>
    </view>

    <!-- ===== HERO：评估单存根（Assessment Stub）=====
         立意升级（v35）：v34 的 hero 是一张「黑色的卡片」——好看，但和所有
         App 的深色 banner 长得一样。v35 把它做成**一张被撕下来的评估单存根**：

           · 右侧是**朱砂等级印章**，旋转 -8°，压在纸边（本设计系统的签名元素）
           · 底部是**撕裂/齿孔撕线**，暗示"这是从一张更大的表上撕下来的"
           · 巨号读数（平均分）与微型等宽标签同屏，制造印刷品的比例张力
           · 无数据时不是空着——显示"待填写"的虚线框，语义精确

         材质仍是暖墨渐变 + 颗粒 + 扫描光（与报告页总分卡同源）。 -->

    <!-- 有数据：成绩存根 -->
    <view class="hero anim-in d1" hover-class="hero-press" @click="goToConfig" v-if="avgScore !== null">
      <image class="hero-grain" src="/static/grain.png" mode="aspectFill" :style="{ opacity: grainOpacity }" />
      <view class="hero-sheen"></view>
      <!-- 等级色环境光晕：印泥渗色（随等级变色，≤15% 透明度） -->
      <view class="hero-glow" :style="{ background: heroGlow }"></view>
      <view class="hero-ring r1"></view>
      <view class="hero-ring r2"></view>

      <!-- 等级印章：旋转压在右上，朱砂描边 + 等级色 -->
      <view class="seal" :class="'seal-' + gradeText.toLowerCase()">
        <text class="seal-letter">{{ gradeText }}</text>
        <text class="seal-cap">GRADE</text>
      </view>

      <view class="hero-inner">
        <text class="hero-eyebrow">CURRENT LEVEL · 当前段位</text>

        <!-- 巨号读数 + 单位 -->
        <view class="hero-readout">
          <text class="hero-num">{{ avgCountUp }}</text>
          <text class="hero-unit">分</text>
        </view>

        <!-- 距下一级：细进度轨 + 等宽提示（C/D 级时"差距"转朱砂提亮） -->
        <view class="hero-gap">
          <view class="hero-gap-track">
            <view class="hero-gap-fill" :style="{ width: meterPct, background: gradeInkLit }"></view>
          </view>
          <text class="hero-gap-text" :class="{ warn: gapWarn }">{{ gradeTip }}</text>
        </view>

        <!-- 存根底栏：撕线 + CTA -->
        <view class="hero-foot">
          <view class="hero-cta">
            <image class="hero-cta-icon" :src="ICONS.mic" mode="aspectFit" />
            <text class="hero-cta-text">再练一场</text>
            <view class="hero-cta-arrow">
              <image class="hero-cta-arrow-icon" :src="ICONS['arrow-up']" mode="aspectFit" />
            </view>
          </view>
          <view class="hero-wave">
            <view
              v-for="bar in waveBars"
              :key="bar.i"
              class="wave-bar"
              :style="{ height: bar.h + 'rpx', animationDelay: bar.delay }"
            ></view>
          </view>
        </view>
      </view>

      <!-- 齿孔撕线：存根被撕下来的物理证据 -->
      <view class="hero-perf"></view>
    </view>

    <!-- 无数据：待填写的空白评估单 -->
    <view class="hero hero-blank anim-in d1" hover-class="hero-press" @click="goToConfig" v-else>
      <image class="hero-grain" src="/static/grain.png" mode="aspectFill" :style="{ opacity: grainOpacity }" />
      <view class="hero-sheen"></view>
      <view class="hero-ring r1"></view>
      <view class="hero-ring r2"></view>

      <view class="hero-inner">
        <text class="hero-eyebrow">ASSESSMENT SHEET · 评估单</text>

        <!-- 虚线"待填写"框：空态即语义，不是留白 -->
        <view class="blank-slot">
          <text class="blank-dash">— — —</text>
          <text class="blank-label">还没有成绩</text>
        </view>

        <view class="hero-title">
          <text class="hero-title-line sub">开始一场</text>
          <text class="hero-title-line main">模拟面试</text>
        </view>
        <view class="hero-rule"></view>
        <text class="hero-sub">实时追问 · 语音/文字作答 · 五维评分报告</text>

        <view class="hero-foot">
          <view class="hero-cta">
            <image class="hero-cta-icon" :src="ICONS.mic" mode="aspectFit" />
            <text class="hero-cta-text">立即开始</text>
            <view class="hero-cta-arrow">
              <image class="hero-cta-arrow-icon" :src="ICONS['arrow-up']" mode="aspectFit" />
            </view>
          </view>
          <view class="hero-wave">
            <view
              v-for="bar in waveBars"
              :key="bar.i"
              class="wave-bar"
              :style="{ height: bar.h + 'rpx', animationDelay: bar.delay }"
            ></view>
          </view>
        </view>
      </view>

      <view class="hero-perf"></view>
    </view>

    <!-- ===== 数据马赛克（v35.3 第十八批）：首页骨架第一次真正分栏 =====
         旧版是「读数带 / 快练条」两条全宽横行纵叠 —— 首页骨架与其它页一个模子，
         这就是"布局一点没改"的根源。现在左右分栏拼版：
           · 左列 = 数据列：场次主格（SESSIONS 眉标 + 巨号读数）+ 答题/时长双联行
           · 右列 = 一张全高**墨面「快速练习」大瓦**（zap + 玩法说明 + 立即开练）
         布局层级从「行的堆叠」变成「块的拼版」，全宽行只剩有真实状态语义的
         （进行中 resume / 区块 section）。 -->
    <view class="mosaic anim-in d2">
      <view class="mosaic-data">
        <view class="tile-data">
          <text class="tile-en">SESSIONS</text>
          <text class="tile-num">{{ userStore.stats?.total_interviews || 0 }}</text>
          <text class="tile-label">累计场次</text>
        </view>
        <view class="tile-pair">
          <view class="tile-mini">
            <text class="tile-mini-num">{{ userStore.stats?.total_questions_answered || 0 }}</text>
            <text class="tile-mini-label">答题总数</text>
          </view>
          <view class="tile-mini-div"></view>
          <view class="tile-mini">
            <view class="tile-mini-num-row">
              <text class="tile-mini-num">{{ practiceDuration.value }}</text>
              <text class="tile-mini-unit">{{ practiceDuration.unit }}</text>
            </view>
            <text class="tile-mini-label">练习时长</text>
          </view>
        </view>
      </view>
      <view class="tile-go" hover-class="tile-go-press" @click="goToQuickPractice">
        <view class="tile-go-icon">
          <image class="tile-go-icon-img" :src="ICONS['zap-white']" mode="aspectFit" />
        </view>
        <text class="tile-go-title">快速练习</text>
        <text class="tile-go-desc">随机一道题 · AI 即时点评</text>
        <view class="tile-go-foot">
          <text class="tile-go-foot-text">立即开练</text>
          <image class="tile-go-foot-arrow" :src="ICONS['chevron-right-white']" mode="aspectFit" />
        </view>
      </view>
    </view>

    <!-- 有进行中的面试：脉冲点条目（弱化的存在感，但"进行中"是活的） -->
    <view class="resume anim-in d4" v-if="resumeInfo" hover-class="hover-press" @click="goResume">
      <view class="resume-dot"></view>
      <view class="resume-main">
        <text class="resume-title">有进行中的面试</text>
        <text class="resume-sub">{{ resumeInfo.positionName || '模拟面试' }} · 已进行 {{ resumeInfo.roundCount || 1 }} 轮</text>
      </view>
      <view class="resume-go">
        <text class="resume-go-text">继续</text>
      </view>
    </view>

    <!-- 热门岗位：横向滑动的"索引卡"（index card）
         序号用描边空心巨数字压在左上角，class 名沿用 hot-* 以兼容既有样式钩子 -->
    <view class="section anim-in d6" v-if="hotPositions.length > 0">
      <view class="section-header">
        <view class="section-title-wrap">
          <text class="section-title-no">01</text>
          <text class="section-title">热门岗位</text>
          <view class="section-title-line"></view>
        </view>
        <view class="section-more" hover-class="hover-press" @click="goToPositions">
          <text class="section-more-text">岗位库</text>
          <image class="section-more-arrow" :src="ICONS['chevron-right-gray']" mode="aspectFit" />
        </view>
      </view>
      <scroll-view scroll-x class="hot-scroll" :show-scrollbar="false">
        <view class="hot-inner">
          <view
            v-for="pos in hotPositions"
            :key="pos._id"
            class="hot-card"
            hover-class="hover-press"
            hover-start-time="0"
            @click="startFromHot(pos)"
          >
            <text class="hot-index">{{ pos.no }}</text>
            <text class="hot-cat">{{ pos.category || '岗位' }}</text>
            <text class="hot-name">{{ pos.name }}</text>
            <view class="hot-foot">
              <text class="hot-go">去练习</text>
              <view class="hot-go-line"></view>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 最近面试 -->
    <view class="section anim-in d6" v-if="recentInterviews.length > 0">
      <view class="section-header">
        <view class="section-title-wrap">
          <text class="section-title-no">02</text>
          <text class="section-title">最近面试</text>
          <view class="section-title-line"></view>
        </view>
        <view class="section-more" hover-class="hover-press" @click="goToHistory">
          <text class="section-more-text">查看全部</text>
          <image class="section-more-arrow" :src="ICONS['chevron-right-gray']" mode="aspectFit" />
        </view>
      </view>
      <interview-card
        v-for="item in recentInterviews"
        :key="item._id"
        :data="item"
        @click="goToDetail(item._id)"
      />
    </view>

    <!-- 首屏骨架屏：按真实卡片的骨架排布，数据回来后原地替换，不是"突然出现"。
         ⚠️ 用 v-if / v-else-if 与下面三个状态（loadError / needLogin / empty）串成一条链，
         保证任意时刻只显示其中一种。 -->
    <view v-else-if="loading && recentInterviews.length === 0" class="section sk-wrap">
      <view class="section-header">
        <view class="section-title-wrap">
          <text class="section-title-no">02</text>
          <text class="section-title">最近面试</text>
          <view class="section-title-line"></view>
        </view>
      </view>
      <view v-for="i in 2" :key="'sk-' + i" class="sk-card">
        <view class="sk-row">
          <view class="skeleton sk-title"></view>
          <view class="skeleton sk-badge"></view>
        </view>
        <view class="skeleton sk-meta"></view>
        <view class="sk-row sk-row-foot">
          <view class="skeleton sk-meta sk-meta-sm"></view>
          <view class="skeleton sk-dot"></view>
        </view>
      </view>
    </view>

    <!-- 加载失败：给可重试的错误态，而不是把网络故障伪装成「还没有面试记录」 -->
    <view v-else-if="loadError" class="load-error" hover-class="hover-press" @click="loadData">
      <text class="load-error-text">数据加载失败，点击重试</text>
    </view>
    <!-- 未登录：给明确的登录入口（与统计/历史/快速练习页同语言） -->
    <view v-else-if="needLogin" class="login-guide">
      <text class="login-guide-tip">登录后查看你的面试记录与评分报告</text>
      <view class="btn-retry" hover-class="hover-press" @click="onLogin">微信一键登录</view>
    </view>
    <empty-state v-else-if="!loading && recentInterviews.length === 0" text="还没有面试记录，来一场真实的模拟面试吧" />

    <!-- 成就解锁仪式：快速练习完回首屏 / 下次打开时补播 -->
    <medal-ceremony-host :visible="pageVisible" />

    <!-- 登录弹窗（2026-11-07）：替代 uni.showModal。
         原生 modal 放不了协议勾选，且「点登录没反应」时无从排查；
         自建弹窗可控制视觉、可放勾选、失败有明确反馈。 -->
    <login-modal
      v-model:visible="loginVisible"
      :loading="loginLoading"
      :wx-fingerprint="wxFingerprint"
      @confirm="onLoginConfirm"
    />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onShow, onHide, onPullDownRefresh, onShareAppMessage } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/modules/user'
import EmptyState from '@/components/empty-state/empty-state.vue'
import InterviewCard from '@/components/interview-card/interview-card.vue'
import MedalCeremonyHost from '@/components/medal-ceremony-host/medal-ceremony-host.vue'
import { getInterviewList } from '@/api/interview'
import { getPositions } from '@/api/position'
import { getInterviewProgress } from '@/utils/interview'
import { ICONS } from '@/utils/svg-icons'
import { go, tab, NAV } from '@/utils/nav'
import { useCountUp } from '@/composables/useCountUp'
import LoginModal from '@/components/login-modal/login-modal.vue'

/* 本页是否前台：tabBar 页切走后仍挂在内存里，仪式宿主需要它来避免后台偷偷播完
   （详见 medal-ceremony-host 的 visible 注释）。 */
const pageVisible = ref(false)

const userStore = useUserStore()

/* ===== 顶部几何：必须在**首帧就是真实值**（v30 修复）
 *
 * 症状（用户实锤）：从首页进「最近面试 → 详情页」，再点详情页的「继续这场面试」，
 * 转场瞬间顶部会露出一块本不属于该页的内容（首页的「平均分 / D / 段位 / 场次」）。
 * 而**从历史页走同一条路径却不会**。
 *
 * 根因是**初始化时机不一致**：
 *   历史页：`initStatusBar()` 在模块级**同步**调用 → 首帧 geometry 就是真值
 *   首页  ：`onMounted(() => initStatusBar())` → 首帧先用兜底 44px 渲染，
 *           挂载后才跳成真实高度
 * 于是首页首帧的 `.status-bar` 占位高度是错的，整页内容相对真值偏移；
 * 这个偏移在离开页面/转场时表现为顶部那块错位的残影。
 *
 * ⚠️ 面试页早就修过同一个问题，它的注释写得很清楚：
 *   「几何必须在首帧就是真实值：初始化在模块级同步执行，而不是丢到 onMounted。
 *     否则首帧用假几何渲染、onMounted 后再跳到真几何，整页内容会跟着跳一下」
 * 首页是同一个 bug 的**漏网实例** —— 改成同一套做法。
 *
 * 为什么保留 ref：几何变了要触发重渲染（如旋转屏、分屏）；
 * 但**初值必须是同步实测值**，不能是兜底常量。 */
const measureHeaderMetrics = () => {
  const def = { statusBar: 44, capsuleGap: 96 }
  try {
    const win = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
    const statusBar = win.statusBarHeight || 44
    // 胶囊避让：首页是自定义导航页，右上角设置图标必须避开微信胶囊
    //（原生层级在页面之上，不避让会被盖住点不到）。与 settings/help 等页同一套几何。
    let capsuleGap = 96
    try {
      const rect = typeof uni.getMenuButtonBoundingClientRect === 'function'
        ? uni.getMenuButtonBoundingClientRect() : null
      if (rect && rect.left && win.windowWidth) capsuleGap = win.windowWidth - rect.left + 14
    } catch (e) { /* 部分环境无胶囊 API，保留兜底值 */ }
    return { statusBar, capsuleGap }
  } catch (e) { return def }
}

// 模块级同步求值：首帧即真实几何（这是本次修复的核心）
const initMetrics = measureHeaderMetrics()
const statusBar = ref(initMetrics.statusBar)
const capsuleGap = ref(initMetrics.capsuleGap)
const initStatusBar = () => {
  const m = measureHeaderMetrics()
  statusBar.value = m.statusBar
  capsuleGap.value = m.capsuleGap
}
const recentInterviews = ref([])
const hotPositions = ref([])
const resumeInfo = ref(null)
// 列表加载失败标记：与「暂无记录」空态区分开，给重试入口
const loadError = ref(false)
// 未登录（用户主动退出后不再静默重登）：与「暂无记录」区分开，给登录引导。
// 三者互斥优先级：loadError > needLogin > 空态（见模板）。
const needLogin = ref(false)
/* 首屏加载标记（v24 新增）：本页此前没有任何 loading 态，空态判据直接是
   recentInterviews.length === 0，而它的初值就是 []。冷启动/切回 tab 时接口
   往返的 200-800ms 里，页面会先渲染出一屏「还没有面试记录，来一场真实的
   模拟面试吧」—— 对一个有几十场记录的老用户是直接的事实错误。
   与项目既有原则一致：「列表失败 ≠ 空列表」「未登录 ≠ 没练过」，这里补上
   「加载中 ≠ 没有数据」这一态。初值 true，loadData 的 finally 里置 false。 */
const loading = ref(true)

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

/* 练习时长：不足 1 小时显示分钟（v24 口径统一）。
 * 原实现 Math.round(minutes/60) 会把 20 分钟显示成「0h」——统计页与我的页
 * 早已改用分钟口径并写了注释（「像功能坏了」），首页是唯一漏网的，导致
 * 同一份数据在首页显示 0h、在统计页显示 20 分钟，两个 tab 互相打脸。 */
const practiceDuration = computed(() => {
  const m = Math.round(userStore.stats?.total_practice_minutes || 0)
  if (m < 60) return { value: m, unit: 'min' }
  const h = m / 60
  // 1 位小数（10.5h）；整数时省掉 .0，读数更干净
  return { value: Number.isInteger(h) ? h : Math.round(h * 10) / 10, unit: 'h' }
})

/* 平均分主角：段位与目标文案与统计页同源（S90/A80/B70/C60），保持产品口径统一；
 * 无数据时给"完成一场后显示"的引导而不是显示 0 分。
 * v24 判据统一：原来用 `s > 0`，会把「真的考了 0 分」也显示成「还没练过」——
 * 这正是统计页注释里明令废弃的旧判据（见 stats/index.vue 的 avgNum）。
 * 改用 scored_interview_count（服务端已返回）区分「没参与过」与「参与过但 0 分」。 */
const avgScore = computed(() => {
  const s = userStore.stats?.average_score
  if (typeof s !== 'number') return null
  const counted = Number(userStore.stats?.scored_interview_count) || 0
  return counted > 0 ? Math.round(s * 10) / 10 : null
})
/* v32：平均分做数字滚动，与统计页同口径。
 * 现状是「同一份数据，两个 tab 两种质感」：统计页的 avgScore 走 useCountUp
 * （1000ms、1 位小数、起点延迟 0），首页这个**同一角色、同一区块主角**的
 * 巨数字是直接插值硬贴上去的 —— 数据到达那一帧从「—」直接
 * 跳成「82.4」，几十 rpx 的墨块面积瞬间出现，观感是"闪了一下"而不是"读出来了"。
 * 参数与统计页逐项对齐（duration 1000 / decimals 1 / fps 32 / delay 0），
 * 保证两个 tab 里这个数字的滚动节奏一模一样。
 *
 * 非数字（无数据时的占位「—」）由 useCountUp 内部直接透传（见其
 * Number.isNaN 分支），不需要在这里再判一次。 */
const avgCountUp = useCountUp(
  computed(() => (avgScore.value === null ? '—' : avgScore.value)),
  { duration: 1000, decimals: 1, fps: 32, delay: 0 }
)
/* v35 新增：等级色带进 CSS 变量。
 * 为什么必须做：v34 里「91 分 S 级」与「64 分 C 级」在界面上都是黑徽章 + 黑数字，
 * 一眼分不出好坏 —— 这是设计失职。等级是这个产品的核心语义，必须上色。
 * 只用于印章描边 / 进度填充 / CTA 点缀，不大面积铺底（否则变成廉价彩色卡）。
 * 第十四批：常量抽到 utils/grades.js（与 score-radar、uni.scss 三处同步改的坑就此收口）。
 * v35.1（第十五批，真机实锤）：墨面板上的等级元素一律用 **提亮版** GRADE_INK_LIT ——
 *   一级色压黑卡对比度只有 ~3:1，用户实测「D 级印章糊进黑卡里、5.9 分的首页灰上加灰」。
 *   低分用户恰恰是最需要被鼓励的人，首页不能越考得差越没精神。 */
import { GRADE_INK, GRADE_INK_LIT, gradeForScore } from '@/utils/grades'
const gradeText = computed(() => gradeForScore(avgScore.value))
const gradeInk = computed(() => GRADE_INK[gradeText.value] || GRADE_INK.D)
const gradeInkLit = computed(() => GRADE_INK_LIT[gradeText.value] || GRADE_INK_LIT.D)

/* 等级色环境光晕：像印泥渗进黑卡的纸纤维里。透明度 ≤15%，是氛围不是色块。 */
const heroGlow = computed(() => {
  const lit = gradeInkLit.value
  return `radial-gradient(circle at 80% 20%, ${lit}26 0%, ${lit}14 34%, transparent 62%)`
})

/* 「距 C 级还差 X 分」是短板语义（$verm 注释里的"短板"用色）：
   C/D 级时转朱砂提亮（黑卡上的一级朱砂只有 3:1，用 lit 版），
   S/A/B 保持灰白 —— 差距提示只在真正"还差得远"时跳出来。 */
const gapWarn = computed(() => ['C', 'D'].includes(gradeText.value))

/* ⚠️ 2026-12-12 修正（与 stats 页同源，用户截图实锤）：
   avgScore === null 时**一律**回「完成一场面试后显示平均分」，但 counted===0 有两种成因：
     ① 一场都没做            → 这句文案对
     ② 做了 N 场但一场都没拿到有效评分（AI 评分失败 scoring_degraded / 报告没生成）
   ② 时首页同一屏右侧就写着「N 场次」，却被告知「完成一场面试」——
   事实错误，且会让人怀疑自己的练习记录丢了。按场次区分。 */
const avgEmptyReason = computed(() => {
  const done = Number(userStore.stats?.total_interviews) || 0
  return done > 0 ? 'scored-none' : 'no-interview'
})
const gradeTip = computed(() => {
  if (avgScore.value === null) {
    return avgEmptyReason.value === 'scored-none'
      ? '练习已完成，但未产生评分'
      : '完成一场面试后显示平均分'
  }
  if (avgScore.value >= 90) return 'S 级 · 面霸水准，保持住'
  const lines = [
    { min: 80, next: 'S', at: 90 },
    { min: 70, next: 'A', at: 80 },
    { min: 60, next: 'B', at: 70 },
    { min: 0, next: 'C', at: 60 }
  ]
  const line = lines.find(l => avgScore.value >= l.min)
  const need = Math.round((line.at - avgScore.value) * 10) / 10
  return `距 ${line.next} 级还差 ${need} 分`
})

// 声波柱的错峰延迟 + 音量曲线高度：在 JS 里算成字符串，模板只做绑定（WXML 表达式能力有限）
// 音量曲线：中间高两边低，比等高竖条更像真实声波，也是"语音产品"的视觉签名
const waveBars = [0, 1, 2, 3, 4, 5, 6].map((i) => {
  const dist = Math.abs(i - 3)          // 距中心的距离 0..3
  const h = 42 - dist * 9               // 42 / 33 / 24 / 15，中间高两边低
  return { i, delay: (i * 0.12).toFixed(2) + 's', h: Math.max(12, h) }
})

// 仪表刻度游标位置：平均分映射到 0-100% 的轨道位置（无数据时不渲染游标）
const meterPct = computed(() => {
  if (avgScore.value === null) return '0%'
  return Math.min(100, Math.max(0, avgScore.value)).toFixed(1) + '%'
})

// 颗粒透明度：克制一点，只加"材质"不加亮度（0.5 会把黑卡提亮发灰）
const grainOpacity = ref(0.35)

const onAvatarError = () => {}

const loadResume = () => {
  const saved = getInterviewProgress()
  if (!saved?.interview) return
  /* 岗位名从哪来（P1 修复，2026-10-08）：
     旧实现读 `saved.interview.position_name`，但 currentInterview 的两个来源都不含该字段 ——
       · 创建面试的响应只有 { interview_id, status, first_question }
       · 服务端重建路径写的是 { interview_id, first_question }
     于是 `|| '模拟面试'` **永远命中**：不管用户选的是「Java开发」还是「产品经理」，
     首页「继续面试」卡片一律显示「模拟面试 · 已进行 N 轮」。
     正确的岗位名在 `saved.config.position_name`（startInterview(config) 时随进度一起落盘），
     兜底顺序：config.position_name → currentInterview.position_name → 通用文案。 */
  const positionName =
    saved.config?.position_name ||
    saved.interview.position_name ||
    '模拟面试'
  resumeInfo.value = {
    positionName,
    roundCount: Math.max(saved.rounds?.length || 1, 1)
  }
}

// onShow 节流：tab 页常驻，切来切去会反复触发 onShow。1.5 秒内不重发——
// 数据不会在这 1.5 秒里变旧，但 4 个 tab 各发一串请求会把微信的 10 并发上限
// 挤满，导致切页时所有请求排队、界面卡住。下拉刷新强制刷新不受此限。
// 注意：仅在「已拿到过数据」时节流，首次加载失败后必须允许重试。
let lastLoadAt = 0
let hasLoaded = false
const loadData = async (force = false) => {
  const now = Date.now()
  if (!force && hasLoaded && now - lastLoadAt < 1500) return
  lastLoadAt = now
  hasLoaded = true
  loadError.value = false
  try {
    if (!userStore.isLoggedIn) {
      const res = await userStore.wxLogin()
      if (!res && !userStore.isLoggedIn) {
        /* 主动退出过的用户会走到这里（wxLogin(false) 尊重「已退出」标记不静默重登）。
           P2 修复：必须标记 needLogin，否则下方空态会显示「还没有面试记录，来一场真实的
           模拟面试吧」—— 对一个根本没登录的用户，这句话在事实层面是错的（他不是「没练过」，
           而是「没登录」），还与同屏上方「点击登录，同步面试记录与评分报告」自相矛盾。
           history / stats 两个 tab 页都已做了同样的登录态分支，首页是唯一漏掉的。 */
        needLogin.value = true
        return
      }
    }
    needLogin.value = false
    await userStore.fetchStats(force)
    const [interviewRes, positionRes] = await Promise.allSettled([
      getInterviewList({ page: 1, page_size: 3 }),
      getPositions({})
    ])
    // 列表失败 ≠ 空列表：标错误态给重试（岗位卡失败可容忍，只隐藏该区块）
    if (interviewRes.status === 'rejected') loadError.value = true
    recentInterviews.value = interviewRes.value?.list || []
    const list = positionRes.value || []
    // 序号在 JS 里格式化好（WXML 不支持 String().padStart() 这类方法调用）
    hotPositions.value = list.slice(0, 4).map((p, i) => ({ ...p, no: String(i + 1).padStart(2, '0') }))
  } catch (e) {
    loadError.value = true
    console.error('加载首页数据失败', e)
  } finally {
    /* 无论成功、失败还是未登录提前 return，都要撤掉 loading——
       否则空态被 v-if="!loading" 永久挡住，页面会停在空白上。 */
    loading.value = false
  }
  loadResume()
}

/* ===== 登录弹窗（2026-11-07 v2）=====
 * 从 uni.showModal 换成自建 <login-modal>：
 *   · 原生 modal 无法承载「协议勾选」，而协议确认是建档前必须的门槛；
 *   · 原生 modal 出错时页面无任何反馈，这次「点登录没反应」就是被它掩盖的。
 * loading 交给弹窗自己的按钮态（不再用全屏 showLoading —— 全屏 loading
 * 会把弹窗一起盖住，用户看不到「正在登录」这个进度语义）。 */
const loginVisible = ref(false)
const loginLoading = ref(false)
/* 上次由微信签发的 openid 指纹（如 "ornl****Ti38"），由 store 在登录成功时
   写入本地。展示它可以让用户确信登录走的是微信官方接口，而不是前端 mock。
   首次登录时为「未登录」态，弹窗会显示「将调用微信开放接口验证你的身份」。 */
const wxFingerprint = ref('')
try { wxFingerprint.value = uni.getStorageSync('wx_identity_fp') || '' } catch (e) {}


const onLogin = () => {
  if (userStore.isLoggedIn) return
  loginVisible.value = true
}

/* 用户在弹窗里点了「微信一键登录」且已勾选协议 */
const onLoginConfirm = async () => {
  if (loginLoading.value) return
  loginLoading.value = true
  try {
    const res = await userStore.wxLogin(true)
    /* wxLogin 返回 null 表示「被守卫拦下」（未授权/已退出标记）。
       force=true 时不应发生；真发生了必须让用户看见，而不是静默停在弹窗上。 */
    if (!res || !userStore.isLoggedIn) {
      uni.showToast({ title: '登录未完成，请重试', icon: 'none' })
      return
    }
    loginVisible.value = false
    // 登录成功后立刻刷新指纹（下次打开弹窗就能看到本次的微信身份凭证）
    try { wxFingerprint.value = uni.getStorageSync('wx_identity_fp') || '' } catch (e) {}
    await userStore.fetchStats().catch(() => {})
    await loadData(true)
  } catch (e) {
    /* 把真实失败原因透出来：网络错误/服务端 4xx 的文案比「登录失败」有用得多 */
    const msg = e?.message || e?.errMsg || ''
    uni.showToast({
      title: msg && msg.length < 24 ? msg : '登录失败，请检查网络后重试',
      icon: 'none'
    })
  } finally {
    loginLoading.value = false
  }
}

const onUserInfoTap = () => {
  // 已登录：与「我的」页 hero 一致，进编辑资料（v24 修复）
  if (userStore.isLoggedIn) return go('/pages/profile-edit/index', NAV.quick)
  // 未登录：走带告知的显式登录入口，不再静默登录
  onLogin()
}

/* v31 转场语义（见 utils/nav.js）：
   · 进入配置/练习用 NAV.enter（自下浮起，暗示"进入一段对话"）
   · 列表→详情用 NAV.quick（更快，保持"快进快出"）
   · switchTab 微信不支持 animationType，仍走原生 */
const goToConfig = () => go('/pages/interview-config/index', NAV.enter)
const goToQuickPractice = () => go('/pages/quick-practice/index', NAV.enter)
const goToHistory = () => tab('/pages/history/index')
const goToPositions = () => go('/pages/positions/index', NAV.quick)
const goToDetail = (id) => go(`/pages/history-detail/index?id=${id}`, NAV.quick)
const goResume = () => {
  // 带 id 进入：面试页会用服务端状态校验这场面试是否仍在进行，
  // 防止点「继续」掉进已在别端结束的幽灵会话
  const saved = getInterviewProgress()
  const id = saved?.interview?.interview_id || saved?.interview?._id
  go(id ? `/pages/interview/index?id=${id}` : '/pages/interview/index', NAV.cover)
}
const startFromHot = (pos) => {
  uni.setStorageSync('quick_position', JSON.stringify({ name: pos.name, id: pos._id }))
  go('/pages/interview-config/index', NAV.enter)
}
const goSettings = () => go('/pages/settings/index', NAV.quick)

onMounted(() => { initStatusBar() })
onShareAppMessage(() => ({ title: '我的面试小屋 · AI 模拟面试，随时开练', path: '/pages/index/index' }))
onShow(() => {
  pageVisible.value = true
  loadData()
})
onHide(() => { pageVisible.value = false })
onPullDownRefresh(async () => {
  await loadData(true)
  uni.stopPullDownRefresh()
})
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 首页 v35 —— 纸本朱砂 · 压印版
 * ----------------------------------------------------------------------------
 * 与 v34 的差别，一句话：**把"平"改成"有厚度"**。
 *   · 读数带从「三根发丝线分隔的格子」→「一条压进纸面的槽」
 *   · hero 从「黑色卡片」→「被撕下来的评估单存根」（带齿孔撕线）
 *   · 等级从「黑徽章」→「旋转的朱砂印章 + 等级色」：S金 A朱 B青 C赭 D灰
 *   · 页头从「问候 + 一句话」→「问候巨字 + 连续天数仪表读数」
 * ============================================================================ */

.page {
  min-height: 100vh;
  padding: 0 $page-padding $sp-6;
  background: $paper;
  /* 纸张纹理：极淡的斜向条纹，只在放大时可见，作用是把纯色底"做旧"一点点。
     用 repeating-linear-gradient 而不是图片，零请求、可直接调参。 */
  background-image: repeating-linear-gradient(
    92deg,
    rgba(23, 19, 14, 0.014) 0rpx,
    rgba(23, 19, 14, 0.014) 1rpx,
    transparent 1rpx,
    transparent 4rpx
  );
}
.status-bar { width: 100%; flex-shrink: 0; }

/* ===== 页头 ===== */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0 32rpx;
}
.user-info {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
/* 头像外圈：一圈极细的"压痕"环，让它像贴上去的圆形标签而不是漂浮的圆 */
.avatar-wrap {
  position: relative;
  margin-right: 22rpx;
  flex-shrink: 0;
  padding: 5rpx;
  border-radius: 50%;
  box-shadow: $emboss-2;
  background: $paper-sunken;
}
.avatar {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: #F5F5F5;
  display: block;
  border: 1rpx solid $rule;
}
.user-detail { display: flex; flex-direction: column; min-width: 0; flex: 1; }

/* 问候：40rpx 重字，是页头承重块 */
.greeting-row { display: flex; align-items: baseline; }
.greeting {
  font-size: 40rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -1.2rpx;
  line-height: 1.12;
}
/* 名字行：名字 + 火苗读数 chip */
.name-row { display: flex; align-items: center; gap: 12rpx; margin-top: 6rpx; min-width: 0; }
.username {
  font-size: 26rpx;
  font-weight: $weight-medium;
  color: $text-3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240rpx;
}
/* 连续天数 chip：朱砂描边 + 等宽数字，是首页唯一常驻的朱砂元素（语义=活着的连续） */
.streak-chip {
  display: flex;
  align-items: center;
  gap: 5rpx;
  padding: 2rpx 10rpx 2rpx 8rpx;
  border-radius: $radius-xs;
  border: 1rpx solid $verm-line;
  background: $verm-soft;
  flex-shrink: 0;
}
.streak-icon { width: 20rpx; height: 20rpx; flex-shrink: 0; }
.streak-num {
  font-family: $font-mono;
  font-size: 22rpx;
  font-weight: $weight-bold;
  color: $verm;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.streak-unit { font-size: 18rpx; color: $verm; opacity: 0.75; line-height: 1.3; }
.streak-hint { font-size: 22rpx; color: $text-4; }

/* 设置按钮：方形（不是圆形——圆形是"社交App"的语言，方形更像工具栏） */
.header-settings {
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
  width: 68rpx;
  height: 68rpx;
  border-radius: $radius-sm;
  background: $paper-card;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  border: 1rpx solid $rule;
  /* 热区 68→88rpx，视觉尺寸不变 */
  &::after {
    content: '';
    position: absolute;
    top: -10rpx;
    bottom: -10rpx;
    left: -10rpx;
    right: -10rpx;
  }
}
.settings-icon { width: 34rpx; height: 34rpx; }

/* ===== HERO 共用材质 ===== */
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  overflow: hidden;
  padding: 38rpx 40rpx 0;
  margin-bottom: $sp-6;
  border-radius: $radius-xl;
  background: $ink-gradient;
  box-shadow: $ink-edge, $ink-shadow;
  transition: opacity $motion-base $ease-out, transform $motion-base $ease-out,
              box-shadow $motion-base $ease-out;
}
.hero-press {
  opacity: $press-opacity-strong;
  transform: scale($press-scale-strong);
  box-shadow: $ink-edge, 0 8rpx 22rpx rgba(23, 19, 14, 0.26);
}

.hero-grain {
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

/* 扫描光：一道斜向白色光带，从左下到右上缓慢巡游。
   用绝对定位 + transform 动画（GPU 友好），不触发重排 */
.hero-sheen {
  position: absolute;
  top: -60%;
  left: -30%;
  width: 180rpx;
  height: 220%;
  pointer-events: none;
  z-index: 2;
  background: linear-gradient(90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.10) 45%,
    rgba(255, 255, 255, 0.16) 50%,
    rgba(255, 255, 255, 0.10) 55%,
    rgba(255, 255, 255, 0) 100%);
  transform: rotate(20deg) translateX(-120rpx);
  animation: heroSheen 8s $ease-out infinite;
}
@keyframes heroSheen {
  0% { transform: rotate(20deg) translateX(-120rpx); }
  55%, 100% { transform: rotate(20deg) translateX(900rpx); }
}

/* ===== 等级色环境光晕（v35.1）=====
   印泥渗进黑卡纸纤维的氛围光：radial 由 JS 内联注入（随等级变色）。
   z-index 与 sheen 同层（都是 pointer-events:none 的氛围层），互不遮挡。 */
.hero-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 2;
}

.hero-inner { position: relative; z-index: 3; width: 100%; }

/* 溢出卡片边缘的同心圆，被 overflow 裁切，是"溢出几何"装饰 */
.hero-ring {
  position: absolute;
  border-radius: 50%;
  border: 1rpx solid rgba(255, 255, 255, 0.10);
  pointer-events: none;
  z-index: 1;
}
.hero-ring.r1 { width: 440rpx; height: 440rpx; right: -150rpx; bottom: -210rpx; }
.hero-ring.r2 { width: 680rpx; height: 680rpx; right: -280rpx; bottom: -340rpx; border-color: rgba(255, 255, 255, 0.05); }

/* ===== 齿孔撕线（v35 签名元素）=====
   存根被撕下来的物理证据：一排白色小圆凹点压在卡片底边。
   实现用 repeating-radial-gradient，零图片、可缩放。 */
.hero-perf {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 14rpx;
  z-index: 4;
  pointer-events: none;
  background-image: radial-gradient(
    circle at 50% 100%,
    rgba(249, 246, 241, 0.92) 0rpx,
    rgba(249, 246, 241, 0.92) 5rpx,
    transparent 5rpx
  );
  background-size: 24rpx 14rpx;
  background-repeat: repeat-x;
  background-position: center bottom;
  opacity: 0.55;
}

.hero-eyebrow {
  font-family: $font-mono;
  font-size: 20rpx;
  font-weight: $weight-bold;
  color: rgba(255, 255, 255, 0.42);
  letter-spacing: 2.4rpx;
}

/* ===== 等级印章（v35 核心视觉）=====
   旋转 -8° 压在卡片右上，等级色描边 + 等级色字，像真盖上去的章。
   为什么旋转：正正方方的徽章是 UI 组件；旋转的印章是"被人盖上去的动作留下的痕迹"。
   为什么描边不均：真印章的边框油墨有断续 —— 用 border-style + 透明度做旧，
   但小程序不支持 dash 动画，所以用「外框 + 内框 + 极轻底噪」三层模拟。 */
.seal {
  position: absolute;
  top: 30rpx;
  right: 30rpx;
  z-index: 5;
  width: 112rpx;
  height: 112rpx;
  border-radius: $radius-xs;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transform: rotate(-8deg);
  /* 内外双框：外 1.5rpx 实线 + 内 1rpx 虚线的组合更像真章 */
  border: 2rpx solid currentColor;
  box-shadow: inset 0 0 0 4rpx rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.02);
  opacity: 0.92;
}
.seal-letter {
  font-family: $font-mono;
  font-size: 54rpx;
  font-weight: $weight-black;
  line-height: 1;
  letter-spacing: -2rpx;
}
.seal-cap {
  font-family: $font-mono;
  font-size: 15rpx;
  font-weight: $weight-bold;
  letter-spacing: 2rpx;
  margin-top: 4rpx;
  opacity: 0.8;
}
/* 五个等级各自的印泥色 —— v35.1：黑卡上必须用提亮版（一级色只有 ~3:1 会糊掉） */
.seal-s { color: $grade-s-lit; }
.seal-a { color: $grade-a-lit; }
.seal-b { color: $grade-b-lit; }
.seal-c { color: $grade-c-lit; }
.seal-d { color: $grade-d-lit; }

/* ===== 巨号读数 ===== */
.hero-readout {
  display: flex;
  align-items: baseline;
  gap: 10rpx;
  margin-top: 20rpx;
}
.hero-num {
  font-family: $font-mono;
  font-size: $font-6xl;
  font-weight: $weight-black;
  color: #FFFFFF;
  line-height: 0.94;
  letter-spacing: -5rpx;
  font-variant-numeric: tabular-nums;
}
.hero-unit {
  font-size: 26rpx;
  font-weight: $weight-medium;
  color: rgba(255, 255, 255, 0.5);
}

/* 距下一级的进度轨：细轨 + 等级色填充（v35.1 轨道提亮：0.12→0.18，低分时短填充不至于整条隐形） */
.hero-gap { margin-top: 26rpx; }
.hero-gap-track {
  height: 6rpx;
  border-radius: 3rpx;
  background: rgba(255, 255, 255, 0.18);
  overflow: hidden;
}
.hero-gap-fill {
  height: 100%;
  border-radius: 3rpx;
  transition: width 0.6s $ease-out;
}
.hero-gap-text {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.55);
  font-weight: $weight-medium;
}
/* 差距提示（C/D 级）：朱砂提亮 + 加粗 —— 短板语义在黑卡上要跳出来 */
.hero-gap-text.warn {
  color: $grade-a-lit;
  font-weight: $weight-bold;
}

/* ===== 存根底栏 ===== */
.hero-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 30rpx;
  padding-bottom: 34rpx;
}

/* CTA：白底黑字（墨底上唯一高对比实体）。v35.2 第十七批：去掉等级色左竖条
   （用户实拍反馈「左侧边框不美观」）—— 印章已经是等级色的承载体，
   按钮保持纯净的白块，两边等距。 */
.hero-cta {
  display: inline-flex;
  align-items: center;
  gap: 14rpx;
  padding: 18rpx 24rpx;
  border-radius: $radius-btn;
  background: #FFFFFF;
  position: relative;
  overflow: hidden;
  transition: transform $motion-fast $ease-out;
}

.hero-cta-icon { width: 28rpx; height: 28rpx; flex-shrink: 0; }
.hero-cta-text { font-size: 29rpx; font-weight: $weight-bold; color: $ink; letter-spacing: -0.4rpx; }
.hero-cta-arrow {
  width: 42rpx;
  height: 42rpx;
  border-radius: $radius-xs;
  background: $ink;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform $motion-fast $ease-out;
}
.hero-press .hero-cta-arrow { transform: translateX(4rpx); }
.hero-cta-arrow-icon { width: 20rpx; height: 20rpx; transform: rotate(45deg); }

/* 声波：音量曲线（中间高两边低）+ 从底部错峰呼吸 */
.hero-wave { display: flex; align-items: flex-end; gap: 6rpx; height: 42rpx; }
.wave-bar {
  width: 4rpx;
  border-radius: 4rpx;
  background: rgba(255, 255, 255, 0.8);
  transform-origin: center bottom;
  animation: waveBar 1.1s $ease-smooth infinite;
}
@keyframes waveBar {
  0%, 100% { transform: scaleY(0.3); opacity: 0.45; }
  50% { transform: scaleY(1); opacity: 1; }
}

/* ===== 空态 hero：待填写的评估单 ===== */
.blank-slot {
  margin-top: 22rpx;
  height: 108rpx;
  border-radius: $radius-sm;
  border: 2rpx dashed rgba(255, 255, 255, 0.16);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  width: 100%;
}
.blank-dash {
  font-family: $font-mono;
  font-size: 34rpx;
  font-weight: $weight-bold;
  color: rgba(255, 255, 255, 0.22);
  letter-spacing: 6rpx;
  line-height: 1;
}
.blank-label { font-size: 20rpx; color: rgba(255, 255, 255, 0.34); letter-spacing: 1rpx; }

.hero-title { margin-top: 26rpx; display: flex; flex-direction: column; position: relative; }
.hero-title-line {
  font-family: $font-display;
  color: #FFFFFF;
  line-height: 1.08;
}
.hero-title-line.sub {
  font-size: 30rpx;
  font-weight: $weight-medium;
  color: rgba(255, 255, 255, 0.58);
  letter-spacing: 0;
}
.hero-title-line.main {
  font-size: 66rpx;
  font-weight: $weight-black;
  letter-spacing: -2.4rpx;
  margin-top: 4rpx;
}
.hero-rule {
  width: 56rpx;
  height: 4rpx;
  border-radius: 2rpx;
  background: rgba(255, 255, 255, 0.28);
  margin-top: 22rpx;
}
.hero-sub {
  display: block;
  margin-top: 16rpx;
  font-size: 23rpx;
  color: rgba(255, 255, 255, 0.5);
  font-weight: $weight-medium;
  line-height: 1.5;
  position: relative;
}
/* 空态 hero 底边内缩：撕线由 .hero-perf 承担，这里只留呼吸空间 */
.hero-blank .hero-foot { padding-bottom: 38rpx; }

/* ===== 数据马赛克（v35.3 第十八批）=====
 * 首页骨架从「全宽行堆叠」改为「左右分栏拼版」：
 *   · 左列 mosaic-data：场次主格（SESSIONS + 巨号读数）+ 答题/时长双联行
 *   · 右列 tile-go：全高墨面「快速练习」大瓦 —— 全页第二块墨面（与 hero 呼应：
 *     大墨在上、小墨在下），也是页面上除了 hero 唯一的动作入口
 * 两条全宽行（读数带 / 快练条）就此消失。 */
.mosaic {
  display: flex;
  align-items: stretch;
  gap: 16rpx;
  margin-bottom: $sp-5;
}
.mosaic-data {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
/* 主格：场次 */
.tile-data {
  flex: 1.25;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10rpx;
  padding: 24rpx 26rpx;
  background: $paper-card;
  border: 1rpx solid $rule;
  border-radius: $radius-lg;
  box-sizing: border-box;
}
.tile-en {
  @include mono-label;
}
.tile-num {
  font-family: $font-mono;
  font-size: 64rpx;
  font-weight: $weight-black;
  color: $text-1;
  line-height: 0.94;
  letter-spacing: -3rpx;
  font-variant-numeric: tabular-nums;
}
.tile-label {
  font-size: 21rpx;
  color: $text-3;
  font-weight: $weight-medium;
  letter-spacing: 0.5rpx;
}
/* 双联行：答题 / 时长 */
.tile-pair {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 18rpx 26rpx;
  background: $paper-card;
  border: 1rpx solid $rule;
  border-radius: $radius-lg;
  box-sizing: border-box;
}
.tile-mini {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}
.tile-mini-div {
  width: 1rpx;
  align-self: stretch;
  background: $rule;
  margin: 0 22rpx;
}
.tile-mini-num-row {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
}
.tile-mini-num {
  font-family: $font-mono;
  font-size: 34rpx;
  font-weight: $weight-black;
  color: $text-1;
  line-height: 1;
  letter-spacing: -1.5rpx;
  font-variant-numeric: tabular-nums;
}
.tile-mini-unit {
  font-size: 20rpx;
  font-weight: $weight-semibold;
  color: $text-3;
}
.tile-mini-label {
  font-size: 20rpx;
  color: $text-3;
  font-weight: $weight-medium;
}
/* 右列：全高墨面「快速练习」大瓦 */
.tile-go {
  width: 44%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 24rpx 26rpx 22rpx;
  background: $ink-gradient;
  border-radius: $radius-lg;
  box-shadow: $ink-edge, 0 10rpx 26rpx rgba(23, 19, 14, 0.22);
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.tile-go-press {
  opacity: $press-opacity-strong;
  transform: scale($press-scale-strong);
}
.tile-go-icon {
  width: 44rpx;
  height: 44rpx;
  border-radius: $radius-sm;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tile-go-icon-img { width: 26rpx; height: 26rpx; }
.tile-go-title {
  margin-top: 20rpx;
  font-size: 30rpx;
  font-weight: $weight-bold;
  color: $on-ink-1;
  letter-spacing: -0.4rpx;
}
.tile-go-desc {
  margin-top: 8rpx;
  font-size: 20rpx;
  color: $on-ink-2;
  line-height: 1.55;
}
.tile-go-foot {
  margin-top: auto;
  padding-top: 18rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.tile-go-foot-text {
  font-size: 24rpx;
  font-weight: $weight-bold;
  color: $on-ink-1;
}
.tile-go-foot-arrow { width: 20rpx; height: 20rpx; }

/* ===== 进行中：脉冲点 ===== */
.resume {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 24rpx 26rpx;
  border-radius: $radius-lg;
  background: $paper-card;
  border: 1rpx solid $rule;
  margin-bottom: $sp-4;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.resume-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: $verm;
  flex-shrink: 0;
  animation: resumePulse 1.8s $ease-smooth infinite;
}
@keyframes resumePulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.82); }
}
.resume-main { flex: 1; display: flex; flex-direction: column; gap: 5rpx; min-width: 0; }
.resume-title { font-size: 27rpx; font-weight: $weight-bold; color: $text-1; }
.resume-sub {
  font-size: 22rpx;
  color: $text-3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.resume-go {
  padding: 8rpx 18rpx;
  border-radius: $radius-xs;
  background: $verm;
  flex-shrink: 0;
}
.resume-go-text { font-size: 22rpx; font-weight: $weight-bold; color: #FFFFFF; }

/* 快速练习入口条已被数据马赛克的墨面大瓦取代（v35.3 第十八批） */

/* ===== 区块 ===== */
.section { margin-bottom: $sp-6; }
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: $sp-4;
}
.section-title-wrap { display: flex; align-items: center; gap: 12rpx; flex: 1; min-width: 0; }
.section-title-no {
  font-family: $font-mono;
  font-size: 21rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 0.5rpx;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.section-title {
  font-size: 33rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -0.8rpx;
  flex-shrink: 0;
}
.section-title-line { flex: 1; height: 1rpx; background: $rule; margin-left: 8rpx; }
.section-more { display: flex; align-items: center; gap: 4rpx; flex-shrink: 0; margin-left: 16rpx; }
.section-more-text { font-size: 23rpx; color: $text-3; }
.section-more-arrow { width: 22rpx; height: 22rpx; }

/* ===== 热门岗位：索引卡 ===== */
.hot-scroll { width: 100%; }
.hot-inner { display: flex; gap: 16rpx; padding-right: 8rpx; }
.hot-card {
  position: relative;
  flex-shrink: 0;
  width: 232rpx;
  padding: 26rpx 24rpx 22rpx;
  border-radius: $radius-lg;
  background: $paper-card;
  border: 1rpx solid $rule;
  overflow: hidden;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
/* 描边空心巨序号压角：编辑式排版，是"索引卡"的编号 */
.hot-index {
  position: absolute;
  top: 8rpx;
  right: 14rpx;
  font-family: $font-mono;
  font-size: 64rpx;
  font-weight: $weight-black;
  line-height: 1;
  letter-spacing: -3rpx;
  color: transparent;
  -webkit-text-stroke: 1rpx rgba(23, 19, 14, 0.14);
  pointer-events: none;
}
.hot-cat {
  display: block;
  font-size: 19rpx;
  color: $text-4;
  letter-spacing: 1rpx;
  margin-bottom: 12rpx;
}
.hot-name {
  display: block;
  font-size: 29rpx;
  font-weight: $weight-bold;
  color: $text-1;
  line-height: 1.3;
  letter-spacing: -0.5rpx;
  min-height: 76rpx;
}
.hot-foot { display: flex; align-items: center; gap: 10rpx; margin-top: 6rpx; }
.hot-go { font-size: 21rpx; color: $verm; font-weight: $weight-semibold; }
.hot-go-line { flex: 1; height: 1rpx; background: $rule; }

/* ===== 骨架屏 ===== */
.sk-wrap { }
.sk-card {
  padding: 26rpx 24rpx;
  border-radius: $radius-lg;
  background: $paper-card;
  border: 1rpx solid $rule;
  margin-bottom: 16rpx;
}
.sk-row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }
.sk-row-foot { margin-top: 16rpx; }
.skeleton {
  border-radius: $radius-xs;
  background: linear-gradient(90deg, $paper-sunken 0%, #F7F3EC 50%, $paper-sunken 100%);
  background-size: 200% 100%;
  animation: skShimmer 1.4s $ease-smooth infinite;
}
@keyframes skShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.sk-title { width: 45%; height: 32rpx; }
.sk-badge { width: 84rpx; height: 40rpx; }
.sk-meta { width: 100%; height: 20rpx; margin-top: 16rpx; }
.sk-meta-sm { width: 35%; margin-top: 0; }
.sk-dot { width: 60rpx; height: 20rpx; }

/* ===== 状态块 ===== */
.load-error {
  padding: 48rpx 24rpx;
  text-align: center;
  border-radius: $radius-lg;
  background: $paper-card;
  border: 1rpx dashed $rule-strong;
}
.load-error-text { font-size: 25rpx; color: $text-3; }

.login-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22rpx;
  padding: 56rpx 24rpx;
  border-radius: $radius-lg;
  background: $paper-card;
  border: 1rpx dashed $rule-strong;
}
.login-guide-tip { font-size: 25rpx; color: $text-3; text-align: center; }
.btn-retry {
  padding: 20rpx 48rpx;
  border-radius: $radius-btn;
  background: $ink;
  font-size: 27rpx;
  font-weight: $weight-bold;
  color: #FFFFFF;
}

/* ===== 入场动画：错峰上浮（位移 + 透明度，只动 transform/opacity） ===== */
.anim-in { animation: fadeUp 0.5s $ease-out both; }
.anim-in.d1 { animation-delay: 0.04s; }
.anim-in.d2 { animation-delay: 0.08s; }
.anim-in.d3 { animation-delay: 0.12s; }
.anim-in.d4 { animation-delay: 0.16s; }
.anim-in.d5 { animation-delay: 0.20s; }
.anim-in.d6 { animation-delay: 0.24s; }
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(18rpx); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
