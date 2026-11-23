<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/modules/user'
import { registerPrivacyInterceptor } from '@/utils/privacy'

const userStore = useUserStore()

/* === 全局 CSS 变量注入（关键）===
 * 微信小程序 WXSS 不会自动注入 --status-bar-height CSS 变量到 page，
 * 但所有页面 .page padding-top / nav-bar padding-top 都用了这个变量。
 * 不设置的话 calc(var(--status-bar-height) + 16rpx) 解析失败 → padding-top 为 0 → nav 被压扁。
 *
 * 兜底：App.vue style 里 page { --status-bar-height: 44px } 给个安全中间值。
 * 真机如有偏差，可后续在 onLaunch 里用 JS 动态覆盖。
 */

onLaunch(async () => {
  // 注册微信隐私授权拦截器：调用 chooseImage / 录音等隐私接口前，
  // 若用户未授权会统一弹窗（配合 manifest 的 __usePrivacyCheck__: true）
  registerPrivacyInterceptor()

  /* ===== 启动时自动检查更新（2026-10-12 新增）=====
   * 为什么必须有这个（而不是只靠设置页那个手动按钮）：
   *   微信小程序的更新机制是「启动时静默检查 → 下载新包 → **下次冷启动生效**」。
   *   如果代码里不注册 onUpdateReady，用户可能长期停留在旧版本 ——
   *   而手动点「检查更新」只有在"小程序一直没被杀掉（热启动）"时才查得到，
   *   刚冷启动完点往往查不到（微信尚未同步）。所以**自动检查才是主路径**。
   *
   * 体验设计：这里**不弹窗打断**（用户刚打开小程序，弹"发现新版本"很烦），
   *   只做静默下载 + 标记；真正的"是否重启"询问交给设置页的手动入口。
   *   若确实需要强制更新，微信会在下次冷启动自动应用新包。
   *
   * 只在正式版启用：开发版/体验版每次重新编译都被视为新版本，
   *   会在调试时反复触发 applyUpdate 导致页面重启、影响调试
   *   （设置页 checkUpdate 里有同样的判断，原因一致）。 */
  try {
    let envVersion = ''
    try {
      const account = uni.getAccountInfoSync()
      envVersion = (account && account.miniProgram && account.miniProgram.envVersion) || ''
    } catch (e) {}
    if (envVersion === 'release' && typeof uni.getUpdateManager === 'function') {
      const um = uni.getUpdateManager()
      /* 有新版本且下载完成：静默等待用户下次冷启动自动生效。
         不弹窗 —— 启动瞬间的弹窗打断感很强，且用户往往选"稍后"，反而推迟更新。
         设置页仍保留手动检查 + 弹窗确认的路径。
         ⚠️ 这里**不写 console.log**：本项目规范要求提交前无调试输出，
             且自动更新是后台行为，用户与审核都无需看到日志。 */
      um.onUpdateReady(() => {})
      // 下载失败不打扰用户：微信会在下次启动重试
      um.onUpdateFailed(() => {})
    }
  } catch (e) {
    // 更新检查失败绝不能影响启动流程
  }

  // 登录态自愈：任何接口 401 时（token 过期/被顶号），除了清 storage，
  // 还要清掉 store 内存里的 token，否则 isLoggedIn 一直为 true、wxLogin 也放行不了重新登录。
  // 关键：走 clearSession 而非 logout——logout 会写「已退出」标记，把「token 过期」
  // 误标成「用户主动退出」，之后 wxLogin(false) 被永久拒绝，形成「永不重登」死循环。
  // 监听由 request.js 的 clearAuth() 广播，注册一次（App 单例）。
  uni.$on('auth:invalid', () => userStore.clearSession())

  /* 恢复本地登录态。
     ⚠️ 不再在启动时静默 wxLogin()（2026-11-07 合规改造）：
        旧实现用户一打开小程序、什么都没点，就用 code 换 openid 并建档、
        签发 JWT —— 未征得同意先建立用户身份标识，且用户点「登录」时
        账号早已存在，表现为「转个圈就好了」，看不到任何授权动作。
        现在只有各页「微信一键登录」按钮传 force=true 才会首次建档。
     wxLogin(false) 内部已有守卫：未授权用户直接返回 null，不会建档。
     已授权过的老用户 token 过期时仍可静默重登（保住登录态自愈）。 */
  userStore.checkLogin()
  if (!userStore.isLoggedIn) {
    try {
      await userStore.wxLogin()
    } catch (e) {
      console.error('登录态恢复失败', e)
    }
  }
  // 拉取统计；若本地 token 已过期，fetchStats 内部会清掉登录态并返回 null，
  // 此时再补一次重新登录（仅对已授权用户生效，换新 token 后重试一次）
  if (userStore.isLoggedIn) {
    const stats = await userStore.fetchStats()
    if (!stats && !userStore.isLoggedIn) {
      try {
        await userStore.wxLogin()
        await userStore.fetchStats()
      } catch (e) {
        console.error('刷新登录态失败', e)
      }
    }
  }
})

