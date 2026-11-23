<template>
  <view class="page">
    <!-- 页头：等宽眉标 + 大标题 + 目标岗位/玩法说明 -->
    <view class="pg-head">
      <text class="pg-kicker">QUICK PRACTICE</text>
      <text class="pg-title">快速练习</text>
      <text class="pg-meta" v-if="positionName">目标岗位 · {{ positionName }}</text>
      <text class="pg-meta" v-else>单题模式 · AI 即时点评</text>
    </view>

    <!-- 未登录：给明确的登录引导，而不是让请求去打 401 报错（2026-10-12）
         此前本页**完全没有登录判断**：未登录进来直接请求出题接口 → 401 →
         落到「题目没拿到 / 可能是网络波动」的错误态。用户看到的是"报错"，
         但真实原因只是没登录 —— 文案在说谎，且没给出正确出口。
         现在按全站既有做法（stats/index.vue、index/index.vue 同款）：
         显式登录引导 + 微信一键登录按钮。 -->
    <view v-if="needLogin && !userStore.isLoggedIn" class="login-guide">
      <image class="lg-mascot" src="/static/ip_mianba_smile.png" mode="aspectFit" />
      <text class="lg-title">登录后即可开始练习</text>
      <text class="lg-sub">快速练习需要登录才能出题与保存点评记录</text>
      <view class="lg-btn" hover-class="hover-press" @click="onLogin">微信一键登录</view>
    </view>

    <template v-else>
    <!-- 题目卡：墨色面板（$ink-gradient 三件套）—— 全页唯一的深色实体，
         题目是这一屏的焦点，必须与"纸"拉开材质差。
         材质与首页 hero / 报告总分卡同源，是同一个"压在纸上的板"。 -->
    <!-- v32：换题时补一次入场（见 questionFresh）。
         原实现换题是纯文字替换：旧题消失、新题出现，中间零过渡。
         ⚠️ 没有用 :key 强制重挂 —— 小程序端 vdom 的 key 行为跨基础库不一致，
         且换题期间卡片本就不该卸载（否则题目区会塌一下）。
         改用 ref 驱动的短类名，与配置页的选岗反馈同一套做法。 -->
    <view class="question-card" :class="{ 'question-card-enter': questionFresh }" v-if="question">
      <view class="q-head">
        <text class="q-label">{{ questionType || '面试题' }}</text>
        <view class="q-refresh" hover-class="hover-press" @click="loadQuestion">
          <text class="q-refresh-text">{{ questionLoading ? '换题中…' : '换一题' }}</text>
          <!-- v32：换题中不再摘掉图标，而是留着转 —— 原来「换题中…」那一行
               只剩文字，卡片上一个在动的线索都没有（见 style 里 .spinning 注释）。
               v-if 改为常驻 + 旋转类，视觉重量不变。 -->
          <image
            class="q-refresh-icon"
            :class="{ spinning: questionLoading }"
            :src="ICONS['rotate-ccw-white']"
            mode="aspectFit"
          />
        </view>
      </view>
      <!-- v32：换题期间旧题变淡。
           原实现里点「换一题」后，卡片上的题面**一动不动**（只有右上角小字变了），
           用户很容易以为没点上，或者把还亮着的旧题当成新题读。
           压到 0.45 是"这块内容正在被替换"的信号，与 .q-refresh 的文案同步。 -->
      <text class="q-content" :class="{ stale: questionLoading }">{{ question }}</text>
    </view>
    <view v-else-if="questionLoading" class="loading">正在出题…</view>
    <!-- 出题失败态（v24 新增）：原先只有「有题目」和「出题中」两个分支，
         而 loadQuestion 失败时只弹 toast、question 保持空串、questionLoading 变 false
         —— 两个分支都不成立，题目区整块消失（连同里面唯一的「换一题」按钮一起消失）。
         用户此时写答案点提交，会被拦下提示「暂无题目，请先获取题目」，
         让他去点一个界面上不存在的按钮。这里补第三个分支给出真实出口。
         用 questionFailed 显式判定，不用「否则即失败」——后者会让首帧闪烁。 -->
    <view v-else-if="questionFailed" class="question-error">
      <text class="qe-title">题目没拿到</text>
      <text class="qe-tip">可能是网络波动，也可能这个岗位暂时没有题</text>
      <view class="qe-btn" hover-class="hover-press" @click="loadQuestion">重新出题</view>
    </view>

    <!-- 作答区：纸本白卡 + 发丝线（与上方墨面板形成"纸/板"两层） -->
    <view class="answer-area">
      <view class="answer-head">
        <text class="answer-label">你的回答</text>
        <!-- 字数计数：等宽读数（0 / 2000 会随输入跳动，必须 tabular-nums） -->
        <text class="char-count">{{ answer.length }} / 2000</text>
      </view>
      <textarea
        v-model="answer"
        class="answer-input"
        placeholder="输入你的回答，或点击下方按钮语音作答…"
        placeholder-style="color: #C4BAAE"
        :maxlength="2000"
        auto-height
      />
      <view class="answer-tools" v-if="voiceAvailable">
        <!-- 识别结果直接追加进上面的作答框（本页作答框常驻，不需要额外预览层） -->
        <voice-button @result="onVoiceResult" @error="onVoiceError" />
      </view>
    </view>

    <view
      v-if="!result"
      class="submit-btn"
      :class="{ disabled: !answer.trim() || loading }"
      :hover-class="(!answer.trim() || loading) ? 'none' : 'hover-press'"
      @click="submit"
    >{{ loading ? '点评中…' : '获取 AI 点评' }}</view>

    <!-- 点评结果 -->
    <!-- v32：结果卡内的三个分区补错落入场（d1~d3）。
         原实现整卡只挂了一个 .anim-in —— 分数、点评、优点、建议、操作
         五块内容**同一帧整块淡入**，读者在它稳定之前抓不到"先看哪"。
         分数是这个页面的结论，应该第一个落定；优点/建议是支撑材料，跟随其后。
         延迟刻度直接复用全局 .anim-in.d1~d3（30/60/90ms），不另造数字。 -->
    <view class="result-card anim-in" v-if="result">
      <!-- 分数区（v35）：区分「真的评了分」与「AI 未能评分」。
           后端在 AI 不可用 / 返回无法解析时会回 score: null 且 fallback: true。
           旧版后端在这种情况下硬塞 60 分，前端照实显示 → 用户看到「确实」两个字
           被评 60 分，误以为模型评分能力有问题。现在如实显示「—」并说明原因。 -->
      <!-- 分数区（v35.3 第二十批）：分数染等级色 + 旁边盖一枚小段位章 ——
           这是全站签名元素，打分页反而是最后一个用上的。批注卷语言：
           分数是卷面成绩，下面 ✓/→ 是批注。 -->
      <view class="result-score anim-in d1" v-if="result.score !== null && result.score !== undefined">
        <text class="score-num" :class="'gscore-' + gradeKey">{{ result.score }}</text>
        <text class="score-label">分</text>
        <view class="score-stamp" :class="'gs-' + gradeKey">
          <text class="score-stamp-text">{{ gradeKey }}</text>
        </view>
      </view>
      <view class="result-score-unscored anim-in d1" v-else>
        <text class="unscored-mark">—</text>
        <text class="unscored-label">本次未能评分</text>
      </view>
      <text class="result-comment anim-in d1">{{ result.comment }}</text>

      <view class="result-section anim-in d2" v-if="result.strengths?.length">
        <view class="section-head">
          <text class="section-index">01</text>
          <text class="section-title">优点</text>
          <view class="section-line"></view>
        </view>
        <view class="section-list">
          <view class="section-item" v-for="(s, i) in result.strengths" :key="i">
            <text class="section-mark ok">✓</text>
            <text class="section-item-text">{{ s }}</text>
          </view>
        </view>
      </view>
      <view class="result-section anim-in d3" v-if="result.suggestions?.length">
        <view class="section-head">
          <text class="section-index">02</text>
          <text class="section-title">建议</text>
          <view class="section-line"></view>
        </view>
        <view class="section-list">
          <view class="section-item" v-for="(s, i) in result.suggestions" :key="i">
            <text class="section-mark tip">→</text>
            <text class="section-item-text">{{ s }}</text>
          </view>
        </view>
      </view>

      <view class="result-actions anim-in d3">
        <text class="action-link" hover-class="hover-press" @click="retrySame">重新点评</text>
        <!-- v28：尾部文字箭头 → 换成 chevron 图标（与全站同源，尺寸按墨迹等高标定） -->
        <view class="action-link primary" hover-class="hover-press" @click="nextQuestion">
          <text class="action-link-text">继续下一题</text>
          <image class="action-link-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
        </view>
        <view class="action-link" hover-class="hover-press" @click="goFullInterview">
          <text class="action-link-text">完整面试</text>
          <image class="action-link-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
        </view>
      </view>
    </view>

    <view class="ai-disclaimer" v-if="result">
      <text>AI 点评由大模型生成，仅供学习参考</text>
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ICONS } from '@/utils/svg-icons'
import { onLoad } from '@dcloudio/uni-app'
import VoiceButton from '@/components/voice-button/voice-button.vue'
import { quickAnswer, getPracticeQuestion } from '@/api/interview'
import { useUserStore } from '@/store/modules/user'
import { gradeForScore } from '@/utils/grades'
import LoginModal from '@/components/login-modal/login-modal.vue'

