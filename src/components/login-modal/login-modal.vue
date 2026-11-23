<template>
  <!-- 登录弹窗（**底部抽屉**，微信授权弹窗的既定形态）
       ======================================================================
       为什么不用 uni.showModal：
         ① 原生 modal 不能放协议勾选（必须做：未同意协议不得创建账号）；
         ② 文案与按钮样式不可控，和全站单色体系脱节；
         ③ 「点击没反应」难以排查 —— 原生层出错时页面无任何反馈。
       为什么是底部抽屉而不是居中卡（2026-11-08 修正）：
         微信所有授权/登录类弹窗（getUserProfile、getPhoneNumber、隐私授权）
         一律从**底部**滑出，用户对「登录 = 底部弹层」已有稳定预期。
         之前做成居中卡是错的：居中卡是「打断式对话框」的语气
         （用于确认危险操作），登录是「补充一段必要信息后继续」，
         语义上属于底部动作面板。本组件视觉也随即与 confirm-sheet /
         day-detail-sheet 对齐，全站浮层形态统一。

       状态机沿用 confirm-sheet / medal-detail 已验证的自管挂载模式：
         mounted — 是否挂着 DOM（不可见必须自己 v-if 掉，否则遮罩盖死整页）
         active  — 终态开关；入场先 false，下一帧转 true，过渡才有起点
       退场等 CLOSE_MS 再卸载，避免「瞬间消失」。 -->
  <view
    v-if="mounted"
    class="lg-mask"
    :class="{ 'lg-in': active, 'lg-gone': gone }"
    @click="onMaskTap"
    catchtouchmove="noop"
  >
    <view class="lg-sheet" :class="{ 'lg-sheet-in': active }" catchtouchmove="noop" @click.stop>
      <!-- 顶部把手 -->
      <view class="lg-handle"></view>

      <!-- ===== v8 重构：从 6 个等重区块 → 3 个层级 =====
           问题（用户反馈「还是不好看」）：品牌区 / 凭证条 / 三行清单 / 协议 / 两个按钮
           一共 6 块，每块都占一整行、分量都差不多，眼睛没有落点。
           重构思路：**合并同类、拉开层级**
             ① 品牌区（大）：IP + 标题 + 副标题，一次说清"谁在请求什么"
             ② 说明区（小）：把原「凭证条」与「三行清单」合并成一段轻文字，
                只保留最该知道的一句半 —— 微信授权 + 不收集隐私。
                原来那三个小图标（人形/盾牌/斜杠）在 34rpx 下太小、太淡，
                读不出语义，纯属噪音，全部删掉。
             ③ 操作区（大）：协议 + 主按钮。这里是用户真正要做决定的地方，
                给足空间，视觉重量集中在"登录"这一个动作上。
           结果：元素从 6 块降到 3 块，纵向也更矮。 -->

      <!-- ① 品牌区 -->
      <view class="lg-brand">
        <image class="lg-logo" src="/static/ip_mianba_smile.png" mode="aspectFit" />
        <view class="lg-brand-text">
          <text class="lg-title">我的面试小屋</text>
          <text class="lg-sub">登录后开始你的第一场模拟面试</text>
        </view>
      </view>

      <!-- ② 说明区：微信信任标识 + 一句隐私说明。
           v35.2 第十七批：凹槽压印卡（$emboss-2）+ 内部发丝线，与全站 well 同语言。 -->
      <view class="lg-note">
        <view class="lg-note-wx">
          <view class="lg-note-bubble"><view class="lg-note-dot"></view></view>
          <text class="lg-note-wx-text">微信授权登录</text>
          <!-- 指纹是"真实微信登录"的证据：openid 由微信服务端签发，前端无法伪造。
               有指纹时显示指纹，首次登录显示"安全验证"。
               ⚠️ 两种文案必须用**不同的类**：指纹是英文+数字，适合 mono 等宽
               （读起来像凭证、字符宽度不跳）；中文若也套 mono，会落到等宽字体的
               中文字形映射上，笔画发虚、字重偏细 —— 实测"安全验证"四字明显发飘。 -->
          <text class="lg-note-fp" v-if="wxFingerprint">{{ wxFingerprint }}</text>
          <text class="lg-note-badge" v-else>安全验证</text>
        </view>
        <view class="lg-note-rule"></view>
        <text class="lg-note-text">仅使用微信身份标识创建账号，用于保存面试记录与评分报告。不会获取昵称、头像、手机号。</text>
      </view>

      <!-- ③ 操作区 -->
      <view class="lg-agree">
        <view
          class="lg-check"
          :class="{ on: agreed }"
          hover-class="lg-check-press"
          @click="agreed = !agreed"
        >
          <view class="lg-check-mark" v-if="agreed"></view>
        </view>
        <view class="lg-agree-text">
          <text class="lg-agree-normal" @click="agreed = !agreed">我已阅读并同意</text>
          <text class="lg-link" hover-class="lg-link-press" @click.stop="openDoc('agreement')">《用户协议》</text>
          <text class="lg-agree-normal">与</text>
          <text class="lg-link" hover-class="lg-link-press" @click.stop="openDoc('privacy')">《隐私政策》</text>
        </view>
      </view>

      <!-- 主按钮：勾选后黑材质从左灌注（scaleX，走合成层，不掉帧） -->
      <view
        class="lg-btn lg-btn-primary"
        :class="{ 'is-ready': agreed && !loading, disabled: !agreed || loading }"
        :hover-class="(!agreed || loading) ? 'none' : 'hover-press'"
        @click="onConfirm"
      >
        <view class="lg-btn-fill" :class="{ 'lg-btn-fill-on': agreed && !loading }"></view>
        <text class="lg-btn-text">{{ loading ? '正在登录…' : '微信一键登录' }}</text>
      </view>
      <view class="lg-btn lg-btn-ghost" hover-class="hover-press" @click="onCancel">
        <text class="lg-btn-ghost-text">暂不登录</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { go, NAV } from '@/utils/nav'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /* loading：父级正在登录。置 true 时按钮显示「登录中…」并禁止重复点击，
     避免连点产生多次 wx.login 与多次建档请求。 */
  loading: { type: Boolean, default: false },
  /* wxFingerprint：微信签发的 openid 脱敏指纹（如 "ornl****Ti38"）。
     由登录响应里的 wx_identity.fingerprint 透传，用于向用户证明
     「上次登录确实走通了微信官方接口」——空值表示首次登录，还没有凭证。 */
  wxFingerprint: { type: String, default: '' }
})
const emit = defineEmits(['confirm', 'cancel', 'update:visible'])

