<template>
  <view class="report-page" :class="{ 'poster-open': showPoster }">
    <!-- 加载态：与面试页「生成报告」遮罩同款，跳转过来视觉无断裂。
         v35.3 第二十一批：等待凭证票（批阅章 + 真实计时） -->
    <loading-overlay
      v-if="showLoading"
      title="生成报告中"
      sub="AI 正在回顾你的全部作答"
      :stages="reportStages"
      stamp="批阅"
      eyebrow="REVIEW · 批阅中"
    />

    <!-- 错误态：报告还没生成好，必须有可恢复的出口 -->
    <view v-else-if="!report" class="state-block">
      <image class="state-mascot" src="/static/ip_mianba_smile.png" mode="aspectFit" />
      <text class="state-title">报告还没准备好</text>
      <text class="state-tip">面试报告由 AI 异步生成，请稍等几秒后重试</text>
      <view class="state-btns">
        <view class="state-btn primary" hover-class="hover-press" @click="loadData">重新加载</view>
        <view class="state-btn" hover-class="hover-press" @click="goToHistory">返回历史</view>
      </view>
    </view>

    <template v-else>
      <!-- 页头：等宽眉标 + 大标题 + 元信息 -->
      <view class="pg-head">
        <text class="pg-kicker">SCORE REPORT</text>
        <text class="pg-title">面试报告</text>
        <view class="pg-meta">
          <text class="pg-meta-item">{{ interviewInfo?.position_name || '模拟面试' }}</text>
          <text class="pg-meta-sep">·</text>
          <text class="pg-meta-item">{{ interviewInfo?.interview_type || '面试' }}</text>
          <text class="pg-meta-sep">·</text>
          <text class="pg-meta-item">{{ roundCountText }} 轮</text>
          <text class="pg-meta-sep">·</text>
          <text class="pg-meta-item">{{ durationText }}</text>
        </view>
      </view>

      <!-- ===== 总分卡：被批改过的成绩单主栏（v35）=====
           与首页 hero 同一套墨材质（$ink-gradient + 双内亮边 + 接地投影 + 齿孔撕线），
           形成「开始 → 结果」的闭环。v35 的三处改动：
             · 巨号读数从 132rpx → $font-7xl(160rpx)：一个数字占半屏，这是全页结论
             · 等级印章改为按等级上色（S金 A朱 B青 C赭 D灰）+ 旋转 -8°（首页同款）
             · 新增 0-100 等级刻度轨（等级色填充 + 每 10% 一道刻痕），
               让「86 分」不只是数字，而是"躺在量表上的一个位置" -->
      <view class="score-hero anim-in">
        <image class="hero-grain" src="/static/grain.png" mode="aspectFill" />
        <view class="hero-sheen"></view>
        <view class="hero-ring r1"></view>
        <view class="hero-ring r2"></view>

        <!-- 印章：落在右上角，微出边（overflow:hidden 会裁掉溢出部分，
             所以只咬住 6rpx —— 读起来像盖到了纸边上） -->
        <view
          class="seal"
          v-if="gradeText && !scoringDegraded"
          :class="['seal-' + gradeText.toLowerCase(), { landed: scoreLanded }]"
        >
          <text class="seal-letter">{{ gradeText }}</text>
          <text class="seal-cap">GRADE</text>
        </view>

        <view class="hero-inner">
          <view class="hero-eyebrow">
            <text class="hero-label">TOTAL SCORE</text>
            <text class="hero-label-cn">本场总分</text>
          </view>

          <view class="hero-score-row" :class="{ landed: scoreLanded }">
            <text class="hero-score">{{ totalAnim }}</text>
            <text class="hero-unit">分</text>
          </view>

          <!-- 等级刻度轨：0-100 的位置 + 每 10% 的刻痕（仪器读数，不是装饰） -->
          <view class="hero-scale" v-if="!scoringDegraded && safeScore !== null">
            <view class="hero-scale-track">
              <view
                class="hero-scale-fill"
                :class="'fill-' + gradeText.toLowerCase()"
                :style="{ width: safeScore + '%' }"
              ></view>
            </view>
            <view class="hero-scale-cap">
              <text class="hero-scale-num">0</text>
              <text class="hero-scale-num">100</text>
            </view>
          </view>

          <!-- 两枚"批注"：距下一级（客观）+ 较上一场（情绪） -->
          <view class="hero-marks">
            <text class="hero-tip" v-if="gradeTip">{{ gradeTip }}</text>
            <view class="hero-delta" v-if="trendDelta" :class="{ up: trendDelta.delta > 0 }">
              <text class="hero-delta-arrow">{{ trendDelta.delta > 0 ? '↑' : '↓' }}</text>
              <text class="hero-delta-text">{{ trendDeltaText }}</text>
              <text class="hero-delta-badge" v-if="trendDelta.isRecord">历史最佳</text>
            </view>
          </view>

          <!-- 降级说明：AI 全程不可用 → 一轮都没真正评上分。
               此时绝不能显示「0 分 D 级」——那是把服务故障说成用户的能力问题 -->
          <view class="hero-degraded" v-if="scoringDegraded">
            <text class="hero-degraded-title">本次未能完成评分</text>
            <text class="hero-degraded-text">评分服务暂时不可用，你作答的 {{ report.unscored_rounds }} 轮未被评估。下方点评由 AI 依据对话生成，仅供参考；建议稍后重新练习一场。</text>
          </view>
          <!-- 部分轮次未评上分：分数仍然有效，但口径要让用户看得见 -->
          <text class="hero-partial" v-else-if="partialUnscored">其中 {{ report.unscored_rounds }} 轮未能评到，不计入本次成绩</text>
        </view>

        <!-- 齿孔撕线：这张成绩单是从更大的表上撕下来的 -->
        <view class="hero-perf"></view>
      </view>

      <!-- ===== 01 能力分析 =====
           去卡片，编辑式分组（朱砂序号 + 大标题 + 延伸发丝线）。
           雷达图负责"形状"，五维条负责"读数"，两者同一套等级色。 -->
      <view class="sec anim-in d1">
        <view class="sec-head">
          <text class="sec-no">01</text>
          <text class="sec-label">能力分析</text>
          <view class="sec-line"></view>
        </view>
        <score-radar :scores="dimensionScores" tone="grade" />
        <view class="dim-list">
          <!-- 等级色按该维分值的等级取值（S≥9 / A≥8 / B≥7 / C≥6 / D<6，与后端口径一致）。
               三元链写在 wrapper 上、颜色交给 CSS 后代选择器 —— 一处判定，条与读数共用。 -->
          <view
            v-for="(dim, idx) in dimRows"
            :key="dim.key"
            class="dim-item"
            :class="dim.score * 1 >= 9 ? 'lv-s' : dim.score * 1 >= 8 ? 'lv-a' : dim.score * 1 >= 7 ? 'lv-b' : dim.score * 1 >= 6 ? 'lv-c' : 'lv-d'"
          >
            <!-- 每维一行：微型等宽序号 / 名称 / 刻度尺 / 读数。
                 刻度尺是 10 格的压印凹槽（不是一根光条）—— 一眼看出"还差几格" -->
            <view class="dim-row">
              <text class="dim-no">{{ String(idx + 1).padStart(2, '0') }}</text>
              <text class="dim-name">{{ dim.name }}</text>
              <view class="dim-track">
                <view
                  class="dim-fill"
                  :style="{ width: dim.width, animationDelay: dim.barDelay }"
                ></view>
              </view>
              <text class="dim-score" :style="{ animationDelay: dim.barDelay }">{{ dim.score }}</text>
            </view>
            <!-- AI 维度评语：回答「为什么是这个分」 -->
            <text
              class="dim-comment"
              v-if="dim.comment"
              :style="{ animationDelay: dim.commentDelay }"
            >{{ dim.comment }}</text>
          </view>
        </view>
      </view>

      <!-- ===== 02 核心优点 =====
        语义符号 ✓（等级 B 墨青 = "已经做对的"），左对齐短横线节奏，
        每条压一行，读起来像批改时打的勾。 -->
      <view class="sec anim-in d2">
        <view class="sec-head">
          <text class="sec-no">02</text>
          <text class="sec-label">核心优点</text>
          <view class="sec-line"></view>
          <text class="sec-count">{{ (report.strengths || []).length }}</text>
        </view>
        <view v-if="!report.strengths || report.strengths.length === 0" class="sec-empty">
          <text class="sec-empty-text">暂无内容</text>
        </view>
        <view v-for="(item, idx) in report.strengths" :key="idx" class="good-item">
          <text class="good-mark">✓</text>
          <text class="good-text">{{ item }}</text>
        </view>
      </view>

      <!-- ===== 03 待改进 =====
        语义符号 ✕，但**排版节奏不同**：不做列表线，改成一条条"批注框"
        （朱砂左侧竖线 + 浅底 + 缩进），读起来像老师写在页边的红笔。 -->
      <view class="sec anim-in d3">
        <view class="sec-head">
          <text class="sec-no">03</text>
          <text class="sec-label">待改进</text>
          <view class="sec-line"></view>
          <text class="sec-count">{{ (report.weaknesses || []).length }}</text>
        </view>
        <view v-if="!report.weaknesses || report.weaknesses.length === 0" class="sec-empty">
          <text class="sec-empty-text">暂无内容</text>
        </view>
        <view v-for="(item, idx) in report.weaknesses" :key="idx" class="bad-item">
          <view class="bad-rail">
            <text class="bad-mark">✕</text>
            <text class="bad-no">{{ String(idx + 1).padStart(2, '0') }}</text>
          </view>
          <text class="bad-text">{{ item }}</text>
        </view>
      </view>

      <!-- Tab 切换：逐题点评 / 改进建议 -->
      <view class="sec anim-in d4">
        <view class="tab-bar">
          <text
            class="tab-item"
            :class="{ active: activeTab === 'comments' }"
            hover-class="hover-press"
            @click="activeTab = 'comments'"
          >逐题点评</text>
          <text
            class="tab-item"
            :class="{ active: activeTab === 'suggestions' }"
            hover-class="hover-press"
            @click="activeTab = 'suggestions'"
          >改进建议</text>
        </view>

        <view v-if="activeTab === 'comments'" class="tab-content">
          <view v-if="roundComments.length === 0" class="sec-empty">
            <text class="sec-empty-text">暂无逐题点评，看看下面的改进建议吧</text>
          </view>
          <!-- 逐题点评：一行题 = 一条"批改批注"。
               左侧朱砂竖线 + 等宽轮次号，题干是承重文字，评语缩进成"页边批注"。 -->
          <view v-for="item in roundComments" :key="item.round_number" class="mark-item">
            <view class="mark-rail">
              <text class="mark-no">{{ item.no }}</text>
              <view class="mark-rail-line"></view>
            </view>
            <view class="mark-body">
              <text class="mark-question">{{ item.question }}</text>
              <text class="mark-comment">{{ item.comment }}</text>
            </view>
          </view>
        </view>

        <view v-else class="tab-content">
          <view v-if="!report.suggestions || report.suggestions.length === 0" class="sec-empty">
            <text class="sec-empty-text">暂无建议</text>
          </view>
          <!-- 改进建议：语义符号 →（"下一步往哪走"），编号弱化为描边空心数字，
               与上面两块形成第三种节奏 —— 不是列表、不是批注框，是"行动清单"。 -->
          <view v-for="(item, idx) in report.suggestions" :key="idx" class="tip-item">
            <text class="tip-no">{{ String(idx + 1).padStart(2, '0') }}</text>
            <text class="tip-arrow">→</text>
            <text class="tip-text">{{ item }}</text>
          </view>
          <view class="next-recommendation" v-if="report.next_recommendation">
            <text class="rec-label">NEXT · 推荐练习</text>
            <text class="rec-text">{{ report.next_recommendation }}</text>
          </view>
        </view>
      </view>

      <!-- AI 免责声明 -->
      <view class="ai-disclaimer">
        <text>本报告由 AI 生成，仅供学习参考，不构成任何录用或评价依据</text>
      </view>

      <!-- 底部操作 -->
      <view class="footer">
        <view class="btn-secondary" hover-class="hover-press" @click="goToHistory">查看历史</view>
        <view class="btn-primary" hover-class="hover-press" @click="practiceAgain">再练一次</view>
        <view class="btn-secondary share-poster-btn" hover-class="hover-press" @click="showPoster = true">分享成绩海报</view>
      </view>

      <!-- 分享海报弹出层（仅微信小程序端可用，Canvas 2D 绘制）
           关闭遮罩：遮罩用普通 @click 关闭，面板用 @click.stop（编译为 catchtap）
           阻止冒泡 —— .self 修饰符在微信端不生效。 -->
      <!-- #ifdef MP-WEIXIN -->
      <view
        class="poster-mask"
        v-if="showPoster"
        @click="showPoster = false"
        catchtouchmove="noop"
      >
        <view class="poster-panel" @click.stop>
          <view class="poster-head">
            <text class="poster-head-title">面试成绩海报</text>
            <view class="poster-head-close" hover-class="hover-press" @click="showPoster = false">
              <image class="poster-head-close-icon" :src="ICONS['close-ash']" mode="aspectFit" />
            </view>
          </view>
          <share-poster
            :score="scoringDegraded ? -1 : report.total_score"
            :grade="scoringDegraded ? '' : report.grade"
            :position-name="interviewInfo?.position_name || ''"
            :dimension-scores="dimensionScores"
          />
        </view>
      </view>
      <!-- #endif -->
    </template>

    <!-- 成就解锁仪式：面试刚结束是最该看到成就的时刻 -->
    <medal-ceremony-host :visible="pageVisible" />
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { onLoad, onShow, onHide, onUnload, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import ScoreRadar from '@/components/score-radar/score-radar.vue'
import LoadingOverlay from '@/components/loading-overlay/loading-overlay.vue'
import MedalCeremonyHost from '@/components/medal-ceremony-host/medal-ceremony-host.vue'
// #ifdef MP-WEIXIN
import SharePoster from '@/components/share-poster/share-poster.vue'
import { go, tab, NAV } from '@/utils/nav'
// #endif
import { getReport } from '@/api/report'
import { getInterviewDetail } from '@/api/interview'
import { useUserStore } from '@/store/modules/user'
import { useCountUp } from '@/composables/useCountUp'
import { ICONS } from '@/utils/svg-icons'

const userStore = useUserStore()
/* 本页是否在前台（成就仪式宿主用）。报告页是 navigateTo 进来的普通页，
   被新页面压住时会收到 onHide，所以同样需要这个标记。 */
const pageVisible = ref(false)

const loading = ref(true)
const report = ref(null)
// 轮询耗尽标记：只有轮询用尽仍没拿到报告时，才撤掉遮罩露出错误态让用户手动重试
const pollExhausted = ref(false)
// 与面试页「生成报告」遮罩同款同文案，跳转过来视觉无断裂
const reportStages = [
  [6000, '正在回顾你的作答'],
  [14000, '正在五维评分'],
  [25000, '马上就好，正在撰写报告']
]
// 遮罩条件：首次加载中，或报告未就绪且轮询仍在进行
const showLoading = computed(() => loading.value || (!report.value && !pollExhausted.value))
const interviewInfo = ref(null)
const activeTab = ref('comments')
const interviewId = ref('')
const showPoster = ref(false)
// 空函数：catchtouchmove 需要一个事件处理函数，阻止真机上弹层背后的页面跟随手指滚动
// （page-style 的 overflow:hidden 管鼠标滚轮/页面级滚动，触摸滚动穿透由它兜底）
const noop = () => {}

// 修复 P1-4：报告生成异步，进入页面时常未就绪。自动轮询兜底：
//   - 起始间隔 2s（AI 调用刚发出，1-2s 内不会好）
//   - 指数退避：4s → 6s → 8s，最长 8s
//   - 上限：最多 6 次（≈ 2+4+6+8+8+8 = 36s），超时后由用户点"重新加载"
// 这样把"等几秒自动出报告"的体验给到，同时限制极端情况下无限轮询
const POLL_INTERVALS_MS = [2000, 4000, 6000, 8000, 8000, 8000]
let pollTimer = null
let pollRound = 0

const dimensionLabels = {
  expression_logic: '表达逻辑',
  professional_depth: '专业深度',
  adaptability: '应变能力',
  fluency: '语言流畅度',
  structure_completeness: '结构完整性'
}

const dimensionScores = computed(() => {
  if (!report.value?.dimension_scores) return []
  return Object.entries(report.value.dimension_scores).map(([key, val]) => ({
    name: dimensionLabels[key] || key,
    score: Number(val?.score) || 0
  }))
})

/* 段位口径全站统一：S90/A80/B70/C60，与首页/统计页同源，保持产品口径一致。
 * 分数可能是 undefined / NaN，先夹取再显示，避免出现 NaN。 */
const safeScore = computed(() => {
  const s = Number(report.value?.total_score)
  return Number.isFinite(s) ? Math.round(s * 10) / 10 : null
})
/* 评分降级：AI 全程不可用导致无任何真实评分（scoreService 的 scoring_degraded）。
   此时 total_score 的 0 代表「无数据」而不是「能力差」，必须与真实 0 分区别展示 */
const scoringDegraded = computed(() => !!report.value?.scoring_degraded)
/* 部分轮次未评上分：分数仍由其余真实评分轮次算出，但要在页面上说明口径 */
const partialUnscored = computed(() =>
  !scoringDegraded.value && Number(report.value?.unscored_rounds) > 0
)

const totalDisplay = computed(() => {
  if (scoringDegraded.value) return '—'
  return safeScore.value === null ? '--' : safeScore.value
})
/* 分数揭晓（v24）：报告页是全流程的情绪最高点，原来 128rpx 巨分是「啪」地直接出现，
   缺少仪式感。改为 0 → 目标值缓动滚上去（与统计页平均分同一套 composable）。
   占位符（'—' / '--'）不是数字，useCountUp 会原样透传，降级口径不受影响。
   900ms 比统计页的 800ms 略长：它是全页主角，值得多停一拍。 */
const totalAnim = useCountUp(totalDisplay, { duration: 900, decimals: 1 })

/* ===== v32 揭晓编排：把「一整块数据同时出现」拆成有先后的一场戏 =====
 *
 * 改之前（真机观感）：
 *   · 巨分从 0 滚到目标值（900ms）—— 这一层是对的；
 *   · 但它旁边的雷达图、下面的五维条，**在页面挂载的第 0 毫秒就已经是终值**
 *     （五维条只有 0→1 的 scaleX，没有 delay 与总分的关系；维度数字直接是 toFixed 结果）。
 *   于是「分数还在滚，下面已经到了」—— 主角还没揭幕，配角已经全部就位，没有节奏可言。
 *
 * 改之后（时间轴，全部挂在同一个常量上，改一处即可整体挪动）：
 *   0.00s  巨分 0 → 目标值（900ms 缓出）+ 页面各区块 fadeUp
 *   0.98s  等级徽章与巨分「落定」（已有）
 *   1.04s  雷达图淡入（它是「分数从哪来」的总览，先于逐条）
 *   1.04s  第 1 根五维条开始长，之后每根 +90ms（五维依次推进）
 *   1.04s  对应维度数字从 0 滚到目标值（与自己的条同刻起）
 *   1.28s  该维度 AI 评语淡入（+240ms：先看到「多少分」，再读「为什么」）
 *
 * 错峰步长取 90ms 而非 60ms：五维共 5 项，90ms 才让「依次」被看见
 * （60ms 在 30fps 的小程序里几乎读成同时）。
 */
const REVEAL_BASE_S = 1.04   // = LAND_DELAY_MS 之后约一拍（秒）
const DIM_STEP_S = 0.09      // 五维错峰步长（秒）
/* 单根条 / 单个数字的时长 = 全站动效刻度上限 $motion-slow(0.36s)。
 * 不取更长：设计系统的三档是 0.16 / 0.24 / 0.36，数据生长的时长也必须落在刻度内，
 * 否则「禁止自造长时长」就形同虚设。0.36s 对一根条来说已经足够"长出来"，
 * 再长会让五根条叠成一片、错峰反而看不出来。 */
const DIM_GROW_S = 0.36
const revealDelay = (i) => (REVEAL_BASE_S + i * DIM_STEP_S).toFixed(2) + 's'
const commentDelay = (i) => (REVEAL_BASE_S + i * DIM_STEP_S + 0.24).toFixed(2) + 's'

/* ===== v31 分数「落定」瞬间 =====
 * 此前 128rpx 巨分虽然有 0→目标值的滚动，但滚完之后**什么都不发生**：
 * 数字停住、等级徽章一直在那儿、页面归于静止。
 * 而这是用户等了 10~30 秒后看到的唯一高潮 —— 该有一个明确的"结果已定"的收束。
 *
 * 做法：分数到达目标值的那一刻，让巨分做一次极克制的回弹（scale 1→1.04→1），
 * 等级徽章同步从半透明落定到全不透明。只动 transform/opacity，全在合成层。
 *
 * 为什么不用固定时长的 animation：报告数据是轮询拿到的（可能 2s 也可能 25s），
 * 固定时长会让动画在数字还在滚时就播完。必须**由数据驱动**。
 * 降级态（totalDisplay 为 '—'）不触发：没有分数就没有"落定"可言。
 *
 * v32：把 980 抽成常数 LAND_DELAY_MS，并明确它必须 ≥ 总分滚动时长（900ms）——
 * 落定必须发生在数字停稳之后，否则回弹会和还在跳动的数字叠在一起，
 * 读成"数字抽了一下"。徽章与雷达/五维的出场时刻也都从这一刻往后排（见 REVEAL_BASE_S）。 */
const LAND_DELAY_MS = 980
const scoreLanded = ref(false)
let landTimer = null
watch(() => totalDisplay.value, (v) => {
  // 目标值变化（首次拿到报告 / 重新加载）→ 复位，等新的分数落定
  scoreLanded.value = false
  if (landTimer) { clearTimeout(landTimer); landTimer = null }
  const n = Number(v)
  /* 非数字（'—' / '--'：评分降级或分数缺失）不排定落定时刻。
   * ⚠️ 但徽章基准态是 opacity:0（见样式区），若不置 true，
   * 一旦 safeScore 为 null 而 report.grade 仍存在（历史脏数据），
   * 徽章会**永久隐身** —— 这正是「为了修一个闪烁而引入一个消失」的典型踩法。
   * 这里直接给终态：没有数字可滚，也就没有"落定"这一刻，徽章应当一开始就在。 */
  if (!Number.isFinite(n)) {
    scoreLanded.value = true
    return
  }
  // 与 useCountUp 的 duration + 一点余量对齐：数字刚停稳的瞬间落定
  landTimer = setTimeout(() => { scoreLanded.value = true }, LAND_DELAY_MS)
})
onUnload(() => { if (landTimer) clearTimeout(landTimer) })
const gradeText = computed(() => {
  // 降级时不显示等级徽章：没有评分就不该有等级
  if (scoringDegraded.value) return ''
  const s = safeScore.value
  if (s === null) return report.value?.grade || ''
  if (s >= 90) return 'S'
  if (s >= 80) return 'A'
  if (s >= 70) return 'B'
  if (s >= 60) return 'C'
  return 'D'
})
const gradeTip = computed(() => {
  // 降级说明由 hero-degraded 区块承担，这里不能再输出「距 C 级还差 X 分」
  if (scoringDegraded.value) return ''
  const s = safeScore.value
  if (s === null) return ''
  if (s >= 90) return 'S 级 · 面霸水准，保持住'
  const lines = [
    { min: 80, next: 'S', at: 90 },
    { min: 70, next: 'A', at: 80 },
    { min: 60, next: 'B', at: 70 },
    { min: 0, next: 'C', at: 60 }
  ]
  const line = lines.find(l => s >= l.min)
  const need = Math.round((line.at - s) * 10) / 10
  return `距 ${line.next} 级还差 ${need} 分`
})

/* 维度条：宽度和序号都在 JS 里预算成字符串，模板只做绑定
 * （WXML 表达式能力有限，不能在模板里调 Math.min / padStart）。 */
const dimensionBars = computed(() => {
  if (!report.value?.dimension_scores) return []
  return Object.entries(report.value.dimension_scores).map(([key, val]) => {
    const raw = Math.min(10, Math.max(0, Number(val?.score) || 0))
    return {
      key,
      name: dimensionLabels[key] || key,
      score: raw,
      width: (raw * 10) + '%',
      // AI 对该维度的评语（后端 dimension_comments 落库，见 scoreService）。
      // 兼容两种历史形态：字符串 / { comment } 对象。
      comment: (typeof val?.comment === 'string' ? val.comment : (val?.comment?.comment || '')).trim()
    }
  })
})

/* ===== 五维数字滚动（v32）=====
 * 改之前：维度分是 `dim.score.toFixed(1)` —— 报告一到，五个数字**同时**跳到终值，
 * 而旁边那根条还在从 0 长出来。数字先到、条后到，读起来像两个部件没同步。
 * 现在每个维度一个 useCountUp，delay 与自己的条**逐字一致**（同一个 revealDelay），
 * 于是「长度到哪儿、读数就是多少」。
 *
 * 为什么用固定 5 个实例而不是 v-for 里动态建：hooks 必须在 setup 顶层调用
 * （useCountUp 内部用 watch + onUnmounted），不能在循环里按数据长度增删。
 * 后端五维口径固定 5 个 key，固定数组不会浪费。
 *
 * target 读取 dimensionBars[i].score：报告未到时为 0（数字停在 0 不闪），
 * 报告一到达就按错峰滚上去。fps 用默认 32（30fps）——本页还有总分在滚，
 * 两个一起跑也不至于把 setData 挤爆。 */
const dimCountups = [0, 1, 2, 3, 4].map((i) =>
  useCountUp(
    computed(() => dimensionBars.value[i]?.score ?? 0),
    {
      duration: Math.round(DIM_GROW_S * 1000),
      decimals: 1,
      delay: Math.round((REVEAL_BASE_S + i * DIM_STEP_S) * 1000)
    }
  )
)
/* 模板只遍历这一份：把「静态事实」（名字/宽度/评语）与「随动画变化的读数」
 * 合成同一个对象，模板里就是普通的 {{ dim.score }} —— 不用数组下标取值。
 * WXML 表达式能力有限，且全项目没有「模板里用变量下标」的先例，
 * 这里不为省一行计算去开一个新写法。 */
const dimRows = computed(() =>
  dimensionBars.value.map((d, i) => {
    const v = dimCountups[i]?.value
    return {
      ...d,
      // 数字滚到位之前不显示静态终值，否则会「先闪终值再跳回 0」
      score: typeof v === 'number' ? v.toFixed(1) : d.score.toFixed(1),
      barDelay: revealDelay(i),
      commentDelay: commentDelay(i)
    }
  })
)

/* 雷达图**不参与延迟揭晓**（见模板里 score-radar 处的注释）：
 * 它高 280px、紧贴首屏折叠线，延迟 1.04s 会让用户先看到一整块空白 ——
 * 那是"没加载出来"，不是"正在揭晓"。揭晓感交给逐条推进的五维条。 */

/* 逐题点评序号：mono 两位数（01/02…），与详情页轮次序号同源 */
const roundComments = computed(() => {
  const list = report.value?.round_comments || []
  return list.map((item, i) => ({ ...item, no: String(i + 1).padStart(2, '0') }))
})

/* 用时格式化：秒 → 「X 分」/「X 小时 X 分」，不足 1 分钟显示秒，保持轻量 */
const formatDuration = (seconds) => {
  const sec = Number(seconds) || 0
  if (sec < 60) return `${sec} 秒`
  const mins = Math.floor(sec / 60)
  if (mins < 60) return `${mins} 分钟`
  const h = Math.floor(mins / 60)
  return `${h} 小时 ${mins % 60} 分`
}

/* Hero 里的「轮次 / 用时」：数据源可能缺失（详情接口失败），必须诚实降级 */
const roundCountText = computed(() => {
  const n = Number(report.value?.total_rounds) ||
            Number(interviewInfo.value?.completed_rounds) ||
            Number(report.value?.round_comments?.length) ||
            0
  return n > 0 ? n : '—'
})
const durationText = computed(() => {
  const s = Number(interviewInfo.value?.duration_seconds)
  // 拿不到详情时不显示「0 秒」（那等于把一场真实面试说成没花时间）
  return Number.isFinite(s) && s > 0 ? formatDuration(s) : '—'
})

const loadData = async () => {
  // 缺少 interviewId 时不要发起无效请求，否则会命中 /interviews/undefined/report
  // 关键：必须同时置 pollExhausted，否则 showLoading = loading || (!report && !pollExhausted)
  // 恒为 true，「生成报告中」遮罩永久盖住错误态，用户无任何出口（外部 deep-link 缺 id 可复现）
  if (!interviewId.value) {
    loading.value = false
    report.value = null
    pollExhausted.value = true
    uni.showToast({ title: '链接缺少场次信息', icon: 'none' })
    return
  }
  loading.value = true
  try {
    // 报告与详情分开请求：报告可能尚未生成完（404/业务码非 0），
    // 不应因此连带丢掉面试详情，否则页面连岗位名都显示不出来
    const [reportData, interviewData] = await Promise.all([
      getReport(interviewId.value).catch(() => null),
      getInterviewDetail(interviewId.value).catch(() => null)
    ])
    report.value = reportData || null
    interviewInfo.value = interviewData || null
  } catch (e) {
    report.value = null
  } finally {
    loading.value = false
    // 报告未就绪：启动自动轮询（「重新加载」按钮也走这里，重置轮次继续等）
    if (!report.value) {
      pollRound = 0
      pollExhausted.value = false
      pollReport()
    }
  }
}

/**
 * 修复 P1-4：自动轮询报告直到就绪
 * 设计：起始 2s 后第一次轮询（AI 调用刚发出，通常 1-2s 内不会好），
 *      失败/未就绪后指数退避到 8s，最多 6 次（≈ 36s 总等待）。
 *      停止条件：拿到 report / 轮询次数耗尽 / 页面卸载。
 */
const pollReport = async () => {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
  if (report.value) return // 已就绪
  if (pollRound >= POLL_INTERVALS_MS.length) {
    // 轮询耗尽：撤掉遮罩露出错误态，由用户决定是否继续等
    pollExhausted.value = true
    return
  }

  const delay = POLL_INTERVALS_MS[pollRound]
  /* ⚠️ pollRound 必须在**请求真正发出之后**才自增（P1 修复，2026-10-11）。
     旧写法在这里就 `pollRound += 1`，而 onHide 会无条件清掉这个已排程的 timer ——
     于是「排程后、触发前切后台」这一拍会把配额白白烧掉、请求根本没发出去。
     用户切几次后台回来，6 档配额就消耗殆尽，pollExhausted 又因为
     `pollReport` 再没被调用过而始终为 false，于是：
        showLoading = !report && !pollExhausted → **恒真** → 遮罩永久盖住错误态与
        「重新加载」按钮 → 用户彻底没有出口（只能靠系统返回键）。
     现在改为在回调内自增：只有真的发出了请求才消耗一档退避。 */
  pollTimer = setTimeout(async () => {
    pollRound += 1
    try {
      const data = await getReport(interviewId.value).catch(() => null)
      if (data) {
        report.value = data
        return
      }
    } catch (e) { /* 继续轮询 */ }
    // 还没好，继续下一轮
    if (!report.value) pollReport()
  }, delay)
}

/* 再练一次（v24 修复）：原来是无参 redirectTo，用户刚看完报告、意愿最高的那一刻，
   落到的是一个「岗位为空、开始按钮 disabled」的全新空表单，必须把 4 项配置重选一遍。
   配置页 onLoad 早已支持这些 URL 参数（interview-config 的 hasUrlPosition 分支），
   这里把本场配置原样带过去即可，让「针对刚才的短板再来一场」一步到位。
   同时 redirectTo → navigateTo：保留返回路径，不再销毁刚看的报告。 */
const practiceAgain = () => {
  const info = interviewInfo.value || {}
  const q = []
  if (info.position_name) q.push(`position_name=${encodeURIComponent(info.position_name)}`)
  if (info.interview_type) q.push(`interview_type=${encodeURIComponent(info.interview_type)}`)
  if (info.difficulty) q.push(`difficulty=${encodeURIComponent(info.difficulty)}`)
  const rounds = Number(info.total_rounds) || 0
  if (rounds > 0) q.push(`total_rounds=${rounds}`)
  // v31 转场：报告页 → 配置页是"再练一次"，语义是"翻篇重来"，
  // 用更短的 quick（240ms），保持看完成绩后立刻开场的利落感
  go('/pages/interview-config/index' + (q.length ? '?' + q.join('&') : ''), NAV.quick)
}
const goToHistory = () => {
  tab('/pages/history/index')
}

/* 进步对比（v24 新增）：报告页是用户情绪最高的一屏，但此前只给一个孤立分数，
   没有任何历史参照——「我这次比上次好还是差」是用户最自然的疑问。
   数据早就在手：本页 onLoad 已调 fetchStats()（为勋章检测），userStore.stats
   里的 recent_trend 就是按日期升序的近 30 天分数序列（见 userController.getStats）。
   实现要点：
     ① 必须排除本场自己 —— trend 是按日期聚合的（同日多场取平均），本场也在其中，
        不排除的话「较上一场」永远是 0 分差；
     ② 用日期比对：本场报告的日期（generated_at / 落库时间）与 trend 的 date 对齐；
     ③ 只有「至少两场」且差值非 0 时才有意义，否则不显示这一行。
   严格只做展示，不改任何统计口径。 */
const trendDelta = computed(() => {
  if (scoringDegraded.value || safeScore.value === null) return null
  const trend = userStore.stats?.recent_trend
  if (!Array.isArray(trend) || trend.length < 2) return null
  /* 本场日期键。算法必须与后端 userController.toDateKey 逐字一致
     （+8h 位移后取 UTC 年月日），否则会与 trend 的 date 对不上、排除失败。
     后端 reportTime() 有「generated_at → ObjectId 时间戳」的兜底，
     这里同样按「generated_at → _id 内嵌时间」顺序取，保证老数据也能算。 */
  const stamp = report.value?.generated_at || report.value?._id
  let curKey = ''
  if (stamp) {
    const d = new Date(stamp)
    if (!Number.isNaN(d.getTime())) {
      const shifted = new Date(d.getTime() + 8 * 60 * 60 * 1000)
      curKey = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
    }
  }
  // 排除本场后取最后一条作为「上一场」
  const rest = curKey ? trend.filter(t => t.date !== curKey) : trend
  if (rest.length === 0) return null
  const prev = rest[rest.length - 1]
  const prevScore = Number(prev?.score)
  if (!Number.isFinite(prevScore)) return null
  const delta = Math.round((safeScore.value - prevScore) * 10) / 10
  // 差值 0 不值得占一行（「较上一场 +0 分」是噪音）
  if (!delta) return null
  const maxScore = Math.max(...trend.map(t => Number(t.score) || 0))
  return { delta, prev: prevScore, isRecord: safeScore.value >= maxScore }
})
const trendDeltaText = computed(() => {
  const d = trendDelta.value
  if (!d) return ''
  const sign = d.delta > 0 ? '+' : ''
  return `较上一场 ${sign}${d.delta} 分`
})

/* 分享文案（v24 修复两处）：
   ① 原文案「我在我的面试小屋的…」有重复措辞；
   ② 用 `?? '--'` 时 0 会被保留，于是评分降级（AI 故障、总分为 0）的用户
      转发出去的标题是「拿了 0 分」—— 把我们的服务故障说成用户的能力问题，
      与页内 totalDisplay 的诚实口径（降级显示「—」）自相矛盾。
      改用 totalDisplay：降级时它就是「—」，不会外泄 0 分。 */
/* ⚠️ 2026-10-12 品牌名统一（审核前自检发现）：
   分享文案原本自称「面霸AI」，而小程序正式名是「我的面试小屋」
   （manifest.json 的 name / pages.json 的 tab 页标题都是后者）。
   分享文案属于**对外传播物**，审核与用户都会看到 ——
   两个不同的产品名会构成「名称与内容不一致」的审核风险。
   现统一为正式名。将来若改名，必须同步：
   manifest.json → pages.json(tab 标题) → 这里 → server 的默认昵称。 */
const shareTitle = () => {
  const t = totalDisplay.value
  if (!t || t === '—' || t === '--') {
    return '来「我的面试小屋」练一场 AI 模拟面试，五维评分报告'
  }
  return `我在「我的面试小屋」的模拟面试拿了 ${t} 分，你也来试试`
}

onShareAppMessage(() => ({
  title: shareTitle(),
  path: '/pages/index/index'
}))

/* 朋友圈分享（v24 新增）：全项目此前零 onShareTimeline。
   注意朋友圈分享只能是单页模式，query 带 id 让点开的人看到同一场报告。 */
onShareTimeline(() => ({
  title: shareTitle(),
  query: interviewId.value ? `id=${interviewId.value}` : ''
}))

onLoad((options) => {
  interviewId.value = options.id
  // loadData 在报告未就绪时会自动启动轮询（见 loadData 的 finally），无需此处再调
  loadData()
  /* 顺手刷新 stats：本场面试的成就是「完成 N 场 / 平均分 / 五维均衡」这几类的达成时刻，
     而成就检测挂在 userStore.fetchStats 里 —— 不拉这一次，用户就得等回到首页或点开
     「我的」才看到解锁仪式（旧实现甚至只有「我的」页会弹）。
     失败静默：勋章不该影响报告本身。 */
  if (userStore.isLoggedIn) userStore.fetchStats().catch(() => {})
})

// 页面卸载清理：避免页面关掉后定时器还在跑（最坏情况是页面被缓存、timer 泄漏）
onUnload(() => {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
})

/* pageVisible：见变量声明处说明。 */
onShow(() => {
  pageVisible.value = true
  /* v31：回到前台且报告仍未就绪 → 继续轮询。
   * 与下面的 onHide 停轮询配对：原来只有 onUnload 会清 pollTimer，
   * 而 onUnload 只在页面**销毁**时触发 —— 用户中途切走（去别的 tab、接电话、
   * 进后台）页面只是被 hide 不卸载，于是它在后台继续每 8 秒打一次 /report：
   * 既费流量，又在用户回来时可能撞上一个早已过期的轮次。
   * pollRound 保留，退避档位不会从头再来。
   *
   * P1 兜底（2026-10-11）：退避档位已耗尽却仍无报告时，必须**立刻**置 pollExhausted。
   * 否则 showLoading（= !report && !pollExhausted）恒为真，遮罩会永久盖住错误态
   * 与「重新加载」按钮，用户在这个页面没有任何出口。这里是最后一道保险：
   * 无论 pollRound 因何走到尽头，都要保证错误态可见。 */
  if (!report.value && !pollExhausted.value) {
    if (pollRound >= POLL_INTERVALS_MS.length) {
      pollExhausted.value = true
    } else {
      pollReport()
    }
  }
})
onHide(() => {
  pageVisible.value = false
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
})
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 面试报告 v35 —— 纸本朱砂 · 压印版
 * ----------------------------------------------------------------------------
 * 立意：**一份被批改过的成绩单**。
 * 全页只有一块深色实体（总分卡），它是"批改结论"；其余全是纸面上的批注：
 *   · 巨号总分（$font-7xl）+ 旋转等级印章 + 0-100 等级刻度轨 —— 结论有位置感
 *   · 五维 = 带格数的压印刻度尺，每根条按该维分值上等级色
 *   · 优点 ✓ 勾选行 / 待改进 ✕ 页边批注框 / 建议 → 行动清单
 *     —— 三块长文**三种排版节奏**，不再是一本说明书的三个段落
 *
 * v34 → v35 的三处硬改动：
 *   ① 总分 132rpx → 160rpx，并压窄字距：一个数字占半屏
 *   ② 等级色从"只有朱砂"扩到五级（S金 A朱 B青 C赭 D灰），印章/刻度/维度条共用
 *   ③ 纸面层次从"发丝线"升级为"压印凹槽"（$emboss-*），纸终于有厚度
 * ========================================================================== */

/* 等级色的「墨面提亮版」：v35.1（第十五批）已提升为全局令牌 ——
 * 见 uni.scss 的 $grade-*-lit 与 utils/grades.js 的 GRADE_INK_LIT。
 * （原为页内私有 $g-*-lit；首页同款场景直接复用全局，避免两份定义漂移。） */

.report-page {
  min-height: 100vh;
  background: $paper;
  padding: 0 $page-padding calc(112rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  /* 纸张纹理：与首页同一套斜向极淡条纹（零请求，纯 CSS） */
  background-image: repeating-linear-gradient(
    92deg,
    rgba(23, 19, 14, 0.014) 0rpx,
    rgba(23, 19, 14, 0.014) 1rpx,
    transparent 1rpx,
    transparent 4rpx
  );
}

/* ===== 页头 =====
 * 编辑式：朱砂方块 + 等宽眉标（微型）/ 巨字标题（承重）/ 等宽元信息（读数）。
 * 三段字号 19 → 60 → 21，比例差把"报告"两个字的地位拉起来。 */
.pg-head {
  padding: 44rpx 0 30rpx;
  border-bottom: 1rpx solid $rule;
  margin-bottom: $sp-5;
}
.pg-kicker {
  display: flex;
  align-items: center;
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.8rpx;
  margin-bottom: 16rpx;
}
/* 眉标前的朱砂小方块：印刷品的"套准标记"，也把眉标锚在左边界上 */
.pg-kicker::before {
  content: '';
  width: 10rpx;
  height: 10rpx;
  background: $verm;
  margin-right: 12rpx;
  flex-shrink: 0;
}
.pg-title {
  display: block;
  font-family: $font-display;
  font-size: 60rpx;
  font-weight: $weight-black;
  color: $text-1;
  letter-spacing: -2.6rpx;
  line-height: 1.06;
}
.pg-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-top: 16rpx;
}
.pg-meta-item {
  font-family: $font-mono;
  font-size: 21rpx;
  color: $text-3;
  font-variant-numeric: tabular-nums;
}
.pg-meta-sep { font-size: 20rpx; color: $text-4; }

/* ===== 总分 Hero（墨色面板）=====
 * 材质与首页 hero 完全同源，这是全站"深色实体"的唯一配方。
 * 内部布局顺序刻意做成「微型眉标 → 巨号读数 → 刻度轨 → 批注」，
 * 视线的落点是中间那个数字，其余全部往两边让。 */
.score-hero {
  position: relative;
  overflow: hidden;
  padding: 38rpx 34rpx 32rpx;
  border-radius: $radius-xl;
  background: $ink-gradient;
  box-shadow: $ink-edge, $ink-shadow;
  margin-bottom: $sp-5;
}
.hero-grain {
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
  opacity: 0.32;
}
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
    rgba(255, 255, 255, 0.07) 45%,
    rgba(255, 255, 255, 0.11) 50%,
    rgba(255, 255, 255, 0.07) 55%,
    rgba(255, 255, 255, 0) 100%);
  transform: rotate(20deg) translateX(-120rpx);
  animation: heroSheen 9s $ease-out infinite;
}
@keyframes heroSheen {
  0% { transform: rotate(20deg) translateX(-120rpx); }
  55%, 100% { transform: rotate(20deg) translateX(900rpx); }
}
.hero-ring {
  position: absolute;
  border-radius: 50%;
  border: 1rpx solid $on-ink-line;
  pointer-events: none;
  z-index: 1;
}
.hero-ring.r1 { width: 420rpx; height: 420rpx; right: -140rpx; bottom: -200rpx; }
.hero-ring.r2 { width: 640rpx; height: 640rpx; right: -260rpx; bottom: -310rpx; border-color: rgba(255, 255, 255, 0.045); }

