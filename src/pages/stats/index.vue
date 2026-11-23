<template>
  <!-- 弹层期间锁掉页面滚动（v25 滚动穿透修复）。
       ⚠️ page-meta 必须是**页面内第一个节点**，且不能被 wx:if / wx:for 动态增删。
       它不能写在 .page 这层 view 里面（编译后仍算「不是第一个节点」，
       会报「<page-meta>: 只能是页面内的第一个节点」），所以必须与 .page 平级、
       放在模板最开头。用 style 绑定切换而非 v-if，挂载位置始终不变。 -->
  <page-meta :page-style="sheetLockStyle" />

  <view class="page">
    <view class="status-bar" :style="{ height: statusBar + 'px' }"></view>

    <!-- v32：页头由「居中 34rpx 小标题」改成与历史页同款的编辑式左对齐大标题。
         改之前从一个 tab 切到另一个 tab，标题会**换位置 + 换字号**：
           历史页：左对齐 44rpx / 800 / -1rpx（下面是「共 N 场」副行）
           统计页：居中 34rpx，左右各留一个空占位块
         同级的两个 tab 页标题语言不同，切页时眼睛要重新找一遍标题。
         现在统一成左对齐 44rpx（$font-display）＋ 一行 meta 副标题；
         右上角的微信胶囊本来就在右侧，左对齐标题天然不与之冲突，
         原先夹在两侧的居中占位块也随之删除（它们唯一的作用是把标题挤到中间）。
         ⚠️ 副标题必须读**原始 stats**，不能读 interviewCount（那是滚动中的动画值），
         否则标题行会跟着数字从 0 一路改十几次。 -->
    <view class="nav">
      <text class="nav-kicker">DATA OVERVIEW</text>
      <text class="nav-title">数据</text>
      <text class="nav-sub" v-if="navSubText">{{ navSubText }}</text>
    </view>

    <!-- 未登录（主动退出过）：登录引导，而不是全 0 假数据 -->
    <view v-if="needLogin" class="error-block">
      <text class="error-tip">登录后查看你的平均分、能力雷达与练习日历</text>
      <view class="btn-retry" hover-class="hover-press" @click="onLogin">微信一键登录</view>
    </view>

    <template v-else>
    <!-- 加载中（v24 上移到所有内容之前）：原先这行在页面最末尾、三个 section 之下，
         首屏根本看不到，而那时三个 section 会各自渲染「没数据」的空态。
         v32：由一行「加载中...」换成按真实版面排的骨架屏。
         为什么值得改：本页首屏是「巨号 112rpx 平均分 + 四格指标带 + 三张卡」，
         数据一到整页从一行小字**瞬间长高近两屏**，滚动位置与视觉焦点全部重排 ——
         用户感觉是「页面闪了一下」。骨架屏先把版面撑起来，数据到达时是**填空**而不是重排。
         用 App.vue 的全局 .skeleton（带扫光），不自造灰块：全站只有一套加载语言。
         骨架高度刻意贴近真值（巨号 112rpx → 96rpx 块），切换时跳跃最小。 -->
    <view v-if="!stats && !loadError" class="sk-page sk-wrap">
      <!-- 平均分主角区 -->
      <view class="sk-hero">
        <view class="skeleton sk-line sk-eyebrow"></view>
        <view class="sk-hero-row">
          <view class="skeleton sk-line sk-label"></view>
          <view class="skeleton sk-pill"></view>
        </view>
        <view class="skeleton sk-hero-num"></view>
        <view class="skeleton sk-meter"></view>
      </view>
      <!-- 四格指标带 -->
      <view class="sk-strip">
        <view v-for="i in 4" :key="'skc-' + i" class="sk-strip-cell">
          <view class="skeleton sk-line sk-strip-num"></view>
          <view class="skeleton sk-line sk-strip-label"></view>
        </view>
      </view>
      <!-- 三张区块卡：卡头一行 + 内容块 -->
      <view v-for="i in 3" :key="'skb-' + i" class="sk-block">
        <view class="sk-block-head">
          <view class="skeleton sk-line sk-block-no"></view>
          <view class="skeleton sk-line sk-block-title"></view>
        </view>
        <view class="skeleton sk-card"></view>
      </view>
    </view>
    <!-- 数据总览：平均分是这页的主角，用编辑式栏目承载段位刻度尺；
         其余指标是配角，退成一条细分隔带，主次一眼可分。 -->
    <view class="overview" v-if="stats">
      <!-- 主角区：编辑式数据页。不做反色黑卡（首页/报告页已用过，全站一个模子会腻），
           改靠「巨号 mono 数字 + 精细刻度尺」的编辑式排版做页面锚点，
           让统计页有「冷静的数据终端」气质，与其他页的黑材质拉开差异。 -->
      <view class="hero anim-in">
        <!-- 栏目眉栏：发丝线 + 小字 + 发丝线，杂志栏目的经典语言，
             先给这块「数据终端」一个明确的开始，而不是数字直接怼在页面上 -->
        <view class="hero-eyebrow">
          <view class="hero-eyebrow-line"></view>
          <text class="hero-eyebrow-text">数据总览</text>
          <view class="hero-eyebrow-line"></view>
        </view>
        <view class="hero-top">
          <text class="hero-label">平均分</text>
          <view class="hero-grade" :class="['hero-grade-g-' + gradeKey, { 'hero-grade-s': isSGrade }]">
            <text class="hero-grade-letter">{{ gradeText }}</text>
          </view>
        </view>
        <view class="hero-num-row">
          <text class="hero-num">{{ avgCount }}</text>
          <text class="hero-unit" v-if="avgScore !== null">分</text>
        </view>
        <!-- 次级数据行：近30天真实最高分，给主角平均分一个佐证，
             也让这块区域的信息密度配得上它的版面权重 -->
        <view class="hero-sub" v-if="bestRecent !== null">
          <text class="hero-sub-key">近30天最佳</text>
          <text class="hero-sub-val">{{ bestRecent }} 分</text>
        </view>
        <!-- 段位刻度尺：细线轨道 + 段位刻度线 + 游标，把一个死数字变成一台有方向的仪表。
             刻度位置即真实段位线（60/70/80/90），数据诚实不打折扣。 -->
        <view class="hero-meter">
          <view class="hero-meter-track">
            <view class="hero-meter-fill" :style="{ width: barPct + '%' }"></view>
            <view
              v-for="m in gradeMarks"
              :key="m.key"
              class="hero-meter-tick"
              :style="{ left: m.pct + '%' }"
            ></view>
            <view
              v-if="avgScore !== null"
              class="hero-meter-cursor"
              :style="{ left: barPct + '%' }"
            ></view>
          </view>
          <view class="hero-meter-scale">
            <text
              v-for="m in gradeMarks"
              :key="m.key"
              class="hero-meter-letter"
              :class="{ active: gradeText === m.key }"
              :style="letterStyle(m)"
            >{{ m.key }}</text>
          </view>
        </view>
        <text class="hero-tip">{{ gradeTip }}</text>
        <!-- 底部发丝线：给这块开放式栏目一个收口，与上方眉栏首尾呼应 -->
        <view class="hero-rule-bottom"></view>
      </view>

      <!-- ===== Bento 指标网格（v35.2 第十六批）=====
           旧版是四格等分带（和首页数据条一个模子）——这就是「千篇一律」的来源。
           改成 2×2 bento：统一 gap / 统一圆角，**材质按格交替**
           （白卡 / 墨面 / 白卡 / 暖纸），连续天数独占墨面瓦片成为全页唯一强调位。
           参考手法定锚：Apple/Notion 式 bento——尺寸有层级、间距一个 token、
           圆角一个值、拒绝装饰性空瓦片（每个格都装真实数据）。 -->
      <view class="bento anim-in d1">
        <view class="tile">
          <text class="tile-label">SESSIONS</text>
          <text class="tile-num">{{ interviewCount }}</text>
          <text class="tile-name">面试场次</text>
        </view>
        <view class="tile tile-ink">
          <view class="tile-flame">
            <image class="tile-flame-img" :src="ICONS['flame-white']" mode="aspectFit" />
          </view>
          <text class="tile-num tile-num-on-ink">{{ streakCount }}</text>
          <text class="tile-name tile-name-on-ink">连续天数</text>
        </view>
        <view class="tile">
          <text class="tile-label">ANSWERED</text>
          <text class="tile-num">{{ questionCount }}</text>
          <text class="tile-name">答题总数</text>
        </view>
        <view class="tile tile-warm">
          <text class="tile-label">MINUTES</text>
          <view class="tile-num-row">
            <text class="tile-num">{{ practiceNum }}</text>
            <text class="tile-unit">{{ practiceInfo.unit }}</text>
          </view>
          <text class="tile-name">练习时长</text>
        </view>
      </view>
    </view>

    <!-- ===== Bento 跨栏瓦片：雷达 / 趋势 / 日历（v35.2 第十六批）=====
         旧的「01 标题线 + 白卡」三连是全站最千篇一律的节奏；现在收进 bento 网格，
         每张图卡自带**内联瓦片头**（mono 编号 + 标题 + 英文角标），不再压一条
         横贯全页的标题线 —— 页面从"三个同构 section"变成"一块有节奏的马赛克"。 -->
    <view class="bento bento-stack anim-in d2" v-if="stats">
      <view class="tile tile-span">
        <view class="tile-head">
          <text class="section-index">01</text>
          <text class="section-title">能力雷达</text>
          <text class="tile-head-en">RADAR</text>
        </view>
        <!-- 图表为 SVG 渲染（纯网页内容、无原生层），弹窗/遮罩正常覆盖，无穿透 -->
        <score-radar v-if="radarHasData" :scores="radarData" show-value />
        <!-- 一次有效评分都没有时不画空雷达（一圈空网格会让人以为「能力全 0」），
             直接说明原因与下一步该做什么 -->
        <view v-else class="radar-empty">
          <text class="radar-empty-title">还没有有效评分</text>
          <text class="radar-empty-desc">完成一场面试（至少作答一道正式题目）后，这里会生成你的五维能力图</text>
          <view class="empty-cta" hover-class="hover-press-strong" @click="goPractice">去练一场</view>
        </view>
        <!-- 样本量脚注：贴在瓦片内、与图表同属一块，读作「图表注释」 -->
        <view v-if="radarHasData" class="radar-foot">
          <text class="radar-foot-text">{{ radarSampleText }}</text>
        </view>
      </view>

      <view class="tile tile-span">
        <view class="tile-head">
          <text class="section-index">02</text>
          <text class="section-title">分数趋势 · 近30天</text>
          <text class="tile-head-en">TREND</text>
        </view>
        <!-- 同上：SVG 渲染，无原生层，弹窗开关零影响。
             不传 height → 按实测宽度等比（高度随机型自适应，见 echart.vue 说明），
             小屏不会变窄高条、大屏不会变扁宽条。 -->
        <echart v-if="trendOption" :option="trendOption" />
        <view v-else class="empty">
          <text class="empty-text">{{ trendEmptyText }}</text>
          <view class="empty-cta" hover-class="hover-press-strong" @click="goPractice">去练一场</view>
        </view>
      </view>

      <view class="tile tile-span">
        <view class="tile-head">
          <text class="section-index">03</text>
          <text class="section-title">练习日历 · {{ heatmapRangeLabel }}</text>
          <text class="tile-head-en">HEATMAP</text>
        </view>
        <calendar-heatmap :data="heatmapData" :weeks="12" dark @select-day="openDayDetail" />
        <!-- 空态判据从「有没有热力数据」改成「窗口内有几格有墨」（历史注释见 git）：
             后端在「近 90 天没有练习」时会回退成全部历史，此时所有日期都落在
             12 周窗口之外 —— 日历一片空白而空态不显示。按窗口内实际有墨天数判断。 -->
        <view v-if="!heatmapVisibleDays" class="empty-sub">
          <text class="empty-sub-text">{{ heatmapEmptyText }}</text>
          <view class="empty-cta" hover-class="hover-press-strong" @click="goPractice">去练一场</view>
        </view>
      </view>
    </view>

    <!-- 当日详情：「练习小票」居中票证卡。点选某个有记录的日期后从屏幕中央弹出
         （票根字段 + 24h 时间轴 + 打孔撕裂线 + 条码票脚，见组件头注释）。
         整块交互已经抽成独立组件（遮罩淡入 + 弹性缩放入场 + 明细时间轴），
         页面只负责「给数据」与「按 320ms 时序卸载」，不再持有任何动画状态。 -->
    <day-detail-sheet
      :visible="sheetVisible"
      :detail="dayDetail"
      @close="closeDayDetail"
      @select-session="onSelectSession"
    />

    <!-- 错误态分两种（v24）：
         ① 从没有过数据（首屏失败）→ 整块错误态占位，给重试；
         ② 已有数据但这次刷新失败 → 只给一条轻提示，旧数据继续显示。
         这个区分很重要：v24 之前 fetchStats 失败会把 stats 置空，用户下拉刷新一次
         就看到"辛苦积累的数据当场消失"；现在数据保住了，但若仍用整块错误态，
         会出现「顶部报加载失败、下面数据都在」的自相矛盾观感。 -->
    <view v-if="loadError && !stats" class="error-block">
      <text class="error-tip">统计加载失败，请检查网络</text>
      <view class="btn-retry" hover-class="hover-press" @click="loadData">重新加载</view>
    </view>
    <view v-else-if="loadError && stats" class="refresh-fail" hover-class="hover-press" @click="loadData">
      <text class="refresh-fail-text">刷新失败，显示的是上次数据 · 点击重试</text>
    </view>
    </template>

    <!-- 登录弹窗（全站统一，含协议勾选） -->
    <login-modal
      v-model:visible="loginVisible"
      :loading="loginLoading"
      :wx-fingerprint="wxFingerprint"
      @confirm="onLoginConfirm"
    />
  </view>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/modules/user'
