<template>
  <view class="page">
    <!-- 页头：等宽眉标 + 大标题 + 短朱砂规则线 + 等宽库存概览。
         眉标（POSITION LIBRARY）与首页 AI MOCK INTERVIEW / 历史页 INTERVIEW LOG 同语言。 -->
    <view class="pg-head">
      <text class="pg-kicker">POSITION LIBRARY</text>
      <text class="pg-title">选择岗位</text>
      <view class="pg-rule"></view>
      <text class="pg-meta">{{ list.length > 0 ? `共 ${list.length} 个岗位 · 题库 ${totalQuestions} 道` : '搜索或浏览岗位' }}</text>
    </view>

    <!-- 搜索框：收敛到凹槽底无描边（表单字段语言，不做受光内亮边的拟物凹槽） -->
    <view class="search-bar">
      <image class="search-icon" :src="ICONS['search']" mode="aspectFit" />
      <input
        v-model="keyword"
        class="search-input"
        placeholder="搜索岗位"
        placeholder-style="color: #C4BAAE"
        confirm-type="search"
        @confirm="loadData"
        @input="onInput"
      />
      <view v-if="keyword" class="search-clear" hover-class="hover-press" @click="clearKeyword">
        <!-- v28：原为两条 view + rotate(±45deg) 手工拼的叉。改用真正的 close 图标：
             省掉 3 条 CSS 规则与 2 个 DOM 节点，且与全站图标同源同描边。 -->
        <image class="search-clear-icon" :src="ICONS['close-ash']" mode="aspectFit" />
      </view>
    </view>

    <!-- 分类：show-scrollbar 必须用绑定写法（P2 修复）。
         微信 scroll-view 的该属性是 Boolean，静态写 "false" 编译产物里是**字符串**
         "false"（非空即真）→ 滚动条照显；全项目另外 5 处横滑条都是 :show-scrollbar="false"，
         只有本页漏了，导致这条分类 chip 条带一条系统滚动条、与全站不一致。 -->
    <scroll-view class="category-tabs" scroll-x :show-scrollbar="false">
      <view class="category-inner">
        <text
          v-for="cat in categories"
          :key="cat"
          class="chip"
          :class="{ active: category === cat }"
          hover-class="hover-press"
          @click="selectCategory(cat)"
        >{{ cat }}</text>
      </view>
    </scroll-view>

    <!-- 列表：岗位索引册。发丝线分隔、描边大编号、朱砂描边小方标——不套卡片。 -->
    <view class="position-list" v-if="list.length > 0">
      <view
        class="position-item"
        v-for="(pos, idx) in list"
        :key="pos._id"
        hover-class="pos-press"
        @click="selectPosition(pos)"
      >
        <!-- 序号：大号描边数字，是列表的编辑式「目录」灵魂 -->
        <text class="pos-index">{{ String(idx + 1).padStart(2, '0') }}</text>
        <view class="pos-main">
          <view class="pos-head">
            <text class="pos-name">{{ pos.name }}</text>
            <!-- 题库量：必须写明「题库」，否则会与「面试轮次」混淆 ——
                 用户看到「30题」会以为这场面试要问 30 道，实际面试默认只问 8 轮，
                 30 是这个岗位背后可抽题的储备量 -->
            <text class="pos-count" v-if="pos.question_count"><text class="pos-count-label">题库</text>{{ pos.question_count }}</text>
          </view>
          <text class="pos-desc" v-if="pos.description">{{ pos.description }}</text>
          <!-- 技能标签条：把后端 key_skills 露出来，信息密度 ↑，不再是光秃秃一行 -->
          <view class="pos-skills" v-if="pos.key_skills && pos.key_skills.length">
            <text
              class="pos-skill"
              v-for="(skill, si) in pos.key_skills.slice(0, 4)"
              :key="si"
            >{{ skill }}</text>
            <text class="pos-skill pos-skill-more" v-if="pos.key_skills.length > 4">+{{ pos.key_skills.length - 4 }}</text>
          </view>
          <view class="pos-foot">
            <text v-if="pos.category" class="pos-cat">{{ pos.category }}</text>
            <view class="pos-go">
              <view class="pos-go-line"></view>
              <view class="pos-go-arrow">
                <image class="pos-go-icon" :src="ICONS['arrow-up']" mode="aspectFit" />
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 失败态 -->
    <view v-else-if="loadError" class="state-block">
      <text class="state-title">加载失败</text>
      <text class="state-tip">请检查网络后重试</text>
      <view class="btn-retry" hover-class="hover-press" @click="loadData">重新加载</view>
    </view>
    <empty-state v-else-if="!loading" text="没有找到相关岗位" />
    <view v-else class="loading">加载中...</view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import EmptyState from '@/components/empty-state/empty-state.vue'