onShow(() => {
})

onHide(() => {
})
</script>

<style lang="scss">
/* ============================================================================
 * 全局基础 —— 纸本朱砂 v34（Paper & Vermilion）
 * ============================================================================
 * 层次只用两件事：1rpx 发丝线（$rule）+ 底色差（纸面/卡片/凹槽）。
 * 禁用重阴影与彩色阴影；深色实体统一走 $ink-gradient 一套配方。
 *
 * ⚠️ 本文件被 17 个页面 + 14 个组件依赖。修改既有类名/结构属于回归风险，
 *    本轮（v34）保留**全部既有类名**，只改值，不删类。
 * ========================================================================== */

/* 全局统一缓动变量：让按压反馈的进入与回弹同速，避免"跳变" */
page {
  position: relative;
  background-color: $paper;        /* 米白纸面：全站唯一底色，勿改纯白 */
  color: $text-1;
  font-family: $font-sans;
  font-size: 28rpx;
  line-height: 1.56;
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  --status-bar-height: 44px;
  --capsule-width: 87px;
  --capsule-height: 32px;
}

/* 文本选中/长按不选中（小程序手感） */
view, text { -webkit-user-select: none; user-select: none; }

/* ===== 工具类 =====
 * .serif 为历史命名，现已改为无衬线展示体（宋体在小程序端会发脏，已废弃）。
 */
.serif { font-family: $font-display; font-weight: $weight-heavy; }
.mono  { font-family: $font-mono; font-variant-numeric: tabular-nums; }

/* ===== 展示级字阶 =====
 * 纸本风：粗体 + 轻微负字距（收紧才显精致）。
 * v34 相比 v33 收小一档（88→80 / 64→56）：米白底上过大的字会显得空。
 */
.display-xl { font-size: 80rpx;  font-weight: $weight-heavy; letter-spacing: -2rpx;   line-height: 1.06; color: $text-1; }
.display-lg { font-size: 56rpx;  font-weight: $weight-heavy; letter-spacing: -1.6rpx; line-height: 1.1;  color: $text-1; }
.display-md { font-size: 46rpx;  font-weight: $weight-bold;  letter-spacing: -1rpx;   line-height: 1.18; color: $text-1; }
.display-sm { font-size: 36rpx;  font-weight: $weight-bold;  letter-spacing: -0.6rpx; line-height: 1.26; color: $text-1; }

