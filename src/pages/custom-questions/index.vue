<template>
  <view class="page">
    <!-- 页头：等宽眉标 + 大标题 + 说明 -->
    <view class="pg-head">
      <text class="pg-kicker">CUSTOM QUESTIONS</text>
      <text class="pg-title">自定义题目</text>
      <text class="pg-meta">把你常被问的题目组整理起来，反复练</text>
    </view>

    <!-- 新建入口：一条凹槽底的行（不是横贯全屏的黑条）
         左侧墨色方形「+」与本页序号方章同形，右侧是动作名 —— 它读作
         "这本册子的下一页是空的，从这里写起"，而不是一颗压在列表上的大按钮。 -->
    <view class="add-row" hover-class="hover-press" @click="showAdd = true">
      <view class="add-mark">
        <text class="add-mark-glyph">+</text>
      </view>
      <text class="add-text">新建题目组</text>
      <view class="add-rule"></view>
    </view>

    <!-- 列表：.list-row 语言（发丝线分隔，不套卡片） -->
    <view class="list" v-if="list.length > 0">
      <view class="item anim-in" :class="'d' + (Math.min(idx + 1, 6))" v-for="(item, idx) in list" :key="idx">
        <view class="item-head">
          <!-- 序号：墨色等宽小方章（"第几组"），与本页其它读数同一套刻度 -->
          <view class="item-badge"><text class="item-badge-text">{{ String(idx + 1).padStart(2, '0') }}</text></view>
          <text class="item-name">{{ item.position_name }}</text>
          <text class="item-count"><text class="item-count-num">{{ item.questions.length }}</text>道题</text>
        </view>
        <view class="item-actions">
          <text class="action-btn" hover-class="hover-press" @click="useItem(item)">使用</text>
          <text class="action-btn delete" hover-class="hover-press" @click="deleteItem(idx)">删除</text>
        </view>
      </view>
    </view>

    <empty-state v-else text="还没有自定义题目，创建一个开始练习" />

    <!-- 新建弹窗：底部弹出，圆角抽屉 -->
    <view v-if="showAdd" class="mask" @click="closeAdd">
      <view class="popup" @click.stop>
        <view class="popup-handle"></view>
        <text class="popup-title">新建题目组</text>
        <text class="popup-label">岗位 / 场景</text>
        <input
          class="input-field popup-input"
          v-model="newItem.position_name"
          placeholder="比如：产品经理面试"
          maxlength="30"
          placeholder-style="color: #C2B8AC"
        />
        <text class="popup-label">题目（每行一道，单题 ≤ 500 字）</text>
        <textarea
          class="input-field popup-textarea"
          v-model="newQuestionsText"
          placeholder="每行一道题，如：你的优势是什么？；为什么选择我们公司？"
          placeholder-style="color: #C2B8AC"
          :maxlength="5000"
          auto-height
        />
        <view class="popup-actions">
          <view class="btn btn-secondary popup-btn" hover-class="hover-press" @click="closeAdd">取消</view>
          <view class="btn btn-primary popup-btn" hover-class="hover-press" @click="addItem">保存</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import EmptyState from '@/components/empty-state/empty-state.vue'

const STORAGE_KEY = 'custom_questions'

const list = ref([])
const showAdd = ref(false)
const newItem = ref({ position_name: '', questions: [] })
const newQuestionsText = ref('')

const loadData = () => {
  try {
    const saved = uni.getStorageSync(STORAGE_KEY)
    const parsed = saved ? (typeof saved === 'string' ? JSON.parse(saved) : saved) : []
    list.value = Array.isArray(parsed) ? parsed : []
  } catch (e) {
    list.value = []
  }
}

const closeAdd = () => { showAdd.value = false }

const addItem = () => {
  const name = (newItem.value.position_name || '').trim()
  if (!name) { uni.showToast({ title: '请输入名称', icon: 'none' }); return }
  // 单题限长 500 字：超长题会生成巨型 prompt、拖慢 AI 且触发后端内容安全分片检测；
  // 与作答框（2000 字）同思路做前端硬约束，后端另有兜底
  const questions = newQuestionsText.value
    .split('\n')
    .map(q => q.trim().slice(0, 500))
    .filter(Boolean)
  if (questions.length === 0) { uni.showToast({ title: '请输入至少一道题', icon: 'none' }); return }

  list.value.unshift({ position_name: name, questions })
  try {
    uni.setStorageSync(STORAGE_KEY, JSON.stringify(list.value))
  } catch (e) {
    uni.showToast({ title: '本地存储写入失败', icon: 'none' })
    list.value.shift()
    return
  }
  showAdd.value = false
  newItem.value = { position_name: '', questions: [] }
  newQuestionsText.value = ''
  uni.showToast({ title: '创建成功', icon: 'success' })
}

const deleteItem = (idx) => {
  uni.showModal({
    title: '删除',
    content: '确定删除这组题目吗？',
    confirmColor: '#C0392B',
    success: (res) => {
      if (!res.confirm) return
      list.value.splice(idx, 1)
      uni.setStorageSync(STORAGE_KEY, JSON.stringify(list.value))
    }
  })
}

