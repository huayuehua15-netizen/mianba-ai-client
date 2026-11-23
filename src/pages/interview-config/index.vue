<template>
  <view class="page">
    <!-- 页头：等宽英文眉标 + 大标题 + 说明。
         眉标（INTERVIEW SETUP）与首页 AI MOCK INTERVIEW / 历史页 INTERVIEW LOG /
         报告页 SCORE REPORT 同一语言，是跨页统一感的关键。 -->
    <view class="pg-head">
      <text class="pg-kicker">INTERVIEW SETUP</text>
      <text class="pg-title">面试配置</text>
      <text class="pg-sub">填好这张表，AI 面试官按岗位与难度发问</text>
    </view>

    <!-- 01 面试类型：凹槽底方格 + 选中墨底白字。
         纸本的选择语言是「方格纸上的勾选」，不是胶囊（胶囊是移动端通用语言）。 -->
    <view class="cfg-section">
      <view class="cfg-head">
        <text class="cfg-no">01</text>
        <text class="cfg-label">面试类型</text>
        <view class="cfg-rule"></view>
      </view>
      <view class="type-grid">
        <view
          v-for="item in interviewTypes"
          :key="item.value"
          class="type-tile"
          hover-class="tab-press"
          :class="{ active: form.interview_type === item.value }"
          @click="form.interview_type = item.value"
        >
          <text class="type-tile-text">{{ item.label }}</text>
        </view>
      </view>
    </view>

    <!-- 目标岗位：单套选择机制：点击选择器展开分类标签，点标签即选中 -->
    <view class="cfg-section">
      <view class="cfg-head">
        <text class="cfg-no">02</text>
        <text class="cfg-label">目标岗位/专业</text>
        <view class="cfg-rule"></view>
        <text class="cfg-tag" v-if="!form.position_name">必选</text>
      </view>
      <view
        class="position-selector"
        :class="{ 'is-filled': !!form.position_name }"
        hover-class="hover-press"
        @click="toggleExpand"
      >
        <text :class="['position-text', { placeholder: !form.position_name, 'just-picked': positionJustPicked }]">
          {{ form.position_name || '请选择岗位' }}
        </text>
        <!-- 展开箭头：v28 由文字字符 › + CSS rotate(90deg) 换成 morph-icon，
             收起 ›（浅灰）↔ 展开 ⌄（墨黑）之间播放 morphicons 烘焙的**纯旋转**变形
             （两段几何互为 90° 旋转，Procrustes 识别为 residual≈0，是旋转而非硬掰）。
             尺寸由 .arrow 的 width/height 决定（17rpx，按"字符墨迹等高"实测标定，
             实测字符墨迹只占字号 36%，
             直接沿用 font-size 会明显偏大）。 -->
        <morph-icon
          class="arrow"
          frames="chevron-right-down-ash"
          frames-alt="chevron-right-down"
          :active="expanded"
          :fallback="ICONS['chevron-right-ash']"
          :fallback-alt="ICONS['chevron-right']"
        />
      </view>
      <!-- 展开的岗位分类 + 全部岗位 -->
      <view v-if="expanded" class="position-expanded">
        <!-- 分类分段控件：凹槽底条内嵌浮起白块（与全局 .seg-bar 同一语言） -->
        <view class="cat-tabs-wrap">
          <scroll-view scroll-x class="cat-tabs" :show-scrollbar="false">
            <view class="cat-tabs-inner">
              <view
                v-for="cat in categories"
                :key="cat"
                class="cat-tab"
                :class="{ active: activeCategory === cat }"
                hover-class="tab-press"
                @click="activeCategory = cat"
              >
                {{ cat }}
              </view>
            </view>
          </scroll-view>
        </view>
        <!-- 分组微表头：标签 + 规则线 + mono 计数，编辑式微排版 -->
        <view class="grid-head">
          <text class="grid-label">{{ activeCategory === '全部' ? '全部岗位' : activeCategory }}</text>
          <view class="grid-rule"></view>
          <text class="grid-count">{{ displayedPositions.length }}</text>
        </view>
        <!-- 分类下的岗位目录：严格两列对齐的方格阵列。
             不用参差的胶囊墙 —— 宽度不一的胶囊换行后右边缘参差不齐，
             视觉上就是「随手排的标签」；锁定等宽的方格排成阵列才像「设计过的目录」。
             ⚠️ 这里刻意不显示题库题量：本页紧邻下方就有「面试轮次」设置，
             放一个「31题」在旁边会让人误以为这轮面试要问 31 道题 -->
        <view class="position-grid">
          <view
            v-for="(pos, pi) in displayedPositions"
            :key="pos._id"
            class="position-tile"
            :class="{ active: form.position_name === pos.name }"
            :style="{ animationDelay: pillDelay(pi) }"
            hover-class="tile-press"
            hover-start-time="0"
            @click="pickPosition(pos)"
          >
            <text class="tile-name">{{ pos.name }}</text>
          </view>
          <view v-if="displayedPositions.length === 0" class="empty-cat">该分类暂无岗位</view>
        </view>
        <!-- 岗位库请求失败时给重试入口，不能只是「暂无岗位」把人打发走 -->
        <view v-if="loadError" class="reload-row">
          <text class="reload-text">岗位加载失败</text>
          <text class="reload-btn" hover-class="hover-press" @click="reloadPositions">重试</text>
        </view>
      </view>
    </view>

    <!-- 03 难度等级：纵向单选行组，不是三张等重卡片。
         三张等宽卡并排在纸本语言里三颗同权，读者先看到的是"三张卡"而不是"我选了哪档"；
         整行变墨之后，"被选中的那一档"成为唯一的深色实体，层级立刻清楚。 -->
    <view class="cfg-section">
      <view class="cfg-head">
        <text class="cfg-no">03</text>
        <text class="cfg-label">难度等级</text>
        <view class="cfg-rule"></view>
      </view>
      <view class="diff-group">
        <view
          v-for="item in difficulties"
          :key="item.value"
          class="diff-row"
          hover-class="hover-press"
          :class="['lv-' + item.value, { active: form.difficulty === item.value }]"
          @click="form.difficulty = item.value"
        >
          <view class="diff-main">
            <text class="diff-label">{{ item.label }}</text>
            <text class="diff-desc">{{ item.desc }}</text>
          </view>
          <view class="diff-mark"></view>
        </view>
      </view>
    </view>

    <!-- 面试官音色：内联展开（点击触发行在卡片内展开选项，不用遮罩/抽屉） -->
    <view class="cfg-section">
      <view class="cfg-toggle-row">
        <view class="cfg-head-inline">
          <text class="cfg-no">04</text>
          <text class="cfg-label">面试官音色</text>
          <view class="cfg-rule"></view>
        </view>
        <view class="voice-picker" hover-class="hover-press" @click="voiceSheetVisible = !voiceSheetVisible">
          <text class="voice-current">{{ voiceOptions[voiceIndex].label }}</text>
          <!-- 音色选择器箭头：语义与岗位选择器**不同**（收起 ⌄ → 展开 ⌃，原实现靠
               CSS rotate(-90deg) 转文字字符）。故用独立的 chevron-down-up 帧序列。 -->
          <morph-icon
            class="voice-arrow"
            frames="chevron-down-up-gray"
            :active="voiceSheetVisible"
            :fallback="ICONS['chevron-down-gray']"
          />
        </view>
      </view>

      <!-- 内联选项列表：展开时在触发行正下方逐条出现 -->
      <view class="voice-list" v-if="voiceSheetVisible">
        <view
          v-for="(v, i) in voiceOptions"
          :key="v.value"
          class="voice-row"
          :class="{ selected: form.tts_voice === v.value }"
          hover-class="voice-row-press"
          @click="onVoiceChange(i)"
        >
          <view class="voice-row-main">
            <text class="voice-row-label">{{ v.label }}</text>
            <text class="voice-row-trait">{{ v.trait }}{{ v.gender ? ' · ' + v.gender + '声' : '' }}</text>
          </view>
          <view class="voice-check" v-if="form.tts_voice === v.value"></view>
        </view>
      </view>

      <text class="form-hint" v-else>{{ voiceOptions[voiceIndex].trait }} · {{ voiceOptions[voiceIndex].gender }}声 · 题目出现自动播报，气泡上可暂停/继续</text>
    </view>

    <!-- 轮次设置 -->
    <view class="cfg-section">
      <view class="cfg-toggle-row">
        <view class="cfg-head-inline">
          <text class="cfg-no">05</text>
          <text class="cfg-label">面试轮次</text>
          <view class="cfg-rule"></view>
        </view>
        <view class="stepper">
          <!-- v32：到达边界时给明确的禁用态。
               原先 3 轮时再点「−」、15 轮时再点「＋」都是**静默无反应**
               （changeRounds 里 next 超界就直接 return）—— 用户分不清
               "点到边了"和"按钮坏了"，只会连点。现在按钮自己变灰。 -->
          <view
            class="step-btn"
            :class="{ disabled: form.total_rounds <= 3 }"
            :hover-class="form.total_rounds <= 3 ? 'none' : 'hover-press'"
            @click="changeRounds(-1)"
          ><text class="step-btn-glyph">−</text></view>
          <text class="step-value">{{ form.total_rounds }}</text>
          <view
            class="step-btn"
            :class="{ disabled: form.total_rounds >= 15 }"
            :hover-class="form.total_rounds >= 15 ? 'none' : 'hover-press'"
            @click="changeRounds(1)"
          ><text class="step-btn-glyph">＋</text></view>
        </view>
      </view>
    </view>

    <!-- 回答方式 -->
    <view class="cfg-section">
      <view class="cfg-toggle-row">
        <view class="cfg-head-inline">
          <text class="cfg-no">06</text>
          <text class="cfg-label">默认语音作答</text>
          <view class="cfg-rule"></view>
        </view>
        <!-- 开关的开态色是原生属性，取不到 SCSS 变量，只能写字面值：
             与基座 $ink(#14110D) 同值，保证它与全站墨色是同一个黑。 -->
        <switch
          :checked="form.answer_mode === 'voice'"
          :disabled="!voiceAvailable"
          @change="toggleAnswerMode"
          color="#14110D"
        />
      </view>
      <text class="form-hint">
        {{ voiceAvailable ? '进入面试后默认按住说话，也可随时切换为文字输入' : '语音能力未就绪，已默认为文字作答' }}
      </text>
    </view>

    <!-- 计时开关 -->
    <view class="cfg-section">
      <view class="cfg-toggle-row">
        <view class="cfg-head-inline">
          <text class="cfg-no">07</text>
          <text class="cfg-label">每题计时</text>
          <view class="cfg-rule"></view>
        </view>
        <!-- 必须以事件回传的 e.detail.value 为准：
             用 !form.timer_enabled 取反会因连续快速切换而与真实开关状态失同步 -->
        <switch :checked="form.timer_enabled" @change="onTimerSwitch" color="#14110D" />
      </view>
    </view>

    <!-- 底部行动区：预计用时（等宽读数）+ 今日额度 + 开始按钮 -->
    <view class="footer">
      <view class="foot-meta">
        <view class="estimate">
          <text class="estimate-label">预计用时</text>
          <text class="estimate-num">{{ form.total_rounds * 3 }}</text>
          <text class="estimate-unit">分钟</text>
        </view>
        <!-- v31 今日额度：全程不收费，但每天最多 10 场（防刷 + 保护 AI/TTS 额度）。
             必须在**点开始之前**就让用户看到剩余次数，否则用户点了才被拒会以为程序坏了。
             拿不到额度（接口失败）时不显示这一行，也不阻塞开始 —— 宁可少显示，
             不能因为一次查询失败就不让用户面试。 -->
        <text
          v-if="quota && quota.limit"
          class="quota-hint"
          :class="{ empty: quota.remaining <= 0 }"
        >{{ quota.remaining > 0 ? `今日还剩 ${quota.remaining}/${quota.limit} 场 · 免费` : '今日次数已用完，明天 0 点恢复' }}</text>
      </view>
      <view
        class="start-btn"
        hover-class="hover-press"
        :class="{ disabled: !canStart || quotaExhausted }"
        @click="startInterview"
      >
        <text class="start-btn-text">开始面试</text>
        <view class="start-btn-arrow">
          <image class="start-btn-arrow-icon" :src="ICONS['arrow-up']" mode="aspectFit" />
        </view>
        <!-- 扫描光：斜向高光缓慢巡游，与首页 Hero 同源 -->
        <view class="start-btn-sheen"></view>
      </view>
    </view>

    <!-- 开场加载层：后端同步生成首题（AI 最长 60s），必须给出有品牌感的等待。
         v35.3 第二十一批：等待凭证票 —— 印章入场仪式 + 真实计时 + 岗位/难度/轮次回显 -->
    <loading-overlay
      v-if="starting"
      title="AI 面试官正在入场"
      sub="正在根据岗位与难度准备开场提问，请稍候"
      :stages="bootStages"
      stamp="入场"
      eyebrow="ENTRANCE · 入场准备"
      :meta="bootMeta"
    />
  </view>
</template>


<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useInterviewStore } from '@/store/modules/interview'
import { useUserStore } from '@/store/modules/user'
import { getPositions } from '@/api/position'
import { getDailyQuota } from '@/api/interview'
import { showOverloadNotice } from '@/utils/serviceNotice'
import { ICONS } from '@/utils/svg-icons'
import LoadingOverlay from '@/components/loading-overlay/loading-overlay.vue'
// 显式引入：模板直接用了 <morph-icon>，原先靠全局 usingComponents 兜底。
// 全局注册块已删除，补 import 后行为不变。
import MorphIcon from '@/components/morph-icon/morph-icon.vue'