import { useCountUp } from '@/composables/useCountUp'
import ScoreRadar from '@/components/score-radar/score-radar.vue'
import CalendarHeatmap from '@/components/calendar-heatmap/calendar-heatmap.vue'
import DayDetailSheet from '@/components/day-detail-sheet/day-detail-sheet.vue'
import Echart from '@/components/echart/echart.vue'
import { getLineOption } from '@/utils/charts'
import { ICONS } from '@/utils/svg-icons'
import LoginModal from '@/components/login-modal/login-modal.vue'

const userStore = useUserStore()
/* 页面存活标记（见 onUnmounted）：登录/加载的 await 续体在卸载后不得再写状态 */
let destroyed = false
const stats = ref(null)
const loadError = ref(false)
// 未登录（主动退出过）态：显示登录引导而不是全 0 假数据
const needLogin = ref(false)

const statusBar = ref(44)
try {
  const win = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
  statusBar.value = win.statusBarHeight || 44
} catch (e) {}

// onShow 节流：tab 页常驻，切来切去反复触发 onShow。1.5 秒内不重发，
// 且 fetchStats 自身也带短时去重，双重避免与别的 tab 请求挤占并发上限。
let lastLoadAt = 0
let hasLoaded = false
const loadData = async (force = false) => {
  const now = Date.now()
  if (!force && hasLoaded && now - lastLoadAt < 1500) return
  lastLoadAt = now
  hasLoaded = true
  loadError.value = false
  // 未登录（主动退出过）：给登录引导而不是全 0 假数据（那会让用户以为数据丢了）
  if (!userStore.isLoggedIn) {
    needLogin.value = true
    stats.value = null
    return
  }
  needLogin.value = false
  try {
    /* v24 修复「下拉刷新失败 → 整页数据凭空消失」：
       原写法 `stats.value = await fetchStats()`，而 fetchStats 的契约是失败返回 null，
       于是地铁里下拉刷新一次，总览/雷达/趋势/日历四块会被一个错误块整体替换 ——
       用户看到的是「辛苦积累的数据当场没了」，比不刷新糟得多。
       改为：只在拿到新数据时覆盖，失败时保留旧数据并单独标注（顶部错误条）。 */
    const next = await userStore.fetchStats(force)
    if (next) {
      stats.value = next
      loadError.value = false
    } else {
      loadError.value = true
    }
  } catch (e) { loadError.value = true }
}