import { getPositions } from '@/api/position'
import { ICONS } from '@/utils/svg-icons'

const keyword = ref('')
const category = ref('全部')
const list = ref([])
const loading = ref(true)
const loadError = ref(false)

/* ===== v31：分类列表改为从数据推导 =====
 * 原来硬编码 ['全部','技术','产品','运营','市场','专升本专业','考研专业'] ——
 * 岗位库新增「设计」「职能」两个分类后，这两类岗位能查到、但**页签里点不到**，
 * 用户只能靠搜索发现，等于白扩。
 * 现在从接口返回的数据里聚合并去重，并按下面这个优先级排序
 * （固定的展示顺序比"按出现先后"稳定，避免分类顺序随机跳动）。
 * 以后再新增分类，前端零改动。 */
const CATEGORY_ORDER = ['技术', '产品', '设计', '运营', '市场', '职能', '专升本专业', '考研专业', '其他']
const categories = computed(() => {
  const seen = new Set(allCategories.value)
  const ordered = CATEGORY_ORDER.filter((c) => seen.has(c))
  // 兜底：接口里出现了未登记的新分类，也要能点（排在已知分类之后）
  const rest = [...seen].filter((c) => !CATEGORY_ORDER.includes(c)).sort()
  return ['全部', ...ordered, ...rest]
})

/* 题量合计：纯展示用，给「这个库有多大」一个具体体感 */
const totalQuestions = computed(() =>
  list.value.reduce((sum, p) => sum + (Number(p.question_count) || 0), 0)
)

/* 分类页签的来源必须与 list 解耦：
   list 是"当前筛选结果"，若拿它推导分类，用户切到「技术」后其他分类页签就会消失，
   再也切不回去。所以单独存一份 allCategories，只在首次进入时拉一次全量。 */
const allCategories = ref([])
let catLoaded = false
const loadCategories = async () => {
  if (catLoaded) return
  catLoaded = true
  try {
    const all = await getPositions({}) || []
    const seen = new Set()
    for (const p of all) if (p && p.category) seen.add(p.category)
    allCategories.value = [...seen]
  } catch (e) {
    // 拉失败不阻塞页面：页签退化为只有「全部」，用户仍可搜索
    catLoaded = false
  }
}

let inputTimer = null
const onInput = () => {
  if (inputTimer) clearTimeout(inputTimer)
  inputTimer = setTimeout(() => loadData(), 300)
}
const clearKeyword = () => { keyword.value = ''; loadData() }

/* v31 竞态修复：请求序号。
   搜索有 300ms 防抖，且 loadData 还可能被 selectCategory 并发触发，
   于是会出现「A 请求后发、B 请求先发」的乱序 —— 旧实现直接
   `list.value = await getPositions(...)`，A 若晚于 B 返回就会把
   较旧的搜索结果覆盖到界面上。
   用户可感知的症状：输入 "ab" 却显示 "a" 的搜索结果。
   修法：每次调用领一个递增序号，回来时若自己已不是最新一次，直接丢弃。
   （不选 abort 的原因：uni.request 的返回值此前没被保存，全项目无从取消；
     序号校验已能杜绝"旧数据覆盖新数据"这个真正的危害，实现也最简单。） */
let loadSeq = 0
const loadData = async () => {
  if (inputTimer) { clearTimeout(inputTimer); inputTimer = null }
  const my = ++loadSeq
  try {
    loading.value = true
    loadError.value = false
    const params = {}
    if (keyword.value.trim()) params.keyword = keyword.value.trim()
    if (category.value && category.value !== '全部') params.category = category.value
    const data = await getPositions(params) || []
    if (my !== loadSeq) return   // 已有更新的请求在飞，丢弃本次结果
    list.value = data
  } catch (e) {
    if (my !== loadSeq) return   // 同理：过期失败不该把界面打成错误态
    loadError.value = true
    list.value = []
  } finally {
    if (my === loadSeq) loading.value = false
  }
}

const selectCategory = (cat) => { category.value = cat; loadData() }

/* 选岗后的落点（P1 修复，2026-10-08）
 *
 * 旧实现只做 `$emit('positionSelected') + navigateBack()`，而这个事件的**唯一监听者**
 * 是 interview-config 页（它的岗位选择器展开时才 $on）。岗位库有三个入口：
 *   · interview-config 展开选择器 → 有监听者，正常回填 ✅
 *   · 首页「岗位库 ›」           → 无监听者，点完只是返回首页，**像坏了** ❌
 *   · 我的 →「岗位库」           → 同上 ❌
 * 页面标题写着「选择岗位」、卡片右侧有箭头引导、点击还有按压反馈，
 * 结果点完什么都没发生 —— 两个真实入口上的功能性死路。
 *
 * 修法：用一个「是否有监听者」的确认握手机制判断当前入口。
 * 监听者（interview-config）收到事件后会立刻置位 consumed 标记；
 * 若本次 tick 结束仍无人消费，则说明是从首页/我的进来的，
 * 直接把选中的岗位带参跳到面试配置页（那里本就支持 ?position_name= 直达），
 * 让「选岗」这个动作在任何入口都有明确结果。 */