const interviewStore = useInterviewStore()

const interviewTypes = [
  { label: '专升本', value: '专升本' },
  { label: '考研复试', value: '考研复试' },
  { label: '校园招聘', value: '校招' },
  { label: '社会招聘', value: '社招' },
  { label: '自定义', value: '自定义' }
]

const difficulties = [
  { value: 'easy', label: '简单', desc: '基础友好' },
  { value: 'medium', label: '中等', desc: '兼顾深度' },
  { value: 'hard', label: '困难', desc: '压力挑战' }
]

/* 面试官音色（与后端 ttsService.VOICES 白名单一致；cosyvoice-v3-flash 可用）
 *
 * ⚠️ 2026-10-11：**已移除「专属复刻音」**（声音复刻音色，value 形如
 *   `cosyvoice-v3-flash-mianba-955358dc8f504f4295d34d760b090faf`）。
 * 原因：用户实测反馈该音色播报**有噪音**。它经由"参考音频→克隆"得到，
 * 即便做过谱减法降噪（v2，SNR 13.2dB）实听仍有杂音 —— 音质达不到播报标准，
 * 直接下线，只保留 5 个官方音色（音质稳定）。
 * 后端 `ttsService.DEPRECATED_VOICES` 已把复刻音的新旧两个 voice_id
 * 都映射到默认音色，因此正在进行的旧会话 / 本地 storage 里残留的复刻音
 * 仍能正常播报（只是换成默认音色），不会出现"选了却听不到声音"。 */