/* 登录引导：走全站统一的 <login-modal>（含协议勾选），不再用原生 showModal */
const loginVisible = ref(false)
const loginLoading = ref(false)
/* 上次微信签发的 openid 指纹，用于弹窗展示"真实微信登录"凭证 */
const wxFingerprint = ref('')
try { wxFingerprint.value = uni.getStorageSync('wx_identity_fp') || '' } catch (e) {}
const onLogin = () => {
  if (userStore.isLoggedIn) { loadData(); return }
  loginVisible.value = true
}
const onLoginConfirm = async () => {
  if (loginLoading.value) return
  loginLoading.value = true
  try {
    const res = await userStore.wxLogin(true)
    // 等待期间页面可能已卸载：不再写 ref、不再弹提示
    if (destroyed) return
    if (!res || !userStore.isLoggedIn) {
      uni.showToast({ title: '登录未完成，请重试', icon: 'none' })
      return
    }
    loginVisible.value = false
    await loadData(true)
  } catch (e) {
    if (destroyed) return
    const msg = e?.message || e?.errMsg || ''
    uni.showToast({ title: msg && msg.length < 24 ? msg : '登录失败，请检查网络后重试', icon: 'none' })
  } finally {
    loginLoading.value = false
  }
}

/* v32：三处空态的出口都指向「快速练习」。
 * 为什么是 quick-practice 而不是首页/配置页：本页三处空态的文案都是
 * 「完成一场面试…」，用户此刻最想做的事是**立刻做一道**，不是再选一遍岗位配置。
 * 快速练习正是「一题即开始」的最短路径；想认真配一场的用户，从空态旁边
 * 也依然能走 tabBar 回首页 —— 这里只保证「想马上练」的人一步到位。
 * 失败必须给反馈：路由被拒时静默停在原地看着像按钮坏了。 */
const goPractice = () => {
  uni.navigateTo({
    url: '/pages/quick-practice/index',
    fail: () => uni.showToast({ title: '打开失败，请重试', icon: 'none' })
  })
}

const radarData = computed(() => {
  if (!stats.value?.dimension_scores) return []
  const labels = { expression_logic: '表达逻辑', professional_depth: '专业深度', adaptability: '应变能力', fluency: '流畅度', structure_completeness: '结构完整性' }
  return Object.entries(stats.value.dimension_scores).map(([k, v]) => ({ name: labels[k] || k, score: v?.score ?? v }))
})

/* 雷达图基于几次「真正评估过」的**面试**（后端 dimension_sample_size）。
   为什么必须标出来：雷达与平均分**口径故意不同**——
   平均分把未作答的场次按 0 分计入（诚实、且防止靠不答刷分），
   雷达只统计真正评估过的（用「没测过」去稀释「测过」会把能力说低）。
   不标样本量的话，用户会以为雷达是拿全部场次平均出来的，数字对不上就又成了 bug。
   ⚠️ 单位是「场面试」不是「次作答」：dimension_sample_size = 有维度分的**报告数**，
   一份报告 = 一场面试（哪怕这场答了 3 题也只算 1）。2026-10-08 曾误写成「次有效作答」。 */
const radarSampleSize = computed(() => Number(stats.value?.dimension_sample_size) || 0)
const radarHasData = computed(() => radarSampleSize.value > 0)
const radarSampleText = computed(() => {
  const n = radarSampleSize.value
  return n > 0 ? `基于 ${n} 场已评分面试` : ''
})