/* ===== 页面骨架 ===== */
.page-shell {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  padding: $sp-6 $page-padding calc($sp-7 + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.container { padding: $page-padding; }

/* ===== 页头（tab 页统一） ===== */
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: $sp-6;
}
.page-head-title {
  font-family: $font-display;
  font-size: 60rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  line-height: 1.08;
  letter-spacing: -1.8rpx;
}
.page-head-meta {
  font-size: 26rpx;
  color: $text-3;
  padding-bottom: 8rpx;
}

/* ===== 区块标题 ===== */
.sec-title {
  font-family: $font-display;
  font-size: 40rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  line-height: 1.2;
  letter-spacing: -1rpx;
  margin-bottom: $sp-4;
}
.section-title { /* 旧名兼容 */
  font-family: $font-display;
  font-size: 40rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  line-height: 1.2;
  letter-spacing: -1rpx;
}
.sec-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: $sp-4;
}
.sec-title-more {
  font-size: 26rpx;
  color: $text-3;
}

/* ===== 面板 / 卡片 =====
 * 两种层次手段，同一张页面里只选一种，不要混用：
 *   .glass-panel / .card  → 白底 + 1rpx hairline（有边界感的"容器"）
 *   .card-flat            → 凹槽填充无描边（更柔和的"分组"）
 */
.glass-panel {
  position: relative;
  background: $paper-card;
  border: 1rpx solid $rule;
  border-radius: $radius-lg;
}

.card {
  @extend .glass-panel;
  padding: $card-padding;
  margin-bottom: $sp-4;
}

.card-section {
  @extend .glass-panel;
  padding: $card-padding;
  margin-bottom: $sp-4;
}

/* 凹槽卡：无描边，靠底色差（纸本风的"内凹"） */
.card-flat {
  background: $paper-sunken;
  border-radius: $radius-lg;
  padding: $card-padding;
  margin-bottom: $sp-4;
}

/* 底部固定栏 */
.glass {
  background: $paper;
  border-top: 1rpx solid $rule;
  border-radius: 0;
}

/* 底部抽屉 */
.sheet {
  background: $paper;
  border-radius: $radius-2xl $radius-2xl 0 0;
  box-shadow: $shadow-sheet;
  padding-bottom: env(safe-area-inset-bottom);
}

/* 图标底座（纸本：接近方形的浅槽，不是圆形）
 *
 * v35 修正（用户实测反馈「图标和背景不搭配」）：
 * 旧实现只有 background: $paper-sunken(#F2EEE7)，而页面底是 $paper(#FAF8F4)、
 * 卡片底是纯白 —— 三个明度挤在极窄区间，**底块几乎看不出边界**，
 * 读起来不像"容器"，像图标背后一块没擦干净的印子。
 * 现在补一根 1rpx 发丝描边（$rule-strong），用「线」而不是「面」来界定边界：
 * 既能看清容器，又不会像重填充那样把一行导航压出层级。 */
.icon-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  border-radius: $radius-md;
  background: $paper-sunken;
  border: 1rpx solid $rule-strong;
  flex-shrink: 0;
}
.icon-tile.lg { width: 92rpx; height: 92rpx; border-radius: $radius-lg; }
/* 墨底变体：不需要描边（深色面上描边会显脏） */
.icon-tile.ink { background: $ink; border-color: transparent; }
.icon-tile .tile-icon { width: 38rpx; height: 38rpx; }

/* ===== 信息图数据卡 ===== */
.stat-card {
  @extend .glass-panel;
  padding: $sp-4 $sp-3;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.stat-card-num {
  @include readout(60rpx);
  font-weight: $weight-heavy;
  color: $text-1;
}
.stat-card-num.accent { color: $accent; }
.stat-card-num.gold { color: $warning; }
.stat-card-label {
  font-size: 22rpx;
  color: $text-3;
  margin-top: $sp-2;
  font-weight: $weight-medium;
}

/* ===== 按钮 =====
 * 纸本风：主按钮墨色方圆（20rpx），字重 700，无阴影、无字距。
 */
.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100rpx;
  border-radius: $radius-btn;
  font-size: 31rpx;
  font-weight: $weight-bold;
  letter-spacing: 0.5rpx;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out, background-color $motion-fast $ease-out;
}