const voiceOptions = [
  { value: 'longanyang', label: '阳光大男孩', trait: '清爽活力', gender: '男' },
  { value: 'longfei_v3', label: '热血磁性男', trait: '低沉磁性', gender: '男' },
  { value: 'longyingxun_v3', label: '年轻青涩男', trait: '温和谦逊', gender: '男' },
  { value: 'longanhuan', label: '欢脱元气女', trait: '明亮活泼', gender: '女' },
  { value: 'longyingjing_v3', label: '低调冷静女', trait: '知性沉稳', gender: '女' }
]
// 自定义底部弹层：可见性 + 选中即收起
const voiceSheetVisible = ref(false)
/* 音色下标：找不到时归一到 0（默认音色）。
 * 必须做这个兜底 —— 模板直接读 `voiceOptions[voiceIndex]`，
 * 而 storage/URL 里可能残留已下线的复刻音 ID（findIndex 返回 -1），
 * 不做归一就会渲染出空标签。 */
const voiceIndex = computed({
  get: () => {
    const i = voiceOptions.findIndex((v) => v.value === form.value.tts_voice)
    return i >= 0 ? i : 0
  },
  set: (i) => { form.value.tts_voice = voiceOptions[i].value }
})
const onVoiceChange = (i) => {
  voiceIndex.value = i
  voiceSheetVisible.value = false
}

// 语音插件（WechatSI）需要在微信公众平台开通并在 manifest 声明后才可用。
// 默认改为文字作答：旧的默认 voice 在插件不可用时，用户一进面试就撞上「语音不可用」。
const voiceAvailable = ref(false)

const form = ref({
  interview_type: '校招',
  position_id: '',
  position_name: '',
  difficulty: 'medium',
  tts_voice: 'longanyang',
  total_rounds: 8,
  answer_mode: 'text',
  timer_enabled: false
})

const expanded = ref(false)
const positions = ref([])
const categories = ref(['全部'])
const activeCategory = ref('全部')
const loadError = ref(false)
const starting = ref(false)
/* URL 是否显式带入了岗位名（?position_name=...）。
   用于防止 onMounted 读 storage 时覆盖 URL 的显式意图 —— 见 onLoad 的说明。 */
const hasUrlPosition = ref(false)

/* 开场加载分阶段文案：首题由 AI 同步生成（10~30s 常态），
   静态一句"正在准备"会让 20 秒的等待像卡死，按时间推进文案给出"在动"的感觉。
   计时器在 loading-overlay 组件内部管理，页面销毁时自动清理 */
const bootStages = [
  [8000, '正在阅读岗位要求'],
  [18000, '正在打磨第一道问题'],
  [30000, '马上就好，正在做最后检查']
]

/* v35.3 第二十一批：等待凭证票的真实上下文行 —— 等待时顺带确认开考信息，
 * 避免用户在 10~30s 里怀疑"我刚才选的到底是什么"。 */
const bootMeta = computed(() => [
  ['岗位', form.value.position_name || '—'],
  ['难度', difficulties.find(d => d.value === form.value.difficulty)?.label || form.value.difficulty],
  ['轮次', `${form.value.total_rounds} 轮`]
])

/* 分类兜底：接口失败/数据为空时也至少有分类可点，避免只剩「全部」一个空壳。
 * v31：补「设计」「职能」—— 岗位库已扩到 8 大类 78 个岗位，
 * 兜底列表落后会让用户在接口失败时点不到这两类。
 * （正常路径是从返回数据聚合分类，见下方 loadPositions，不依赖本常量。） */
const FALLBACK_CATEGORIES = ['全部', '技术', '产品', '设计', '运营', '市场', '职能', '专升本专业', '考研专业']

const displayedPositions = computed(() => {
  if (activeCategory.value === '全部') return positions.value
  return positions.value.filter(p => p.category === activeCategory.value)
})

/* 胶囊错落入场延迟：每颗递增 24ms，超过 12 颗后不再累加
   （避免第 21 颗等半秒才出现，观感变拖沓） */
const pillDelay = (i) => `${Math.min(i, 12) * 24}ms`

const canStart = computed(() => !!form.value.position_name)

/* ===== v31 今日额度 =====
 * 全程不收费，但每人每天最多 10 场（后端强制，防刷 + 保护 AI/TTS 额度）。
 * 前端只做「提前告知」和「按钮态」，**不做拦截判定** ——
 * 真实限额永远以后端为准（客户端可被绕过，且多端登录时本地计数会不准）。
 * 拿不到额度就不显示提示、也不禁用按钮：宁可少提示，
 * 不能因为一次查询失败就让用户无法开始面试。 */
const quota = ref(null)
const quotaExhausted = computed(() => !!(quota.value && quota.value.limit && quota.value.remaining <= 0))
const loadQuota = async () => {
  try {
    const q = await getDailyQuota()
    if (q && typeof q.remaining === 'number') quota.value = q
  } catch (e) { /* 静默：额度查不到不影响面试 */ }
}