const userStore = useUserStore()

const question = ref('')
const questionType = ref('')
const positionName = ref('')
const answer = ref('')
const result = ref(null)
/* v35.3 第二十批：单题评分 → 等级（口径与全站一致 S90/A80/B70/C60），
 * 供分数染色与小段位章取 class。 */
const gradeKey = computed(() => gradeForScore(result.value?.score ?? null))
const loading = ref(false)
/* 出题中：初值 true（v24）。
   本页 onLoad 会立刻调 loadQuestion()，若初值为 false，首帧会命中「题目没拿到」的
   错误态闪一下再切到「正在出题…」——正是本轮在首页/统计页修掉的那类"假状态闪烁"。
   初值 true 让首帧直接是"出题中"，语义也正确：进页面本来就在出题。 */
const questionLoading = ref(true)
/* 出题失败标记：与 questionLoading 分开，避免"没在加载"被误读为"加载失败"。
   失败时展示错误态 + 重新出题出口。 */
const questionFailed = ref(false)
/* 出题请求 in-flight 标记（v30 P0 修复）：防重入必须用它，不能用 questionLoading。
   原因见 loadQuestion 顶部注释 —— questionLoading 初值 true 是 UI 语义，
   拿来当"是否正在请求"会把首次加载直接掐死。
   用普通变量而非 ref：它只控制流程，不参与渲染。 */