/* 主按钮：墨色实底 */
.btn-primary {
  background: $ink;
  color: #FFFFFF;
  box-shadow: none;
}
/* 禁用态：凹槽底 + 辅助灰字（3.5:1，读作"还没准备好"而非"界面坏了"） */
.btn-primary.disabled {
  background: #E8E2D8;
  color: $text-3;
  box-shadow: none;
  transform: none;
}

/* 次要按钮：凹槽填充，无描边 */
.btn-secondary {
  background: $paper-sunken;
  color: $ink;
}

/* 描边按钮：透明底 + hairline */
.btn-outline {
  background: transparent;
  color: $text-2;
  border: 1rpx solid $rule-strong;
  letter-spacing: 0.5rpx;
}

.btn-soft {
  background: $verm-soft;
  color: $verm;
}

.btn-accent {
  background: $ink;
  color: #FFFFFF;
  box-shadow: none;
}

.btn-sm { height: 76rpx; font-size: 27rpx; border-radius: $radius-btn; }
.btn-lg { height: 108rpx; font-size: 33rpx; }

.btn-ghost {
  background: transparent;
  color: $text-3;
  font-size: 28rpx;
  letter-spacing: 0;
  height: auto;
  padding: $sp-2 0;
}

/* ===== 按压反馈（全站唯一实现，页面不得再各自覆写） ===== */
.hover-press {
  opacity: $press-opacity;
  transform: scale($press-scale);
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}

/* 大体量元素的按压：同一语义、更浅的幅度。
 * 0.72 对一张 88rpx 的小行是「明确按下去」，对一张占半屏的 hero 卡却像「界面卡了一下」。
 *
 * ⚠️ 必须用「同元素双类」写法（`.hero-cta.hover-press-strong`）：
 * 小程序的 hover-class 是把类加到**目标元素自身**，不是它的祖先。
 */
.hero-cta.hover-press-strong {
  box-shadow: inset 0 1rpx 0 rgba(23, 19, 14, 0.06);
}
.hover-press-strong {
  opacity: $press-opacity-strong;
  transform: scale($press-scale-strong);
  transition: opacity $motion-base $ease-out, transform $motion-base $ease-out;
}

.main-btn.hover-press-strong {
  box-shadow: inset 0 1rpx 0 rgba(255, 255, 255, 0.10);
}

/* ===== 重试 / 错误按钮（全站统一） ===== */
.btn-retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 84rpx;
  padding: 0 $sp-7;
  border-radius: $radius-btn;
  background: $ink;
  color: #FFFFFF;
  font-size: 28rpx;
  font-weight: $weight-bold;
  letter-spacing: 0.5rpx;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}

/* ===== 选择芯片 =====
 * chip 是唯一保留胶囊的元素（"可切换的多选项"本身就是胶囊语义）。
 * 选中态 = 墨底白字（纸本不用朱砂做选中，朱砂留给"盖章"）。
 */
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 64rpx;
  padding: 0 $sp-4;
  border-radius: $radius-pill;
  background: $paper-sunken;
  color: $text-2;
  font-size: 26rpx;
  font-weight: $weight-medium;
  transition: background-color $motion-fast $ease-out, color $motion-fast $ease-out;
}
.chip.active {
  background: $ink;
  color: #FFFFFF;
  font-weight: $weight-bold;
}

/* ===== 列表行 ===== */
.list-row {
  display: flex;
  align-items: center;
  padding: $sp-4 0;
  min-height: 104rpx;
  box-sizing: border-box;
  border-bottom: 1rpx solid $rule;
  transition: opacity $motion-fast $ease-out;
}
.list-row:last-child { border-bottom: none; }
.list-row-main { flex: 1; min-width: 0; }
.list-row-title {
  font-size: 31rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  line-height: 1.35;
  letter-spacing: -0.3rpx;
}
.list-row-meta {
  font-size: 24rpx;
  color: $text-3;
  margin-top: 8rpx;
  line-height: 1.4;
}
.list-row-value {
  @include readout(32rpx);
  font-weight: $weight-bold;
  color: $text-1;
  margin-left: $sp-3;
}
.list-row-arrow {
  font-size: 34rpx;
  color: $text-4;
  margin-left: 12rpx;
  line-height: 1;
  font-weight: $weight-regular;
}