/* 齿孔撕线：与首页 hero 同一签名元素（这张成绩单是被撕下来的） */
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
  opacity: 0.5;
}

.hero-inner { position: relative; z-index: 3; }

/* --- 等级印章（v35）---
 * 与首页 .seal 同一元素：旋转 -8° + 等级色描边 + 墨面提亮字色。
 * v34 这里是"永不变的红章"，不管 91 分还是 61 分长得一样 —— 现已按等级分色。
 * 基准态 opacity:0 / scale .9，落章时由 .landed 压下来（分数停稳那一刻）。 */
.seal {
  position: absolute;
  right: 28rpx;
  top: 26rpx;
  width: 118rpx;
  height: 118rpx;
  border-radius: $radius-xs;
  border: 2rpx solid currentColor;
  background: rgba(255, 255, 255, 0.03);
  box-shadow: inset 0 0 0 4rpx rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transform: rotate(-8deg) scale(0.9);
  opacity: 0;
  z-index: 5;
  transition: transform $motion-base $ease-bounce, opacity $motion-base $ease-out;
}
.seal.landed {
  transform: rotate(-8deg) scale(1);
  opacity: 0.95;
}
.seal-letter {
  font-family: $font-mono;
  font-size: 52rpx;
  font-weight: $weight-black;
  line-height: 1;
  letter-spacing: -2rpx;
}
.seal-cap {
  font-family: $font-mono;
  font-size: 14rpx;
  font-weight: $weight-bold;
  letter-spacing: 1.6rpx;
  margin-top: 5rpx;
  opacity: 0.8;
}
/* 五级印泥色（墨面提亮版，见文件头 $g-*-lit 的说明） */
.seal-s { color: $grade-s-lit; }
.seal-a { color: $grade-a-lit; }
.seal-b { color: $grade-b-lit; }
.seal-c { color: $grade-c-lit; }
.seal-d { color: $grade-d-lit; }