/* 勾选状态不跨次保留：每次重新打开都从「未勾选」开始，
   这是协议确认的基本要求（不能记住上次同意就默认下次也同意）。 */
const agreed = ref(false)

/* ===== 自管挂载（同 confirm-sheet 的常量与语义）===== */
const mounted = ref(false)
const active = ref(false)
/* gone：跳转前把整层浮层直接 display:none 掉（不做过渡）。
   只用于「打开协议页」这条路径 —— 见 openDoc 的说明。
   普通的关闭（点遮罩/暂不登录）**不用**它，仍然走完整退场动画。 */
const gone = ref(false)
let enterTimer = null
let exitTimer = null
// 打开协议页时的跳转延迟定时器（见 openDoc）
let navTimer = null
const ENTER_NEXT_FRAME_MS = 20
const CLOSE_MS = 320
/* 打开协议页时的跳转延迟（见 openDoc）：只需等浮层被抹掉那一次 setData
   落到视图层，50ms 足够（远大于一帧 16.7ms，又不至于让用户感到迟滞）。 */
const DOC_NAV_DELAY_MS = 50

const clearEnter = () => { if (enterTimer) { clearTimeout(enterTimer); enterTimer = null } }
const clearExit = () => { if (exitTimer) { clearTimeout(exitTimer); exitTimer = null } }

const openModal = () => {
  clearEnter()
  clearExit()
  gone.value = false
  agreed.value = false
  mounted.value = true
  active.value = false
  enterTimer = setTimeout(() => { enterTimer = null; active.value = true }, ENTER_NEXT_FRAME_MS)
}

const finishExit = () => {
  clearEnter()
  clearExit()
  mounted.value = false
  active.value = false
  gone.value = false
}