const trendOption = computed(() => {
  const trend = stats.value?.recent_trend
  if (!trend || trend.length === 0) return null
  /* 后端 recent_trend[].score 为 null 表示「这天有面试但没评出分」，
     不是 0 分。若直接交给图表，echart 的 Number(null) || 0 会把这些点
     画到 0 刻度，趋势线俯冲到 0 —— 与「平均分 82.3·A 级」自相矛盾
     （后端 userController 注释里明确点名要避免的）。
     这里只保留有效分数点：折线只连真实成绩，空缺日自然断开，
     不引入任何新的图表几何分支（smoothPathD 的钳制逻辑保持不变）。 */
  const valid = trend.filter((t) => {
    const s = Number(t?.score)
    return Number.isFinite(s) && s > 0
  })
  if (valid.length === 0) return null
  const xData = valid.map((t) => t.date)
  const yData = valid.map((t) => Number(t.score))
  return getLineOption(xData, yData)
})
// 空态分两种：从没面过（真没数据）/ 面过但都在 30 天前（数据过期）。
// 前者催他去练，后者告诉他历史还在、只是窗口内没有——不能说「暂无数据」。
const trendEmptyText = computed(() => {
  if (avgScore.value === null) return '暂无足够数据，多完成几次面试即可看到趋势'
  return '近30天没有新的面试记录，完成一场即可看到走势'
})

const heatmapData = computed(() => {
  const list = stats.value?.heatmap || []
  const map = {}
  list.forEach((item) => { if (item?.date) map[item.date] = item.count || 1 })
  return map
})
const hasHeatmapData = computed(() => Object.keys(heatmapData.value).length > 0)

/* v32：日历网格实际覆盖的日期窗口内，有几天落了墨。
 * 为什么不能直接用 hasHeatmapData：它判的是「后端返回的 heatmap 非空」，
 * 而后端在近 90 天无记录时会回退成「全部历史」（heatmap_range='全部记录'）。
 * 接着 calendar-heatmap 只画 12 周（最近 82 天，见组件 weekStarts 的算法）——
 * 一份三个月前的数据落在窗口之外，网格里一格都不亮，
 * 但 hasHeatmapData 仍是 true，于是空态不显示：一张全空的日历 + 一句
 * 标题「练习日历 · 全部记录」，用户读不出任何原因。
 *
 * 窗口算法必须与 calendar-heatmap 的 weekStarts **逐字一致**
 * （周一为列首、最后一列包含今天、共 12 列 × 7 行），否则判据与网格会错位。
 * 未来日期不计（网格不画未来格，那些天也不可能有记录）。 */
const HEATMAP_WEEKS = 12
const heatmapWindowStart = (() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = (today.getDay() + 6) % 7   // 0=周一
  const monday = new Date(today)
  monday.setDate(today.getDate() - dow - (HEATMAP_WEEKS - 1) * 7)
  return monday
})()
const heatmapVisibleDays = computed(() => {
  const start = heatmapWindowStart.getTime()
  const end = Date.now() + 86400000   // 含今天
  return Object.keys(heatmapData.value).filter((d) => {
    const t = new Date(d + 'T00:00:00').getTime()
    return Number.isFinite(t) && t >= start && t <= end
  }).length
})
const heatmapEmptyText = computed(() => {
  // 有历史记录但都在这 12 周之外：说清"数据还在、只是不在这张图里"，
  // 而不是误报"从没练过"（那与上面的场次/平均分直接打架）。
  if (hasHeatmapData.value) return `这 ${HEATMAP_WEEKS} 周内没有练习记录，更早的记录不计入这张日历`
  return '还没有练习记录，完成一场面试就会在这里落墨'
})
// 同 trendRangeLabel：后端回退全部历史时标「全部记录」，标题与数据必须一致
const heatmapRangeLabel = computed(() => stats.value?.heatmap_range || '近90天')

/* ===== 当日详情抽屉 =====
 * 位移/跟手/进出场全部由 day-detail-sheet 组件内部负责，页面只做两件事：
 *   1. 给数据：把选中的那天解析成 detail 快照（月/日/周几在 JS 里算好，WXML 不做日期计算）
 *   2. 控时序：收到 close 后立刻卸 visible 触发收回动画，320ms 后再卸载组件
 *      （320ms 必须与组件内部 CLOSE_MS 常量一致，否则会出现「收一半被卸载」的跳切）
 */
const CLOSE_MS = 320
const emptyDay = () => ({ date: '', md: 0, d: 0, week: '', sessions: [], count: 0, minutes: 0 })
const dayDetail = ref(emptyDay())
const sheetVisible = ref(false)
/* 页面滚动锁（v25 滚动穿透修复）：与 sheetVisible 分开维护。
   sheetVisible 在「收回动画播完后」才置 false，而滚动锁必须覆盖
   「弹层已可见 → 用户开始滚 → 收到 close → 动画收完」整个区间 ——
   若直接用 sheetVisible 驱动，锁会在动画刚开始时就松开，用户快速点击关闭的
   那一瞬间仍能带动背景页。因此独立成一个 ref，由 open/close 成对置位。 */
const sheetLocked = ref(false)
let sheetHideTimer = null

/* 弹层期间的页面级滚动锁。
   用 style 绑定（而不是 v-if）切换：page-meta 不能被 wx:if / wx:for 动态增删，
   它必须常驻在模板里、只改 page-style 的内容。 */
const sheetLockStyle = computed(() => (sheetLocked.value ? 'overflow:hidden;' : ''))

const weekdayName = (d) => ['日', '一', '二', '三', '四', '五', '六'][d]
// 返回该日期在统计原始 heatmap 里的 sessions 明细（[{ time, minutes, position, interview_id }]）
const findDaySessions = (date) => {
  const item = (stats.value?.heatmap || []).find((x) => x?.date === date)
  return Array.isArray(item?.sessions) ? item.sessions : []
}

const openDayDetail = (date) => {
  // 关闭途中又点开：撤销卸载，面板保持打开直接换内容（组件会按 date 重播入场）
  if (sheetHideTimer) { clearTimeout(sheetHideTimer); sheetHideTimer = null }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
  const sessions = findDaySessions(date)
  dayDetail.value = {
    date,
    md: m ? Number(m[2]) : 0,
    d: m ? Number(m[3]) : 0,
    week: d ? weekdayName(d.getDay()) : '',
    sessions,
    count: sessions.length,
    minutes: sessions.reduce((s, x) => s + (Number(x.minutes) || 0), 0)
  }
  sheetLocked.value = true
  sheetVisible.value = true
}

const closeDayDetail = () => {
  if (!sheetVisible.value) return
  if (sheetHideTimer) clearTimeout(sheetHideTimer)
  // 组件内部收到 visible=false 后播 320ms 收回动画，这里等它播完再卸载
  sheetHideTimer = setTimeout(() => {
    sheetVisible.value = false
    // 锁到动画真正结束才解：提前解会让「点关闭的瞬间」成为穿透窗口
    sheetLocked.value = false
    dayDetail.value = emptyDay()
    sheetHideTimer = null
  }, CLOSE_MS)
}

/* 点某条明细 → 跳该场面试详情。
 * 点击反馈与提速都在弹窗组件内完成（行内转圈节拍 + 详情预取），这里只负责：
 * 收回抽屉（避免返回时抽屉还悬在页面上）+ navigateTo。
 * 旧数据可能没有 interview_id，组件侧已拦截不发事件，这里再兜一层防御。 */
