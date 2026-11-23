<template>
  <view class="page">
    <!-- 状态栏占位 -->
    <view class="status-bar" :style="{ height: statusBar + 'px' }"></view>

    <!-- 编辑式页头：左对齐大标题 + 等宽场次概览 -->
    <view class="nav">
      <text class="nav-kicker">INTERVIEW LOG</text>
      <text class="nav-title">面试记录</text>
      <view class="nav-meta" v-if="listTotal > 0">
        <text class="nav-count">{{ listTotal }}</text>
        <text class="nav-unit">场</text>
      </view>
    </view>

    <!-- 未登录（主动退出过）：给登录入口，而不是「加载失败」死循环 -->
    <view v-if="needLogin" class="error-block">
      <text class="error-tip">登录后可查看你的面试记录与评分报告</text>
      <view class="btn-retry" hover-class="hover-press" @click="onLogin">去登录</view>
    </view>

    <!-- 失败重试 -->
    <view v-else-if="loadError && list.length === 0" class="error-block">
      <text class="error-tip">加载失败，请检查网络</text>
      <view class="btn-retry" hover-class="hover-press" @click="loadData">重新加载</view>
    </view>

    <template v-else>
      <!-- 列表：纸本账本。发丝线分隔、等宽读数、段位小印章。
           错峰入场 40ms/项、位移 12rpx（走全局 fadeUp 刻度，上限 8 项）。 -->
      <view class="list">
        <view
          class="record"
          :class="'lv-' + item.gradeKey.toLowerCase()"
          v-for="item in rows"
          :key="item._id"
          hover-class="hover-press"
          hover-start-time="0"
          hover-stay-time="80"
          :style="item.enterStyle"
          @click="goDetail(item._id)"
        >
          <!-- 档案编号：描边幽灵数字（账本语言，行序号而非分组） -->
          <text class="record-no">{{ item.no }}</text>
          <view class="record-left">
            <view class="record-title-row">
              <text class="record-pos">{{ item.position_name }}</text>
              <text class="type-seal" v-if="item.interview_type">{{ item.interview_type }}</text>
            </view>
            <text class="record-meta">{{ item.completed_rounds }}/{{ item.total_rounds }} 轮 · {{ formatDate(item.started_at) }}</text>
          </view>
          <!-- 有分数：等宽分数 + 段位印章 -->
          <view class="record-result" v-if="item.total_score != null">
            <text class="result-num">{{ item.total_score }}</text>
            <view class="grade-badge" :class="'g-' + (item.grade || 'D')">
              <text class="grade-badge-text">{{ item.grade || 'D' }}</text>
            </view>
          </view>
          <!-- 无分数：状态点（进行中朱砂脉冲） -->
          <view class="record-state" v-else>
            <view class="state-dot" :class="item.status"></view>
            <text class="state-text">{{ statusText(item.status) }}</text>
          </view>
        </view>
      </view>

      <empty-state v-if="!loading && list.length === 0" text="还没有面试记录">
        <!-- 空态给出口：说明 + 下一步动作 -->
        <view class="btn-retry" hover-class="hover-press" @click="goPractice">开始第一场</view>
      </empty-state>
      <!-- 骨架行按真实行高撑起版面，数据到达时是填空而不是重排 -->
      <view v-if="loading && list.length === 0" class="sk-list sk-wrap">
        <view v-for="i in 5" :key="'skr-' + i" class="sk-row">
          <view class="sk-row-left">
            <view class="skeleton sk-pos"></view>
            <view class="skeleton sk-meta"></view>
          </view>
          <view class="skeleton sk-score"></view>
        </view>
      </view>
      <view v-if="loadingMore" class="loading">加载更多…</view>
      <view v-else-if="list.length > 0 && !hasMore" class="end-tip">END</view>
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
import { ref, computed } from 'vue'
import { onShow, onReachBottom, onPullDownRefresh, onShareAppMessage } from '@dcloudio/uni-app'
import EmptyState from '@/components/empty-state/empty-state.vue'
import { getInterviewList } from '@/api/interview'
import { useUserStore } from '@/store/modules/user'
// 日期格式化统一来源（P2 修复：原两页各自 toLocaleDateString，格式/平台表现不一致）
import { formatDate as formatDateUtil } from '@/utils/format'
import { go, NAV } from '@/utils/nav'
import LoginModal from '@/components/login-modal/login-modal.vue'