let loadInFlight = false
/* 页面存活标记：loadQuestion 的 await 续体在卸载后不该再写界面状态或启动
   换题入场定时器（markQuestionFresh 会起 freshTimer）。守卫
   check_async_lifecycle 也据此判定「卸载后劫持」风险。*/
let destroyed = false

/* 换题后的一次性入场类（v32）：
   原实现换题是纯文字替换 —— 新题直接"出现"，零过渡，整个动作读作闪了一下。
   这里让新题轻推一下（8rpx / 0.24s，收进基座刻度），只演一次就摘掉类，
   避免常驻导致后续任何重渲染都重放动画。
   用定时器而不是 :key 重挂：小程序端 key 行为跨基础库不一致，
   且换题期间卡片不该卸载（否则题目区塌一下）。 */
const questionFresh = ref(false)
let freshTimer = null
/* 首题是否已经落地过：用来区分"首屏加载"与"用户主动换题"。
   首屏有自己的入场语言，两套同时演会显得页面在抖。 */
let hasLoadedOnce = false
const markQuestionFresh = () => {
  questionFresh.value = false
  if (freshTimer) clearTimeout(freshTimer)
  freshTimer = setTimeout(() => {
    questionFresh.value = true
    freshTimer = setTimeout(() => { questionFresh.value = false }, 320)
  }, 20)
}

const voiceAvailable = ref(false)
/* 未登录引导（2026-10-12）：本页此前无登录判断，未登录进来直接请求 → 401 →
   显示"题目没拿到 / 可能是网络波动"，文案在说谎且没有正确出口。
   现在先判登录态：未登录就展示登录引导，不发任何需要鉴权的请求。 */
const needLogin = ref(false)

/* 登录：走全站统一的 <login-modal>（含协议勾选）。
   登录成功后重新出题，无需手动返回再进。 */