/* 眉标行：微型等宽英文 + 中文次级，压在巨号读数上面当"欄头" */
.hero-eyebrow {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  padding-right: 140rpx;   /* 给右上印章让位 */
}
.hero-label {
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $on-ink-2;
  letter-spacing: 2.8rpx;
}
.hero-label-cn {
  font-size: 19rpx;
  color: $on-ink-3;
  letter-spacing: 1.4rpx;
}

/* 总分：v35 从 132rpx → $font-7xl(160rpx)。
 * 字距收到 -7rpx：三位数在 160rpx 下必须收紧才不散架。
 * line-height 压到 0.84，让数字的视觉中心上移、不与下面的刻度轨贴在一起。 */
.hero-score-row {
  display: flex;
  align-items: flex-end;
  gap: 8rpx;
  margin-top: 14rpx;
  transform: translateY(10rpx);
  opacity: 0;
  transition: transform $motion-slow $ease-out, opacity $motion-slow $ease-out;
}
.hero-score-row.landed {
  transform: none;
  opacity: 1;
}
.hero-score {
  font-family: $font-mono;
  font-size: $font-7xl;
  font-weight: $weight-black;
  color: $on-ink-1;
  line-height: 0.84;
  letter-spacing: -7rpx;
  font-variant-numeric: tabular-nums;
}
.hero-unit {
  font-size: 26rpx;
  font-weight: $weight-semibold;
  color: $on-ink-3;
  margin-bottom: 16rpx;
}