const onSelectSession = (s) => {
  if (!s?.interview_id) return
  closeDayDetail()
  uni.navigateTo({
    url: `/pages/history-detail/index?id=${s.interview_id}`,
    // 路由被拒（极端并发/系统拒绝）时显式告知，不让用户停在无反馈的原地
    fail: () => uni.showToast({ title: '打开失败，请重试', icon: 'none' })
  })
}

onUnmounted(() => {
  destroyed = true
  if (sheetHideTimer) clearTimeout(sheetHideTimer)
})

onShow(() => loadData())
onPullDownRefresh(async () => { await loadData(true); uni.stopPullDownRefresh() })

/* ===== 平均分主角卡 =====
 * 段位线：S 90 / A 80 / B 70 / C 60，与报告页、个人页的等级定义保持一致。
 *
 * 「有没有数据」的判据必须是 `scored_interview_count`（参与统计的场次），**不能再用 `s > 0`**：
 * 2026-10-08 口径调整后，**未作答的场次按 0 分计入平均**（用户决策：进去不想答直接结束 = 0 分），
 * 于是「真的考了 0 分」和「一场都没考」的 average_score 都是 0 —— 旧判据会把前者
 * 也显示成「完成一场面试后显示平均分」，等于把用户已经做过的事说成没做过。
 * 现在：一场都没参与 → 显示「—」；参与了但拿 0 分 → 如实显示「0 分 · D 级」。 */
const avgScore = computed(() => {
  const s = stats.value?.average_score
  if (typeof s !== 'number') return null
  const counted = Number(stats.value?.scored_interview_count) || 0
  return counted > 0 ? s : null
})

const gradeText = computed(() => {
  if (avgScore.value === null) return '—'
  if (avgScore.value >= 90) return 'S'
  if (avgScore.value >= 80) return 'A'
  if (avgScore.value >= 70) return 'B'
  if (avgScore.value >= 60) return 'C'
  return 'D'
})
const isSGrade = computed(() => avgScore.value !== null && avgScore.value >= 90)
/* v35：等级 key（小写），供 .hero-grade-g-* 选色。
   无数据时归到 d（石灰），配合 gradeText 的「—」占位是中性观感。 */
const gradeKey = computed(() => {
  const g = gradeText.value
  return ['S', 'A', 'B', 'C', 'D'].includes(g) ? g.toLowerCase() : 'd'
})

/* 页头副标题（v32）：读**原始 stats**，不读滚动中的动画值
 * （interviewCount 是从 0 滚上去的，若挂到标题上，标题会被改写十几次）。
 * 内容取「场次 + 平均分」，与下方主角区同一口径，只是更小一级 ——
 * 它回答的是用户切进这一页最先想知道的那件事：我一共练了多少、整体什么水平。
 * 必须定义在 avgScore 之后（组合式 API 里 computed 引用后声明的常量
 * 会在 setup 求值时抛 ReferenceError）。 */
const navSubText = computed(() => {
  const s = stats.value
  if (!s) return ''
  const n = Number(s.total_interviews) || 0
  if (!n) return '还没有练习记录'
  const avg = avgScore.value
  return avg === null ? `累计 ${n} 场 · 暂无有效评分` : `累计 ${n} 场 · 平均 ${avg} 分`
})

/* 「距 A 级还差 2.5 分」：有目标感的文案，比孤零零一个数字有动力
 *
 * ⚠️ 2026-12-12 修正（用户截图实锤）：原来 avgScore === null 时**一律**回
 * 「完成一场面试后显示平均分」。但 scored_interview_count === 0 有两种成因：
 *   ① 一场都没做            → 这句文案是对的
 *   ② 做了 N 场但**一场都没拿到有效评分**
 *      （AI 评分全程失败 scoring_degraded=true，或报告压根没生成成功）
 * ② 时用户明明看到旁边写着「11 场次」，却被告知「完成一场面试」——
 *    事实错误，而且会让人以为自己的练习记录丢了（截图里就是这个观感）。
 * 现在按场次区分：做过了就如实说明"做过了但没有评分"，并给出下一步动作。 */
const avgEmptyReason = computed(() => {
  const done = Number(stats.value?.total_interviews) || 0
  if (done > 0) return 'scored-none'
  return 'no-interview'
})