/* ===== 输入框（凹槽填充无描边；v35 补压印 —— 只有底色没有 inset，"凹"是假的） ===== */
.input-field {
  background: $input-bg;
  border-radius: $radius-md;
  box-shadow: $emboss-2;
  height: 104rpx;
  padding: 0 $sp-4;
  font-size: 30rpx;
  color: $text-1;
}

/* ===== 巨数字（全部等宽：这是本设计系统最硬的规则） ===== */
.num-hero { @include readout(112rpx); font-weight: $weight-heavy; color: $text-1; letter-spacing: -4rpx; }
.num-xl   { @include readout(84rpx);  font-weight: $weight-heavy; color: $text-1; }
.num-lg   { @include readout(54rpx);  font-weight: $weight-heavy; color: $text-1; }
.num-label { font-size: 22rpx; color: $text-3; margin-top: 12rpx; }

/* ===== 文本省略 ===== */
.text-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.text-ellipsis-2 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* ===== 标签徽章（纸本：小方圆角，不是胶囊） ===== */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 4rpx 12rpx;
  border-radius: $radius-xs;
  font-size: 21rpx;
  line-height: 1.5;
  font-weight: $weight-medium;
  letter-spacing: 0.3rpx;
}
.tag-default { background: $paper-sunken; color: $text-3; }
.tag-ink { background: $ink; color: #FFFFFF; }
.tag-primary { background: $accent-soft; color: $accent; }
.tag-success { background: $success-soft; color: $success-deep; }
.tag-warning { background: $warning-soft; color: $warning-deep; }
.tag-danger { background: $verm-soft; color: $verm; }
.tag-accent { background: $accent-soft; color: $accent; }
/* 朱砂描边标签：用于「校招 / 社招」这类"印章属性" */
.tag-verm {
  background: transparent;
  border: 1rpx solid $verm-line;
  color: $verm;
  font-family: $font-mono;
  font-size: 20rpx;
  letter-spacing: 0.6rpx;
}

/* ===== 状态小圆点 ===== */
.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  font-size: 22rpx;
  color: $text-3;
}
.status-dot::before {
  content: '';
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: $text-4;
}
.status-dot.completed { color: $text-2; }
.status-dot.completed::before { background: $ink; }
.status-dot.in_progress { color: $verm; }
.status-dot.in_progress::before { background: $verm; }
.status-dot.interrupted { color: $text-3; }
.status-dot.interrupted::before { background: $text-4; }

/* ===== 药丸徽章 ===== */
.pill-badge {
  display: inline-flex;
  align-items: center;
  padding: 4rpx 14rpx;
  border-radius: $radius-pill;
  font-size: 21rpx;
  line-height: 1.5;
  font-weight: $weight-medium;
}
.pill-badge.ink { background: $ink; color: #FFFFFF; }
.pill-badge.accent { background: $verm-soft; color: $verm; }
.pill-badge.muted { background: $paper-sunken; color: $text-3; }

/* ===== 入场动效（位移克制到 12rpx） ===== */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12rpx); }
  to   { opacity: 1; transform: none; }
}
/* 纯淡入：遮罩/浮层不该有位移 */
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.anim-in { animation: fadeUp $motion-base $ease-out both; }

.anim-in.d1 { animation-delay: 0.03s; }
.anim-in.d2 { animation-delay: 0.06s; }
.anim-in.d3 { animation-delay: 0.09s; }
.anim-in.d4 { animation-delay: 0.12s; }
.anim-in.d5 { animation-delay: 0.15s; }
.anim-in.d6 { animation-delay: 0.18s; }