/* --- 等级刻度轨（v35 新增）---
 * 0-100 的物理位置：宽度就是分数本身，填充色是该等级的印泥色。
 * 轨道用 rgba 白 12%（墨面凹槽），刻痕用 repeating-linear-gradient 每 10% 一道，
 * 这样"86 分"读起来是"躺在量表 86% 的位置"，而不是一个孤立的数字。 */
.hero-scale { margin-top: 26rpx; }
.hero-scale-track {
  position: relative;
  height: 8rpx;
  border-radius: 4rpx;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
/* 刻痕：10 格，压在填充层之上（半透明白，深色填充上也能看见） */
.hero-scale-track::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    90deg,
    rgba(15, 12, 8, 0.55) 0rpx,
    rgba(15, 12, 8, 0.55) 1rpx,
    transparent 1rpx,
    transparent 10%
  );
}
.hero-scale-fill {
  height: 100%;
  border-radius: 4rpx;
  transition: width 0.6s $ease-out;
}
.fill-s { background: $grade-s-lit; }
.fill-a { background: $grade-a-lit; }
.fill-b { background: $grade-b-lit; }
.fill-c { background: $grade-c-lit; }
.fill-d { background: $grade-d-lit; }
.hero-scale-cap {
  display: flex;
  justify-content: space-between;
  margin-top: 8rpx;
}
.hero-scale-num {
  font-family: $font-mono;
  font-size: 17rpx;
  color: $on-ink-3;
  font-variant-numeric: tabular-nums;
}