const loginVisible = ref(false)
const loginLoading = ref(false)
/* 上次微信签发的 openid 指纹，用于弹窗展示"真实微信登录"凭证 */
const wxFingerprint = ref('')
try { wxFingerprint.value = uni.getStorageSync('wx_identity_fp') || '' } catch (e) {}
const onLogin = () => {
  if (userStore.isLoggedIn) { needLogin.value = false; loadQuestion(); return }
  loginVisible.value = true
}
const onLoginConfirm = async () => {
  if (loginLoading.value) return
  loginLoading.value = true
  try {
    const res = await userStore.wxLogin(true)
    if (!res || !userStore.isLoggedIn) {
      uni.showToast({ title: '登录未完成，请重试', icon: 'none' })
      return
    }
    loginVisible.value = false
    needLogin.value = false
    await loadQuestion()
  } catch (e) {
    const msg = e?.message || e?.errMsg || ''
    uni.showToast({ title: msg && msg.length < 24 ? msg : '登录失败，请检查网络后重试', icon: 'none' })
  } finally {
    loginLoading.value = false
  }
}

const onVoiceError = (e) => {
  uni.showToast({ title: e?.errMsg || '语音识别不可用，请使用文字输入', icon: 'none' })
}

// 语音输入已改为「原生录音 + 服务端 ASR」，不再依赖微信同声传译插件
// （该插件仅对企业主体开放，个人主体添加被拒）
const initVoice = () => {
  // #ifdef MP-WEIXIN
  voiceAvailable.value = true
  // #endif
}

const loadQuestion = async () => {
  /* ⚠️ 防重入必须用**独立的 in-flight 标记**，不能用 questionLoading（v30 修复 P0）。
     原来的写法 `if (questionLoading.value) return` 与「初值 true」直接互锁：
       · questionLoading 初值是 true（为了让首帧显示"出题中"而非闪错误态，见上方注释）
       · onLoad 唯一调用点 loadQuestion() 一进来就命中 `if (questionLoading.value) return`
       · 于是 try/finally 从未执行，questionLoading 永远是 true
       · 模板三分支 question → questionLoading → questionFailed 卡在中间那个，
         永远显示「正在出题…」，而「换一题」「重新出题」两个出口分属另外两个分支，
         整块不渲染 → 用户零出路，快速练习 100% 不可用
         （三个入口 index.vue:407/478/493 都是无参跳转，question 恒为空，必现）
     现在：in-flight 用独立标记，questionLoading 只负责"界面显示什么"。 */
  if (loadInFlight) return
  loadInFlight = true
  try {
    /* ⚠️ 2026-10-12：未登录时不发请求。
       本页出题接口需要鉴权，未登录请求必然 401，然后落到 catch 显示
       "获取题目失败，请重试" —— 用户看到的是网络错误，真实原因却是没登录。
       先判登录态并展示引导，把"错误的报错"变成"正确的引导"。 */
    if (!userStore.isLoggedIn) {
      needLogin.value = true
      questionFailed.value = false
      return
    }
    needLogin.value = false
    questionLoading.value = true
    questionFailed.value = false
    const res = await getPracticeQuestion({
      position_name: positionName.value,
      question_type: questionType.value === '面试题' ? '' : questionType.value
    })
    // 请求回包时页面可能已卸载：不再写 ref、不再触发换题入场动画
    if (destroyed) return
    if (res?.question) {
      question.value = res.question
      questionType.value = res.question_type || ''
      /* v32：新题落地时轻推一次，把"换成了"讲清楚（见 markQuestionFresh 注释）。
         只在**换题成功**这条路径上调，首屏加载不调 —— 首屏有自己的入场语言，
         两套动画同时演会显得页面在抖。 */
      if (hasLoadedOnce) markQuestionFresh()
    } else {
      // 服务端返回空题（题库为空且 AI 未生成）：同样进错误态，给出「重新出题」出口
      questionFailed.value = true
      uni.showToast({ title: '暂无可用题目', icon: 'none' })
    }
  } catch (e) {
    if (destroyed) return
    questionFailed.value = true
    uni.showToast({ title: '获取题目失败，请重试', icon: 'none' })
  } finally {
    questionLoading.value = false
    loadInFlight = false
    hasLoadedOnce = true
  }
}

// 语音识别结果：追加进作答框（本页作答框常驻，识别完直接可改可发）
const onVoiceResult = (res) => {
  const text = (res && res.text) || ''
  if (!text.trim()) return
  answer.value = answer.value ? `${answer.value} ${text}` : text
}