watch(() => props.visible, (v) => {
  if (v) openModal()
  else if (mounted.value) {
    // 关闭：先播退场，再卸载
    clearEnter()
    active.value = false
    clearExit()
    exitTimer = setTimeout(finishExit, CLOSE_MS)
  }
}, { immediate: true })

const close = () => {
  // 先同步父级状态，再由 watch 的关闭分支负责播退场
  emit('update:visible', false)
  emit('cancel')
}

const onMaskTap = () => { if (!props.loading) close() }
const onCancel = () => { if (!props.loading) close() }

const onConfirm = () => {
  if (props.loading) return
  /* 未勾选协议：给出明确提示而不是静默返回。
     静默会让用户以为「按钮点不动」（本次反馈里最典型的误判来源）。 */
  if (!agreed.value) {
    uni.showToast({ title: '请先阅读并同意用户协议与隐私政策', icon: 'none' })
    return
  }
  emit('confirm')
}

/* 打开协议 / 隐私页。
   ======================================================================
   这条路径**不走退场动画**，而是把浮层直接抹掉再跳转。原因：
     只要浮层（遮罩 z-index:1000 / 抽屉）还挂在旧页面上，微信的页面转场
     就会把**整个旧页**当成一张图一起滑动，而新页同时从右侧推入 ——
     两层叠在同一屏，就是用户看到的"弹窗底下透出新页面文字"。
     这与退场动画时长无关（等 320ms、420ms 都一样），因为转场开始时
     旧页已经"拍成快照"了，快照里有浮层就是有浮层。

   所以正确顺序是：
     ① 先把浮层 display:none（gone=true）——不是淡出，是立即不画；
     ② 等一帧让 setData 落到视图层；
     ③ 再 navigateTo。
   用户感知：点链接 → 弹窗消失 → 下一页升起。中间不会有浮层跟着滑。

   ⚠️ 只有这条路径用 gone；用户主动关闭（点遮罩 / 暂不登录）仍然播完整
      320ms 退场动画——那是正常的"用户取消"，不需要抹掉。 */
const openDoc = (kind) => {
  const url = kind === 'privacy' ? '/pages/privacy/index' : '/pages/agreement/index'
  // 通知父级同步状态（避免父级下次打开时状态不一致）
  emit('update:visible', false)
  emit('cancel')
  // 立即抹掉浮层视觉（不播退场）
  clearEnter()
  clearExit()
  gone.value = true
  // 等渲染层真正不画了，再发起转场
  clearTimeout(navTimer)
  navTimer = setTimeout(() => {
    navTimer = null
    mounted.value = false
    gone.value = false
    go(url, NAV.quick)
  }, DOC_NAV_DELAY_MS)
}

const noop = () => {}

onUnmounted(() => {
  clearEnter()
  clearExit()
  if (navTimer) { clearTimeout(navTimer); navTimer = null }
})
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 登录弹窗 v8 —— 结构重排
 * ----------------------------------------------------------------------------
 * 上一版的问题（用户实拍反馈「还是不好看」）：
 *   品牌区 / 凭证条 / 三行清单 / 协议 / 两个按钮 = 6 个等重区块，
 *   每块都占一整行、分量差不多，眼睛没有落点；
 *   其中三个 34rpx 的小图标（人形/盾牌/斜杠）小到读不出语义，是纯噪音。
 *
 * 本版把 6 块合并成 3 个层级：
 *   ① 品牌（大）—— IP + 标题 + 副标题，回答"谁在请求什么"
 *   ② 说明（轻）—— 一张浅卡：微信信任标识 + 一句隐私说明
 *   ③ 操作（大）—— 协议勾选 + 主按钮，视觉重量集中在这里
 * 元素少了一半，纵向也更矮，且只有一个视觉主角（登录按钮）。
 * 单色纪律：全程 $ink / $text-* / $bg-* / $border-*，无彩色。
 * ========================================================================== */

