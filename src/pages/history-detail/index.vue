<template>
  <!-- 弹层期间锁掉页面滚动（v25 滚动穿透修复）。
       ⚠️ page-meta 必须是页面内第一个节点、不能被 wx:if/wx:for 动态增删。 -->
  <page-meta :page-style="sheetLockStyle" />

  <view class="page">
    <!-- ===== 自定义导航栏（v31 · 转场"串页"根治）=====
     *
     * 本页此前是全项目唯一几个用**原生导航栏**的页面，原生导航页的 webview
     * 不覆盖「状态栏 + 导航栏」那一条，转场期间会露出下面那层 webview
     * （表现为顶部一瞬间「露出首页的平均分」）。
     * 改用自定义导航栏后本页 webview 覆盖 y=0，顶部由本页自己画成不透明白底。
     *
     * ⚠️ 几何必须在**首帧就是真值**：初始化在模块级同步执行，不能丢进 onMounted。 -->
    <view class="nav" :style="navBarStyle">
      <!-- 导航栏入场分层：① 底色整条从上往下擦出；② 内容上移淡入 -->
      <view class="nav-bg"></view>
      <view class="nav-side nav-left anim-in nav-in-back" hover-class="hover-press" @click="goBack">
        <image class="nav-back-icon" :src="ICONS['arrow-left']" mode="aspectFit" />
      </view>
      <view class="nav-center">
        <text class="nav-title anim-in nav-in-title">面试详情</text>
      </view>
      <view class="nav-side nav-right"></view>
    </view>

    <template v-if="detail">
      <!-- 页头：等宽眉标 + 岗位大标题 + 等宽 meta 一行 + 状态印章 -->
      <view class="page-head">
        <text class="ph-kicker">SESSION ARCHIVE</text>
        <view class="page-head-row">
          <view class="page-head-main">
            <text class="page-head-title">{{ detail.position_name }}</text>
            <view class="page-head-meta">
              <text>{{ detail.interview_type }}</text>
              <text class="dot">·</text>
              <text>{{ progressText }}</text>
              <!-- 用时只在有时长时才显示：进行中的面试 duration_seconds 为 0，
                   原来会渲染成「用时 0 秒」—— 读起来像数据没加载出来。 -->
              <template v-if="detail.duration_seconds > 0">
                <text class="dot">·</text>
                <text>用时 {{ formatDuration(detail.duration_seconds) }}</text>
              </template>
            </view>
          </view>
          <!-- 状态：进行中 = 朱砂描边，已完成 = 墨色，已中断 = 灰 -->
          <view class="status-tag" :class="detail.status">
            <text class="status-text">{{ statusText(detail.status) }}</text>
          </view>
        </view>
      </view>

      <!-- 进行中的面试：墨材质卡 + 朱砂脉冲点，与首页同源语言 -->
      <view v-if="detail.status === 'in_progress'" class="resume-card" hover-class="hover-press" @click="goResume">
        <view class="resume-left">
          <view class="resume-dot"></view>
          <text class="resume-text">继续这场面试</text>
        </view>
        <image class="resume-arrow" :src="ICONS['chevron-right-white']" mode="aspectFit" />
      </view>

      <!-- 成绩卡 + 报告入口（v24 新增）：把「已完成」的场次接回报告页。
           报告是异步生成的，detail.report 为空时不显示入口（避免点进去是错误态）。 -->
      <view class="score-card" v-if="detail.status === 'completed' && detail.total_score != null">
        <view class="score-main">
          <text class="score-label">本场总分</text>
          <!-- P1 修复（2026-10-11）：评分降级时必须与报告页同口径。
               降级 = AI 全程不可用导致**没有任何真实评分**，此时 total_score 的 0
               代表「无数据」，不是「能力差」。 -->
          <view class="score-row" v-if="isScoringDegraded">
            <text class="score-num">—</text>
          </view>
          <view class="score-row" v-else>
            <text class="score-num">{{ detail.total_score }}</text>
            <text class="score-unit">分</text>
            <!-- 段位印章：朱砂（签名元素） -->
            <view class="score-grade" :class="'g-' + (detail.grade || 'D')" v-if="detail.grade">
              <text class="score-grade-text">{{ detail.grade }}</text>
            </view>
          </view>
          <!-- 「—」必须自带解释，否则会被读成「页面坏了」而不是「这次没评上分」 -->
          <text class="score-degraded-note" v-if="isScoringDegraded">本次未能完成评分</text>
        </view>
        <view
          class="score-go"
          :class="{ 'is-off': !detail.report }"
          hover-class="hover-press"
          @click="goReport"
        >
          <text class="score-go-text">{{ detail.report ? '查看完整报告' : '报告未生成' }}</text>
          <image class="score-go-arrow" v-if="detail.report" :src="ICONS['chevron-right-white']" mode="aspectFit" />
        </view>
      </view>

      <!-- 轮次列表：时间轴语言。
           左侧发丝竖线 + 等宽轮次序号，右侧内容。
           层级：问题（主角）> AI 点评（朱砂左边条）> 我的回答（引述式弱化）> 追问 -->
      <view class="rounds">
        <view class="round" v-for="round in rounds" :key="round.round_number">
          <view class="round-head">
            <text class="round-no">{{ round.no }}</text>
            <text class="round-type">{{ round.question_type }}</text>
          </view>
          <text class="question">{{ round.question }}</text>

          <view v-if="round.user_answer" class="answer-block">
            <text class="block-label">我的回答</text>
            <!-- v32 长文本折叠：真实作答常有 300~800 字，直接铺开会把本轮题面与
                 AI 点评推到几屏之外 —— 回顾本该"一眼扫完一场"。
                 折叠阈值取 200 字（约 12 行）。 -->
            <text class="answer" :class="{ collapsed: isLong(round.user_answer) && !isOpen('a' + round.round_number) }">{{ round.user_answer }}</text>
            <view
              v-if="isLong(round.user_answer)"
              class="expand-toggle"
              hover-class="hover-press"
              @click="toggleOpen('a' + round.round_number)"
            >
              <text class="expand-text">{{ isOpen('a' + round.round_number) ? '收起' : `展开全部（${round.user_answer.length} 字）` }}</text>
              <image
                class="expand-arrow"
                :class="{ up: isOpen('a' + round.round_number) }"
                :src="ICONS['chevron-down-gray']"
                mode="aspectFit"
              />
            </view>
          </view>

          <view v-if="round.ai_feedback" class="feedback-block">
            <text class="feedback-label">AI 点评</text>
            <text class="feedback">{{ round.ai_feedback }}</text>
          </view>

          <view v-if="round.follow_ups?.length" class="follow-ups">
            <view class="follow-up" v-for="(fu, fidx) in round.follow_ups" :key="fidx">
              <text class="fu-q">追问{{ fidx + 1 }}：{{ fu.question }}</text>
              <text class="fu-a" v-if="fu.user_answer">{{ fu.user_answer }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="rounds.length === 0" class="empty-tip">这场面试暂无轮次记录</view>

      <!-- AI 生成内容声明（v30 补）：本页会原样回放每一轮的 AI 点评 -->
      <view class="ai-disclaimer">
        <text>本页 AI 点评由大模型生成，仅供学习参考，不构成任何录用或评价依据</text>
      </view>

      <!-- 页尾危险操作（v25 重做 · 定稿）：
           不做按钮、不做卡片。破坏性低频操作在页尾只该是「一行安静的入口」。 -->
      <view class="danger-zone">
        <view class="danger-row" hover-class="danger-row-press" @click="onDelete">
          <image class="del-icon" :src="ICONS['trash-danger']" mode="aspectFit" />
          <text class="delete-text">删除这条记录</text>
        </view>
      </view>
    </template>

    <view v-else-if="loadError" class="state-block">
      <text class="state-title">加载失败</text>
      <text class="state-tip">请检查网络后重试</text>
      <view class="btn-retry" hover-class="hover-press" @click="loadData">重新加载</view>
    </view>
    <view v-else class="loading">加载中…</view>

    <!-- 转场期间盖住底部 tabBar 高度带 -->
    <view v-if="enterVeil" class="enter-veil" :style="veilStyle"></view>

    <!-- 删除确认：light 变体 + 红色确认键（破坏性语义） -->
    <confirm-sheet
      v-model:visible="delSheetVisible"
      variant="light"
      danger-tone
      title="删除这场面试？"
      desc="这场面试的作答、AI 点评与评分报告将无法找回。"
      confirm-text="删除"
      cancel-text="保留"
      @confirm="onDeleteConfirm"
    />
  </view>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { onLoad, onReady } from '@dcloudio/uni-app'
import { getInterviewDetail, deleteInterview } from '@/api/interview'
import { getInterviewProgress, clearInterviewProgress } from '@/utils/interview'
import { formatDuration } from '@/utils/format'
import { ICONS } from '@/utils/svg-icons'
import ConfirmSheet from '@/components/confirm-sheet/confirm-sheet.vue'

const detail = ref(null)
const rounds = ref([])
const interviewId = ref('')
const loadError = ref(false)

const loadData = async () => {
  if (!interviewId.value) { loadError.value = true; return }
  loadError.value = false
  try {
    const res = await getInterviewDetail(interviewId.value)
    detail.value = res || null
    // 序号在 JS 里格式化好（WXML 不支持 String().padStart()），用编辑式 01/02 呈现
    rounds.value = (res?.rounds || []).map((r, i) => ({ ...r, no: String(i + 1).padStart(2, '0') }))
    if (!res) loadError.value = true
  } catch (e) {
    detail.value = null
    loadError.value = true
  }
  // 若从统计页弹窗进入：请求在点击行时已预取发出（见 api/interview.js），
  // 这里 await 的多半是已完成的 Promise，首屏直接渲染内容，不再出现加载态
}

const statusText = (s) => ({ completed: '已完成', in_progress: '进行中', interrupted: '已中断' }[s] || s)

/* ===== 长文本折叠（v32，纯展示层）=====
 * 为什么做：本页是「回顾」，目标是让用户快速扫完一场面试。而真实作答常在
 * 300~800 字（面试练习本来就是长篇输出），铺开后单轮就占两三屏，
 * 题面与 AI 点评被推到很远 —— 用户要点十几次才能看完，回顾价值大打折扣。
 *
 * 阈值 200 字：约 12 行（27rpx/1.75）。低于它铺开更好读（折叠反而多一次点击），
 * 高于它才收。折叠用 -webkit-line-clamp（小程序支持的截断方案，不靠 JS 算行数，
 * 免去测量与重排）。
 *
 * ⚠️ 状态只活在本次页面的内存里：不落盘、不同步、不影响任何接口。
 *    用 object 而非 Set：小程序对 Set 的响应式代理支持不稳（真机曾经不触发重渲染）。 */
const LONG_TEXT = 200
const openMap = reactive({})
const isLong = (t) => !!t && t.length > LONG_TEXT
const isOpen = (key) => !!openMap[key]
const toggleOpen = (key) => { openMap[key] = !openMap[key] }

/* 轮次文案按状态措辞（v25）：进行中的面试还没结束，写「完成 N 轮」不准确
   （那是对已结束场次的说法）。两者都用 completed_rounds，不改口径、只改措辞。 */
const progressText = computed(() => {
  const n = Number(detail.value?.completed_rounds) || 0
  return detail.value?.status === 'completed' ? `完成 ${n} 轮` : `已进行 ${n} 轮`
})

/* 评分降级（P1 修复，2026-10-11）：与报告页同口径。
   降级 = AI 全程不可用、没有任何真实评分。此时 total_score 的 0 是「无数据」，
   必须显示「—」而不是「0 分 D 级」—— 后者会把我们的服务故障说成用户能力差。
   判据：报告本体上的 scoring_degraded（后端 scoreService 落的库字段）。
   报告还没生成时 detail.report 为空，保持原样显示，不做推测。 */
const isScoringDegraded = computed(() => !!detail.value?.report?.scoring_degraded)

const goResume = () => {
  /* v31 更新：转场串页的真正根因已找到（本页原用原生导航栏，见模板顶部说明），
     与跳转方式无关。这里保留 navigateTo —— 它只有一步 push，
     比 redirectTo 的"先弹栈再推入"少一次露出底层的窗口，仍然是更稳的选择。 */
  uni.navigateTo({ url: `/pages/interview/index?id=${interviewId.value}` })
}

/* 查看完整报告（v24 新增）：报告页入参是面试 id，与本页同一个 id。
   报告未生成时（detail.report 为空）不做跳转，避免用户点进去只看到错误态。 */
const goReport = () => {
  if (!detail.value?.report) {
    uni.showToast({ title: '这场报告尚未生成', icon: 'none' })
    return
  }
  uni.navigateTo({ url: `/pages/report/index?id=${interviewId.value}` })
}

// 删除这条记录：服务端删除（接口自带归属校验）+ 本地进度属于该场时一并清掉，
// 防止首页残留「继续」幽灵卡。
// v25：原生 showModal → 自研 confirm-sheet 的 light 变体。
// 为什么用 light 而非默认的 danger 重模式：删的是「这一场记录」，不是账号/全部数据，
// 后果明确但不至于用「勾选 + 清单」那种强门槛（那是注销/清空数据才需要的重量）。
// 原生弹窗的红色确认键与 app 黑白语言脱节，且一段小字不可扫读；light 变体
// 在保留「视觉统一 + 红色破坏语义」的同时去掉了多余的确认摩擦。
const delSheetVisible = ref(false)

/* 弹层期间的页面级滚动锁（见模板顶部 page-meta 处说明） */
const sheetLockStyle = computed(() => (delSheetVisible.value ? 'overflow:hidden;' : ''))

const onDelete = () => { delSheetVisible.value = true }

/* v31 加提交锁：删除是破坏性操作，此前无任何守卫。
   双击「确认删除」会连发两次 DELETE —— 第一次成功，第二次因记录已不存在
   而报错，用户会同时看到「已删除」和「删除失败」，**报错与事实相反**。
   settings 页的清空数据/注销账号已有同款锁（deletingAccount/loggingOut），
   这里补齐，两处行为一致。 */
const deleting = ref(false)
const onDeleteConfirm = async () => {
  if (deleting.value) return
  deleting.value = true
  try {
    uni.showLoading({ title: '删除中...', mask: true })
    await deleteInterview(interviewId.value)
    const saved = getInterviewProgress()
    if (saved?.interview?.interview_id === interviewId.value) clearInterviewProgress()
    uni.hideLoading()
    delSheetVisible.value = false
    uni.showToast({ title: '已删除', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 500)
  } catch (e) {
    uni.hideLoading()
    uni.showToast({ title: e?.message || '删除失败，请重试', icon: 'none' })
  } finally {
    deleting.value = false
  }
}

onLoad((options = {}) => {
  interviewId.value = options.id || ''
  loadData()
})

/* ===== 自定义导航栏（v31 · 见模板顶部根因说明）=====
 * 返回键：本页既可能从首页/历史页/统计页 navigateTo 进来，也可能是被分享/扫码
 * 直接打开的第一个页面。栈里还有页面就回退，否则回首页 —— 换成自定义导航栏后
 * 原生返回键没了，这条兜底必须自己写，否则用户会被困在详情页。
 * （与设置页/关于页的 goBack 同源。） */
const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/index/index' })
}

/* 几何：状态栏高度 + 胶囊避让宽度。 */
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
const navBarStyle = computed(() => ({
  paddingTop: navMetrics.value.statusBar + 'px',
  paddingRight: navMetrics.value.capsuleGap + 'px'
}))

/* ⚠️ 必须**模块级同步执行**，不能放进 onMounted：
 * 首帧就要用真值渲染，否则挂载后整页"跳一下"，转场时会留下错位残影。
 * 这正是本次要修的转场串页问题的同族坑（见模板顶部说明）。 */
initNavMetrics()

/* ===== 转场"底部露底"遮挡（v31.2 · 与顶部同一根因的另一半）=====
 *
 * 症状：从 **tabBar 页**（首页/历史/统计）点一条记录进本页，转场瞬间
 * 屏幕最下方那一条会露出**本页自己的底部内容**（截图里是黑底 AI 点评块 + 「追问1」卡）。
 *
 * 根因：源页是 tabBar 页，它的 webview 高度 = 窗口高 − tabBar 高，
 * **不覆盖最下面那一条**；本页不是 tabBar 页，webview 是满高的，且转场前就已渲染好。
 * 转场期间原生 tabBar 收起 → 那一条就露出本页的内容，而屏幕其余部分还是源页，
 * 读起来就是"穿帮"。
 *
 * 为什么只有本页需要遮挡：从本页进面试页时，源页是**本页**（非 tabBar 页，webview 满高），
 * 那一条显示的就是源页自己 —— 属于正常。所以"源页是 tabBar 页"是本问题的充要条件，
 * 而本页正是所有 tabBar 页跳转的目标页。
 *
 * 修法：本页进入时用一条不透明白底把那一条盖住，转场结束后淡出。
 * 白色是唯一"存在感为零"的填充：它正常状态下的邻居就是白色 tabBar / 白色页面底。
 *
 * ⚠️ v31 首版实测**未生效**（用户复测），原因是**高度不够**：
 *   首版写 `height: calc(100rpx + env(safe-area-inset-bottom))` ——
 *   100rpx 只有 **50px**，而那条带是「tabBar 50px + 底部安全区 34px」≈ **84px**，
 *   于是只盖住下半截，**上半截的黑块继续露出来**（用户看到的就是"还在"）。
 *   另外 `env()` 一旦不被支持，整条 calc 会失效、height 退回 auto（空 view = 0 高）。
 *   → 现在用**纯 px**，并留足余量：覆盖 120px > 84px。
 *
 * 定位：只用 `top`，不用 `bottom`。
 *   本项目已验证：`position: fixed` 的包含块是**视口**（webview），
 *   且**不跟随转场动画平移**（见面试页 `.interview-page` 的注释）。
 *   本页是自定义导航页，webview 铺满整屏 → 视口高 = 窗口高。
 *   所以 `top = windowHeight − 120` 就是"从屏幕底边往上 120px 处"，
 *   正好压在那一条上；高度给 400px 让它向下溢出屏幕（多出部分看不见），
 *   因此不依赖容器实际高度。
 *   CSS 里另留 `bottom:0 + height:160px` 兜底：万一量不到窗口高，
 *   仍能靠视口锚定盖住那一条（而不是像首版那样整层消失）。
 *
 * 时长：`onReady` 后 **420ms 直接撤除，不做淡出**。
 *
 *   关键认知：遮挡层**只在转场期间有意义**。
 *   转场结束后，本页（非 tabBar 页，webview 满高）已覆盖整屏，
 *   最下面那一条显示的就是本页**自己的**内容 —— 那是正确的；
 *   此时遮挡层反而变成缺陷：它用白色盖住 120px 真实内容。
 *
 *   ⚠️ 为什么是 420ms（这个数是量出来的，不是猜的）：
 *   `onReady`（首屏渲染完成）**早于**转场动画开始，不是同步。
 *   实测反推：`onReady` 大约落在动画开始前 100ms 量级，
 *   所以撤除时间必须 = **转场时长 + onReady→动画开始的提前量**，
 *   而不是"转场时长本身"。
 *   - 250ms：比转场结束早约 150ms → 撤得太早，**转场收尾段露出下层内容**
 *     （用户截图：黑底 AI 点评块 + 「追问1」卡又在底部露出来了）← v31.3 失败
 *   - 420ms：转场(300ms) + 提前量(≈120ms) → 撤除点正落在转场结束后不久
 *
 *   ⚠️ v31.3 曾因一个**错误的推理**踩坑，这里记下来以免再犯：
 *   我当时写"早撤不可怕，因为滑动收尾时那一条显示的正是本页自己的内容"。
 *   **这是错的** —— 恰恰相反：转场越接近结束，本页越还没铺满屏幕，
 *   底部那一条露出的越是**下层/源页**内容，穿帮最刺眼。
 *   → **宁可晚，不可早**。
 *
 *   ⚠️ v31.3 时序返工（用户复测反馈）：
 *   v31.2 是"`onReady` + 500ms 后开始 240ms 淡出"，即最长 **740ms** 都在盖内容，
 *   而且是**当着用户的面慢慢淡掉**。用户反馈：进页之后白条还赖着，
 *   然后能看见它消失的动画，像闪了一下。
 *   这一版保留 ① 时长（420ms，覆盖到转场结束），
 *   只改 ② **删掉 opacity 过渡** —— 有过渡就一定有"看得见的消失动画"，
 *   而这一层的正确归宿是"使命结束即无声消失"。
 *   不做淡出还有一层理由：撤除瞬间露出的本来就是该露出的正确内容，
 *   不需要用淡出去掩饰任何东西，淡出反而把注意力引到底部。 */
const VEIL_TOP_OFFSET = 120
const VEIL_H = 400

const veilTop = ref(null)
try {
  const win = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
  // 视口高 = windowHeight（包含块就是视口）；量不到再退回 screenHeight
  const vh = win.windowHeight || win.screenHeight || 0
  if (vh > VEIL_TOP_OFFSET) veilTop.value = vh - VEIL_TOP_OFFSET
} catch (e) {}

const enterVeil = ref(true)
const veilStyle = computed(() => {
  const s = {}
  // 量不到屏幕高就**不覆盖 top**：交给 CSS 的 bottom:0 + height:160px 兜底，
  // 而不是整层隐藏（首版那样做等于完全没遮挡）。
  if (veilTop.value != null) {
    s.top = veilTop.value + 'px'
    s.height = VEIL_H + 'px'
  }
  return s
})

onReady(() => {
  // 420ms = 转场 300ms + onReady→动画开始的提前量(≈120ms)。
  // 撤太早(250ms)会在转场收尾段露馅(用户截图复现)，撤太晚会看到白条赖着不走。
  // 无过渡：使命结束即无声消失，避免"看得见的消失动画"。
  setTimeout(() => { enterVeil.value = false }, 420)
})
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 面试详情 · 纸本朱砂（v34）
 * ============================================================================
 * 本页的立意：**一场面试的存档页**。
 *   · 轮次回顾走"时间轴"语言：左侧发丝竖线 + 等宽轮次序号
 *   · 问题=主角（正文色/加粗），回答=引述（凹槽底），AI 点评=朱砂左边条
 *   · 成绩卡：等宽分数 + 等级色段位印章（v35）
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
  padding: 0 $page-padding calc(96rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

/* ===== 自定义导航栏 =====
 * v33：吸顶固定 + 实色底（不能透明，否则滚动时文字透出来）。
 * 页面用 .nav-hold 等高占位块把内容顶下来。 */
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: $nav-gap-bottom;
  box-sizing: border-box;
}
.nav-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: $paper;
  border-bottom: 1rpx solid $rule;
}
.nav-side {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  height: $nav-side-h;
  padding: 0 $nav-back-gap;
  box-sizing: border-box;
}
.nav-left { padding-left: $page-padding; }
.nav-right { width: $nav-hold-w; }
.nav-back-icon { width: 38rpx; height: 38rpx; }
.nav-center {
  position: absolute;
  left: 0; right: 0; top: 0; bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.nav-title {
  font-size: 33rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -0.4rpx;
}
.nav-in-back { animation: fadeUp $motion-base $ease-out both; }
.nav-in-title { animation: fadeUp $motion-base $ease-out 0.03s both; }

/* ===== 页头 ===== */
.page-head {
  padding: 36rpx 0 28rpx;
  border-bottom: 1rpx solid $rule;
}
.ph-kicker {
  display: block;
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.6rpx;
  margin-bottom: 14rpx;
}
.page-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}
.page-head-main { flex: 1; min-width: 0; }
.page-head-title {
  display: block;
  font-family: $font-display;
  font-size: 48rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -1.4rpx;
  line-height: 1.15;
}
.page-head-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7rpx;
  margin-top: 14rpx;
}
.page-head-meta text {
  font-family: $font-mono;
  font-size: 21rpx;
  color: $text-3;
  font-variant-numeric: tabular-nums;
}
.page-head-meta .dot { font-size: 19rpx; color: $text-4; }