const submit = async () => {
  /* 必须同时校验 question（P2 修复，2026-10-08）：
     loadQuestion 失败时只弹 toast、question 保持空串（见上方 catch），
     而旧守卫只看 answer —— 用户可以在「暂无可用题目」之后照样写答案并点「获取 AI 点评」，
     发一个 question: '' 的请求出去，换回一段无意义的点评（或服务端 400）。
     题目是点评的前提，没题目就不该让请求发出去。 */
  if (!question.value.trim()) {
    uni.showToast({ title: '题目未加载，请点上方「重新出题」', icon: 'none' })
    return
  }
  if (!answer.value.trim() || loading.value) return
  try {
    loading.value = true
    result.value = await quickAnswer({
      question: question.value,
      answer: answer.value,
      position_name: positionName.value
    })
    /* 答完刷新一次 stats（v24）：快速练习本身不落库（服务端 practiceController
       只调 AI、不写任何记录，见该文件注释——这是有意的轻量设计，不是缺陷），
       所以它不会改变连击/热力图。但刷新的意义在于：
         · 若本次恰好触发了勋章条件（例如此前已练够场次，本次是同一 onShow 周期的
           最后一击），勋章墙与「我的」页能立刻反映，不必等用户切页；
         · 保持与首页/统计页一致的数据新鲜度。
       失败静默：它只是加分项，任何异常都不能影响「已拿到点评」这个主结果。 */
    userStore.fetchStats().catch(() => {})
  } catch (e) {
    uni.showToast({ title: e?.message || '点评失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

// 同题重评：只清结果保留作答，用户改完答案再点底部按钮
const retrySame = () => { result.value = null }

const nextQuestion = async () => {
  result.value = null
  answer.value = ''
  await loadQuestion()
}

const goFullInterview = () => {
  const q = positionName.value ? `?position_name=${encodeURIComponent(positionName.value)}` : ''
  uni.navigateTo({ url: `/pages/interview-config/index${q}` })
}

onLoad((options = {}) => {
  if (options.question) question.value = decodeURIComponent(options.question)
  if (options.question_type) questionType.value = decodeURIComponent(options.question_type)
  if (options.position_name) positionName.value = decodeURIComponent(options.position_name)

  if (!question.value) loadQuestion()
})

onMounted(initVoice)

/* v32：卸载时清掉换题入场用的定时器。
   它是纯 UI 定时器（只摘一个类名），但页面销毁后仍回调会去写一个
   已经不属于任何视图的 ref —— 无害但没必要留着。 */
onUnmounted(() => {
  destroyed = true
  if (freshTimer) { clearTimeout(freshTimer); freshTimer = null }
})
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 快速练习 · 纸本朱砂（v34）
 * ============================================================================
 * 单题问答只有两个主角：**题目**与**回答**。
 * 版式判断：
 *   ① 题目卡走墨色面板（$ink-gradient + 双内亮边 + 接地投影三件套）——
 *      它是全页唯一的深色实体，与首页 hero / 报告总分卡同源，"纸上的板"。
 *   ② 作答区是纸本白卡 + 发丝线（纸 vs 板，两层材质差就是层次本身）。
 *   ③ 字数计数 0 / 2000 用等宽 + tabular-nums：输入时数字宽度不抖。
 *   ④ 结果卡不套深色（结论已经由题目卡承载深色），分数仍是等宽巨数字。
 * ========================================================================== */
.page {
  /* 底部留位 = 固定提交按钮的实占位（bottom 32rpx + 高 104rpx = 136rpx）+ 呼吸位 */
  padding: 24rpx $page-padding calc(176rpx + env(safe-area-inset-bottom));
  min-height: 100vh;
  background: $paper;
  box-sizing: border-box;
}
.page::before { display: none; }

/* ===== 页头 ===== */
.pg-head { padding: 24rpx 0 30rpx; }
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
  font-size: 56rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  line-height: 1.1;
  letter-spacing: -2rpx;
}
.pg-meta {
  display: block;
  margin-top: 12rpx;
  font-size: 23rpx;
  color: $text-3;
  font-weight: $weight-regular;
  line-height: 1.5;
}

/* ===== 未登录引导 =====
 * 复用全站语言：IP 吉祥物 + 标题/说明两级文案 + 墨材质主按钮。
 * 容器与 .question-error 同源（同圆角/同边距/同凹槽底），
 * 让"未登录"和"出题失败"在视觉上属于同一类"需要用户处理"的状态。 */
.login-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 560rpx;
  padding: 60rpx 40rpx;
  margin-bottom: 24rpx;
  border-radius: $radius-xl;
  background: $paper-sunken;
}
.lg-mascot {
  width: 140rpx;
  height: 140rpx;
  margin-bottom: 28rpx;
  animation: lgFloat 2.4s $ease-smooth infinite;
}
@keyframes lgFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-10rpx); }
}
.lg-title {
  font-size: 32rpx;
  font-weight: $weight-bold;
  color: $text-1;
  letter-spacing: -0.3rpx;
}
.lg-sub {
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: $text-3;
  text-align: center;
}
.lg-btn {
  margin-top: 40rpx;
  height: 88rpx;
  padding: 0 56rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-btn;
  background: $ink-gradient;
  box-shadow: $ink-edge, 0 10rpx 24rpx rgba(23, 19, 14, 0.28);
  color: #FFFFFF;
  font-size: 30rpx;
  font-weight: $weight-bold;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}