/** 把后端给的重置时刻（ISO 串）格式化成北京时间「M月D日 HH:mm」 */
const formatResetTime = (iso) => {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    // 后端返回的是 UTC ISO，这里加 8 小时换算成北京时间再取字段
    const cst = new Date(d.getTime() + 8 * 3600 * 1000)
    const hh = String(cst.getUTCHours()).padStart(2, '0')
    const mm = String(cst.getUTCMinutes()).padStart(2, '0')
    return `${cst.getUTCMonth() + 1}月${cst.getUTCDate()}日 ${hh}:${mm}`
  } catch (e) { return '' }
}

const changeRounds = (delta) => {
  const next = form.value.total_rounds + delta
  if (next >= 3 && next <= 15) form.value.total_rounds = next
}

const toggleAnswerMode = (e) => {
  const on = !!e.detail.value
  if (on && !voiceAvailable.value) {
    uni.showToast({ title: '语音能力未就绪，请先用文字作答', icon: 'none' })
    return
  }
  form.value.answer_mode = on ? 'voice' : 'text'
}

const onTimerSwitch = (e) => {
  form.value.timer_enabled = !!e.detail.value
}

const toggleExpand = () => {
  expanded.value = !expanded.value
}

const pickPosition = (pos) => {
  form.value.position_name = pos.name
  form.value.position_id = pos._id || ''
  expanded.value = false
  /* v32：选中的确认反馈。
     原实现在同一 tick 里既写入岗位名、又把 expanded 置 false —— 整个目录面板瞬间
     消失，而"被点的那一格变黑"（.position-tile.active 的墨材质 + chipPop）
     **一次都没被人看见**。用户唯一能确认"选上了"的证据，是收起来之后
     选择器里那行字换了 —— 一次静默的文字替换。
     这里给那行字补一次短促的强调（0.24s 内收进基座刻度），把"换成了"讲清楚。
     用定时器而不是 CSS :key 重挂：小程序端 vdom 的 key 行为跨基础库不一致，
     定时器行为可预期，且卸载时统一清理。 */
  pulsePicked()
}

/* 岗位名强调脉冲：加类 → 一个动效周期后移除（类留着会让下次选同一岗位不再触发）。
   两条定时器串成一条链：先让类**一定被摘掉**（同一 tick 内反复加同一个类不会重播，
   Vue 会合并），下一帧再加回去，动效才每次都从 0 开始。 */
const positionJustPicked = ref(false)
let pickedTimer = null
const pulsePicked = () => {
  positionJustPicked.value = false
  if (pickedTimer) clearTimeout(pickedTimer)
  pickedTimer = setTimeout(() => {
    positionJustPicked.value = true
    pickedTimer = setTimeout(() => { positionJustPicked.value = false }, 380)
  }, 20)
}

const startInterview = async () => {
  if (!canStart.value) {
    uni.showToast({ title: '请选择目标岗位', icon: 'none' })
    return
  }
  // 登录前置：主动退出过的用户走到这里必然 401，与其让用户等 15s 超时后
  // 看到「创建面试失败」（文案还误导），不如当场给出登录引导
  const userStore = useUserStore()
  if (!userStore.isLoggedIn) {
    /* 这一处本来就有「请先登录」弹窗，直接把它当作合规告知载体，
       避免连弹两个 modal。文案与全站 LOGIN_CONSENT_TEXT 保持一致：
       明确只使用 openid、不取昵称/头像/手机号。 */
    uni.showModal({
      title: '登录说明',
      content: '登录后会使用你的微信身份标识（openid）创建账号，用于保存面试记录与评分报告。\n\n我们不会获取你的微信昵称、头像、手机号。完整说明见「我的 → 设置 → 隐私政策」。',
      confirmText: '同意并登录',
      cancelText: '暂不登录',
      success: (r) => {
        if (!r.confirm) return
        uni.showLoading({ title: '登录中...', mask: true })
        userStore.wxLogin(true)
          .then(() => { startInterview() })
          .catch(() => uni.showToast({ title: '登录失败，请重试', icon: 'none' }))
          .finally(() => uni.hideLoading())
      },
      fail: () => {}
    })
    return
  }
  // 防重复点击：AI 生成首题较慢，连点会创建出多场面试、浪费额度也污染历史列表
  if (starting.value) return

  /* 额度耗尽：不发注定失败的请求，直接给出明确的恢复时间。
     后端也会拦（429），这里只是让用户少等一次网络往返、早点知道原因。 */
  if (quotaExhausted.value) {
    const resetTip = quota.value?.reset_at
      ? `明天 0 点（${formatResetTime(quota.value.reset_at)}）自动恢复。`
      : '明天 0 点自动恢复。'
    uni.showModal({
      title: '今日次数已用完',
      content: `每人每天最多 ${quota.value.limit} 场模拟面试，${resetTip}\n\n本功能完全免费，限额只为保证大家都能稳定使用。`,
      confirmText: '知道了',
      showCancel: false
    })
    return
  }

  starting.value = true

  try {
    const payload = { ...form.value }

    // 若来自"自定义题目"，携带题目进入面试。
    // 注意：只读不删——创建成功后才清，创建失败（网络/超时）时保留题组便于重试，避免用户重填
    let usedCustomQuestions = false
    const custom = uni.getStorageSync('current_custom_questions')
    if (custom) {
      try {
        const item = typeof custom === 'string' ? JSON.parse(custom) : custom        // 后端期望 string[]，自定义题页存的是 { position_name, questions: [] }，这里只取数组
        if (Array.isArray(item?.questions) && item.questions.length > 0) {
          payload.custom_questions = item.questions
          payload.position_name = item.position_name || payload.position_name
          usedCustomQuestions = true
        }
      } catch (e) { /* 忽略解析异常 */ }
    }

    // 记录本次所用音色：服务端恢复会话（resumeFromServer）重建的 config 不含 tts_voice，
    // 面试页回退到这份 storage，保证恢复的会话也用用户选的音色
    uni.setStorageSync('lastTtsVoice', form.value.tts_voice)
    await interviewStore.startInterview(payload)
    /* v31（P1）：startInterview 会同步生成首题（AI 最长 60s），期间用户完全可能
       点返回离开本页。若不判存活，续体会在**用户已经到达的页面**上执行
       uni.redirectTo —— 表现为「我退出来了，几十秒后它自己跳进面试页」。
       这里提前退出；面试已在服务端创建，用户可从首页「继续面试」回到它。 */
    if (destroyed) return
    // 创建成功：本次题组已随面试提交，清掉本地暂存
    if (usedCustomQuestions) uni.removeStorageSync('current_custom_questions')
    // 语音不可用时强制回落文字模式，避免进入面试页后是语音盘却用不了
    interviewStore.answerMode = voiceAvailable.value ? payload.answer_mode : 'text'
    uni.redirectTo({ url: '/pages/interview/index' })
    // 成功路径不关遮罩：页面随 redirectTo 销毁，遮罩自动消失。
    // 若在这里 starting=false，跳转动画期间会露出配置页 → 闪烁。
  } catch (e) {
    if (destroyed) return
    starting.value = false
    uni.showToast({ title: e?.message || '创建面试失败，请重试', icon: 'none' })
  }
}