/* 状态印章：进行中=朱砂描边，已完成=墨底，已中断=凹槽 */
.status-tag {
  flex-shrink: 0;
  padding: 8rpx 16rpx;
  border-radius: $radius-xs;
  border: 1rpx solid $rule-strong;
  background: $paper-sunken;
  margin-top: 6rpx;
}
.status-text {
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $text-3;
  letter-spacing: 0.6rpx;
}
.status-tag.in_progress {
  border-color: $verm-line;
  background: $verm-soft;
}
.status-tag.in_progress .status-text { color: $verm; }
.status-tag.completed {
  border-color: $ink;
  background: $ink;
}
.status-tag.completed .status-text { color: #FFFFFF; }

/* ===== 进行中：墨材质卡 + 朱砂脉冲点 ===== */
.resume-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 26rpx 28rpx;
  margin: 28rpx 0;
  border-radius: $radius-lg;
  background: $ink-gradient;
  box-shadow: $ink-edge, 0 10rpx 26rpx rgba(23, 19, 14, 0.22);
  transition: opacity $motion-base $ease-out, transform $motion-base $ease-out;
}
.resume-left { display: flex; align-items: center; gap: 16rpx; }
.resume-dot {
  position: relative;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: $verm;
  flex-shrink: 0;
}
.resume-dot::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  border-radius: 50%;
  background: rgba(192, 57, 43, 0.4);
  animation: pulseDot 1.8s $ease-out infinite;
}
@keyframes pulseDot {
  0%   { transform: scale(1);   opacity: 0.55; }
  70%  { transform: scale(2.4); opacity: 0; }
  100% { transform: scale(2.4); opacity: 0; }
}
.resume-text {
  font-size: 29rpx;
  font-weight: $weight-bold;
  color: #FFFFFF;
  letter-spacing: -0.2rpx;
}
.resume-arrow { width: 24rpx; height: 24rpx; flex-shrink: 0; }