/* ===== 出题失败态 ===== */
.question-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 260rpx;
  padding: 40rpx;
  margin-bottom: 24rpx;
  border-radius: $radius-xl;
  background: $paper-sunken;
}
.qe-title {
  font-size: 30rpx;
  font-weight: $weight-bold;
  color: $text-1;
}
.qe-tip {
  font-size: 24rpx;
  color: $text-3;
  margin-top: 12rpx;
  line-height: 1.6;
  text-align: center;
}
.qe-btn {
  margin-top: 28rpx;
  height: 76rpx;
  padding: 0 48rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-btn;
  background: $ink;
  color: #FFFFFF;
  font-size: 28rpx;
  font-weight: $weight-bold;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}

/* ===== 题目卡：墨色面板（全站深色实体的唯一配方）===== */
.question-card {
  position: relative;
  overflow: hidden;
  padding: 32rpx 34rpx 34rpx;
  margin-bottom: 20rpx;
  border-radius: $radius-xl;
  background: $ink-gradient;
  box-shadow: $ink-edge, $ink-shadow;
}
/* 卡片外溢的同心圆：被 overflow 裁掉一半，是"溢出几何"装饰（与首页 hero 同源） */
.question-card::after {
  content: '';
  position: absolute;
  width: 360rpx;
  height: 360rpx;
  right: -140rpx;
  bottom: -190rpx;
  border-radius: 50%;
  border: 1rpx solid $on-ink-line;
  pointer-events: none;
}
.q-head {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22rpx;
}
/* 题型标签：墨面上的浅内亮边方标（等宽，与全站小标签同语言） */
.q-label {
  font-family: $font-mono;
  font-size: 20rpx;
  color: $on-ink-1;
  font-weight: $weight-bold;
  background: rgba(255, 255, 255, 0.10);
  box-shadow: inset 0 0 0 1rpx rgba(255, 255, 255, 0.16);
  padding: 6rpx 14rpx;
  border-radius: $radius-xs;
  letter-spacing: 0.6rpx;
}
.q-refresh {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 4rpx 8rpx 16rpx;
  border-radius: $radius-xs;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.q-refresh-text {
  font-size: 24rpx;
  color: $on-ink-2;
  font-weight: $weight-medium;
}
.q-refresh-icon {
  width: 24rpx;
  height: 24rpx;
  flex-shrink: 0;
}
/* v32：换题进行中让图标转起来。
 * 原来「换题中…」只剩一行字：icon 被 v-if 直接摘掉，卡片上唯一的"在动"的
 * 线索消失了 —— 而 AI 出题要 1~3 秒，这段时间里界面是完全静止的。
 * 0.9s/圈 是"转但不急"，与 loading-overlay 的节奏同档。 */
.q-refresh-icon.spinning {
  animation: qSpin 0.9s linear infinite;
}
@keyframes qSpin {
  to { transform: rotate(360deg); }
}
.q-content {
  position: relative;
  z-index: 2;
  display: block;
  font-size: 38rpx;
  font-weight: $weight-heavy;
  color: $on-ink-1;
  line-height: 1.6;
  letter-spacing: -0.6rpx;
  /* v32：换题期间压暗，与「换题中…」同步（见模板注释） */
  transition: opacity $motion-base $ease-out;
}
.q-content.stale { opacity: 0.45; }

/* 换题成功后的入场（v32）：只弹一次，类由 JS 摘除。
   只动 transform、**不动 opacity** —— 卡片里的 .q-content 自己有一条
   0.45→1 的 opacity 过渡（stale 摘除时跑）。若这里也淡入，两层 opacity
   会相乘，题面先暗一次再亮一次，读起来像闪帧。 */
.question-card-enter { animation: qIn $motion-base $ease-out both; }
@keyframes qIn {
  from { transform: translateY(8rpx); }
  to   { transform: none; }
}

/* ===== 作答区：压印槽（v35）=====
 * 改之前是「白卡 + 发丝线」，和题目卡（墨面）在层次上完全分开，中间那块
 * 大留白读起来像"页面没做完"。v35 把它做成**压进纸面的答题槽**：
 *   · 底色用 $paper-sunken（比纸面暗一档）+ 内凹阴影 = 凹槽
 *   · 顶部一条朱砂短规则线，把"这是你要填的地方"讲清楚
 *   · min-height 从 200 → 260rpx，让空态也是一块"待填的纸"而不是空洞 */
.answer-area {
  padding: 26rpx 28rpx 22rpx;
  margin-bottom: 22rpx;
  background: $paper-sunken;
  border: 1rpx solid rgba(23, 19, 14, 0.055);
  border-radius: $radius-xl;
  box-shadow: $emboss-2;
  /* 顶部朱砂短条：标记"填写区"的语义锚点 */
  position: relative;
  overflow: hidden;
}
.answer-area::before {
  content: '';
  position: absolute;
  top: 0;
  left: 28rpx;
  width: 64rpx;
  height: 4rpx;
  border-radius: 0 0 3rpx 3rpx;
  background: $verm;
  opacity: 0.75;
}
.answer-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16rpx;
  margin-bottom: 14rpx;
  padding-bottom: 14rpx;
  border-bottom: 1rpx solid rgba(23, 19, 14, 0.09);
}
/* 栏目标签：等宽大写 + 字距，读作"这一栏叫什么"而不抢正文 */
.answer-label {
  font-size: 22rpx;
  font-weight: $weight-bold;
  color: $text-3;
  letter-spacing: 1.2rpx;
}
/* 字数计数：仪器读数字体（输入时宽度不跳） */
.char-count {
  @include readout(22rpx);
  font-weight: $weight-bold;
  color: $text-3;
  flex-shrink: 0;
}
.answer-input {
  width: 100%;
  min-height: 260rpx;
  font-size: 30rpx;
  color: $text-1;
  line-height: 1.78;
  box-sizing: border-box;
}
.answer-tools {
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid rgba(23, 19, 14, 0.09);
}