const userStore = useUserStore()
const list = ref([])
// 列表总数（接口返回的 total，用于标题概览「共 N 场」）
const listTotal = ref(0)
const loading = ref(true)
const loadingMore = ref(false)
const hasMore = ref(true)
const loadError = ref(false)
// 未登录（主动退出过）态：显示登录引导而不是「加载失败」
const needLogin = ref(false)
const PAGE_SIZE = 10

const statusBar = ref(44)
const initStatusBar = () => {
  try {
    const win = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
    statusBar.value = win.statusBarHeight || 44
  } catch (e) {}
}
initStatusBar()

// onShow 节流：tab 页常驻，切来切去反复触发 onShow。1.5 秒内不重发，
// 避免与首页/统计页的请求一起把微信的 10 并发上限挤满、拖慢切页。
// 仅在已拿到列表后节流；失败态允许重试。
let lastLoadAt = 0
let hasLoaded = false
const loadData = async (force = false) => {
  const now = Date.now()
  if (!force && hasLoaded && now - lastLoadAt < 1500) return
  lastLoadAt = now
  hasLoaded = true
  loadError.value = false
  // 未登录（主动退出过）：不发注定 401 的请求，直接展示登录引导
  if (!userStore.isLoggedIn) {
    needLogin.value = true
    loading.value = false
    return
  }
  needLogin.value = false
  loading.value = true
  try {
    const res = await getInterviewList({ page: 1, page_size: PAGE_SIZE })
    list.value = res?.list || []
    listTotal.value = res?.total || 0
    hasMore.value = (res?.total || 0) > list.value.length
  } catch (e) {
    // 401 且无法自愈（主动退出过）：转登录引导；其余才按网络失败处理
    if (e?.authRequired) needLogin.value = true
    else loadError.value = true
  } finally {
    loading.value = false
  }
}

/* 登录引导：走全站统一的 <login-modal>（含协议勾选） */
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
    if (!res || !userStore.isLoggedIn) {
      uni.showToast({ title: '登录未完成，请重试', icon: 'none' })
      return
    }
    loginVisible.value = false
    await loadData()
  } catch (e) {
    const msg = e?.message || e?.errMsg || ''
    uni.showToast({ title: msg && msg.length < 24 ? msg : '登录失败，请检查网络后重试', icon: 'none' })
  } finally {
    loginLoading.value = false
  }
}

const loadMore = async () => {
  if (loading.value || loadingMore.value || !hasMore.value) return
  const page = Math.floor(list.value.length / PAGE_SIZE) + 1
  loadingMore.value = true
  try {
    const res = await getInterviewList({ page, page_size: PAGE_SIZE })
    const more = res?.list || []
    if (more.length === 0) {
      hasMore.value = false
    } else {
      list.value = list.value.concat(more)
      listTotal.value = res?.total || list.value.length
      hasMore.value = (res?.total || 0) > list.value.length
    }
  } catch (e) {
    /* 加载更多失败必须让用户知道，并停止继续触发（P2 修复，2026-10-08）：
       旧实现是空 catch + 不收敛 hasMore，而 onReachBottom 每次触底都会调本函数 ——
       弱网/断网时用户看到的是「滑到底 → 转一下「加载更多」→ 什么都没有」，
       且可以无限重复触发（每次都静默失败一次）。同页首次加载失败是有错误态的，
       分页失败却完全无感，标准不一致。
       这里：提示一次 + 把 hasMore 置 false（用户可下拉刷新从头再来）。 */
    hasMore.value = false
    uni.showToast({ title: '加载更多失败，请下拉刷新重试', icon: 'none' })
  } finally { loadingMore.value = false }
}