// 「距 A 级还差 2.5 分」：有目标感的文案，比孤零零一个数字有动力
const gradeTip = computed(() => {
  if (avgScore.value === null) {
    return avgEmptyReason.value === 'scored-none'
      ? '练习已完成，但未产生评分（答完一题即可生成）'
      : '完成一场面试后显示平均分'
  }
  if (avgScore.value >= 90) return 'S 级·面霸水准，保持住'
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

/* 段位刻度尺：刻度位置 = 段位线在 0-100 上的真实位置。
 * D 在左端点（0），C/B/A/S 分别在 60/70/80/90 —— 与 gradeTip 的「距 X 级还差 Y 分」
 * 是同一套口径，游标落在哪儿、离下一段位线多远，用户一眼能对上号。 */
const gradeMarks = [
  { key: 'D', pct: 0 },
  { key: 'C', pct: 60 },
  { key: 'B', pct: 70 },
  { key: 'A', pct: 80 },
  { key: 'S', pct: 90 }
]
// 首末刻度做边缘对齐（ translateX(-50%) 会让 D / S 贴边裁切）
const letterStyle = (m) => {
  if (m.pct === 0) return { left: '0%', transform: 'translateX(0)' }
  return { left: m.pct + '%', transform: 'translateX(-50%)' }
}

/* 次级数据：近30天单场最高分。和趋势图同源（recent_trend），不是另造一套数。
   趋势为空（近30天没练）时返回 null，hero-sub 整行不显示——不展示假数据。 */
const bestRecent = computed(() => {
  const trend = stats.value?.recent_trend || []
  /* ⚠️ 2026-12-12：后端把「无有效评分」的天标为 score:null（折线断开而非画 0 分，
     见 userController.js 的 scoredCount 说明）。原来的 `Number(t.score) || 0`
     会把 null 变成 0，让「近30天最高分」显示 0 分 —— 那是假的，比不显示更糟。
     现在只对有效数值求最大值；一个都没有时返回 null。 */
  const scores = trend
    .map((t) => (typeof t.score === 'number' && Number.isFinite(t.score) ? t.score : null))
    .filter((s) => s !== null)
  return scores.length ? Math.max(...scores) : null
})

/* ===== 数字滚动：数据回来后从 0 缓动到真值，给「加载完成」的反馈 =====
 * 非数字（'—'）直接透传，不会出现「— 在跳」的怪象。
 *
 * v31：本页一次挂 5 个 useCountUp（下方 day-detail-sheet 里还有 2 个），
 * 以前全部无错峰同帧启动、且各自 60fps 逐帧 setData → 峰值 300+ 次/秒，
 * 低端安卓机上卡片肉眼可见地抽搐。
 * 现在统一 fps=32（30fps，数字滚动观感无损）+ delay 逐项错开 90ms：
 * 既把 setData 砍到约 1/4，又让「数据逐项到位」比五处同时抽动更像加载完成。 */
const avgCount = useCountUp(computed(() => (avgScore.value === null ? '—' : avgScore.value)), {
  duration: 1000, decimals: 1, fps: 32, delay: 0
})
const interviewCount = useCountUp(computed(() => stats.value?.total_interviews || 0), { duration: 900, fps: 32, delay: 90 })
const questionCount = useCountUp(computed(() => stats.value?.total_questions_answered || 0), { duration: 900, fps: 32, delay: 180 })
const streakCount = useCountUp(computed(() => stats.value?.streak_days || 0), { duration: 900, fps: 32, delay: 270 })

/* 练习时长：不足 1 小时显示分钟。
   原来是 Math.round(minutes / 60)，练 20 分钟会显示「0 小时」，像功能坏了。 */
const practiceInfo = computed(() => {
  const m = Math.round(stats.value?.total_practice_minutes || 0)
  if (m < 60) return { value: m, decimals: 0, unit: '分钟' }
  const h = m / 60
  return h < 10
    ? { value: Math.round(h * 10) / 10, decimals: 1, unit: '小时' }
    : { value: Math.round(h), decimals: 0, unit: '小时' }
})
// decimals 传函数：分钟/小时的小数位不同，跟着单位一起切
const practiceNum = useCountUp(computed(() => practiceInfo.value.value), {
  duration: 900,
  decimals: () => practiceInfo.value.decimals,
  fps: 32,
  delay: 360   // 接在 4 个之后错开，本页 5 个数字共铺开 360ms
})

/* 进度条从 0 滚到当前分位，给一个「数据加载完成」的反馈。
   初始 0，等 stats 回来后再设真值，过渡才有起点；
   用 watch 而不是 onMounted——onMounted 时 stats 往往还没请求回来。
   ⚠️ v32 修 BUG：必须 immediate。
   典型路径：App.vue 的 onLaunch 已经 fetchStats() 过，用户随后点「统计」tab
   → 本页首次挂载时 stats 里**已经有值**，avgScore 从 setup 那一刻就不为 null。
   没有 immediate 的话这个 watch 永远不触发 → barPct 停在 0 →
   「平均分 82.3 · A 级」的徽章亮着，下面刻度尺的游标却钉在最左边的 D 位、
   墨色填充一分为零。数字与仪表互相矛盾，是这页最伤可信度的一种错。
   （同级页 profile 的同一段逻辑本来就带 immediate，是这里漏了。） */
const barPct = ref(0)
let barTimer = null
watch(avgScore, (v) => {
  if (barTimer) { clearTimeout(barTimer); barTimer = null }
  barTimer = setTimeout(() => {
    barPct.value = v === null ? 0 : Math.min(100, Math.max(3, v))
    barTimer = null
  }, 240)
}, { immediate: true })
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #FFFFFF;
  /* v32：底部补安全区，并改用全站统一的 $safe-bottom-gap（112rpx）。
     本页与 history 同属 tabBar 页，tabBar 会占掉底部安全区；
     但「练习日历」是本页最后一个区块，在 iPhone 上滚到底时
     图例与 Home 指示条之间只剩 48rpx —— 与上面各区块 44rpx 的节奏读不出「结束了」。
     用基座变量而不是再写一个 48rpx：底部留白是跨页一致项，
     散落的字面量正是这类"逐页漂移"的来源。 */
  padding: 0 48rpx calc(#{$safe-bottom-gap} + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.page::before { display: none; }
.status-bar { width: 100%; }

.nav {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 28rpx 0 30rpx;
  border-bottom: 1rpx solid $rule;
  margin-bottom: 8rpx;
}
/* v35：页头 kicker（等宽微型朱砂字），与历史页 .nav-kicker 同一配方。
   四个 tab 页的页头现在共享同一套「KICKER + 巨标题 + 副文」节奏，
   切页时标题不再跳档。 */
.nav-kicker {
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.6rpx;
  margin-bottom: 12rpx;
}
/* v35：与 history 页同一条配方（52rpx / 800 / -1.8rpx / $font-display）。
 * 两页是同级 tab，标题必须同号同位置，否则切页时标题会"跳一下"。 */
.nav-title {
  font-family: $font-display;
  font-size: 52rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -1.8rpx;
  line-height: 1.1;
}
/* 副标题：与 history 的 .nav-sub 同款 */
.nav-sub {
  font-size: 22rpx;
  color: $text-3;
  font-weight: $weight-medium;
  margin-top: 12rpx;
  letter-spacing: 0;
}

/* ===== 数据总览 ===== */
.overview { margin-bottom: 40rpx; }

/* 主角区：编辑式数据页。
 * 刻意不做反色黑卡——首页/报告页/个人页都用了同款黑材质，统计页再照抄就是
 * 千篇一律。这里改用「巨号 mono 数字 + 精细刻度尺 + 大留白」的编辑式排版，
 * 层次靠字号对比与发丝线承担，白底上的近纯黑巨字本身就是最强的视觉锚点。 */
.hero {
  position: relative;
  padding: 12rpx 4rpx 0;
  margin-bottom: 8rpx;
}
/* 栏目眉栏：两侧发丝线夹一个小字，是「编辑式排版」的招牌结构 */
.hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 28rpx;
}
.hero-eyebrow-line {
  flex: 1;
  height: 1rpx;
  background: $hint;
}
.hero-eyebrow-text {
  font-size: 20rpx;
  font-weight: $weight-bold;
  color: $ash;
  letter-spacing: 4rpx;
  flex-shrink: 0;
}
.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hero-label {
  font-size: 24rpx;
  color: $mauve;
  font-weight: $weight-semibold;
  letter-spacing: 2rpx;
}
/* v35：段位徽章从「描边胶囊 + 灰黑」改为「方形印章 + 等级色」。
   理由：
     · 胶囊是移动端通用的"友好"语言；这里表达的是一枚**成绩印章**，
       方角 + 细描边才像盖上去的章（与首页 hero 印章同源）。
     · v34 五个等级全是黑/灰，扫一眼分不出 S 和 C —— 等级是核心语义，必须上色。
   旋转 -6°：真盖章不会绝对水平，这一点点倾斜就是"人盖的"证据。 */
.hero-grade {
  padding: 8rpx 20rpx;
  border-radius: $radius-xs;
  border: 2rpx solid currentColor;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-6deg);
}
.hero-grade-letter {
  font-family: $font-mono;
  font-size: 28rpx;
  font-weight: $weight-black;
  line-height: 1.2;
  letter-spacing: -0.5rpx;
}
/* 五个等级各取印泥色（浅底 + 描边 + 同色字） */
.hero-grade-g-s { color: $grade-s; background: $grade-s-soft; }
.hero-grade-g-a { color: $grade-a; background: $grade-a-soft; }
.hero-grade-g-b { color: $grade-b; background: $grade-b-soft; }
.hero-grade-g-c { color: $grade-c; background: $grade-c-soft; }
.hero-grade-g-d { color: $grade-d; background: $grade-d-soft; }
/* 兼容旧类名 .hero-grade-s（模板里 isSGrade 分支仍在用） */
.hero-grade-s { color: $grade-s; background: $grade-s-soft; }
.hero-grade-s .hero-grade-letter { color: $grade-s; }

.hero-num-row {
  display: flex;
  align-items: baseline;
  margin-top: 8rpx;
  gap: 10rpx;
}
/* 巨号数字：比其他页更大一号（88→112rpx），是「数据页」的专属字号特权 */
.hero-num {
  font-size: 112rpx;
  font-weight: $weight-heavy;
  color: $ink;
  line-height: 0.95;
  letter-spacing: -3rpx;
  font-variant-numeric: tabular-nums;
  font-family: $font-mono;
}
.hero-unit {
  font-size: 26rpx;
  color: $mauve;
  font-weight: $weight-medium;
}
/* 次级数据行：mono 键 + mono 值，用竖线分隔，是「数据终端」的字段式排布 */
.hero-sub {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  margin-top: 14rpx;
}
.hero-sub-key {
  font-size: 22rpx;
  color: $mauve;
  font-weight: $weight-medium;
  letter-spacing: 1rpx;
}
.hero-sub-key::before {
  content: '';
  display: inline-block;
  width: 2rpx;
  height: 18rpx;
  background: $ash;
  margin-right: 14rpx;
  vertical-align: -2rpx;
}
.hero-sub-val {
  font-size: 26rpx;
  color: $ink-soft;
  font-weight: $weight-bold;
  font-family: $font-mono;
  font-variant-numeric: tabular-nums;
}

/* 段位刻度尺：细线轨道 + 墨色填充 + 段位刻度线 + 白心游标。
   刻度就是真实段位线（60/70/80/90），游标落在哪儿、离下一段位线多远一目了然，
   且与 gradeTip 的「距 X 级还差 Y 分」是同一套口径。 */
.hero-meter { margin-top: 36rpx; }
.hero-meter-track {
  position: relative;
  height: 4rpx;
  border-radius: 2rpx;
  /* 归位灰阶（#E4E4E4 是板外私色） */
  background: $hint;
}
.hero-meter-fill {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  border-radius: 2rpx;
  /* 数据条转实色（单色体系里渐变只留给黑材质卡，数据可视化不在豁免列） */
  background: $ink;
  /* 宽度由 JS 从 0 推到目标，这里负责滚过去。
   * v32：0.9s → 0.36s（$motion-slow，全站动效刻度上限）。
   * 0.9s 属于「自造长时长」：它让游标比别处所有动效都慢一倍以上，
   * 且与报告页五维条（0.36s）不同步 —— 同一类"数据生长"在两个页面手感不同。
   * 统一 0.36s 后，两个页面的条是同一种速度，读起来才像同一套设计。 */
  transition: width $motion-slow $ease-out;
}
.hero-meter-tick {
  position: absolute;
  top: -5rpx;
  bottom: -5rpx;
  width: 1rpx;
  background: #C8C8C8;
  transform: translateX(-50%);
}
.hero-meter-cursor {
  position: absolute;
  top: 50%;
  width: 20rpx;
  height: 20rpx;
  margin-top: -10rpx;
  margin-left: -10rpx;
  border-radius: 50%;
  background: #FFFFFF;
  /* 存在感改由加粗墨描边承担（原 4rpx+重落影在白底上发浮，违反"白底小元素无落影"） */
  border: 5rpx solid $ink;
  /* 与 .hero-meter-fill 同一条时长（$motion-slow）：游标与墨段必须同步移动，
     否则会出现"条已经到了、珠子还在路上"的错位感。 */
  transition: left $motion-slow $ease-out;
}
.hero-meter-scale {
  position: relative;
  height: 30rpx;
  margin-top: 16rpx;
}
.hero-meter-letter {
  position: absolute;
  top: 0;
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: 700;
  color: #C8C8C8;
  line-height: 1;
  transition: color $motion-base $ease-out, font-size $motion-base $ease-out;
}
.hero-meter-letter.active {
  color: $ink;
  font-size: 23rpx;
}
.hero-tip {
  display: block;
  margin-top: 20rpx;
  font-size: 24rpx;
  color: $mauve;
  font-weight: $weight-medium;
}
/* 底部发丝线：与眉栏首尾呼应，给开放式栏目收口；
   比 margin 更重要的是它让这块区域「成立」为一个完整的版面单元 */
.hero-rule-bottom {
  height: 1rpx;
  background: $hint;
  margin-top: 32rpx;
}

/* ===== Bento 网格（v35.2 第十六批）=====
 * 打破「四格等分带 + 三张同构 section 卡」的千篇一律节奏。
 * bento 手法定锚（Apple/Notion 式）：
 *   · 一个 gap token（16rpx）贯穿全网格；一个圆角（$radius-lg）贯穿全瓦片
 *   · 尺寸层级：指标瓦片 1 格，图表瓦片跨 2 格 —— 主角（图）更大，而不是更花
 *   · 材质节奏：白卡 / 墨面 / 白卡 / 暖纸 交替 —— 靠底色差而不是描边堆砌
 *   · 每格必装真实数据（拒绝装饰性空瓦片）；墨面瓦片全页唯一 = 强调位 */
.bento {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 44rpx;
}
.tile {
  width: calc(50% - 8rpx);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 26rpx 26rpx 24rpx;
  background: $paper-card;
  border: 1rpx solid $rule;
  border-radius: $radius-lg;
  min-height: 172rpx;
}
.tile-span { width: 100%; min-height: 0; }
.tile-label {
  @include mono-label;
  margin-bottom: 16rpx;
}
.tile-num {
  @include readout(56rpx);
  font-weight: $weight-black;
  color: $text-1;
  letter-spacing: -2rpx;
}
.tile-num-row {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
}
.tile-unit {
  font-size: 22rpx;
  font-weight: $weight-semibold;
  color: $text-3;
}
.tile-name {
  margin-top: auto;
  padding-top: 14rpx;
  font-size: 21rpx;
  font-weight: $weight-medium;
  color: $text-3;
  letter-spacing: 0.5rpx;
}

/* 墨面瓦片：全页唯一深色格（连续天数）—— 火苗 + 白字读数 */
.tile-ink {
  background: $ink-gradient;
  border-color: transparent;
  box-shadow: $ink-edge;
}
.tile-flame {
  width: 44rpx;
  height: 44rpx;
  border-radius: $radius-sm;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14rpx;
}
.tile-flame-img { width: 26rpx; height: 26rpx; }
.tile-num-on-ink { color: $on-ink-1; }
.tile-name-on-ink { color: $on-ink-2; }

/* 暖纸瓦片（练习时长）：票据/存根语义，与白卡靠底色差区分 */
.tile-warm {
  background: $paper-warm;
  border-color: $rule;
}

/* 跨栏图卡瓦片：内联瓦片头（mono 编号 + 标题 + 英文角标），
   不再压一条横贯全页的标题线 */
.tile-head {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  margin-bottom: 22rpx;
}
.tile-head-en {
  margin-left: auto;
  @include mono-label;
}

/* 区块容器与 .card 已被 bento 瓦片取代（v35.2 第十六批）；
   .section-index / .section-title 保留 —— 瓦片内联头沿用同一套 mono 语言。
   ⚠️ 属性必须写进 .section-title 本体：拆成附属规则会被 minifier 分块，
   产物断言（check_ui_polish_dist 按首条规则匹配）会假红灯。 */
.section-index {
  @include mono-index;
}
.section-title {
  @include sec-heading;
  flex-shrink: 0;
}

/* 练习日历（v27）：全 app 的黑卡已经饱和（首页/报告页/我的页），
 * 这台「记录仪」改用纸面语言——普通白卡 + 勾线空格 + 墨点密度，
 * 与本页 hero 的编辑式数据排版同族，材质身份与所有黑卡页面拉开。
 * 卡片本身零特殊样式，视觉全在 calendar-heatmap 组件内部。 */

.empty {
  min-height: 300rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28rpx;
  color: #888888;
  font-size: 24rpx;
  padding: 24rpx 0;
}
.empty-text { text-align: center; line-height: 1.6; }
/* v32 空态出口：全局按钮语言（黑实底 / 88rpx / $radius-btn）。
 * 三处空态共用同一个类，保证「去练一场」在全页长得完全一样 ——
 * 空态里的 CTA 如果每处各写一套，用户会以为是三个不同的东西。 */
.empty-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  padding: 0 $sp-7;
  border-radius: $radius-btn;
  background: $ink;
  color: #FFFFFF;
  font-size: 28rpx;
  font-weight: $weight-bold;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.empty-sub {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  text-align: center;
  padding: 24rpx;
  font-size: 22rpx;
  color: #888888;
}
.empty-sub-text { line-height: 1.6; }

.loading { text-align: center; padding: 100rpx; color: $text-3; }

/* ===== 首屏骨架屏（v32）=====
 * 版面照抄真值：主角区（眉栏 / 标签+徽章 / 巨号数字 / 刻度尺）→ 四格指标带 → 三张区块卡。
 * 尺寸取真值附近（巨号 112rpx 的数字给 96rpx 的块，给上下留一点呼吸），
 * 目的是让「骨架 → 真内容」的跳跃尽量小，而不是画一个差不多的灰块。
 * 扫光动画来自 App.vue 的 .skeleton::after，这里只负责排版，不重复定义质感。
 * sk-wrap 由 App.vue 提供（pointer-events:none，骨架不可点）。 */
.sk-page { padding-top: 8rpx; }
.sk-line { border-radius: $radius-xs; }
.sk-eyebrow { width: 140rpx; height: 20rpx; margin: 0 auto 40rpx; }
.sk-hero-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18rpx;
}
.sk-label { width: 96rpx; height: 24rpx; }
.sk-pill { width: 92rpx; height: 52rpx; border-radius: $radius-sm; }
.sk-hero-num { width: 320rpx; height: 96rpx; border-radius: $radius-sm; margin-bottom: 24rpx; }
.sk-meter { width: 100%; height: 8rpx; border-radius: $radius-sm; margin-bottom: 32rpx; }