const reloadPositions = async () => {
  try {
    const res = await getPositions({})
    positions.value = res || []
    const cats = Array.from(new Set((res || []).map(p => p.category).filter(Boolean)))
    categories.value = cats.length ? ['全部', ...cats] : FALLBACK_CATEGORIES
    loadError.value = false
  } catch (e) {
    // 接口失败：分类仍有完整兜底，岗位重试按钮继续可点
    categories.value = FALLBACK_CATEGORIES
    loadError.value = true
    uni.showToast({ title: '加载失败，请检查网络', icon: 'none' })
  }
}

/* 从「岗位库」页选完岗位后回传（用事件总线，不再直接改上一页实例的 $vm）。
 * ⚠️ 必须回一个 consumed 确认：岗位库有三个入口（首页「岗位库 ›」/ 我的 → 岗位库 /
 * 本页展开选择器），只有本页是监听者。岗位库靠这个确认判断「有没有人接」，
 * 没人接时就把选中的岗位带参跳到本页（否则首页/我的那两个入口点选后毫无反应，见 P1）。 */
const onPositionSelected = (payload) => {
  if (!payload) return
  form.value.position_name = payload.name || ''
  form.value.position_id = payload.id || ''
  expanded.value = false
  // 同步回确认：告诉岗位库「本页接住了，按原契约 navigateBack 即可」
  if (uni.$emit) uni.$emit('positionSelected:consumed')
}

// AI Skill 等外部入口带参直达（如 ?position_name=Java开发&difficulty=hard&total_rounds=5）：
// 旧实现只读 storage（quick_position），URL 参数全部丢弃，跳转后表单仍是空的
onLoad((options = {}) => {
  if (options.position_name) form.value.position_name = decodeURIComponent(options.position_name)
  if (options.interview_type && interviewTypes.some(t => t.value === options.interview_type)) {
    form.value.interview_type = options.interview_type
  }
  if (['easy', 'medium', 'hard'].includes(options.difficulty)) form.value.difficulty = options.difficulty
  const rounds = Number(options.total_rounds)
  if (rounds >= 3 && rounds <= 15) form.value.total_rounds = rounds
  /* 记录「URL 是否显式指定了岗位」：下面 onMounted 读 storage 时不能覆盖它。
     （P1 修复）旧实现里 onLoad 先跑、onMounted 后跑且**无条件赋值**，
     于是 `?position_name=Java开发` 这种 AI Skill / 分享入口的显式意图，
     会被上一次遗留的 current_custom_questions 静默改写成别的岗位；
     若该对象缺 position_name，`|| ''` 还会把岗位名清成空（显示"请选择岗位"）。
     而 current_custom_questions 只在 startInterview 成功后才清（失败时按注释是**故意保留**的），
     所以"创建失败过一次"就会让后续所有带参入口串岗。 */
  hasUrlPosition.value = !!options.position_name
})

onMounted(async () => {
  // 语音回答（按住说话）已改为「原生录音 + 服务端 ASR」，不再依赖微信同声传译插件
  // （该插件仅对企业主体开放，个人主体添加被拒），微信端恒可用
  // #ifdef MP-WEIXIN
  voiceAvailable.value = true
  // #endif

  uni.$on('positionSelected', onPositionSelected)

  // v31：拉今日额度（并行，不阻塞页面渲染）—— 用户能提前看到还剩几场
  loadQuota()
  /* 调试入口：让自动化脚本能在模拟器里真实触发「服务繁忙」弹窗，用于核对文案排版。
     ⚠️ 安全性说明：这是 `uni.$on` 事件监听，**只能由小程序内部代码 emit 触发**，
     外部（用户、网络、其他小程序）无法调用 —— 不构成攻击面。
     且它只弹一个提示框，没有任何副作用。因此无需条件编译，
     保留它可让后续维护者随时用 `uni.$emit('debug:overload', 'tts')` 复核文案。 */
  uni.$on('debug:overload', (scene) => showOverloadNotice({ scene: scene || 'asr', force: true }))

  // 支持从"自定义题目"页直接带入岗位名称。
  // 但**不能覆盖 URL 显式指定的岗位**（URL 优先级最高：代表用户此刻的明确意图，
  // 而 storage 可能是上次创建失败遗留的旧值，见 onLoad 里的说明）。
  const custom = uni.getStorageSync('current_custom_questions')
  if (custom && !hasUrlPosition.value) {
    try {
      const item = typeof custom === 'string' ? JSON.parse(custom) : custom
      // 只在确实取到非空岗位名时赋值，避免用空串把已有选择抹掉
      const name = item?.position_name
      if (name) form.value.position_name = name
    } catch (e) { /* 解析失败时忽略，用户可手动选择 */ }
  }

  try {
    const res = await getPositions({})
    positions.value = res || []
    const cats = Array.from(new Set((res || []).map(p => p.category).filter(Boolean)))
    categories.value = cats.length ? ['全部', ...cats] : FALLBACK_CATEGORIES
    loadError.value = false
  } catch (e) {
    loadError.value = true
    categories.value = FALLBACK_CATEGORIES
  }

  // 首页「热门岗位」直达：自动选中并展开，少一步「重新选岗」
  const quick = uni.getStorageSync('quick_position')
  if (quick) {
    try {
      const item = typeof quick === 'string' ? JSON.parse(quick) : quick
      if (item?.name) {
        form.value.position_name = item.name
        form.value.position_id = item.id || ''
        // 尝试把分类也切到该岗位对应分类，让列表聚焦
        const p = positions.value.find(x => x._id === item.id || x.name === item.name)
        if (p?.category) activeCategory.value = p.category
      }
    } catch (e) { /* 解析失败忽略 */ }
    uni.removeStorageSync('quick_position')
  }
})

/* 页面销毁标记（v31）：startInterview 会同步生成首题（AI 最长 60s），
   期间用户可能返回离开；续体必须知道自己已经不在页面上（见 handleStart 的说明）。 */
let destroyed = false

onUnmounted(() => {
  destroyed = true
  // 必须解绑：页面销毁后仍监听会在下次进入时重复触发
  uni.$off('positionSelected', onPositionSelected)
  // 选岗脉冲的定时器同理：页面已销毁还回调会写一个不再存在的 ref
  if (pickedTimer) { clearTimeout(pickedTimer); pickedTimer = null }
})