const goDetail = (id) => go(`/pages/history-detail/index?id=${id}`, NAV.quick)
/* v32：空态出口。走「快速练习」（一题即开始）而不是首页/配置页 ——
 * 空态的用户此刻最想要的是"立刻做一场"，不是再选一遍岗位与轮次。
 * 失败必须给反馈：路由被拒时静默停在原地，按钮看起来就像坏了。 */
const goPractice = () => go('/pages/quick-practice/index', NAV.quick, {
  fail: () => uni.showToast({ title: '打开失败，请重试', icon: 'none' })
})

/* 日期统一走 utils/format 的手写补零实现（P2 修复）：
   旧实现用 `toLocaleDateString()`（无 locale），与首页卡片的
   `toLocaleDateString('zh-CN')` 格式不同且都依赖平台 Intl 支持 ——
   同一个面试日期在两页可能长得不一样，换机型还会变。 */
const formatDate = (d) => formatDateUtil(d)
const statusText = (s) => ({ completed: '已完成', in_progress: '进行中', interrupted: '已中断' }[s] || s)

/* v32：列表渲染用的派生数据 = 原始行 + 入场延迟。
 * 为什么把延迟算在这里而不是模板内联：
 *   ① WXML 表达式能力有限（不能调 Math.min），一旦在模板里写运算，
 *     编译产物的可读性也会变差；
 *   ② 与项目既有做法一致 —— 序号、宽度、日期这类值一律在 JS 里算好，
 *     模板只做绑定（见 report 页的 dimensionBars / roundComments）。
 * 错峰 40ms/项、上限 8 项：单行 0.24s，第 8 项也在 0.56s 内起播，
 * 用户不会觉得"要等动画"。
 * ⚠️ 不能直接用 list.value.map 生成后交给 :key —— 这里保留 _id，
 * 且新增字段不改变对象身份之外的任何语义，不影响滚动位置。 */
const ENTER_STEP_S = 0.04
const ENTER_MAX_INDEX = 8
const rows = computed(() =>
  list.value.map((item, i) => ({
    ...item,
    /* v35.3 第十九批：档案编号（页内顺序 01/02…），幽灵描边数字压在行首 ——
       账本/档案的语言：每一场都是编过号的记录。注意是**行序号**不是分组。 */
    no: String(i + 1).padStart(2, '0'),
    enterStyle: { animationDelay: `${Math.min(i, ENTER_MAX_INDEX) * ENTER_STEP_S}s` },
    /* v35：等级归一化后给行挂 class，用于左侧等级色竖条。
       只做大小写与空值归集，**不推断等级** —— 分数→等级的映射属后端口径。 */
    gradeKey: (() => {
      const g = String(item.grade || '').toUpperCase()
      return ['S', 'A', 'B', 'C', 'D'].includes(g) ? g : 'D'
    })()
  }))
)

onShareAppMessage(() => ({ title: '我的面试小屋 · AI 模拟面试，随时开练', path: '/pages/index/index' }))

/* v31 智能 onShow：原来每次切回本页都 loadData() → 重置为第 1 页。
 * 后果有两个，用户都能直接感觉到：
 *   ① 已滑到第 3 页（加载过多）时切去别的 tab 再回来 → 列表被打回第 1 页，
 *      已翻的内容消失，还要重新滑一遍；
 *   ② 页面整体高度骤变，滚动位置被顶回顶部。
 * loadData 里的 1.5s 节流挡不住「切走 5 秒再回来」这种情况（早过期了）。
 *
 * 现在：只在「没数据」或「第 1 页」时做全量重置；否则静默刷新第一页数据
 * （有新面试会插到最前面），但**保留已加载的页数与滚动位置**。 */