const selectPosition = (pos) => {
  const payload = { name: pos.name, id: pos._id }
  let consumed = false
  const markConsumed = () => { consumed = true }
  const CONSUMED_EVENT = 'positionSelected:consumed'
  /* $emit 是**同步扇出**（编译产物实测：`vt=rt(0,(e,...t)=>{dt.emit(e,...t)})`，
     外层只是参数校验）。所以监听者若在场，会在下面这一行返回前就把 consumed 置位，
     正常路径（从面试配置页进来）无需等待、直接 navigateBack，不会有可感知延迟。 */
  uni.$once(CONSUMED_EVENT, markConsumed)
  uni.$emit('positionSelected', payload)
  uni.$off(CONSUMED_EVENT, markConsumed)

  if (consumed) {
    // 有监听者（来自面试配置页）：按原契约回填即可
    uni.navigateBack()
    return
  }
  // 无监听者（来自首页 / 我的）：直接去面试配置页并预选该岗位
  uni.redirectTo({ url: `/pages/interview-config/index?position_name=${encodeURIComponent(pos.name)}` })
}

onMounted(() => {
  loadData()
  /* 分类页签单独拉一次全量（v31）：与 loadData 并行，不阻塞首屏岗位列表。
     注意这里**不能**等 loadData 完成再推导分类 —— loadData 返回的是
     带 category 筛选的结果，用它会漏掉其他分类（详见 allCategories 的说明）。 */
  loadCategories()
})
onUnmounted(() => { if (inputTimer) clearTimeout(inputTimer) })
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 岗位库 · 纸本索引册（v34）
 * ============================================================================
 * 立意：这一页本质是**一本岗位索引册**，不是"卡片瀑布"。
 * 所以：
 *   · 通栏发丝线分隔，不做一张张白卡（卡片会把"目录"变成"信息流"）
 *   · 编号是描边大数字（-webkit-text-stroke），像书页边上的页码
 *   · 岗位名粗体独占视觉重量，其余信息降一档
 *   · 分类用朱砂描边小方标（"属性印章"），与首页热门岗位卡同款
 *   · 搜索框收敛成凹槽底无描边（表单字段语言）
 * ========================================================================== */