/* ⚠️ 2026-10-12 修复「次日额度不刷新」：
 * 面试配置页是 tab 流程里的普通页面，但小程序**页面实例会常驻**——
 * 用户昨天进过本页，实例留在内存中；今天从首页再进来时，若走的是原有实例，
 * onMounted **不会重跑**，于是 quota 永远是昨天那份："今天还剩 9/10 场" 一直不变。
 * 额度是**按天**变的东西（北京时间 0 点重置），必须在每次页面可见时重新拉取。
 * onShow 在「首次挂载」和「每次从后台/其他页返回」都会触发，正是需要的时机。
 * （onLoad 只触发一次，同样不够；onMounted 与 onShow 首次重复调用 loadQuota
 *   无害——同一份数据、幂等，且两次之间用户可能已用掉场次。） */
onShow(() => {
  loadQuota()
})
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 面试配置 · 纸本朱砂（v34）
 * ============================================================================
 * 立意：这是「开始一场面试前填的表」，所以整屏要像**一张正在被填写的评估表**，
 * 而不是又一个设置页。
 *
 * 三条版式判断：
 *   ① 每个配置项 = 朱砂等宽序号（01…07）+ 项目名 + 延伸发丝线。
 *      序号不是装饰，是"第几栏"——和首页区块、报告分组同一套刻度。
 *   ② 选项一律「凹槽/白卡 + 1rpx 发丝线」，不用重阴影；选中态唯一写法是**墨底白字**。
 *      纸本不用朱砂做选中（朱砂只留给"盖章"：必选标记、难度选中的方印、额度耗尽）。
 *   ③ 难度不并排三张等重卡，改**纵向单选行**：未选是白纸描边，选中整行变墨。
 *      这样"我选了哪档"一眼可读，三档之间也有了层级，而不是三颗同权按键。
 * ========================================================================== */
.page {
  padding: 16rpx $page-padding calc(232rpx + env(safe-area-inset-bottom));
  background: $paper;
  min-height: 100vh;
  box-sizing: border-box;
}
.page::before { display: none; }

/* ===== 页头：等宽眉标 + 大标题 + 一句说明 =====
 * 眉标是英文等宽朱砂（INTERVIEW SETUP），与首页/历史页/报告页同语言。 */
.pg-head {
  padding: 24rpx 0 30rpx;
}
.pg-kicker {
  display: block;
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.8rpx;
  margin-bottom: 12rpx;
}
.pg-title {
  display: block;
  font-family: $font-display;
  font-size: 54rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -1.8rpx;
  line-height: 1.1;
}
.pg-sub {
  display: block;
  margin-top: 12rpx;
  font-size: 23rpx;
  color: $text-3;
  font-weight: $weight-regular;
  line-height: 1.5;
}

/* ===== 表单项：发丝线上分隔，逐栏读数 ===== */
.cfg-section {
  padding: 30rpx 0 34rpx;
  border-top: 1rpx solid $rule;
}
/* 页头之后的第一栏不再叠一条线（否则标题下会出现双线） */
.pg-head + .cfg-section {
  border-top: none;
  padding-top: 4rpx;
}

.cfg-head {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 20rpx;
}
.cfg-head-inline {
  display: flex;
  align-items: center;
  gap: 14rpx;
  flex: 1;
  min-width: 0;
}
/* 栏目序号：朱砂等宽两位（本设计系统的"盖章"位之一） */
.cfg-no { @include mono-index; }
.cfg-label {
  /* 区块标题的唯一配方（uni.scss @mixin sec-heading），不另写字号档 */
  @include sec-heading;
  flex-shrink: 0;
}
/* 延伸发丝线：把「序号 + 项目名」和右侧内容连成同一条基线 */
.cfg-rule {
  flex: 1;
  height: 1rpx;
  background: $rule;
  margin-left: 6rpx;
  min-width: 20rpx;
}
/* 必选标记：未选岗位时才出现，是朱砂描边小方标（属性印章语义） */
.cfg-tag {
  flex-shrink: 0;
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  border: 1rpx solid $verm-line;
  border-radius: $radius-xs;
  padding: 3rpx 10rpx;
  letter-spacing: 0.6rpx;
}
/* 开关/触发行：标题在左，控件在右 */
.cfg-toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
}
.form-hint {
  display: block;
  font-size: 22rpx;
  color: $text-3;
  margin-top: 14rpx;
  line-height: 1.55;
}

/* ===== 01 面试类型：凹槽方格，选中墨底白字 ===== */
.type-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}
.type-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 150rpx;
  padding: 18rpx 26rpx;
  border-radius: $radius-md;
  background: $paper-sunken;
  border: 1rpx solid transparent;
  transition: background-color $motion-base $ease-out, color $motion-base $ease-out,
              border-color $motion-base $ease-out;
}
.type-tile-text {
  font-size: 27rpx;
  font-weight: $weight-medium;
  color: $text-2;
  line-height: 1.2;
  transition: color $motion-base $ease-out;
}
.type-tile.active {
  background: $ink;
  border-color: $ink;
}
.type-tile.active .type-tile-text {
  color: #FFFFFF;
  font-weight: $weight-bold;
}
/* 按压并入全局刻度（hover-class="tab-press"） */
.tab-press { opacity: $press-opacity; transform: scale($press-scale); }

/* ===== 02 目标岗位：凹槽字段（表单输入的语言，不是下拉胶囊） ===== */
.position-selector {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
  padding: 0 26rpx;
  height: 104rpx;
  border-radius: $radius-md;
  background: $paper-sunken;
  border: 1rpx solid transparent;
  box-sizing: border-box;
  transition: background-color $motion-fast $ease-out, opacity $motion-fast $ease-out,
              transform $motion-fast $ease-out, border-color $motion-fast $ease-out;
}
/* 已选岗位：字段底换成白卡 + 发丝线（"这一栏已经填好了"）。
   ⚠️ 不用 :has() —— 小程序的 WXSS 选择器不支持它，真机会整条失效；
   由模板上的 is-filled 类（读同一个 form.position_name）驱动。 */