/* ===== 加载/思考动画 ===== */
@keyframes waveDot {
  0%, 80%, 100% { transform: scale(0.4); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* 骨架屏（纸本：凹槽底 + 慢扫光）
   实现要点：扫光走伪元素 + translateX（合成层），
   不要用 background-position 做动画 —— 那会每帧触发重绘。 */
.skeleton {
  background: $paper-sunken;
  border-radius: $radius-xs;
  position: relative;
  overflow: hidden;
}
.skeleton::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 253, 250, 0.85) 50%,
    rgba(255, 255, 255, 0) 100%);
  transform: translateX(-100%);
  animation: skShimmer 1.4s ease-in-out infinite;
}
@keyframes skShimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
/* 骨架屏容器禁用按压反馈：它不是可点元素 */
.sk-wrap { pointer-events: none; }

/* ===== 布局工具类 ===== */
.flex-center { display: flex; align-items: center; justify-content: center; }
.flex-between { display: flex; align-items: center; justify-content: space-between; }
.flex-col { display: flex; flex-direction: column; }
.flex-wrap { display: flex; flex-wrap: wrap; }
.flex-1 { flex: 1; }

.page-padding { padding-left: $page-padding; padding-right: $page-padding; }

/* 分隔线 */
.subtle-border {
  border-top: 1rpx solid $rule;
  padding-top: $sp-3;
  margin-top: $sp-3;
}

/* 顶部圆角分隔条 */
.top-curve {
  border-top-left-radius: $radius-lg;
  border-top-right-radius: $radius-lg;
}

/* ===== segmented ===== */
.seg-bar {
  display: flex;
  background: $paper-sunken;
  border-radius: $radius-md;
  padding: 5rpx;
}
.seg-item {
  flex: 1;
  text-align: center;
  padding: 13rpx 0;
  font-size: 26rpx;
  color: $text-2;
  border-radius: $radius-sm;
  transition: background-color $motion-fast $ease-out, color $motion-fast $ease-out;
}
.seg-item.active {
  background: $paper-card;
  color: $ink;
  font-weight: $weight-semibold;
  box-shadow: 0 1rpx 3rpx rgba(23, 19, 14, 0.08);
}

/* ============================================================================
 * 以下为跨页共享配方（v32 起逐步收口，v34 全部改为纸本语言）
 * ========================================================================== */

/* ===== 自定义导航栏（设置类页面共用）=====
 * 用法：
 *   <view class="pg-nav" :style="navBarStyle">
 *     <view class="pg-nav-side pg-nav-left" hover-class="hover-press" @click="goBack">
 *       <image class="pg-nav-back" :src="ICONS['arrow-left']" mode="aspectFit" />
 *     </view>
 *     <view class="pg-nav-center"><text class="pg-nav-title">标题</text></view>
 *     <view class="pg-nav-side pg-nav-right"></view>
 *   </view>
 *
 * 三个必须配套的点，缺一个就会出问题：
 *   ① position: fixed + z-index：脱离文档流、盖在内容之上；
 *   ② 页面必须有**等高占位块**（.pg-nav-hold），否则内容会钻到导航栏下面；
 *   ③ 背景必须是**实色**（$paper），不能透明 —— 否则滚动时文字透出来。
 */
.pg-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: $nav-fixed-z;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 0;
  padding-bottom: $nav-gap-bottom;
  background: $paper;
  box-sizing: border-box;
  border-bottom: 1rpx solid transparent;
  transition: border-color $motion-fast $ease-out;
}
.pg-nav.is-stuck {
  border-bottom-color: $rule;
}

/* 占位块：与导航栏等高，把内容顶下来。 */
.pg-nav-hold {
  width: 100%;
  flex-shrink: 0;
}
.pg-nav-hold .pg-nav-hold-inner {
  height: $nav-side-h;
  margin-bottom: $nav-gap-bottom;
}