/* --- 两枚批注：距下一级（客观）+ 较上一场（情绪）--- */
.hero-marks {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10rpx 18rpx;
  margin-top: 20rpx;
  /* 与下方降级说明的分割线，只在有降级内容时才需要 —— 这里不加，避免空线 */
}
.hero-tip {
  font-size: 22rpx;
  color: $on-ink-2;
  line-height: 1.5;
}
/* 进步 chip：向下（退步）用灰、向上（进步）用提亮朱砂。
   箭头是文字符号而非图标 —— 图标在 20rpx 下会糊，字符永远是清晰的。 */
.hero-delta {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 4rpx 12rpx 4rpx 8rpx;
  border-radius: $radius-xs;
  border: 1rpx solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.05);
}
.hero-delta.up {
  border-color: rgba(232, 102, 79, 0.42);
  background: rgba(232, 102, 79, 0.14);
}
.hero-delta-arrow {
  font-family: $font-mono;
  font-size: 20rpx;
  font-weight: $weight-black;
  color: $on-ink-2;
  line-height: 1;
}
.hero-delta.up .hero-delta-arrow { color: $grade-a-lit; }
.hero-delta-text {
  font-family: $font-mono;
  font-size: 21rpx;
  font-weight: $weight-bold;
  color: $on-ink-2;
  letter-spacing: 0.4rpx;
  font-variant-numeric: tabular-nums;
}
.hero-delta.up .hero-delta-text { color: $grade-a-lit; }
/* 历史最佳：实心提亮朱砂小方标（本页唯一"满格"标签） */
.hero-delta-badge {
  font-family: $font-mono;
  font-size: 16rpx;
  font-weight: $weight-bold;
  color: #FFFFFF;
  border-radius: $radius-xs;
  background: $grade-a-lit;
  padding: 2rpx 8rpx;
  letter-spacing: 1rpx;
  margin-left: 2rpx;
}