.position-selector.is-filled {
  background: $paper-card;
  border-color: $rule;
}
.position-text {
  flex: 1;
  min-width: 0;
  font-size: 31rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  letter-spacing: -0.4rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.position-text.placeholder {
  color: $text-4;
  font-weight: $weight-regular;
}
/* v32：选中岗位后的确认强调（"那行字换了"的落点，不是装饰性弹跳） */
.position-text.just-picked {
  animation: pickedIn $motion-base $ease-out both;
}
@keyframes pickedIn {
  from { opacity: 0.3; transform: translateY(6rpx); }
  to   { opacity: 1;   transform: none; }
}
/* 展开箭头（岗位选择器）。
   v28：由文字字符 › + rotate(90deg) 改为 morph-icon，尺寸不再由 font-size 决定，
   而是 width/height —— 17rpx 是"字符墨迹等高"的实测标定值。 */
.arrow {
  width: 17rpx;
  height: 17rpx;
  flex-shrink: 0;
}

/* 展开面板：用一条发丝线把它与"字段"分开，不用描边盒子套盒子 */
.position-expanded {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid $rule;
  animation: fadeIn $motion-fast $ease-out both;
}
/* 分类分段控件：与全局 .seg-bar 同语言（凹槽底条 + 浮起白块） */
.cat-tabs-wrap {
  margin-bottom: 22rpx;
  background: $paper-sunken;
  border-radius: $radius-sm;
  padding: 5rpx;
}
.cat-tabs {
  white-space: nowrap;
  width: 100%;
  box-sizing: border-box;
}
.cat-tabs-inner {
  display: inline-flex;
  padding-right: 8rpx;
  gap: 4rpx;
}
.cat-tab {
  display: inline-block;
  padding: 13rpx 30rpx;
  border-radius: $radius-xs;
  background: transparent;
  font-size: $font-sm;
  color: $text-3;
  transition: background-color $motion-base $ease-out, color $motion-base $ease-out;
}
.cat-tab.active {
  background: $paper-card;
  color: $ink;
  font-weight: $weight-bold;
  box-shadow: 0 1rpx 3rpx rgba(23, 19, 14, 0.08);
}

/* 分组微表头：标签 + 规则线 + mono 计数 */
.grid-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 18rpx;
}
.grid-label {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  letter-spacing: 1rpx;
}
.grid-rule {
  flex: 1;
  height: 1rpx;
  background: $rule;
}
.grid-count {
  flex-shrink: 0;
  font-family: $font-mono;
  font-size: 22rpx;
  font-weight: $weight-bold;
  color: $text-3;
  font-variant-numeric: tabular-nums;
}

/* 岗位方格：等宽锁定两列，排成规整阵列 */
.position-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}
.position-tile {
  flex: 0 0 calc((100% - 14rpx) / 2);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  min-height: 96rpx;
  padding: 14rpx 20rpx;
  border-radius: $radius-md;
  background: $paper-card;
  border: 1rpx solid $rule;
  animation: tileIn $motion-base $ease-out backwards;
  transition: background-color $motion-base $ease-out, border-color $motion-base $ease-out,
              opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
@keyframes tileIn {
  from { opacity: 0; transform: translateY(10rpx); }
  to   { opacity: 1; transform: translateY(0); }
}
.tile-name {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  line-height: 1.25;
}
.tile-press {
  opacity: $press-opacity;
  transform: scale($press-scale);
}
/* 选中 = 墨材质唯一配方（$ink-gradient 三件套），不另造黑 */
.position-tile.active {
  background: $ink-gradient;
  border-color: transparent;
  box-shadow: $ink-edge;
}
.position-tile.active .tile-name { color: #FFFFFF; }

.empty-cat {
  font-size: 24rpx;
  color: $text-3;
  padding: 24rpx 0;
}
.reload-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid $rule;
}
.reload-text {
  font-size: 24rpx;
  color: $text-3;
}
.reload-btn {
  font-size: 24rpx;
  color: $verm;
  font-weight: $weight-bold;
  padding: 4rpx 16rpx;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}

/* ===== 03 难度：纵向单选行（本题"有明显层级的选择"）=====
 * 未选：白纸 + 发丝描边 + 空方印框；选中：整行墨 + 朱砂方印。
 * 落章位置固定在最右，切换时读者能看着"章从这行移到那行"。 */
.diff-group {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.diff-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 26rpx;
  border-radius: $radius-md;
  /* 未选：浅凹槽底、透明描边（与 01 面试类型同一套"选项组"语言）；
     选中：换成墨材质。凹槽 → 墨，是纸本里"把这一项盖掉"的对比。 */
  background: $paper-sunken;
  border: 1rpx solid transparent;
  transition: background-color $motion-base $ease-out, border-color $motion-base $ease-out;
}
.diff-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}
.diff-label {
  font-size: 30rpx;
  font-weight: $weight-bold;
  color: $text-1;
  letter-spacing: -0.3rpx;
  flex-shrink: 0;
  transition: color $motion-base $ease-out;
}
.diff-desc {
  font-size: 22rpx;
  color: $text-3;
  transition: color $motion-base $ease-out;
}
/* 空印框：未选中时是虚线方框，选中后变成朱砂实心小方印 */
.diff-mark {
  width: 26rpx;
  height: 26rpx;
  border-radius: $radius-xs;
  border: 1rpx dashed $rule-strong;
  flex-shrink: 0;
  transition: background-color $motion-base $ease-out, border-color $motion-base $ease-out;
}
.diff-row.active {
  background: $ink-gradient;
  border-color: transparent;
  box-shadow: $ink-edge;
}
.diff-row.active .diff-label { color: #FFFFFF; }
.diff-row.active .diff-desc { color: $on-ink-2; }
.diff-row.active .diff-mark {
  background: $verm;
  border: 1rpx solid $verm;
}

/* v35：难度语义色（新增）。
   难度是一个**有序**的选择（简单 < 中等 < 困难），v34 三档选中后都是同一个朱砂，
   看不出"我选的是哪一档、这一档有多重"。用等级色阶的左边缘轨道表达序：
     简单 = 墨青($grade-b)：友好、无压力
     中等 = 鎏金($grade-s)：需要认真对待
     困难 = 朱砂($grade-a)：压力挑战
   这是把"等级色阶"复用为"强度色阶"，同一套视觉语义，不引入新色。 */
.diff-row {
  position: relative;
  overflow: hidden;
}
.diff-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 5rpx;
  height: 0;
  border-radius: 0 2rpx 2rpx 0;
  transition: height $motion-base $ease-out;
}
.diff-row.lv-easy::before { background: $grade-b; }
.diff-row.lv-medium::before { background: $grade-s; }
.diff-row.lv-hard::before { background: $grade-a; }
.diff-row.active::before { height: 56rpx; }
/* 选中态的小方印也按难度取色（与左轨道呼应，双处确认） */
.diff-row.active.lv-easy .diff-mark { background: $grade-b; border-color: $grade-b; }
.diff-row.active.lv-medium .diff-mark { background: $grade-s; border-color: $grade-s; }
.diff-row.active.lv-hard .diff-mark { background: $grade-a; border-color: $grade-a; }

