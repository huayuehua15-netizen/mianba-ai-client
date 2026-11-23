<template>
  <!-- 危险操作确认抽屉：替代注销账号原来的「两个原生 showModal 连环弹」。
       原生弹窗的问题：①两弹连击、体验生硬；②一段长文字不可扫读；
       ③红色确认键与 app 黑白语言脱节。
       本组件用清单式列出「会删掉什么」+ 勾选确认 + 郑重的确认按钮。 -->
  <!-- catchtouchmove="noop"：挡住滚动穿透（P2 修复，2026-10-08）。
       使用方 settings 页是长列表且未锁页面滚动，抽屉只盖住视觉层；真机上下滑抽屉区域时
       touchmove 会穿透到背景页面（用户看到抽屉后面的列表在动）。
       同项目的 day-detail-sheet 与 profile-edit 遮罩都显式加了同样的防护并留了说明，
       本组件此前漏了。加在遮罩上安全（抽屉内部无滚动区域，
       且不能加到祖先上否则会连带禁掉内部滚动）。 -->
  <!-- ===== v32 进出场状态机 =====
       用户反馈形态：「点开有从底部滑出，关闭时几乎瞬间消失」。
       根因与 medal-detail / day-detail-sheet 当初一模一样：
       模板原来是 `v-if="visible"` —— 父级把 visible 置 false 的瞬间，
       整棵 DOM 被移除，**根本不存在播退场动画的机会**。

       修法照搬本项目已验证的自管挂载模式（不发明新机制）：
         mounted — DOM 是否挂着。挂载权在组件自己手里；
                   不可见时必须自己 v-if 掉，否则 fixed 遮罩会盖死整页。
         active  — 终态开关。true = 到位（无位移/全不透明），false = 初态。
                   入场：挂载时先 false → 下一帧转 true，过渡才有起点。
                   退场：关闭时转 false → CLOSE_MS 后再卸载。
       为什么用「类切换 + CSS transition」而不是 keyframes 动画：
       animation 只在元素插入时播一次，无法承载退场；transition 由类名驱动，
       进出场共用同一组属性声明，天然对称。

       ⚠️ 调用方契约完全不变：仍然只是 `v-model:visible` + `@confirm`，
       父级零改动（settings / profile / history-detail 三页均不用改）。 -->
  <view
    v-if="mounted"
    class="cs-mask"
    :class="{ light: isLight, 'cs-in': active }"
    @click="requestClose"
    catchtouchmove="noop"
  >
    <!-- 抽屉本体也挂 catchtouchmove：mask 是本节点的父级，手指落在面板内容上时
         touchmove 要冒泡到遮罩才被吞掉，而**页面滚动此时往往已经被启动**，
         事件拦截拦不住「已经在滚的页面」（真机实测同类问题，见 medal-detail）。
         这里在内容层再挡一次，与宿主页面的 page-meta 滚动锁构成双保险。 -->
    <view class="cs-sheet" :class="{ light: isLight, 'cs-sheet-in': active }" catchtouchmove="noop" @click.stop>
      <view class="cs-handle"></view>

      <view class="cs-head">
        <text class="cs-title">{{ title }}</text>
        <text class="cs-desc">{{ desc }}</text>
      </view>

      <!-- 清单：把「会删什么」逐条列出，比一段长文字可扫读得多。
           light 模式下可选（轻量确认不强制清单） -->
      <view class="cs-list" v-if="items?.length">
        <view class="cs-item" v-for="(t, i) in items" :key="i">
          <text class="cs-dot"></text>
          <text class="cs-item-text">{{ t }}</text>
        </view>
      </view>

      <!-- 勾选确认：必须主动勾选才允许提交，是「确认键」之外的二次门槛。
           高危操作只用一个按钮确认太轻，连环弹窗又太烦——勾选是中间解。
           light 模式（轻量确认）不需要这层门槛：它用于「结束面试 / 删除一条记录」
           这类后果明确但不至于毁数据的操作，强上勾选只会让人烦躁。 -->
      <view class="cs-check" v-if="needCheck" hover-class="cs-check-press" @click="checked = !checked">
        <view class="cs-box" :class="{ on: checked }">
          <view class="cs-box-fill" v-if="checked"></view>
        </view>
        <text class="cs-check-text">{{ checkLabel }}</text>
      </view>

      <view class="cs-actions">
        <view class="cs-btn cs-btn-cancel" hover-class="hover-press" @click="requestClose">{{ cancelText }}</view>
        <!-- 确认键的 loading 态（v32 新增）：
             使用方在请求期间会把 busy 置 true。此前确认键没有任何「已经点下去了」
             的反馈 —— 注销 / 清空数据都要走一次网络，用户看着一个纹丝不动的黑按钮
             会再点两次（settings 页用 deletingAccount 兜了重复点击，但视觉上仍是死的）。
             这里把三个状态显式化：禁用（灰）/ 就绪（黑或红）/ 进行中（文案换成 loading-text + 白点）。
             loading 期间点击直接被 onConfirm 拒绝，不依赖父级的兜底判断。 -->
        <view
          class="cs-btn cs-btn-danger"
          :class="{ ready: canConfirm, tone: dangerTone, busy: busy }"
          hover-class="hover-press"
          @click="onConfirm"
        >
          <view v-if="busy" class="cs-spin"></view>
          <text class="cs-btn-text">{{ busy ? loadingText : confirmText }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '确认操作' },
  desc: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  checkLabel: { type: String, default: '我已了解后果' },
  confirmText: { type: String, default: '确认' },
  cancelText: { type: String, default: '取消' },
  /* variant: 'danger'（默认，重操作：清单+勾选+红色门槛） | 'light'（轻确认：无勾选门槛，一句话+两个按钮）
     为什么要两种：重操作（注销/清空数据）需要「勾选+清单」这种强门槛防止误触；
     但「结束面试 / 删除一条记录」这类后果明确、不至于毁数据的操作，
     强上勾选只会让人烦躁 —— 这是之前它们一直用原生弹窗的原因。
     light 模式让「视觉统一」与「不惹人烦」可以同时成立。 */
  variant: { type: String, default: 'danger' },
  /* dangerTone: light 模式下确认键的色 —— true=破坏性（红），false=中性（黑）。
     删除记录用 true（红色，与危险语义一致）；结束面试这种非破坏性操作用 false（黑）。 */
  dangerTone: { type: Boolean, default: true },
  /* busy: 确认键的进行中态（v32 新增，默认 false 故对所有既有调用点零影响）。
     置 true 时：文案换成 loadingText、按钮禁止点击、左侧出现一个旋转点。
     请在请求开始时置 true、请求结束（成功或失败）时置回 false。 */
  busy: { type: Boolean, default: false },
  loadingText: { type: String, default: '处理中…' }
})
const emit = defineEmits(['confirm', 'cancel', 'update:visible'])