onShow(() => {
  if (!hasLoaded || list.value.length <= PAGE_SIZE) {
    loadData()
  } else {
    loadDataQuietly()
  }
})
/** 静默刷新：只把第 1 页的数据合到列表头部，不动分页状态、不动 hasMore */
const loadDataQuietly = async () => {
  if (!userStore.isLoggedIn) return
  try {
    const res = await getInterviewList({ page: 1, page_size: PAGE_SIZE })
    const first = res?.list || []
    if (!first.length) return
    // 已有 id 集合：只插入真正新的，避免整列表替换导致的高度抖动
    const seen = new Set(list.value.map((x) => x._id))
    const fresh = first.filter((x) => !seen.has(x._id))
    if (fresh.length) list.value = [...fresh, ...list.value]
  } catch (e) { /* 静默失败：不影响用户当前浏览的内容 */ }
}
onReachBottom(loadMore)
onPullDownRefresh(async () => { await loadData(true); uni.stopPullDownRefresh() })
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 面试记录 · 纸本账本（v34）
 * ============================================================================
 * 这张页面的气质应该是「一本批注过的记录册」：
 *   · 通栏发丝线分隔，不用卡片（卡片会把"账本"变成"列表"）
 *   · 每条记录左侧一行标题 + 一行等宽元信息；右侧分数是仪器读数
 *   · 招聘类型用朱砂描边小方标做"属性印章"
 * ========================================================================== */
.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: $paper;
  /* 底部留白走基座变量，与其它页对齐 */
  padding: 0 48rpx calc(#{$safe-bottom-gap} + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.status-bar { width: 100%; }

/* ===== 编辑式页头 =====
 * 三行：等宽小字眉标 → 大标题 → 等宽场次概览。
 * 眉标是英文等宽（INTERVIEW LOG），与首页的 AI MOCK INTERVIEW 同语言。 */
.nav {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 28rpx 0 30rpx;
  border-bottom: 1rpx solid $rule;
  margin-bottom: 8rpx;
}
.nav-kicker {
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.6rpx;
  margin-bottom: 12rpx;
}
.nav-title {
  font-family: $font-display;
  font-size: 52rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -1.8rpx;
  line-height: 1.1;
}
.nav-meta {
  display: flex;
  align-items: baseline;
  gap: 5rpx;
  margin-top: 12rpx;
}
.nav-count {
  @include readout(26rpx);
  font-weight: $weight-bold;
  color: $text-2;
}
.nav-unit {
  font-size: 21rpx;
  color: $text-3;
  font-weight: $weight-medium;
}

/* ===== 列表：通栏发丝线 ===== */
.list { border-top: 1rpx solid $rule; }
.record {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 30rpx 0;
  border-bottom: 1rpx solid $rule;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
  /* 错峰入场（延迟由模板内联给出）。
     用 backwards 而非 both：结束帧不占 transform，
     否则 hover-press 的 scale 会被动画终态按死，整列行没有按压反馈。 */
  animation: fadeUp $motion-base $ease-out backwards;
}

.record-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
.record-title-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}
.record-pos {
  font-family: $font-display;
  font-size: 32rpx;
  font-weight: $weight-bold;
  color: $text-1;
  line-height: 1.3;
  letter-spacing: -0.5rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 截断真正生效需要的宽度约束：flex 子项默认 min-width:auto，
     长标题会先撑宽父容器再被整体裁掉（末尾"…"不出现）。 */
  max-width: 100%;
  box-sizing: border-box;
}
/* 招聘类型：朱砂描边小方标（"属性印章"），与首页卡同款 */
.type-seal {
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  border: 1rpx solid $verm-line;
  border-radius: $radius-xs;
  padding: 3rpx 9rpx;
  flex-shrink: 0;
  letter-spacing: 0.4rpx;
}
/* 元信息走等宽：轮次与日期都是读数，滚动时不会左右微抖 */
.record-meta {
  font-family: $font-mono;
  font-size: 21rpx;
  color: $text-3;
  font-weight: $weight-regular;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* ===== 右侧分数：等宽巨数字 + 段位印章 ===== */
.record-result {
  display: flex;
  align-items: center;
  gap: 14rpx;
  flex-shrink: 0;
}
.result-num {
  @include readout(46rpx);
  font-weight: $weight-heavy;
  color: $text-1;
}
.grade-badge {
  width: $grade-badge-size;
  height: $grade-badge-size;
  border-radius: $radius-badge;
  display: flex;
  align-items: center;
  justify-content: center;
  /* v35：描边 + 浅底取代纯灰填充。
     单色灰阶在米白纸面上区分度太低（S/A 同色、C 几乎看不见），
     改用等级色后「91 S / 86 A / 78 B / 64 C」一眼扫得出好坏。 */
  border: 1.5rpx solid currentColor;
}
.grade-badge-text {
  font-family: $font-mono;
  font-size: 21rpx;
  font-weight: $weight-black;
  line-height: 1;
}
.grade-badge.g-S { color: $grade-s; background: $grade-s-soft; }
.grade-badge.g-A { color: $grade-a; background: $grade-a-soft; }
.grade-badge.g-B { color: $grade-b; background: $grade-b-soft; }
.grade-badge.g-C { color: $grade-c; background: $grade-c-soft; }
.grade-badge.g-D { color: $grade-d; background: $grade-d-soft; }

/* v35 新增：记录行左侧等级色竖条。
   贴在行首（不是卡片边缘，因为本页是"账本"而不是卡片列表），
   宽度 5rpx —— 够扫读、不喧宾夺主。 */
.record { position: relative; }
.record::before {
  content: '';
  position: absolute;
  left: -20rpx;
  top: 50%;
  transform: translateY(-50%);
  width: 5rpx;
  height: 46rpx;
  border-radius: 3rpx;
  background: $rule;
  transition: background $motion-fast $ease-out;
}
/* 按等级取色：模板里给行加了 class，见下方 v35 规则 */
.record.lv-s::before { background: $grade-s; }
.record.lv-a::before { background: $grade-a; }
.record.lv-b::before { background: $grade-b; }
.record.lv-c::before { background: $grade-c; }

/* v35.3 第十九批：档案编号幽灵数字 —— 描边空心等宽两位数压在行首。
   账本/档案的语言："每一场都是编过号的记录"。透明填充 + 极淡描边，
   只提供节奏不抢分数的主角地位。 */
.record-no {
  font-family: $font-mono;
  font-size: 40rpx;
  font-weight: $weight-black;
  line-height: 1;
  letter-spacing: -1rpx;
  color: transparent;
  -webkit-text-stroke: 1rpx rgba(23, 19, 14, 0.17);
  flex-shrink: 0;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}
.record.lv-d::before { background: $grade-d; }

/* ===== 无分数：状态点 ===== */
.record-state {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}
.state-dot {
  position: relative;
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: $text-4;
}
.state-dot.completed { background: $ink; }
.state-dot.interrupted { background: $ash; }
.state-dot.in_progress { background: $verm; }
/* 波纹走伪元素，只动 transform + opacity（不触发 paint）。 */
.state-dot.in_progress::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  border-radius: 50%;
  background: rgba(192, 57, 43, 0.32);
  animation: pulseDot 1.8s $ease-out infinite;
}
.state-text { font-size: 22rpx; font-weight: $weight-medium; color: $text-3; }