/* ===== 04 面试官音色：凹槽触发行 + 内联展开 ===== */
.voice-picker {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 22rpx;
  background: $paper-sunken;
  border-radius: $radius-sm;
  flex-shrink: 0;
  transition: background-color $motion-fast $ease-out, opacity $motion-fast $ease-out,
              transform $motion-fast $ease-out;
}
.voice-current {
  font-size: 25rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  line-height: 1.2;
}
/* 箭头随展开状态翻转，是「这一块正开着」的视觉确认。 */
.voice-arrow {
  width: 14rpx;
  height: 14rpx;
  flex-shrink: 0;
}
/* 内联选项列表：白卡 + 发丝线分隔（列表语言，不是"又一张深卡"） */
.voice-list {
  margin-top: 20rpx;
  background: $paper-card;
  border: 1rpx solid $rule;
  border-radius: $radius-md;
  overflow: hidden;
  animation: fadeUp $motion-fast $ease-out both;
}
.voice-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 26rpx;
  border-bottom: 1rpx solid $rule;
  transition: background-color $motion-fast $ease-out;
}
.voice-row:last-child { border-bottom: none; }
.voice-row-press { background: $paper-sunken; }
.voice-row-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.voice-row-label {
  font-size: 28rpx;
  font-weight: $weight-semibold;
  color: $text-1;
}
.voice-row.selected .voice-row-label {
  font-weight: $weight-heavy;
  color: $ink;
}
.voice-row-trait {
  font-size: 22rpx;
  color: $text-3;
  margin-top: 4rpx;
}
/* 选中标记：朱砂实心方印（"这一条被盖章选中"），不用圆点 */
.voice-check {
  width: 18rpx;
  height: 18rpx;
  border-radius: $radius-xs;
  background: $verm;
  flex-shrink: 0;
}

/* ===== 05 面试轮次：步进器 ===== */
.stepper {
  display: flex;
  align-items: center;
  gap: 6rpx;
  flex-shrink: 0;
}
.step-btn {
  position: relative;
  width: 64rpx;
  height: 64rpx;
  border-radius: $radius-sm;
  background: $paper-sunken;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out,
              background-color $motion-fast $ease-out;
  /* 热区 64→88rpx(32pt→44pt)，圆钮仍是 64rpx（每次点都改变题目数量，偏难点不中） */
  &::after {
    content: '';
    position: absolute;
    top: -12rpx;
    bottom: -12rpx;
    left: -4rpx;
    right: -4rpx;
  }
}
/* 全宽字符 −／＋ 替代裸 -/+：字模在方钮内视觉居中 */
.step-btn-glyph {
  font-size: 32rpx;
  color: $text-1;
  font-weight: $weight-semibold;
  line-height: 1;
  transition: color $motion-fast $ease-out;
}
/* 轮次是仪器读数：等宽 + tabular-nums，加减时数字宽度不抖 */
.step-value {
  @include readout(48rpx);
  min-width: 96rpx;
  text-align: center;
  color: $text-1;
  font-weight: $weight-heavy;
}
/* 到达边界（3 / 15 轮）时按钮变灰，与全局 .btn-primary.disabled 同一语言 */
.step-btn.disabled {
  background: #E8E2D8;
  opacity: 1;
}
.step-btn.disabled .step-btn-glyph { color: $text-3; }

/* ===== 底部行动区 =====
 * 固定底栏：实色纸面 + 顶部发丝线（小程序 backdrop-filter 不稳，不用毛玻璃）。 */
.footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 18rpx $page-padding calc(26rpx + env(safe-area-inset-bottom));
  background: $paper;
  border-top: 1rpx solid $rule;
  z-index: 10;
  box-sizing: border-box;
}
.foot-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 14rpx;
}
/* 预计用时：等宽读数 + 小号单位（读数带语言，不居中飘着） */
.estimate {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
  flex-shrink: 0;
}
.estimate-label {
  font-size: 22rpx;
  color: $text-3;
  font-weight: $weight-medium;
  margin-right: 2rpx;
}
.estimate-num {
  @include readout(30rpx);
  font-weight: $weight-heavy;
  color: $text-1;
}
.estimate-unit {
  font-size: 21rpx;
  color: $text-3;
  font-weight: $weight-medium;
}
/* 今日额度：辅助信息，字号更小、更淡 —— 不能比主操作抢眼。
   额度用尽时转朱砂，因为那一刻它变成了用户必须知道的原因。 */
.quota-hint {
  font-size: 21rpx;
  color: $text-3;
  text-align: right;
  line-height: 1.4;
  flex: 1;
  min-width: 0;
}
.quota-hint.empty {
  color: $verm;
  font-weight: $weight-semibold;
}

/* 开始按钮：墨材质（渐变 + 内亮边 + 接地投影三件套），高度对齐基座按钮刻度 */
.start-btn {
  position: relative;
  overflow: hidden;
  height: 104rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
  background: $ink-gradient;
  box-shadow: $ink-edge, 0 16rpx 40rpx rgba(23, 19, 14, 0.28);
  color: #FFFFFF;
  border-radius: $radius-btn;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out,
              box-shadow $motion-fast $ease-out;
}
.start-btn-text {
  font-size: 31rpx;
  font-weight: $weight-bold;
  letter-spacing: 0.5rpx;
  position: relative;
  z-index: 2;
}
/* 墨按钮内的白色箭头圆点：与首页 Hero CTA 完全同形 */
.start-btn-arrow {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  box-shadow: inset 0 0 0 1rpx rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
  transition: transform $motion-fast $ease-out;
}
/* hover-class 把 .hover-press 加在按钮自身，故用同元素双类作前缀 */
.hover-press .start-btn-arrow,
.start-btn.hover-press .start-btn-arrow { transform: translateX(4rpx); }
.start-btn-arrow-icon { width: 22rpx; height: 22rpx; transform: rotate(45deg); }

/* 扫描光：斜向高光 6 秒一轮缓慢巡游，与首页 Hero 同源。
   按钮禁用时不扫（不可用时不应有"活着"的暗示）。 */
.start-btn-sheen {
  position: absolute;
  top: -80%;
  left: -20%;
  width: 120rpx;
  height: 260%;
  background: linear-gradient(90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.10) 45%,
    rgba(255, 255, 255, 0.16) 50%,
    rgba(255, 255, 255, 0.10) 55%,
    rgba(255, 255, 255, 0) 100%);
  transform: rotate(20deg) translateX(-80rpx);
  animation: btnSheen 6s $ease-out infinite;
  pointer-events: none;
  z-index: 1;
}
@keyframes btnSheen {
  0% { transform: rotate(20deg) translateX(-80rpx); }
  55%, 100% { transform: rotate(20deg) translateX(760rpx); }
}

/* 禁用态：浅填充底 + 辅助灰字（读作"还没准备好"，而不是"界面坏了"） */
.start-btn.disabled {
  background: #E8E2D8;
  box-shadow: none;
  color: $text-3;
  opacity: 1;
}
.start-btn.disabled .start-btn-sheen { display: none; }
.start-btn.disabled .start-btn-arrow {
  background: rgba(23, 19, 14, 0.06);
  box-shadow: inset 0 0 0 1rpx rgba(23, 19, 14, 0.10);
}
/* 禁用态箭头是白色图标，压在浅底上会"消失"——压暗到不可读以下反而更糊，
   保持原样即可（视觉上按钮整体已是浅灰块，读者不会去找图标）。 */
</style>