const isLight = computed(() => props.variant === 'light')
const needCheck = computed(() => !isLight.value)   // light 不需要勾选门槛
const canConfirm = computed(() => (needCheck.value ? checked.value : true))

const checked = ref(false)

/* ===== 自管挂载（v32）=====
 * 与 medal-detail 同一套常量：等一帧让初态上屏，退场等过渡播完再卸。
 * 入场 $motion-slow(360ms) / 退场同长，遮罩与抽屉共用同一时长 ——
 * 此前遮罩 240ms、抽屉 360ms，退场时遮罩会**先**淡完、抽屉还挂在半空，
 * 最后一帧露出底层页面（这就是「生硬消失」里最刺眼的那一下）。
 * 现统一 360ms：遮罩淡出与抽屉下落同时开始、同时结束。 */
const mounted = ref(false)
const active = ref(false)
let enterTimer = null
let exitTimer = null
const ENTER_NEXT_FRAME_MS = 20
const CLOSE_MS = 360

const clearEnter = () => { if (enterTimer) { clearTimeout(enterTimer); enterTimer = null } }
const clearExit = () => { if (exitTimer) { clearTimeout(exitTimer); exitTimer = null } }

const openSheet = () => {
  clearEnter()
  clearExit()
  mounted.value = true
  // 先以初态挂载，下一帧再转终态 —— 过渡才有可动的起点
  active.value = false
  enterTimer = setTimeout(() => { enterTimer = null; active.value = true }, ENTER_NEXT_FRAME_MS)
}

const finishExit = () => {
  clearEnter()
  clearExit()
  mounted.value = false
  active.value = false
}

/* 请求关闭：遮罩点击 / 取消键都走这里。
   ⚠️ 先转 active=false（用户一点就有反馈），CLOSE_MS 后再真正卸载。
   立即 emit 让父级同步 visible=false —— 父级状态与组件动画解耦，
   这样父级的滚动锁（settings 的 page-meta）等副作用照旧按原时机生效。 */
const requestClose = () => {
  if (!mounted.value) return
  clearEnter()
  active.value = false
  /* 只发 update:visible —— 与旧契约严格一致（旧的 onCancel 也只做这一件事）。
     不额外 emit('cancel')：虽然 3 个调用点都没监听，但多出来的事件
     会让「这个组件什么时候会 cancel」这件事变得含糊。 */
  emit('update:visible', false)
  clearExit()
  exitTimer = setTimeout(finishExit, CLOSE_MS + 20)
}