/* ===== 遮罩 ===== */
.lg-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(23, 19, 14, 0.55);
  display: flex;
  align-items: flex-end;
  z-index: 1000;
  opacity: 0;
  transition: opacity $motion-base $ease-out;
}
.lg-mask.lg-in { opacity: 1; }
/* 跳转前抹掉整层（见 openDoc）：display:none 而非 opacity:0 ——
   透明元素仍参与合成，微信转场拍旧页快照时它还在。 */
.lg-mask.lg-gone { display: none; }

/* ===== 抽屉 =====
   v35.2 第十七批：纯白面板 → 暖纸底 + 纸张纹理，与其他浮层（privacy 联系卡 /
   confirm-sheet）同一材质身份。 */
.lg-sheet {
  width: 100%;
  box-sizing: border-box;
  background: $paper;
  background-image: repeating-linear-gradient(
    92deg,
    rgba(23, 19, 14, 0.014) 0rpx,
    rgba(23, 19, 14, 0.014) 1rpx,
    transparent 1rpx,
    transparent 4rpx
  );
  border-radius: $radius-2xl $radius-2xl 0 0;
  padding: $sp-2 $page-padding calc(#{$sp-4} + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  box-shadow: $shadow-sheet;
  transform: translateY(100%);
  transition: transform $motion-slow $ease-out;
}
.lg-sheet.lg-sheet-in { transform: translateY(0); }

.lg-handle {
  width: 72rpx;
  height: 8rpx;
  /* v35：把手不占胶囊名额；8rpx 高 + 10rpx 圆角渲染仍为全圆，视觉零变化 */
  border-radius: $radius-sm;
  background: $border-strong;
  margin: 0 auto $sp-5;
  flex-shrink: 0;
}

/* ===== ① 品牌区 =====
   v35.2 第十七批：IP 不再套圆角容器 —— 「IP 是内容角色不是装饰块」，
   直接放在纸面上（全站铁律），去掉那层 $bg-muted 灰底。 */
.lg-brand {
  display: flex;
  align-items: center;
  gap: $sp-4;
  margin-bottom: $sp-5;
}
.lg-logo {
  width: 92rpx;
  height: 92rpx;
  flex-shrink: 0;
  display: block;
}
.lg-brand-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
/* 标题 40rpx/800：全抽屉唯一的强字号，作为视觉锚点 */
.lg-title {
  font-size: 40rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -1rpx;
  line-height: 1.2;
}
.lg-sub {
  font-size: 24rpx;
  color: $text-3;
  margin-top: 8rpx;
  line-height: 1.4;
}

/* ===== ② 说明区 =====
   v35.2 第十七批：凹槽压印卡（@mixin well 配方：$paper-sunken + $emboss-2），
   内部一条发丝线分隔"凭证行"与"隐私说明"—— 与编辑资料输入槽、
   自定义题目弹窗同一材质语言。 */
.lg-note {
  background: $paper-sunken;
  box-shadow: $emboss-2;
  border-radius: $radius-lg;
  padding: $sp-3 $sp-4;
  margin-bottom: $sp-5;
  display: flex;
  flex-direction: column;
}
.lg-note-rule {
  height: 1rpx;
  background: $rule;
  margin: 16rpx 0 14rpx;
}
.lg-note-wx {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
/* 微信气泡：极简几何（圆角方块 + 两点），不冒用官方 logo */
.lg-note-bubble {
  width: 28rpx;
  height: 28rpx;
  border-radius: 8rpx;
  background: $ink;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.lg-note-dot {
  width: 5rpx;
  height: 5rpx;
  border-radius: 50%;
  background: #FFFFFF;
  box-shadow: 8rpx 0 0 #FFFFFF;
  margin-left: -4rpx;
}
.lg-note-wx-text {
  font-size: 24rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  line-height: 1.3;
}
/* 指纹：靠右、mono 等宽、更浅 —— 它是"证据"，不该和标题抢重量。
   只用于英文+数字（openid 片段），中文**不能**用这个类（见下方 badge）。 */
.lg-note-fp {
  margin-left: auto;
  font-family: $font-mono;
  font-size: 20rpx;
  color: $text-4;
  letter-spacing: 0.5rpx;
  line-height: 1.3;
}
/* 中文状态标签（"安全验证"）：用手写体栈、正常字重、同样靠右。
   为什么不用 mono：等宽字体的中文字形是"凑"进去的，笔画粗细不匀、字面偏小，
   在 20rpx 这个尺寸上会明显发虚。无衬线体在中文下才是对的。
   $text-3 比指纹的 $text-4 略深一档 —— 中文是"状态说明"，可读性要够。 */
.lg-note-badge {
  margin-left: auto;
  font-family: $font-sans;
  font-size: 21rpx;
  font-weight: $weight-medium;
  color: $text-3;
  letter-spacing: 0.5rpx;
  line-height: 1.3;
}
.lg-note-text {
  font-size: 22rpx;
  color: $text-3;
  line-height: 1.6;
}

/* ===== ③ 协议勾选 =====
   v35.2 第十七批：圆圈 → **方形空章**（$radius-xs）。未勾 = 虚线空位（"待盖章"），
   勾选 = 墨底实心 + 白勾 —— 与编辑资料岗位勾选位（pos-item-check）同一语言。
   文字容器 flex + min-height 与勾选方章同高（56rpx）——这是"章与文字对齐"
   的唯一正解：inline 流的行盒高度取字体 ascent+descent，
   与几何居中的章天然差几像素，只调父级 align-items 治不好。 */
.lg-agree {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: $sp-4;
}
.lg-check {
  position: relative;
  width: 56rpx;
  height: 56rpx;
  border-radius: $radius-xs;
  border: 2rpx dashed $rule-strong;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  transition: background-color $motion-fast $ease-out, border-color $motion-fast $ease-out;
}
/* 热区补到 88rpx（44pt），视觉仍是 56rpx 的方章 */
.lg-check::after {
  content: '';
  position: absolute;
  top: -16rpx;
  bottom: -16rpx;
  left: -16rpx;
  right: -16rpx;
}
.lg-check.on {
  background: $ink;
  border: 2rpx solid $ink;
}
.lg-check-mark {
  width: 13rpx;
  height: 7rpx;
  border-left: 3rpx solid #FFFFFF;
  border-bottom: 3rpx solid #FFFFFF;
  transform: rotate(-45deg) translate(1rpx, -2rpx);
}
.lg-check-press { opacity: $press-opacity; }

.lg-agree-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-height: 56rpx;
  font-size: 24rpx;
  line-height: 1.35;
  color: $text-3;
}
.lg-agree-text > text {
  display: inline-flex;
  align-items: center;
  line-height: 1.35;
}
.lg-agree-normal { color: $text-3; }
.lg-link {
  color: $text-1;
  font-weight: $weight-semibold;
  text-decoration: underline;
  text-underline-offset: 3rpx;
}
.lg-link-press { opacity: $press-opacity; }

/* ===== 主按钮 =====
   v35.2 第十七批：禁用态从"平灰"改为**凹槽压印**（$paper-sunken + $emboss-1）
   —— 未盖章的"空位"语义，与勾选方章呼应；勾选后黑材质从左灌注（scaleX，
   走合成层，不掉帧）。 */
.lg-btn {
  width: 100%;
  height: 92rpx;
  border-radius: $radius-btn;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.lg-btn-primary {
  background: $paper-sunken;
  box-shadow: $emboss-1;
}
/* 黑材质揭示层：transform-origin 在左 → 读作"从左侧灌满" */
.lg-btn-fill {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: $ink-gradient;
  border-radius: $radius-btn;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform $motion-slow $ease-out;
  will-change: transform;
}
.lg-btn-fill-on { transform: scaleX(1); }
/* 阴影挂在外层，不随 scale 变形 */
.lg-btn.is-ready {
  box-shadow: $ink-edge, $ink-shadow;
}
.lg-btn-text {
  position: relative;
  z-index: 1;
  font-size: 31rpx;
  font-weight: $weight-bold;
  color: $text-3;
  letter-spacing: 0;
  transition: color $motion-base $ease-out;
}
.lg-btn.is-ready .lg-btn-text { color: #FFFFFF; }

.lg-btn-ghost {
  height: 76rpx;
  margin-top: 4rpx;
  background: transparent;
  overflow: visible;
}
.lg-btn-ghost-text {
  font-size: 25rpx;
  color: $text-3;
}
</style>