.pg-nav-side {
  /* 热区 $nav-side-h(88rpx = 44pt)：微信可点元素建议值。 */
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 $nav-back-gap;
  box-sizing: border-box;
  height: $nav-side-h;
}
.pg-nav-left { justify-content: flex-start; padding-left: $page-padding; }
.pg-nav-right { width: $nav-hold-w; flex-shrink: 0; }

/* 返回键：箭头套一个 64rpx 底座，成为明确的「按钮」而不是悬空图标。
   v34：底座由圆形改为圆角方形（纸本语言），背景改为发丝描边。 */
.pg-nav-back-tile {
  width: $nav-back-tile;
  height: $nav-back-tile;
  border-radius: $radius-sm;
  background: $paper-sunken;
  border: 1rpx solid $rule;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color $motion-fast $ease-out, opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.pg-nav-back-tile.pressed { background: $bg-fill-strong; }
.pg-nav-back { width: $nav-back-size; height: $nav-back-size; display: block; }
.pg-nav-center {
  position: absolute;
  left: 0; right: 0; top: 0; bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  padding-top: var(--nav-pad-top, 0px);
  padding-bottom: $nav-gap-bottom;
  box-sizing: border-box;
}
.pg-nav-title {
  font-size: $nav-title-size;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -0.4rpx;
}

/* ===== 页面底部安全区 ===== */
.page-safe-bottom { height: calc(#{$safe-bottom-gap} + env(safe-area-inset-bottom)); }

/* ===== 长文档排版（隐私政策 / 用户协议共用）=====
 * 行高 $reading-line(1.78)：中文长文可读性区间。
 */
.doc-head { padding: $sp-3 0 $sp-5; }
.doc-head-title {
  display: block;
  font-size: $font-3xl;
  font-weight: $weight-black;
  color: $text-1;
  line-height: 1.12;
  letter-spacing: -2rpx;
}
.doc-head-meta {
  display: block;
  margin-top: $sp-2;
  font-size: $font-sm;
  color: $text-3;
}

/* 引言：与正文之间用一条 hairline 分开 */
.doc-lead {
  display: block;
  font-size: $font-md;
  color: $text-2;
  line-height: $reading-line;
  padding-bottom: $sp-6;
  border-bottom: 1rpx solid $rule;
}

.doc-section { padding: $sp-6 0 0; }
/* 节号：朱砂等宽序号（本设计系统的"盖章"位） */
.doc-num {
  display: block;
  font-family: $font-mono;
  font-size: 22rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 1rpx;
  font-variant-numeric: tabular-nums;
}
.doc-title {
  display: block;
  margin-top: 8rpx;
  font-size: 34rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  line-height: 1.3;
  letter-spacing: -0.5rpx;
}
.doc-body { margin-top: $sp-3; }
.doc-para {
  display: block;
  font-size: $font-md;
  color: $text-2;
  line-height: $reading-line;
  margin-bottom: $reading-gap;
}
.doc-para:last-child { margin-bottom: 0; }

/* 条目：圆点用 view 而不是 text —— text 是 inline，width/height 不生效 */
.doc-list { margin-top: $sp-2; }
.doc-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: $reading-gap;
}
.doc-dot {
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: $ink;
  flex-shrink: 0;
  margin-top: 18rpx;
  margin-right: $sp-3;
}
.doc-text {
  flex: 1;
  font-size: $font-md;
  color: $text-2;
  line-height: $reading-line;
}

.doc-footnote {
  display: block;
  margin-top: $sp-5;
  font-size: $font-xs;
  color: $text-3;
  line-height: 1.7;
}

/* 尊重系统的减弱动效偏好 */
@media (prefers-reduced-motion: reduce) {
  page, view, text, image, button, input, textarea, navigator, scroll-view, swiper, icon {
    animation: none !important;
    transition: none !important;
  }
}
</style>