/* visible 变化驱动状态机。immediate 让「初始就 visible=true」的用法也能正确进场。 */
watch(() => props.visible, (v) => {
  if (v) { openSheet(); return }
  // false：若还没挂载（父级在动画结束后再次置 false）就不做任何事
  if (!mounted.value) return
  /* 已经在退场途中：不重启计时（否则连点会拖长卸载时间），
     也不主动再 emit，避免与 requestClose 形成回路。 */
  if (exitTimer) return
  /* ⚠️ 必须清掉可能还在排队的进场计时器。
     场景：openSheet() 挂了 mounted=true + 20ms 后 active=true，
     若父级在这 20ms 窗口内就把 visible 置回 false（快速连点打开又关掉），
     不清 enterTimer 的话，那个定时器会在退场开始后把 active 又设成 true ——
     抽屉「关到一半又自己升回去」然后才被 finishExit 卸掉。
     requestClose() 里已经 clearEnter()，非组件内部路径（父级直接改 visible）
     走这里，两条路径都必须清。 */
  clearEnter()
  active.value = false
  clearExit()
  exitTimer = setTimeout(finishExit, CLOSE_MS + 20)
}, { immediate: true })

onUnmounted(() => { clearEnter(); clearExit() })

// 每次打开都重置勾选：上次勾过不能带到这次，危险操作必须每次重新确认
watch(() => props.visible, (v) => { if (v) checked.value = false })

const onConfirm = () => {
  if (!canConfirm.value) return
  if (props.busy) return          // 进行中：不重复触发（不依赖父级兜底）
  emit('confirm')
}

/* catchtouchmove 需要一个事件处理函数才能生效（模板里绑定在遮罩上，用于挡滚动穿透）。
   空实现即可 —— 目的只是「吃掉」touchmove 事件不让它冒泡到背景页面。 */
const noop = () => {}
</script>

<style lang="scss" scoped>
/* 遮罩：盖住全页，点击空白处取消。
   注意：进场那 360ms 内点遮罩**会**正常关闭 —— 这是有意保留的
   （用户明确点了外部空白，即使刚打开也应当算数）。
   遮罩与抽屉共用同一个 $motion-slow 时长，退场时二者同起同落，
   不会出现「遮罩先淡完、抽屉还挂在半空」的最后一帧。 */
.cs-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: rgba(26, 26, 26, 0.45);
  display: flex;
  align-items: flex-end;
  /* ===== 进出场改为 transition 驱动（v32，原为 animation csFade）=====
   * 关键帧动画只在元素插入时播一次，关闭时没有可播退场的载体。
   * 改为 transition + 类切换：.cs-in 是终态，无此类即初态（透明）。
   * 时长与抽屉保持同一个 $motion-slow，两者同起同落。 */
  opacity: 0;
  transition: opacity $motion-slow $ease-out;
}
.cs-mask.cs-in {
  opacity: 1;
}

/* 抽屉：白底大圆角顶角，从底部滑入 */
.cs-sheet {
  width: 100%;
  background: #FFFFFF;
  border-radius: $radius-2xl $radius-2xl 0 0;
  padding: 20rpx 48rpx calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  box-shadow: $shadow-sheet;
  transform: translateY(100%);
  transition: transform $motion-slow $ease-out;
}
.cs-sheet.cs-sheet-in {
  transform: translateY(0);
}
.cs-handle {
  width: 64rpx;
  height: 8rpx;
  /* v35：把手不占胶囊名额；8rpx 高 + 10rpx 圆角渲染仍为全圆，视觉零变化 */
  border-radius: $radius-sm;
  background: $track;
  margin: 0 auto 28rpx;
}

.cs-head { margin-bottom: 28rpx; }
.cs-title {
  display: block;
  font-size: 36rpx;
  font-weight: $weight-black;
  color: $text-1;
  line-height: 1.2;
  letter-spacing: -1rpx;
  margin-bottom: 12rpx;
}
.cs-desc {
  display: block;
  font-size: 26rpx;
  color: $text-3;
  line-height: 1.6;
}

/* 清单 */
.cs-list {
  background: $bg-fill;
  border-radius: $radius-md;
  padding: 24rpx 28rpx;
  margin-bottom: 28rpx;
}
.cs-item {
  display: flex;
  align-items: flex-start;
}
.cs-item + .cs-item { margin-top: 16rpx; }
.cs-dot {
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: $ink;
  flex-shrink: 0;
  margin-right: 16rpx;
  margin-top: 12rpx;
}
.cs-item-text {
  flex: 1;
  font-size: 26rpx;
  color: $text-1;
  line-height: 1.6;
}