.hero-degraded {
  margin-top: 22rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid rgba(255, 255, 255, 0.10);
}
.hero-degraded-title {
  display: block;
  font-size: 26rpx;
  font-weight: $weight-bold;
  color: #FFFFFF;
  margin-bottom: 8rpx;
}
.hero-degraded-text {
  display: block;
  font-size: 22rpx;
  line-height: 1.6;
  color: $on-ink-2;
}
.hero-partial {
  display: block;
  margin-top: 16rpx;
  font-size: 21rpx;
  color: $on-ink-3;
  line-height: 1.5;
}

/* ===== 编辑式分组 =====
 * 朱砂序号 + 大标题 + 延伸发丝线，不上卡片：
 * 这一屏信息量大，卡片会把"报告"变成"卡片墙"。
 * v35：分组的上边界从"发丝线"改为"压印凹槽边"—— 一条 1rpx 亮线 + 一条 1rpx 暗线，
 * 读起来是纸被折过一道，而不是被划线切开。 */
.sec {
  padding: 38rpx 0 30rpx;
  border-top: 1rpx solid $rule;
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.7);
}
.sec-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 26rpx;
}
.sec-no { @include mono-index; }
.sec-label {
  font-size: 34rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -0.6rpx;
  flex-shrink: 0;
}
.sec-line {
  flex: 1;
  height: 1rpx;
  background: $rule;
  margin-left: 6rpx;
}
/* 条目计数：等宽微读数，压在发丝线右端（"3 条"这个事实，不是装饰） */
.sec-count {
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $text-4;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  letter-spacing: 0.5rpx;
}
.sec-empty { padding: 32rpx 0; text-align: center; }
.sec-empty-text { font-size: 26rpx; color: $text-3; }