/* ===== 提交按钮（固定底栏上的墨材质） ===== */
.submit-btn {
  position: fixed;
  left: 48rpx;
  right: 48rpx;
  bottom: calc(32rpx + env(safe-area-inset-bottom));
  height: 104rpx;
  border-radius: $radius-btn;
  background: $ink-gradient;
  color: #FFFFFF;
  font-size: 31rpx;
  font-weight: $weight-bold;
  letter-spacing: 0.5rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  box-shadow: $ink-edge, 0 10rpx 24rpx rgba(23, 19, 14, 0.28);
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out,
              background-color $motion-fast $ease-out;
}
/* 禁用态：浅填充底 + 辅助灰字（读作"还没准备好"，而不是"界面坏了"） */
.submit-btn.disabled {
  background: #E8E2D8;
  color: $text-3;
  box-shadow: none;
}

/* ===== 结果卡 ===== */
.result-card {
  padding: 34rpx 30rpx 28rpx;
  background: $paper-card;
  border: 1rpx solid $rule;
  border-radius: $radius-xl;
}
/* 分数：等宽巨数字，本页第二视觉焦点（第一是题目墨卡） */
.result-score {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6rpx;
  margin-bottom: 8rpx;
}
.score-num {
  @include readout(96rpx);
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -3rpx;
}
/* v35.3 第二十批：分数按等级染色（纸面一级 $grade-*，非黑卡不用 lit 版） */
.score-num.gscore-s { color: $grade-s; }
.score-num.gscore-a { color: $grade-a; }
.score-num.gscore-b { color: $grade-b; }
.score-num.gscore-c { color: $grade-c; }
.score-num.gscore-d { color: $grade-d; }
/* 小段位章：分数右侧的批注印章（rotate -5°，等级浅底） */
.score-stamp {
  width: 52rpx;
  height: 52rpx;
  border-radius: $radius-xs;
  border: 2rpx solid currentColor;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 6rpx;
  transform: rotate(-5deg);
}
.score-stamp-text {
  font-family: $font-mono;
  font-size: 26rpx;
  font-weight: $weight-black;
  line-height: 1;
}
.score-stamp.gs-s { color: $grade-s; background: $grade-s-soft; }
.score-stamp.gs-a { color: $grade-a; background: $grade-a-soft; }
.score-stamp.gs-b { color: $grade-b; background: $grade-b-soft; }
.score-stamp.gs-c { color: $grade-c; background: $grade-c-soft; }
.score-stamp.gs-d { color: $grade-d; background: $grade-d-soft; }
.score-label {
  font-size: 24rpx;
  color: $text-3;
  font-weight: $weight-medium;
}
/* 未评分态（v35）：不使用 0 或 60 这类"看起来像分数"的假值，
   用一个破折号 + 明确说明，让用户一眼看出「这次没评上」而不是「我考砸了/考了60」。 */