/* 勾选确认 */
.cs-check {
  display: flex;
  align-items: flex-start;
  padding: 8rpx 0;
  margin-bottom: 28rpx;
}
.cs-check-press { opacity: $press-opacity; }
.cs-box {
  width: 40rpx;
  height: 40rpx;
  /* 圆角收进刻度（12 不在 8/16 刻度上） */
  border-radius: $radius-sm;
  border: 2rpx solid $ash;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 16rpx;
  margin-top: 2rpx;
  box-sizing: border-box;
  transition: background-color $motion-fast $ease-out, border-color $motion-fast $ease-out;
}
.cs-box.on {
  background: $ink;
  border-color: $ink;
}
/* 对勾：两条边拼出 L 形 */
.cs-box-fill {
  width: 18rpx;
  height: 10rpx;
  border-left: 3rpx solid #FFFFFF;
  border-bottom: 3rpx solid #FFFFFF;
  transform: rotate(-45deg) translateY(-2rpx);
}
.cs-check-text {
  flex: 1;
  font-size: 26rpx;
  color: $text-1;
  line-height: 1.6;
  font-weight: $weight-medium;
}

/* 操作按钮 */
.cs-actions {
  display: flex;
  gap: 20rpx;
}
.cs-btn {
  flex: 1;
  height: 96rpx;
  border-radius: $radius-btn;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  font-size: 30rpx;
  font-weight: $weight-bold;
  box-sizing: border-box;
}
.cs-btn-text { line-height: 1; }
.cs-btn-cancel {
  background: $bg-fill;
  color: $text-1;
}
/* 危险确认：未勾选时是浅灰禁用态，勾选后才升黑——
   「变黑」本身就是「你刚授权了这个危险操作」的视觉确认 */
.cs-btn-danger {
  background: $bg-fill-strong;
  color: $text-3;
  transition: background $motion-base $ease-out, color $motion-base $ease-out;
}
.cs-btn-danger.ready {
  background: $ink;
  color: #FFFFFF;
  /* v23：删唯一例外的按钮阴影——"升黑"本身已是确认，全站按钮无阴影口径统一 */
}
/* 破坏性确认键（dangerTone=true）：红色实心，明确「这一步不可逆」 */
.cs-btn-danger.ready.tone {
  background: $danger;
  color: #FFFFFF;
}
/* 进行中：保持已升起的底色，但去掉可按感（hover-class 仍在，
   视觉上 opacity 变化仍会发生 —— 用 pointer 层面拦不住，
   所以 onConfirm 里直接 return，这里只负责「看起来在忙」）。 */
.cs-btn-danger.busy {
  opacity: 0.86;
}
/* 旋转点：18rpx 的小圆环，1.6s 一圈。
   只用 border 的透明段制造缺口，不用图片/SVG（与全站图标语言一致但更轻）。 */
.cs-spin {
  width: 24rpx;
  height: 24rpx;
  border-radius: 50%;
  border: 3rpx solid rgba(255, 255, 255, 0.35);
  border-top-color: #FFFFFF;
  box-sizing: border-box;
  animation: csSpin 0.8s linear infinite;
}
@keyframes csSpin {
  to { transform: rotate(360deg); }
}

/* ===== light 变体（v25）=====
   轻量确认：给「结束面试 / 删除一条记录」这类后果明确但不至于毁数据的操作。
   与 danger 的差异只在「门槛」与「体量」，视觉语言完全一致（同一套单色 + 红/黑语义）。 */
.cs-mask.light { align-items: center; }        /* 轻量确认居中，更像 iOS 动作表 */
.cs-sheet.light {
  width: auto;
  margin: 0 64rpx;
  border-radius: $radius-2xl;
  padding: 48rpx 40rpx 40rpx;
  box-shadow: $shadow-pop;
  /* 居中弹层不做位移，只做「淡入 + 轻微缩近」——
     从底部滑入是抽屉的语言，居中弹层跟着滑会显得跑错方向。
     初态写在 transition 之前，.cs-sheet-in 时落到终态。 */
  opacity: 0;
  transform: translateY(24rpx) scale(0.97);
  transition: opacity $motion-base $ease-out, transform $motion-base $ease-out;
}
.cs-sheet.light.cs-sheet-in {
  opacity: 1;
  transform: none;
}
.cs-sheet.light .cs-handle { display: none; }
.cs-sheet.light .cs-title { font-size: 34rpx; margin-bottom: 10rpx; }
.cs-sheet.light .cs-btn { height: 88rpx; }
</style>