/* ===== 五维刻度尺（v35 重做）=====
 * v34：一根全黑细条 + 数字。五根长得一样，读不出谁强谁弱。
 * v35：① 每根条按**该维分值的等级**上色（与印章/刻度轨同一套色阶）
 *      ② 轨道是 10 格压印凹槽（repeating-linear-gradient 画格），
 *         "还差几格"变成可数的，而不是估的
 *      ③ 左侧加微型等宽序号，右侧读数是等宽仪器字
 *
 * 等级色通过 wrapper 的 .lv-* 类下发，条与读数共用一次判定。 */
.dim-list { margin-top: 20rpx; }
.dim-item {
  padding: 16rpx 0 4rpx;
  border-bottom: 1rpx solid $rule;
}
.dim-item:last-child { border-bottom: none; }
.dim-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
/* 微型序号：与区块序号（朱砂 22rpx）区分开，这里是石灰 19rpx —— 它是标尺刻度，不是章节号 */
.dim-no {
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $text-4;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  letter-spacing: 0.5rpx;
}
.dim-name {
  font-size: 25rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  width: 132rpx;
  flex-shrink: 0;
  letter-spacing: -0.2rpx;
}
/* 轨道：压印凹槽 + 10 格刻痕 */
.dim-track {
  position: relative;
  flex: 1;
  height: 12rpx;
  border-radius: 3rpx;
  background: $paper-sunken;
  box-shadow: $emboss-1;
  overflow: hidden;
}
.dim-track::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.85) 0rpx,
    rgba(255, 255, 255, 0.85) 1rpx,
    transparent 1rpx,
    transparent 10%
  );
}
/* 填充：出场时从 0 长到目标宽度；颜色由 .lv-* 决定 */
.dim-fill {
  height: 100%;
  border-radius: 3rpx;
  animation: dimGrow $motion-slow $ease-out both;
}
@keyframes dimGrow {
  from { width: 0 !important; }
}
.dim-score {
  @include readout(30rpx);
  font-weight: $weight-heavy;
  color: $text-1;
  width: 66rpx;
  text-align: right;
  flex-shrink: 0;
  animation: fadeUp $motion-base $ease-out backwards;
}
/* AI 评语：缩进对齐轨道左端（序号 19 + 间隔 + 名称 132），
   让「评语属于这一行」的归属一目了然。 */
.dim-comment {
  display: block;
  margin-top: 10rpx;
  margin-left: 176rpx;
  font-size: 23rpx;
  line-height: 1.66;
  color: $text-muted;
  animation: fadeUp $motion-base $ease-out backwards;
}

/* 等级色下发（阈值与后端等级口径一致：S≥9 / A≥8 / B≥7 / C≥6 / D<6，0-10 量纲）
 * ⚠️ 只染填充条与右侧读数 —— 整行铺色会变成彩色表格，违反 v35「不大面积铺色」 */
.lv-s { .dim-fill { background: $grade-s; } .dim-score { color: $grade-s; } }
.lv-a { .dim-fill { background: $grade-a; } .dim-score { color: $grade-a; } }
.lv-b { .dim-fill { background: $grade-b; } .dim-score { color: $grade-b; } }
.lv-c { .dim-fill { background: $grade-c; } .dim-score { color: $grade-c; } }
.lv-d { .dim-fill { background: $grade-d; } .dim-score { color: $grade-d; } }

/* ===== 02 核心优点：勾选行 =====
 * 语义符号 ✓（墨青 = "已经做对的"）+ 逐条压一行，条间只有极淡的分隔。
 * 节奏是**紧凑**的：优点应该被快速读完，然后往下一块走。 */
.good-item {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  padding: 18rpx 0;
  border-bottom: 1rpx solid $rule;
}
.good-item:last-child { border-bottom: none; padding-bottom: 4rpx; }
/* 勾：等级 B 墨青，方框包住 —— 像批改时的对勾，不是 emoji */
.good-mark {
  width: 34rpx;
  height: 34rpx;
  border-radius: $radius-xs;
  background: $grade-b-soft;
  border: 1rpx solid rgba(44, 95, 82, 0.24);
  color: $grade-b;
  font-size: 22rpx;
  font-weight: $weight-black;
  line-height: 32rpx;
  text-align: center;
  flex-shrink: 0;
  margin-top: 4rpx;
}
.good-text {
  flex: 1;
  font-size: 28rpx;
  line-height: 1.66;
  color: $text-1;
  font-weight: $weight-medium;
  letter-spacing: -0.2rpx;
}

/* ===== 03 待改进：页边批注框 =====
 * 语义符号 ✕ + **完全不同的节奏**：不进列表，做成一条条独立的批注块
 * （浅暖底 + 左侧朱砂竖轨 + 缩进），读起来像老师写在页边、用红笔框住的提醒。
 * 与上面的勾选行形成"紧 → 松"的呼吸对比，这是消除"说明书感"的关键。 */