.page {
  padding: 24rpx $page-padding calc(48rpx + env(safe-area-inset-bottom));
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
/* 短规则线：编辑式页头的标志性分隔，比满宽细线更考究。
   这里用朱砂——它是本页唯一的"盖章"位（页头之下全是墨色内容）。 */
.pg-rule {
  width: 56rpx;
  height: 4rpx;
  border-radius: 2rpx;
  background: $verm;
  margin: 20rpx 0 16rpx;
}
/* ⚠️ 不用 $font-mono：这行是「共 78 个岗位 · 题库 2078 道」的中英混排。
   等宽字体对英文数字合适，但中文字形是"凑"进等宽网格的 —— 笔画粗细不匀、
   字面偏小，在 22rpx 上明显发虚（登录弹窗里"安全验证"踩过同一个坑）。
   这类混排一律走无衬线体；纯数字（分数/场次/编号）才继续用 mono。 */
.pg-meta {
  display: block;
  font-family: $font-sans;
  font-size: 22rpx;
  font-weight: $weight-medium;
  color: $text-3;
  letter-spacing: 0.3rpx;
  font-variant-numeric: tabular-nums;
}

/* ===== 搜索框：凹槽底，无描边，无拟物内亮边 ===== */
.search-bar {
  display: flex;
  align-items: center;
  height: 92rpx;
  padding: 0 26rpx;
  margin-bottom: 22rpx;
  border-radius: $radius-md;
  background: $paper-sunken;
}
.search-icon {
  width: 32rpx;
  height: 32rpx;
  margin-right: 16rpx;
  opacity: 0.45;
}
.search-input {
  flex: 1;
  font-size: 28rpx;
  color: $text-1;
}
.search-clear {
  /* v30：热区 36×36 → 64×88rpx。原先 18pt×18pt，不到微信建议值(44pt)的四成，
     而「清除搜索」恰恰是个需要精准点中的小目标。
     高度取满 search-bar 的 92rpx，宽度给到 64rpx；
     .search-clear-icon 仍是 24rpx 且居中 → 图标视觉尺寸完全不变，
     只是手指不必瞄准那个 24rpx 的叉。 */
  width: 64rpx;
  height: 88rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.search-clear-icon {
  width: 24rpx;
  height: 24rpx;
}

/* ===== 分类 chip（全局 .chip / .chip.active 提供形态与选中态） ===== */
.category-tabs {
  white-space: nowrap;
  margin-bottom: 8rpx;
}
.category-inner {
  display: inline-flex;
  gap: 12rpx;
  padding: 4rpx 0;
}
.chip { flex-shrink: 0; }

/* ===== 岗位列表：索引册 =====
 * 顶部一条通栏发丝线，每条之间一条发丝线 —— 与历史页账本同一语言。 */
.position-list {
  border-top: 1rpx solid $rule;
}
.position-item {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  padding: 30rpx 0 28rpx;
  border-bottom: 1rpx solid $rule;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
/* 按压并入全局刻度；描边不加深（索引册里行本身没有描边可加深） */
.pos-press {
  opacity: $press-opacity;
  transform: scale($press-scale);
}
/* 序号：大号描边数字 + 极浅填充兜底（-webkit-text-stroke 在部分 Android 不渲染，
   无描边时退回淡灰，编号仍在）。字号逼近标题，用描边压住自己不抢正文。 */
.pos-index {
  font-family: $font-mono;
  font-size: 52rpx;
  font-weight: $weight-heavy;
  line-height: 1;
  width: 68rpx;
  flex-shrink: 0;
  padding-top: 4rpx;
  color: rgba(23, 19, 14, 0.06);
  -webkit-text-stroke: 2rpx rgba(23, 19, 14, 0.20);
  font-variant-numeric: tabular-nums;
  letter-spacing: -2rpx;
}
.pos-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.pos-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 10rpx;
}
.pos-name {
  font-size: 34rpx;
  font-weight: $weight-bold;
  color: $text-1;
  line-height: 1.2;
  letter-spacing: -0.6rpx;
  flex: 1;
  min-width: 0;
}
/* 题库量：mono 数字 + 「题库」前缀（前缀不能省 —— 只写「30题」会被误读成
   "这场面试问 30 道"） */
.pos-count {
  font-family: $font-mono;
  font-size: 26rpx;
  font-weight: $weight-bold;
  color: $text-1;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  flex-shrink: 0;
}
.pos-count-label {
  font-size: 20rpx;
  font-weight: $weight-medium;
  color: $text-3;
  margin-right: 6rpx;
  font-family: inherit;
}
.pos-desc {
  display: block;
  font-size: 24rpx;
  color: $text-3;
  line-height: 1.55;
  margin-bottom: 14rpx;
}
/* 技能标签条：小方标（不是胶囊 —— 纸本拒绝大胶囊） */
.pos-skills {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-bottom: 18rpx;
}
.pos-skill {
  font-size: 20rpx;
  font-weight: $weight-medium;
  color: $text-2;
  background: $paper-sunken;
  padding: 5rpx 14rpx;
  border-radius: $radius-xs;
  line-height: 1.35;
}
.pos-skill-more {
  color: $text-3;
  background: transparent;
  padding-left: 0;
  padding-right: 0;
}
/* 行尾：分类印章（朱砂描边）+ 右引导。
   分类用 .tag-verm 同款语言：透明底 + 朱砂描边 + 等宽字。 */
.pos-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid $rule;
}
.pos-cat {
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  border: 1rpx solid $verm-line;
  border-radius: $radius-xs;
  padding: 3rpx 10rpx;
  letter-spacing: 0.4rpx;
  flex-shrink: 0;
}
/* 右引导：短横线 + 描边小方箭头。
   每行一颗墨钮会把"点睛"稀释成"噪点"，所以箭头保持描边形态。 */
.pos-go {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-left: auto;
}
.pos-go-line {
  width: 28rpx;
  height: 1rpx;
  background: $rule-strong;
  transition: background-color $motion-fast $ease-out;
}
.pos-go-arrow {
  width: 44rpx;
  height: 44rpx;
  border-radius: $radius-xs;
  background: transparent;
  border: 1rpx solid $rule-strong;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color $motion-fast $ease-out;
}
.pos-go-icon {
  width: 20rpx;
  height: 20rpx;
  transform: rotate(45deg);
}
.pos-press .pos-go-line { background: $ink; }
.pos-press .pos-go-arrow { border-color: $ink; }

/* ===== 状态块 ===== */
.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 100rpx 0;
}
.state-title {
  font-size: 32rpx;
  color: $text-1;
  font-weight: $weight-bold;
}
.state-tip {
  font-size: 24rpx;
  color: $text-3;
  margin-top: 10rpx;
}
.state-block .btn-retry { margin-top: 32rpx; }

.loading {
  text-align: center;
  padding: 100rpx 0;
  color: $text-3;
  font-size: 24rpx;
}
</style>