/* 四格指标带：外壳与真指标带同款（描边卡 + 内部分隔线由格子自身承担） */
.sk-strip {
  display: flex;
  border: 1rpx solid $border-glass;
  border-radius: $radius-xl;
  padding: 8rpx 0;
  margin-bottom: 40rpx;
}
.sk-strip-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 4rpx;
}
.sk-strip-cell + .sk-strip-cell { border-left: 1rpx solid $border-glass; }
.sk-strip-num { width: 64rpx; height: 36rpx; }
.sk-strip-label { width: 80rpx; height: 18rpx; }

/* 三张区块卡 */
.sk-block { margin-bottom: 44rpx; }
.sk-block-head {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 20rpx;
}
.sk-block-no { width: 34rpx; height: 20rpx; }
.sk-block-title { width: 180rpx; height: 30rpx; }
.sk-card {
  width: 100%;
  height: 300rpx;
  border-radius: $radius-xl;
  border: 1rpx solid $border-glass;
}
.error-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 40rpx;
}
.error-tip { font-size: 26rpx; color: $text-3; margin-bottom: 32rpx; }
/* 刷新失败轻提示（v24）：已有数据时不让整块错误态覆盖真实内容，
   只在顶部压一条发丝下划线的窄条，点它重试。克制、不抢数据。 */