/* ===== 成绩卡 ===== */
.score-card {
  margin: 28rpx 0;
  padding: 28rpx;
  border-radius: $radius-lg;
  background: $paper-card;
  border: 1rpx solid $rule;
}
.score-main { margin-bottom: 24rpx; }
.score-label {
  display: block;
  font-family: $font-mono;
  font-size: 18rpx;
  font-weight: $weight-bold;
  color: $text-3;
  letter-spacing: 2rpx;
  margin-bottom: 14rpx;
}
.score-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
/* 本场总分：等宽大读数 */
.score-num {
  @include readout(72rpx);
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -3rpx;
}
.score-unit {
  font-size: 22rpx;
  font-weight: $weight-semibold;
  color: $text-3;
}
/* 段位印章：v35 按等级取色（模板绑定 g-S…g-D，口径与历史页 .grade-badge 同源）。
   旋转 + 等级色描边 + 等级浅底 —— 「91 分 S」与「64 分 C」从此一眼分得出。 */
.score-grade {
  width: 52rpx;
  height: 52rpx;
  border-radius: $radius-xs;
  border: 2rpx solid $grade-d;
  background: $grade-d-soft;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 8rpx;
  transform: rotate(-5deg);
}
.score-grade-text {
  font-family: $font-mono;
  font-size: 26rpx;
  font-weight: $weight-black;
  color: $grade-d;
  line-height: 1;
}
.score-grade.g-S { border-color: $grade-s; background: $grade-s-soft; }
.score-grade.g-S .score-grade-text { color: $grade-s; }
.score-grade.g-A { border-color: $grade-a; background: $grade-a-soft; }
.score-grade.g-A .score-grade-text { color: $grade-a; }
.score-grade.g-B { border-color: $grade-b; background: $grade-b-soft; }
.score-grade.g-B .score-grade-text { color: $grade-b; }
.score-grade.g-C { border-color: $grade-c; background: $grade-c-soft; }
.score-grade.g-C .score-grade-text { color: $grade-c; }
.score-grade.g-D { border-color: $grade-d; background: $grade-d-soft; }
.score-grade.g-D .score-grade-text { color: $grade-d; }
.score-degraded-note {
  display: block;
  font-size: 21rpx;
  color: $text-3;
  margin-top: 10rpx;
}
/* 报告入口：墨色实底按钮 */
.score-go {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  height: 86rpx;
  border-radius: $radius-btn;
  background: $ink;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.score-go.is-off { background: $bg-fill-strong; }
.score-go-text {
  font-size: 27rpx;
  font-weight: $weight-bold;
  color: #FFFFFF;
}
.score-go.is-off .score-go-text { color: $text-3; }
.score-go-arrow { width: 22rpx; height: 22rpx; }

/* ===== 轮次列表：时间轴 ===== */
.rounds { padding-top: 8rpx; }
.round {
  position: relative;
  padding: 28rpx 0 28rpx 34rpx;
  border-bottom: 1rpx solid $rule;
}
.round:last-child { border-bottom: none; }
/* 时间轴竖线：左侧一条发丝线，读作"一条连续的时间" */
.round::before {
  content: '';
  position: absolute;
  left: 0;
  top: 34rpx;
  bottom: 28rpx;
  width: 1rpx;
  background: $rule-strong;
}
.round-head {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-bottom: 12rpx;
}
/* 轮次序号：朱砂等宽两位 */
.round-no {
  font-family: $font-mono;
  font-size: 22rpx;
  font-weight: $weight-black;
  color: $verm;
  letter-spacing: 1rpx;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.round-type {
  font-family: $font-mono;
  font-size: 18rpx;
  color: $text-3;
  letter-spacing: 0.6rpx;
  border: 1rpx solid $rule-strong;
  border-radius: $radius-xs;
  padding: 2rpx 8rpx;
}
/* 问题：主角 */
.question {
  display: block;
  font-size: 29rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  line-height: 1.72;
  letter-spacing: -0.2rpx;
  margin-bottom: 20rpx;
}

/* 回答：引述式弱化（凹槽底 + 发丝描边） */
.answer-block {
  padding: 20rpx 22rpx;
  border-radius: $radius-sm;
  background: $paper-sunken;
  margin-bottom: 18rpx;
}
.block-label {
  display: block;
  font-family: $font-mono;
  font-size: 18rpx;
  font-weight: $weight-bold;
  color: $text-3;
  letter-spacing: 1.6rpx;
  margin-bottom: 10rpx;
}
.answer {
  display: block;
  font-size: 26rpx;
  line-height: 1.74;
  color: $text-2;
  letter-spacing: 0.1rpx;
  word-break: break-word;
}
.answer.collapsed {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 12;
  overflow: hidden;
}
.expand-toggle {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 14rpx;
  transition: opacity $motion-fast $ease-out;
}
.expand-text {
  font-size: 22rpx;
  color: $verm;
  font-weight: $weight-semibold;
}
.expand-arrow {
  width: 20rpx;
  height: 20rpx;
  transition: transform $motion-fast $ease-out;
}
.expand-arrow.up { transform: rotate(180deg); }

/* AI 点评：朱砂左边条 + 浅朱砂底（批注应该有自己的颜色） */
.feedback-block {
  padding: 18rpx 20rpx;
  background: $verm-soft;
  border-left: 4rpx solid $verm;
  border-radius: 0 $radius-sm $radius-sm 0;
  margin-bottom: 18rpx;
}
.feedback-label {
  display: block;
  font-family: $font-mono;
  font-size: 17rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 1.6rpx;
  margin-bottom: 9rpx;
}
.feedback {
  display: block;
  font-size: 25rpx;
  line-height: 1.7;
  color: $text-2;
}

/* 追问：进一步左缩 + 更浅 */
.follow-ups {
  padding-left: 20rpx;
  border-left: 1rpx solid $rule-strong;
}
.follow-up { margin-bottom: 16rpx; }
.follow-up:last-child { margin-bottom: 0; }
.fu-q {
  display: block;
  font-size: 25rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  line-height: 1.68;
  margin-bottom: 8rpx;
}
.fu-a {
  display: block;
  font-size: 24rpx;
  color: $text-muted;
  line-height: 1.68;
}

/* ===== 声明 / 危险操作 ===== */
.ai-disclaimer {
  padding: 36rpx 0 20rpx;
  text-align: center;
  font-size: 21rpx;
  color: $text-4;
  line-height: 1.6;
}
.danger-zone {
  display: flex;
  justify-content: center;
  padding-top: 20rpx;
  border-top: 1rpx solid $rule;
}
.danger-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 16rpx 4rpx;
  transition: opacity $motion-fast $ease-out;
}
.danger-row-press { opacity: 0.6; }
.del-icon { width: 26rpx; height: 26rpx; }
.delete-text { font-size: 24rpx; color: $verm; font-weight: $weight-medium; }

/* ===== 状态块 ===== */
.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 40rpx;
  text-align: center;
}
.state-title {
  font-size: 34rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  margin-bottom: 14rpx;
}
.state-tip {
  font-size: 25rpx;
  color: $text-3;
  margin-bottom: 36rpx;
  line-height: 1.6;
}
.loading {
  text-align: center;
  padding: 160rpx 0;
  color: $text-3;
  font-size: 25rpx;
}
.empty-tip {
  text-align: center;
  padding: 60rpx 0;
  font-size: 25rpx;
  color: $text-3;
}
.enter-veil {
  position: fixed;
  left: 0;
  right: 0;
  background: $paper;
  z-index: 5;
}
</style>