@keyframes pulseDot {
  0%   { transform: scale(1);   opacity: 0.55; }
  70%  { transform: scale(2.6); opacity: 0; }
  100% { transform: scale(2.6); opacity: 0; }
}

.loading {
  text-align: center;
  padding: 60rpx;
  color: $text-3;
  font-size: 24rpx;
}

/* ===== 骨架行 =====
 * 行高照抄 .record 的真实构成（上下 padding 30rpx + 两行文字 ≈ 140rpx），
 * 骨架 → 真内容的高度差控制在几 rpx 内，切换时列表不会整体跳一下。 */
.sk-list { border-top: 1rpx solid $rule; }
.sk-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 30rpx 0;
  border-bottom: 1rpx solid $rule;
}
.sk-row-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
.sk-pos { width: 62%; height: 30rpx; }
.sk-meta { width: 84%; height: 22rpx; }
.sk-score { width: 76rpx; height: 44rpx; border-radius: $radius-xs; flex-shrink: 0; }

/* 到底提示：发丝线夹等宽小字，账本收尾 */
.end-tip {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 44rpx 0;
  color: $text-4;
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  letter-spacing: 3rpx;
}
.end-tip::before, .end-tip::after {
  content: '';
  flex: 1;
  height: 1rpx;
  background: $rule;
}

.error-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 40rpx;
}
.error-tip { font-size: 26rpx; color: $text-3; margin-bottom: 32rpx; }
</style>