.refresh-fail {
  padding: 20rpx 40rpx;
  margin-bottom: 24rpx;
  border-radius: $radius-md;
  background: $bg-muted;
  text-align: center;
}
.refresh-fail-text { font-size: 24rpx; color: $text-3; }
/* 重试/登录按钮已改用全局 .btn-retry（见 App.vue），此处不再重复定义 */

/* 雷达图样本量脚注：贴在卡片内、图表正下方并居中，上方一条发丝分隔线，
   读作「这张图的注释」。原先挂在卡片外右对齐（像一行飘着的孤字），
   2026-10-08 真机反馈「UI 不好看」后改到卡内。
   （本页 style 未引入 uni.scss 变量，故沿用页面既有的字面色值。） */
.radar-foot {
  margin-top: 4rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid $hint;
  text-align: center;
}
.radar-foot-text {
  font-size: 20rpx;
  color: $text-3;
  letter-spacing: 1rpx;
}

/* 无有效评分时的雷达空态：不画空网格（一圈空网格会让人以为「能力全 0」），
   直接说清原因与下一步该做什么。 */
.radar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 72rpx 40rpx;
}
.radar-empty-title {
  font-size: 28rpx;
  font-weight: 600;
  color: $text-2;
  margin-bottom: 12rpx;
}
.radar-empty-desc {
  font-size: 24rpx;
  color: #888888;
  line-height: 1.6;
  text-align: center;
}

/* 当日详情抽屉的样式已随交互一起搬进
 * components/day-detail-sheet/day-detail-sheet.vue（遮罩/面板/时间轴/跟手位移）。
 * 页面不再持有这类状态，样式留在这里会造成两套口径漂移的可能，故整体移除。 */
</style>