.result-score-unscored {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 8rpx;
}
.unscored-mark {
  font-family: $font-mono;
  font-size: 88rpx;
  font-weight: $weight-heavy;
  color: $text-4;
  line-height: 1;
  letter-spacing: -3rpx;
}
.unscored-label {
  font-size: 22rpx;
  color: $verm;
  font-weight: $weight-semibold;
  letter-spacing: 0.4rpx;
}
.result-comment {
  display: block;
  font-size: 27rpx;
  color: $text-2;
  line-height: 1.75;
  margin-bottom: 26rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid $rule;
}
.result-section { margin-bottom: 26rpx; }
/* 分区标题：朱砂序号 + 标题 + 延伸发丝线（全站唯一配方） */
.section-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
}
.section-index { @include mono-index; }
.section-title {
  @include sec-heading;
  flex-shrink: 0;
}
.section-line {
  flex: 1;
  height: 1rpx;
  background: $rule;
  margin-left: 6rpx;
}
.section-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
/* 每条左侧一条竖线：把「· 项目符号」升级为编辑式引文条 */
.section-item {
  display: flex;
  align-items: flex-start;
  padding-left: 2rpx;
}
/* v35.3 第二十批：批注符号取代无语义竖条 —— ✓（优点，墨）与 →（建议，朱砂），
   与报告页的语义符号同一语言。 */
.section-mark {
  font-family: $font-mono;
  font-size: 26rpx;
  font-weight: $weight-black;
  line-height: 1;
  flex-shrink: 0;
  margin-right: 18rpx;
  margin-top: 8rpx;
}
.section-mark.ok { color: $grade-b; }
.section-mark.tip { color: $verm; }
.section-item-text {
  flex: 1;
  font-size: 26rpx;
  color: $text-2;
  line-height: 1.72;
}

.result-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12rpx;
  margin-top: 28rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid $rule;
}
/* v28：带箭头的两个入口由 <text> 改为 <view>+<text>+图标，
   故字号/颜色下沉到 .action-link-text，容器负责 flex 对齐。
   箭头 13rpx 按"字符墨迹等高"标定（28rpx 字号下字符墨迹约 10rpx）。 */
.action-link {
  display: flex;
  align-items: center;
  gap: 6rpx;
}
.action-link-text {
  font-size: 27rpx;
  color: $text-3;
  font-weight: $weight-semibold;
}
.action-link-arrow {
  width: 13rpx;
  height: 13rpx;
  flex-shrink: 0;
}
/* 主操作「继续下一题」= 墨色（引导进入下一轮练习循环，是本卡唯一的行动色） */
.action-link.primary .action-link-text { color: $ink; }

.ai-disclaimer {
  margin-top: 20rpx;
  text-align: center;
  padding-bottom: 24rpx;
}
.ai-disclaimer text {
  /* 合规标识必须读得见：24rpx / $text-3（3.54:1），与面试页/报告页同一句声明同档 */
  font-size: 24rpx;
  color: $text-3;
  line-height: 1.5;
  letter-spacing: 0.5rpx;
}

.loading {
  text-align: center;
  padding: 120rpx 0;
  color: $text-3;
  font-size: 26rpx;
}
</style>