.bad-item {
  display: flex;
  align-items: stretch;
  gap: 0;
  margin-bottom: 14rpx;
  background: $paper-warm;
  border-radius: 0 $radius-sm $radius-sm 0;
  box-shadow: $emboss-1;
  overflow: hidden;
}
.bad-item:last-child { margin-bottom: 0; }
/* 左轨：朱砂竖线 + ✕ + 序号，三件竖排，是这块的"批改栏" */
.bad-rail {
  width: 66rpx;
  flex-shrink: 0;
  background: $verm-soft;
  border-left: 4rpx solid $verm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  padding: 16rpx 0;
}
.bad-mark {
  font-size: 24rpx;
  font-weight: $weight-black;
  color: $verm;
  line-height: 1;
}
.bad-no {
  font-family: $font-mono;
  font-size: 16rpx;
  font-weight: $weight-bold;
  color: rgba(192, 57, 43, 0.62);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  letter-spacing: 0.5rpx;
}
.bad-text {
  flex: 1;
  font-size: 27rpx;
  line-height: 1.68;
  color: $text-1;
  padding: 20rpx 22rpx;
}

/* ===== Tab 切换（v35：改成压印凹槽里的两个"抽出的卡片"）===== */
.tab-bar {
  display: flex;
  gap: 6rpx;
  margin-bottom: 24rpx;
  padding: 6rpx;
  background: $paper-sunken;
  border-radius: $radius-md;
  box-shadow: $emboss-2;
}
.tab-item {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: $radius-sm;
  font-size: 26rpx;
  font-weight: $weight-semibold;
  color: $text-3;
  transition: background-color $motion-fast $ease-out, color $motion-fast $ease-out;
}
/* 选中态：白卡浮出凹槽 + 微投影（**这是凹槽内的实体，不是普通卡片**，
   所以此处允许极轻的 drop shadow —— 它是"从槽里抽出来的纸片"） */
.tab-item.active {
  background: $paper-card;
  color: $ink;
  font-weight: $weight-bold;
  box-shadow: 0 1rpx 3rpx rgba(23, 19, 14, 0.07);
}
.tab-content { min-height: 80rpx; }

/* ===== 逐题点评：批改批注（v35 重做）=====
 * v34：序号 + 题干的标题行 + 缩进评语，本质是一串"条目"。
 * v35：做成**左栏竖轨**——轮次号与一条朱砂细线竖着排，
 * 题干是承重文字，评语缩进成"页边批注"。一眼看出这是"逐题"而不是"逐条"。 */
.mark-item {
  display: flex;
  align-items: stretch;
  gap: 20rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid $rule;
}
.mark-item:last-child { border-bottom: none; }
/* 左轨：等宽轮次号 + 向下延伸的朱砂细线（像夹在纸上的书签） */
.mark-rail {
  width: 40rpx;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}
.mark-no {
  font-family: $font-mono;
  font-size: 21rpx;
  font-weight: $weight-black;
  color: $verm;
  letter-spacing: 0.5rpx;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.mark-rail-line {
  flex: 1;
  width: 2rpx;
  min-height: 20rpx;
  background: linear-gradient(180deg, $verm-line, rgba(192, 57, 43, 0));
  border-radius: 1rpx;
}
.mark-body { flex: 1; min-width: 0; }
.mark-question {
  display: block;
  font-size: 27rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  line-height: 1.55;
  letter-spacing: -0.3rpx;
}
/* 评语：缩进 + 更松的行高 + 次级色 —— 排版上明确"这是批注，不是正文" */
.mark-comment {
  display: block;
  margin-top: 12rpx;
  padding-left: 16rpx;
  border-left: 2rpx solid $rule-strong;
  font-size: 24rpx;
  line-height: 1.74;
  color: $text-muted;
}

/* ===== 改进建议：行动清单（第三种节奏）=====
 * 描边空心序号 + → 符号 + 正文。无分隔线、无底色，
 * 靠"序号 → 文本"的横向留白分段 —— 三条建议读起来像三条待办。 */
.tip-item {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  padding: 20rpx 0;
}
.tip-no {
  font-family: $font-mono;
  font-size: 20rpx;
  font-weight: $weight-black;
  color: transparent;
  -webkit-text-stroke: 1.2rpx $text-4;
  letter-spacing: 0.5rpx;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  padding-top: 5rpx;
}
.tip-arrow {
  font-family: $font-mono;
  font-size: 24rpx;
  font-weight: $weight-bold;
  color: $verm;
  line-height: 1.4;
  flex-shrink: 0;
}
.tip-text {
  flex: 1;
  font-size: 27rpx;
  line-height: 1.72;
  color: $text-1;
  letter-spacing: -0.1rpx;
}
/* 推荐练习：朱砂左轨 + 浅朱砂底 + 压印（全页唯一的"彩色区块"） */
.next-recommendation {
  margin-top: 26rpx;
  padding: 26rpx 26rpx 26rpx 24rpx;
  background: $verm-soft;
  border-left: 4rpx solid $verm;
  border-radius: 0 $radius-sm $radius-sm 0;
  box-shadow: $emboss-1;
}
.rec-label {
  display: block;
  font-family: $font-mono;
  font-size: 18rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2rpx;
  margin-bottom: 10rpx;
}
.rec-text {
  display: block;
  font-size: 26rpx;
  line-height: 1.7;
  color: $text-1;
  font-weight: $weight-medium;
}

/* ===== 免责声明 ===== */
.ai-disclaimer {
  padding: 36rpx 0 28rpx;
  text-align: center;
  font-size: 21rpx;
  color: $text-4;
  line-height: 1.6;
}

/* ===== 底部操作 =====
 * 主按钮（再练一次）用墨底 —— 全页唯一的实心动作。
 * 次按钮（查看历史）用压印凹槽，而不是"描边"：凹槽是 v35 的次级语言。
 * 分享海报整宽放在下一行，视觉权重最低。 */
.footer {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  padding-top: 12rpx;
}
.footer .btn-secondary,
.footer .btn-primary {
  flex: 1;
  height: 100rpx;
  border-radius: $radius-btn;
  font-size: 29rpx;
  font-weight: $weight-bold;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.footer .btn-secondary {
  background: $paper-sunken;
  color: $ink;
  box-shadow: $emboss-1;
}
.footer .btn-primary {
  background: $ink;
  color: #FFFFFF;
}
/* ⚠️ 必须写成 `.footer .share-poster-btn`（两个类），不能只写 `.share-poster-btn`：
   上面 `.footer .btn-secondary` 的 `flex: 1` 优先级更高（0,2,0 > 0,1,0），
   而分享按钮是 `btn-secondary share-poster-btn` 双类，会被前者拉回同一行。
   v35 实测：旧写法 `.share-poster-btn { flex-basis: 100% }` 完全无效，
   三个按钮挤成一行、分享按钮被压成窄条。 */
.footer .share-poster-btn {
  flex: 0 0 100%;
  height: 84rpx;
  font-size: 26rpx;
  color: $text-3;
  background: transparent;
  box-shadow: inset 0 0 0 1rpx $rule;
  letter-spacing: 0.4rpx;
}

/* ===== 空态 / 错误态 ===== */
.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 78vh;
  padding: 0 24rpx;
  text-align: center;
}
.state-mascot { width: 200rpx; height: 200rpx; margin-bottom: 32rpx; }
.state-title {
  font-size: 38rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -0.8rpx;
  margin-bottom: 16rpx;
}
.state-tip {
  font-size: 25rpx;
  color: $text-3;
  line-height: 1.65;
  margin-bottom: 44rpx;
}
.state-btns { display: flex; gap: 16rpx; }
.state-btn {
  padding: 20rpx 44rpx;
  border-radius: $radius-btn;
  font-size: 27rpx;
  font-weight: $weight-bold;
  background: $paper-sunken;
  color: $text-2;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.state-btn.primary { background: $ink; color: #FFFFFF; }

/* ===== 海报弹层 ===== */
.poster-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(23, 19, 14, 0.62);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  animation: fadeIn $motion-base $ease-out both;
}
.poster-panel {
  width: 100%;
  max-width: 640rpx;
  background: $paper;
  border-radius: $radius-xl;
  padding: 32rpx;
  box-shadow: $shadow-dialog;
}
.poster-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.poster-head-title {
  font-size: 32rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -0.5rpx;
}
.poster-head-close {
  width: 64rpx;
  height: 64rpx;
  border-radius: $radius-sm;
  background: $paper-sunken;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.poster-head-close-icon { width: 26rpx; height: 26rpx; }
</style>