const useItem = (item) => {
  uni.setStorageSync('current_custom_questions', JSON.stringify(item))
  uni.navigateTo({ url: '/pages/interview-config/index' })
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 自定义题目 · 纸本朱砂（v34）
 * ============================================================================
 * 这是一本"我的题册"：列表用 .list-row 的语言——发丝线分隔、不套卡片。
 * 版式判断：
 *   ① 列表行不套卡片（卡片会把"册子"读成"信息流"）
 *   ② 序号是墨色等宽小方章（"第几组"），与岗位库的描边大编号区分开：
 *      这里是"装订过的条目"，不是"索引页的页码"
 *   ③ 新建入口是一条凹槽行，而不是横贯全屏的黑条/大按钮
 * ========================================================================== */
.page {
  padding: 24rpx $page-padding calc(48rpx + env(safe-area-inset-bottom));
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
  box-sizing: border-box;
}
.page::before { display: none; }

/* 抽屉入场：从底部滑入，缓出不弹跳（全局未定义，页内补） */
@keyframes sheetUp {
  from { transform: translateY(100%); opacity: 0.6; }
  to   { transform: translateY(0); opacity: 1; }
}

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

/* ===== 新建入口：一条凹槽行（左方「+」+ 动作名 + 延伸发丝线）=====
 * 刻意不做横贯全屏的黑色大按钮：那会在"册子"上压一条与内容无关的重色块，
 * 并且与列表里每一行的语言脱节。 */
.add-row {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 22rpx 24rpx;
  margin-bottom: 8rpx;
  border-radius: $radius-md;
  background: $paper-sunken;
  transition: background-color $motion-fast $ease-out, opacity $motion-fast $ease-out,
              transform $motion-fast $ease-out;
}
/* 「+」底座：墨材质小方章，与列表序号章同形同料 */
.add-mark {
  width: 44rpx;
  height: 44rpx;
  border-radius: $radius-xs;
  background: $ink-gradient;
  box-shadow: $ink-edge;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.add-mark-glyph {
  font-family: $font-mono;
  font-size: 30rpx;
  font-weight: $weight-bold;
  color: #FFFFFF;
  line-height: 1;
  margin-top: -2rpx;
}
.add-text {
  font-size: 29rpx;
  font-weight: $weight-bold;
  color: $text-1;
  letter-spacing: -0.2rpx;
  flex-shrink: 0;
}
.add-rule {
  flex: 1;
  height: 1rpx;
  background: $rule-strong;
  margin-left: 4rpx;
}

/* ===== 列表：发丝线分隔（.list-row 语言） ===== */
.list {
  margin-top: 8rpx;
  border-top: 1rpx solid $rule;
}
.item {
  padding: 26rpx 0 22rpx;
  border-bottom: 1rpx solid $rule;
}
.item-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 12rpx;
}
/* mono 序号方章：墨色小方块 + 白字（"装订好的第几组"） */
.item-badge {
  width: 44rpx;
  height: 44rpx;
  border-radius: $radius-xs;
  background: $ink;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.item-badge-text {
  font-family: $font-mono;
  font-size: 20rpx;
  font-weight: $weight-bold;
  color: #FFFFFF;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.4rpx;
}
.item-name {
  flex: 1;
  min-width: 0;
  font-size: 32rpx;
  font-weight: $weight-bold;
  color: $text-1;
  line-height: 1.25;
  letter-spacing: -0.5rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 题量：等宽数字 + 「道题」小字。
   ⚠️ 中文不能整体走 $font-mono（等宽字体没有中文，会"凑"进网格发虚），
   所以数字与中文拆成两个 span：数字 mono，中文无衬线。 */
.item-count {
  font-size: 20rpx;
  font-weight: $weight-medium;
  color: $text-3;
  flex-shrink: 0;
}
.item-count-num {
  font-family: $font-mono;
  font-size: 22rpx;
  font-weight: $weight-bold;
  color: $text-2;
  font-variant-numeric: tabular-nums;
  margin-right: 2rpx;
}
.item-actions {
  display: flex;
  gap: 36rpx;
  padding-left: 60rpx;
}
.action-btn {
  font-size: 27rpx;
  color: $text-2;
  font-weight: $weight-semibold;
  /* 扩热区：纯文字 27rpx 热区远低于指尖标准 */
  padding: 8rpx 0;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
/* 删除是破坏性操作：用朱砂（全站唯一"警告红"就是朱砂，不另造色） */
.action-btn.delete { color: $verm; }

/* ===== 弹窗 ===== */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(23, 19, 14, 0.46);
  display: flex;
  align-items: flex-end;
  z-index: 100;
  animation: fadeIn $motion-base $ease-out both;
}
.popup {
  width: 100%;
  background: $paper;
  border-radius: $radius-2xl $radius-2xl 0 0;
  padding: 20rpx $page-padding calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  box-shadow: $shadow-sheet;
  animation: sheetUp $motion-base $ease-out both;
}
/* 抽屉顶部的小把手：比标题更先告诉用户「这是个可下滑关闭的抽屉」 */
.popup-handle {
  width: 64rpx;
  height: 6rpx;
  /* v35：把手不占胶囊名额；6rpx 高 + 10rpx 圆角渲染仍为全圆，视觉零变化 */
  border-radius: $radius-sm;
  background: $rule-strong;
  margin: 0 auto 24rpx;
}
.popup-title {
  display: block;
  font-size: 36rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  margin-bottom: 28rpx;
  line-height: 1.2;
  letter-spacing: -0.8rpx;
}
.popup-label {
  display: block;
  font-size: 22rpx;
  color: $text-3;
  margin-bottom: 12rpx;
  margin-top: 8rpx;
  font-weight: $weight-semibold;
  letter-spacing: 0.5rpx;
}
.popup-label:first-of-type { margin-top: 0; }
.popup-input { margin-bottom: 8rpx; }
.popup-textarea {
  min-height: 220rpx;
  width: 100%;
  box-sizing: border-box;
  font-size: 28rpx;
  line-height: 1.6;
  padding-top: 20rpx;
  padding-bottom: 20rpx;
  height: auto;
}
.popup-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 32rpx;
}
.popup-btn { flex: 1; height: 88rpx; }
</style>
