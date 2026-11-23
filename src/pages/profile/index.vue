<template>
  <!-- 弹层期间锁掉页面滚动（v25 滚动穿透修复 · 真机实锤）：
       勋章详情抽屉展开后，手指在抽屉上滑动会带动背后的「我的」页一起滚。
       ⚠️ page-meta 必须是页面内第一个节点、且不能被 wx:if/wx:for 动态增删。 -->
  <page-meta :page-style="sheetLockStyle" />

  <view class="page">

    <!-- 状态栏 -->
    <view class="status-bar" :style="{ height: statusBar + 'px' }"></view>

    <!-- 页头：等宽眉标 + 编辑式大标题 -->
    <view class="pg-head">
      <text class="pg-kicker">MY PROFILE</text>
      <text class="pg-title">我的</text>
    </view>

    <!-- ===== Hero：墨色「工牌卡」（v35.3 第十九批：身份 + 段位合并）=====
         与首页 hero / 报告总分卡同一套材质（$ink-gradient + 双内亮边 + 接地投影）。
         v35.3 把原「段位数据卡」（一张独立白卡，与统计页重复）收编进身份卡：
           · 右上角 = 等级印章（墨面上用 $grade-*-lit 提亮版，旋转 -6°）
           · 底部 = 三格读数轨（场面试 / 练习时长 / 连续天数，白字读数）
         一张卡回答"你是谁 + 你练得怎么样"，重复的全宽卡就此消失。 -->
    <view class="hero anim-in d1" hover-class="hover-press-strong" @click="onHeroTap">
      <!-- 溢出卡片边缘的同心圆，被 overflow 裁切，是空间感的来源 -->
      <view class="hero-ring r1"></view>
      <view class="hero-ring r2"></view>

      <view class="hero-top" :style="heroTopStyle">
        <text class="hero-eyebrow">PROFILE</text>
      </view>

      <!-- 等级印章：压在右上角（有评分时才盖） -->
      <view v-if="userStore.isLoggedIn && avgNum !== null" class="hseal" :class="'hseal-' + gradeText.toLowerCase()">
        <text class="hseal-letter">{{ gradeText }}</text>
        <text class="hseal-cap">GRADE</text>
      </view>

      <view class="hero-id">
        <view class="avatar-wrap">
          <!-- 环绕光带：一道朱砂光束沿头像圆环缓慢巡游。
               遮罩原理：avatar-inner（墨圆）盖住中心，只有 4rpx 环露出光束。 -->
          <view class="avatar-beam"></view>
          <view class="avatar-inner">
            <text v-if="!effectiveAvatar" class="avatar-letter">{{ userStore.isLoggedIn ? avatarLetter : '?' }}</text>
            <image v-else class="avatar-img" :src="effectiveAvatar" mode="aspectFill" @error="onAvatarError" />
          </view>
        </view>

        <view class="hero-id-text">
          <text class="hero-name">{{ userStore.isLoggedIn ? (userStore.userInfo?.nickname || '微信用户') : '点击头像登录' }}</text>
          <text class="hero-sub" v-if="userStore.isLoggedIn">{{ heroSubline }}</text>
        </view>

        <!-- 编辑入口：与头像/昵称同排，「编辑这份身份」的归属一目了然 -->
        <view
          class="hero-edit"
          hover-class="hero-edit-press"
          @click.stop="onEditTap"
          v-if="userStore.isLoggedIn"
        >
          <image class="hero-edit-icon" :src="ICONS['edit-pen-white']" mode="aspectFit" />
        </view>
      </view>

      <!-- 工牌卡底部：四格读数轨（平均分 / 场面试 / 练习时长 / 连续天数） -->
      <template v-if="userStore.isLoggedIn">
        <view class="hero-rule-ink"></view>
        <view class="hero-stats">
          <view class="hstat">
            <text class="hstat-num">{{ statsLoadFailed ? '—' : avgScoreAnim }}</text>
            <text class="hstat-label">平均分</text>
          </view>
          <view class="hstat-div"></view>
          <view class="hstat">
            <text class="hstat-num">{{ statsLoadFailed ? '—' : interviewCountAnim }}</text>
            <text class="hstat-label">场面试</text>
          </view>
          <view class="hstat-div"></view>
          <view class="hstat">
            <text class="hstat-num">{{ statsLoadFailed ? '—' : practiceNumAnim }}</text>
            <text class="hstat-label">{{ statsLoadFailed ? '未加载' : practiceDuration.label }}</text>
          </view>
          <view class="hstat-div"></view>
          <view class="hstat">
            <text class="hstat-num">{{ statsLoadFailed ? '—' : streakCountAnim }}</text>
            <text class="hstat-label">连续天数</text>
          </view>
        </view>
      </template>
    </view>

    <!-- ===== 个性签名：藏书票 =====
         bio 只在这一处展示。设计隐喻——藏书票（ex-libris）：
         墨线框住、硬质偏移投影、贴在页面上的纸卡。它是全页唯一用「实线墨边 +
         硬投影」的卡：别的卡都是发丝描边轻浮着，唯独它像被实实在在印上去、
         按下来，因为它托着全页最私人的那句话。 -->
    <view
      class="signature-block anim-in d2"
      :class="{ 'is-empty': !hasSignature }"
      v-if="userStore.isLoggedIn"
    >
      <view class="sig-paper"></view>
      <view class="sig-head">
        <view class="sig-labels">
          <text class="sig-label">个性签名</text>
          <text class="sig-label-en">MOTTO</text>
        </view>
        <view class="sig-edit" hover-class="hover-press" @click.stop="onEditSignature">
          <image class="sig-edit-icon" :src="ICONS['edit-pen']" mode="aspectFit" />
          <text class="sig-edit-text">{{ hasSignature ? '编辑' : '去写一句' }}</text>
        </view>
      </view>
      <!-- 短规则线：编辑系统里 36px 短规则是「标点符号」，比整条横线克制得多 -->
      <view class="sig-rule"></view>
      <view class="sig-body">
        <text class="sig-text">{{ hasSignature ? signatureText : '写下你的目标与心声，让每次练习都有方向' }}</text>
        <view class="sig-foot" v-if="hasSignature">
          <text class="sig-foot-dash">—</text>
          <text class="sig-foot-name">{{ userStore.userInfo?.nickname || '我' }}</text>
        </view>
      </view>
    </view>

    <!-- ===== 成就勋章：横滑展柜 =====
         横滑展柜让勋章放大到能看清材质，右侧永远露出半枚，是「还能滑」的最强暗示。
         已解锁：墨材质底座 + 白色图标 + 扫光，强调「已赚到」。
         未解锁：虚线空位 + 可见进度轨，靠描边虚实与填充有无区分，不引入第二种颜色。 -->
    <view class="section anim-in d4" v-if="userStore.isLoggedIn">
      <view class="section-head">
        <view class="section-title-wrap">
          <text class="section-no">01</text>
          <text class="section-title">成就勋章</text>
          <view class="section-title-line"></view>
        </view>
        <text class="section-more">{{ unlockedCount }} / {{ allMedals.length }} 解锁</text>
      </view>
      <text class="medal-hint" v-if="nextMedalHint">{{ nextMedalHint }}</text>

      <scroll-view scroll-x class="medal-scroll" :show-scrollbar="false">
        <view class="medal-track">
          <view
            class="medal-card"
            v-for="m in displayedMedals"
            :key="m.id"
            hover-class="hover-press"
            :class="{ 'medal-locked': !m.unlocked }"
            @click="onMedalTap(m)"
          >
            <!-- 锁定态 = 虚线轨道环 + 可见进度条；已完成 = 墨材质半球 + 扫光。
                 单色体系里唯一可靠的「未完成」语言是虚线描边。 -->
            <view class="medal-disc" :class="{ 'medal-disc-on': m.unlocked }">
              <view class="medal-shine" v-if="m.unlocked"></view>
              <image class="medal-img" :src="ICONS[m.unlocked ? `${m.icon}-white` : m.icon]" mode="aspectFit" />
            </view>
            <text class="medal-name">{{ m.name }}</text>
            <!-- 锁定态不再只写「未解锁」：有进度的显示百分比，是看得见的目标 -->
            <text class="medal-desc" v-if="m.unlocked">{{ m.desc }}</text>
            <template v-else>
              <text class="medal-desc medal-desc-progress" v-if="m.progress > 0">{{ m.progressPct }}%</text>
              <text class="medal-desc" v-else>未解锁</text>
              <!-- 进度轨：宽度已由 JS 预算成字符串，模板不做任何运算 -->
              <view class="medal-progress" v-if="m.progress > 0">
                <view class="medal-progress-fill" :style="{ width: m.progressPct + '%' }"></view>
              </view>
            </template>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- ===== 主按钮 ===== -->
    <view class="main-action anim-in d5">
      <view class="main-btn" hover-class="hover-press-strong" @click="onMainAction">
        <text class="main-btn-text">{{ userStore.isLoggedIn ? '开始今日练习' : '登录' }}</text>
      </view>
      <!-- ⚠️ 2026-10-12 审核合规补：登录按钮下方必须有协议同意提示。
           微信审核对「收集用户信息」的核心要求是**用户知情且主动同意**。
           ⚠️⚠️ 条件不能只写 !isLoggedIn：本页 onLaunch 会静默自动登录，
           绝大多数情况下进来时 isLoggedIn 已经是 true。 -->
      <view class="login-agree">
        <text class="login-agree-text">{{ userStore.isLoggedIn ? '使用本产品即代表你已阅读并同意' : '登录即代表你已阅读并同意' }}</text>
        <text class="login-agree-link" @click.stop="goAgreementPage">《用户协议》</text>
        <text class="login-agree-text">与</text>
        <text class="login-agree-link" @click.stop="goPrivacyPage">《隐私政策》</text>
      </view>
    </view>

    <!-- ===== 列表：快捷入口与设置列表合并成一张分组卡 =====
         分开放时底部又碎又空；合并后是一张有分量的分组卡。 -->
    <view class="list anim-in d6">
      <view class="list-row" hover-class="hover-press" @click="goPositions">
        <view class="list-icon">
          <image class="list-icon-img" :src="ICONS['briefcase']" mode="aspectFit" />
        </view>
        <text class="list-text">岗位库</text>
        <image class="list-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
      </view>
      <view class="list-row" hover-class="hover-press" @click="goCustomQuestions">
        <view class="list-icon">
          <image class="list-icon-img" :src="ICONS['square-pen']" mode="aspectFit" />
        </view>
        <text class="list-text">自定义题目</text>
        <image class="list-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
      </view>
      <view class="list-row" hover-class="hover-press" @click="goSettings">
        <view class="list-icon">
          <image class="list-icon-img" :src="ICONS['setting']" mode="aspectFit" />
        </view>
        <text class="list-text">设置</text>
        <image class="list-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
      </view>
      <view class="list-row" hover-class="hover-press" @click="goHelp">
        <view class="list-icon">
          <image class="list-icon-img" :src="ICONS['help-circle']" mode="aspectFit" />
        </view>
        <text class="list-text">帮助与反馈</text>
        <image class="list-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
      </view>
      <view class="list-row" hover-class="hover-press" @click="goAbout">
        <view class="list-icon">
          <image class="list-icon-img" :src="ICONS['info-circle']" mode="aspectFit" />
        </view>
        <text class="list-text">关于我的面试小屋</text>
        <image class="list-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
      </view>
    </view>

    <!-- 退出登录：卡片式 -->
    <view class="logout-card anim-in d7" hover-class="hover-press" @click="onLogout" v-if="userStore.isLoggedIn">
      <image class="logout-icon" :src="ICONS['log-out']" mode="aspectFit" />
      <text class="logout-text">退出登录</text>
    </view>

    <!-- 品牌收尾：让页面底部有一个安静的落点，而不是突然断在退出按钮上 -->
    <view class="footer anim-in d8">
      <text class="footer-text">我的面试小屋</text>
    </view>

    <view class="spacer-bottom"></view>

    <!-- 成就解锁仪式：改由全局宿主驱动 -->
    <medal-ceremony-host ref="ceremonyRef" :visible="pageVisible" />

    <!-- 勋章详情抽屉：z-index 低于仪式（150 < 200） -->
    <medal-detail :visible="medalDetailVisible" :medal="medalDetailData" @close="onMedalDetailClose" />

    <!-- 退出登录确认：light 变体，深色确认键（退出不删数据，非破坏性） -->
    <confirm-sheet
      v-model:visible="logoutSheetVisible"
      variant="light"
      title="退出登录？"
      desc="本机会话将结束，云端的面试记录与评分报告不会删除。"
      confirm-text="退出"
      cancel-text="取消"
      @confirm="onLogoutConfirm"
    />

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
import { ref, computed, onMounted } from 'vue'
import { onShow, onHide, onBackPress } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/modules/user'
import { useCountUp } from '@/composables/useCountUp'
import ConfirmSheet from '@/components/confirm-sheet/confirm-sheet.vue'
import { ICONS } from '@/utils/svg-icons'
import { MEDAL_DEFS, buildMedals } from '@/utils/medals'
import LoginModal from '@/components/login-modal/login-modal.vue'
import MedalCeremonyHost from '@/components/medal-ceremony-host/medal-ceremony-host.vue'
import MedalDetail from '@/components/medal-detail/medal-detail.vue'

const userStore = useUserStore()
const avatarError = ref(false)
/* 统计数据是否没拉到（v24）：失败时数据卡显示「—」而不是 0 —— 详见 onShow 注释。
 * 弱网下把「没加载出来」说成「0 场面试」会让用户以为历史数据被清空。 */
const statsLoadFailed = ref(false)
/* 本页是否前台：tabBar 页切走后仍挂在内存里，仪式宿主靠它避免后台偷偷播完。 */
const pageVisible = ref(false)
const ceremonyRef = ref(null)

/* ===== 个性签名 =====
 * 就是用户资料里的 bio（后端 User.bio，maxlength 200），与「编辑资料」页的
 * 「个人简介」是同一个字段。
 * 上一版这里是个独立的本地 ref + showModal：只改内存、退出小程序即丢，
 * 而且与编辑页写的 bio 互不相干 —— 用户在编辑页写的东西，回「我的」页根本看不到。
 */
const signatureText = computed(() => userStore.userInfo?.bio || '')
const hasSignature = computed(() => !!signatureText.value.trim())

/* Hero 副标题：只放身份事实（教育阶段 · 目标岗位）。
   * bio 故意不在这里出现 —— 它由下方签名区独占展示。原来 Hero 和签名区
   * 各显示一遍 bio，签名区就显得多余，而且单行截断把长句子切得没头没尾。 */
const heroSubline = computed(() => {
  const u = userStore.userInfo || {}
  const stage = u.education_stage || ''
  const n = Array.isArray(u.target_positions) ? u.target_positions.length : 0
  const parts = [stage, n ? `已选 ${n} 个目标岗位` : ''].filter(Boolean)
  return parts.length ? parts.join(' · ') : '完善资料，解锁专属练习计划'
})

/* ===== 成就勋章（v28 扩充：6 → 11 枚）=====
 * 解锁条件 / 达成日期 / 进度全部来自后端 /user/stats 的 medal_meta。
 * 上一版是写死的 unlocked: true/false，所以每个人看到的勋章状态一模一样，完全是装饰。
 *
 * 扩充思路（见设计分析）：
 * 1) 补早期阶梯（1/3/10 场）：原来第一枚之后直奔 7 天连击 / 均分 85，
 *    新人在空档期没有够得着的下一枚，留存就在这段流失；
 * 2) 砍掉「高分突破 90+」：它与「表达大师 85+」是包含关系（90 必然 ≥85），
 *    两枚并排像注水。换成「五维均衡」——奖励全面发展而非靠单维拉分；
 * 3) 用上后端已有但勋章从未使用的 dimension_scores 与 total_practice_minutes。
 *
 * 定义已抽到 utils/medals.js（单点）：解锁仪式要在多页播，各页面各写一份必然阈值漂移
 * （原注释就警告过「改勋章时前后端两处必须同步」）。这里只做一次合并渲染。
 * ⚠️ 阈值必须与 server/src/controllers/userController.js 的 MEDAL_DEFS 同步。
 */
const allMedals = computed(() => buildMedals(userStore.stats))

const statusBar = ref(44)
/* 胶囊避让（真机 bug 修复，2026-10-08）：
   status-bar 只让出了状态栏高度，**没有让出微信胶囊的区域** ——
   而 hero 卡片紧贴状态栏下方，其右上角的「编辑资料」圆钮正好落在胶囊覆盖范围内，
   真机上被官方胶囊盖住、点不到（用户实锤：「和那两个官方自带的东西重合」）。
   项目其他自定义导航页（首页/统计/历史/面试页）都已用 getMenuButtonBoundingClientRect
   算出 capsuleGap 并 paddingRight 避让，只有本页漏了 —— 这里补上同一套逻辑。
   垂直方向：胶囊底边可能低于状态栏底边，hero 顶行需要再让出这段差值，
   否则标题与按钮仍会被胶囊纵向覆盖。 */
const capsuleGap = ref(96)
const capsuleExtraTop = ref(0)
try {
  const win = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
  statusBar.value = win.statusBarHeight || 44
  const rect = typeof uni.getMenuButtonBoundingClientRect === 'function'
    ? uni.getMenuButtonBoundingClientRect()
    : null
  if (rect && rect.width > 0 && win.windowWidth) {
    // 胶囊左侧留白 + 14px 呼吸（与首页/面试页同一公式，保证全站观感一致）
    capsuleGap.value = win.windowWidth - rect.left + 14
    /* 垂直：胶囊底边相对状态栏底边多出的部分。
       卡片自身还有 padding-top（30rpx ≈ 15px），所以只需补足超出卡片上内边距的那部分，
       避免把卡片撑得过高。 */
    const cardPadTopPx = 15
    const extra = (rect.bottom || 0) - statusBar.value - cardPadTopPx
    if (extra > 0) capsuleExtraTop.value = Math.ceil(extra)
  }
} catch (e) { /* 取不到时用安全默认值 */ }

// hero 顶部标题行：右侧避开胶囊水平区，顶部补足胶囊纵向超出量
const heroTopStyle = computed(() => ({
  paddingRight: capsuleGap.value + 'px',
  paddingTop: capsuleExtraTop.value + 'px'
}))

const effectiveAvatar = computed(() => {
  if (avatarError.value) return ''
  return userStore.userInfo?.avatar_url || ''
})
const avatarLetter = computed(() => {
  const n = userStore.userInfo?.nickname || ''
  return n ? n.trim().charAt(0).toUpperCase() : '面'
})
/* 练习时长：不足 1 小时显示分钟。
 * 上一版是 Math.round(minutes / 60)，练了 20 分钟会显示"0 小时"，像功能坏了。 */
const practiceDuration = computed(() => {
  const m = Math.round(userStore.stats?.total_practice_minutes || 0)
  if (m < 60) return { num: String(m), label: '分钟' }
  const h = m / 60
  return { num: h < 10 ? (Math.round(h * 10) / 10).toString() : String(Math.round(h)), label: '小时' }
})

/* 平均分的数值形态：仅供进度条与「距下一档」计算使用。
 *
 * 2026-10-08 口径调整：**未作答的场次按 0 分计入平均**（用户决策），
 * 于是「真的考了 0 分」与「一场都没考」的 average_score 都是 0。
 * 判据改用 `scored_interview_count`（参与统计的场次）区分两者：
 *   · 没参与过 → 显示「—」（不能说用户没做过的事）
 *   · 参与过但 0 分 → 如实显示 0 分，文案给下一步动作而不是责备
 * （旧判据 `s > 0` 会把「做了 11 场但都没答」的用户说成「开始你的第一次」，与统计页矛盾。） */
const avgNum = computed(() => {
  const s = userStore.stats?.average_score
  if (typeof s !== 'number') return null
  const counted = Number(userStore.stats?.scored_interview_count) || 0
  return counted > 0 ? s : null
})
const avgScore = computed(() => (avgNum.value === null ? '—' : avgNum.value))
const gradeText = computed(() => {
  if (avgNum.value === null) return '—'
  const s = avgNum.value
  if (s >= 90) return 'S'
  if (s >= 80) return 'A'
  if (s >= 70) return 'B'
  if (s >= 60) return 'C'
  return 'D'
})
/* v35.3 第十九批：原「段位数据卡」的 gradeLine（距 X 级还差 Y 分）、gradeDesc
 * 与 barPct 进度条仪表随卡片收编退役 —— 工牌卡只保留印章 + 四格读数轨，
 * 目标感文案由统计页 hero 承载（避免同一文案在两个 tab 重复）。 */

/* ===== 数字滚动（v32）=====
 * 改之前本页是三种数字形态并存：
 *   · 平均分 46rpx 直接是静态值 —— 一进来就"拍"在那里；
 *   · 三格统计（场次/时长/连续天数）同样是静态值；
 *   · 而进度条却从 0 滚到位 —— 同一张卡里，条在动、数字不动，像是没配合上。
 * 现在统一走 useCountUp，与统计页同一套刻度：时长 900ms / 30fps / 逐项错开 90ms。
 *
 * 为什么 fps=32：useCountUp 的注释里记着实测 —— 小程序每次 ref 写入都是一次 setData，
 * 本页一次挂 4 个数字，60fps 会到 300+ 次/秒，低端安卓上卡片会肉眼可见地抽搐。
 *
 * 降级口径不变：statsLoadFailed 时模板直接显示「—」，不经过这两个 ref，
 * 不会出现「— 在跳」的怪象；平均分为 null（无有效评分）时 target 传 '—'，
 * useCountUp 对非数字原样透传。
 */
const avgScoreAnim = useCountUp(
  computed(() => (avgNum.value === null ? '—' : avgNum.value)),
  { duration: 900, decimals: 1, fps: 32, delay: 0 }
)
const interviewCountAnim = useCountUp(
  computed(() => userStore.stats?.total_interviews || 0),
  { duration: 900, fps: 32, delay: 90 }
)
const streakCountAnim = useCountUp(
  computed(() => userStore.stats?.streak_days || 0),
  { duration: 900, fps: 32, delay: 180 }
)
/* 练习时长：单位会在分钟/小时之间切，小数位跟着单位走（decimals 传函数）。
 * 接在最后错开，本页 4 个数字共铺开 270ms。 */
const practiceNumAnim = useCountUp(
  computed(() => Number(practiceDuration.value.num) || 0),
  {
    duration: 900,
    decimals: () => (practiceDuration.value.label === '小时' && String(practiceDuration.value.num).includes('.') ? 1 : 0),
    fps: 32,
    delay: 270
  }
)

const unlockedCount = computed(() => allMedals.value.filter(m => m.unlocked).length)
// v28 勋章扩到 11 枚，横滑展柜不截断——右侧永远露出半枚是「还能滑」的暗示。
/* v32：额外预算 progressPct（0-100 整数）。
 * 为什么不在模板里写 Math.round(m.progress * 100)：
 *   ① WXML 表达式能力有限，且全项目模板的既定做法是「只取值、不运算」
 *      （序号/宽度/日期一律在 JS 里算好，见 report 的 dimensionBars）；
 *   ② 同一个值要在两处出现（百分比文字 + 进度轨宽度），
 *      算一次分发两处，才不会出现「写 62% 却画 63% 宽」的漂移。 */
const displayedMedals = computed(() =>
  allMedals.value.map((m) => ({
    ...m,
    progressPct: Math.round((Number(m.progress) || 0) * 100)
  }))
)
/* 下一枚目标：取第一枚未解锁的，给用户一个「再努力一下就到手」的抓手；
 * 全部解锁时换成祝贺文案，勋章墙不留死气。 */
const nextMedalHint = computed(() => {
  const next = allMedals.value.find(m => !m.unlocked)
  if (!next) return '已解锁全部勋章，你已是面霸'
  return `下一枚 · ${next.name} — ${next.desc}`
})

/* ===== 解锁仪式（2026-10-08 全局化后本页只剩展示职责）=====
 * 检测与队列已抽到 store/modules/medal.js + components/medal-ceremony-host：
 *   检测挂在 userStore.fetchStats 内部 —— 任何页面（首页/统计/我的/报告…）
 *   拉到最新 stats 都会自动检测并抛出仪式，不再依赖「用户主动打开我的页」。
 *   旧实现把检测写在本页 onShow，导致用户做完面试在报告页看不到任何反馈。
 * 本页此前自带的 SEEN_KEY / loadSeenIds / saveSeenIds / detectNewUnlocks /
 * checkAndPlayCeremony / onCeremonyFinish / ceremonyQueue 全部删除（单一实现）。
 * 保留 onBackPress：仪式进行中按系统返回键应推进队列而不是退页 ——
 * 这是【页面级】生命周期，写在子组件里不生效。 */

/* 勋章详情：点击展柜卡片升起底部抽屉。
   展示中的卡片可能是解锁也可能锁定，两副面孔由组件内部按状态切换。 */
const medalDetailVisible = ref(false)
const medalDetailData = ref({})

const onMedalTap = (m) => {
  medalDetailData.value = m
  medalDetailVisible.value = true
}
const onMedalDetailClose = () => { medalDetailVisible.value = false }
onBackPress(() => {
  if (ceremonyRef.value && ceremonyRef.value.isActive()) {
    ceremonyRef.value.onTap()
    return true
  }
  return false
})

const onAvatarError = () => { avatarError.value = true }

/* 登录：走全站统一的 <login-modal>（含协议勾选）。
   本页有两个入口（点 hero、点主按钮），共用同一个弹窗。 */
const loginVisible = ref(false)
const loginLoading = ref(false)
/* 上次微信签发的 openid 指纹，用于弹窗展示"真实微信登录"凭证 */
const wxFingerprint = ref('')
try { wxFingerprint.value = uni.getStorageSync('wx_identity_fp') || '' } catch (e) {}

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
    await userStore.fetchStats().catch(() => {})
  } catch (e) {
    const msg = e?.message || e?.errMsg || ''
    uni.showToast({ title: msg && msg.length < 24 ? msg : '登录失败，请检查网络后重试', icon: 'none' })
  } finally {
    loginLoading.value = false
  }
}

const onHeroTap = () => {
  if (userStore.isLoggedIn) return uni.navigateTo({ url: '/pages/profile-edit/index' })
  loginVisible.value = true
}

// 主按钮：文案随登录态切换（「登录」/「开始今日练习」），点击行为也必须跟着切换。
// 旧实现无论登录与否都跳快速练习页，退出后点「登录」直接跳走，登录流程根本没触发。
const onMainAction = () => {
  if (userStore.isLoggedIn) return uni.navigateTo({ url: '/pages/quick-practice/index' })
  loginVisible.value = true
}
const onEditTap = () => uni.navigateTo({ url: '/pages/profile-edit/index' })
// 签名卡是入口而非编辑器：点击直接跳「编辑资料」页。
// 上一版整块可点弹 showModal 编辑——块面积大，滑动/误触经常把签名带走，
// 而且弹窗里改完还要再同步一次，不如直接去编辑资料页改个痛快。
const onEditSignature = () => uni.navigateTo({ url: '/pages/profile-edit/index' })

const goCustomQuestions = () => uni.navigateTo({ url: '/pages/custom-questions/index' })
const goQuickPractice = () => uni.navigateTo({ url: '/pages/quick-practice/index' })
const goPositions = () => uni.navigateTo({ url: '/pages/positions/index' })
const goSettings = () => uni.navigateTo({ url: '/pages/settings/index' })
const goHelp = () => uni.navigateTo({ url: '/pages/help/index' })
const goAbout = () => uni.navigateTo({ url: '/pages/about/index' })
/* 登录按钮下方的协议链接（审核合规，见模板 .login-agree 注释）。
   用 navigateTo 而非 switchTab —— 二者都是普通页面，可正常返回。 */
const goAgreementPage = () => uni.navigateTo({ url: '/pages/agreement/index' })
const goPrivacyPage = () => uni.navigateTo({ url: '/pages/privacy/index' })

// 退出登录 → 自研确认弹层（light 变体 + 黑色确认键）。
// v25：原生 showModal → confirm-sheet。
// 为什么是 light + 黑色键而非 danger 红色键：退出登录**不删数据**，只是结束本机会话
// （云端记录仍在，下次进入重新登录即可看到）。红色确认键会让「可逆的登录态切换」
// 读起来像「不可逆的删数据」，反而制造错误紧张感。黑色 = 中性但仍属确认动作。
const logoutSheetVisible = ref(false)

/* 弹层期间的页面级滚动锁（见模板顶部 page-meta 处的说明）。
   覆盖本页两个弹层：勋章详情抽屉 + 退出登录确认。
   定义在两个 ref 之后，避免前向引用影响阅读。 */
const sheetLockStyle = computed(() =>
  (medalDetailVisible.value || logoutSheetVisible.value) ? 'overflow:hidden;' : ''
)

const onLogout = () => { logoutSheetVisible.value = true }

const onLogoutConfirm = () => {
  try {
    userStore.logout()
    uni.removeStorageSync('wxUserInfo')
    logoutSheetVisible.value = false
    uni.reLaunch({ url: '/pages/index/index' })
  } catch (e) {
    uni.showToast({ title: '操作失败', icon: 'none' })
  }
}

onMounted(() => {})
/* 只需拉最新 stats：成就检测已挂在 userStore.fetchStats 内部（全局化），
   仪式由本页的 <medal-ceremony-host :visible="pageVisible"> 播。
   pageVisible 让后台页不抢播（详见宿主组件注释）。
   v24：fetchStats 失败返回 null（契约），原来 `.catch(() => {})` 把它咽掉，
   于是弱网冷启动时页面会如实渲染成「0 场面试 / 0 分钟 / 0 连续天数」——
   本页没有任何 loadError 态，用户看到的是「我练了十几场，全没了？」，
   这是最伤信任的一类误报。现在记下失败标记，让数据卡显示「未加载」而不是 0。 */
onShow(() => {
  pageVisible.value = true
  if (!userStore.isLoggedIn) return
  userStore.fetchStats()
    .then((res) => { statsLoadFailed.value = !res })
    .catch(() => { statsLoadFailed.value = true })
})
onHide(() => { pageVisible.value = false })
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 「我的」· 纸本朱砂（v34）
 * ============================================================================
 * 本页的立意：**一份个人档案页**（不是"个人中心菜单"）。
 *   · 顶部墨色身份卡（与首页 hero 同源材质）
 *   · 段位用朱砂印章 + 等宽分数 + 仪表刻度条
 *   · 签名是"藏书票"——全页唯一用实线墨边 + 硬投影的卡，托着最私人的那句话
 *   · 勋章展柜：已解锁=墨底扫光，未解锁=虚线空位 + 可见进度
 * ========================================================================== */
.page {
  min-height: 100vh;
  background: $paper;
  padding: 0 $page-padding 0;
  box-sizing: border-box;
}
.status-bar { width: 100%; }

/* ===== 页头 ===== */
.pg-head {
  padding: 28rpx 0 32rpx;
}
.pg-kicker {
  display: block;
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.6rpx;
  margin-bottom: 12rpx;
}
.pg-title {
  display: block;
  font-family: $font-display;
  font-size: 52rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -1.8rpx;
  line-height: 1.1;
}

/* ===== Hero 墨色身份卡 =====
 * 深色实体三件套与首页/报告页完全同源。 */
.hero {
  position: relative;
  overflow: hidden;
  padding: 28rpx 30rpx 30rpx;
  border-radius: $radius-xl;
  background: $ink-gradient;
  box-shadow: $ink-edge, $ink-shadow;
  margin-bottom: $sp-4;
  transition: opacity $motion-base $ease-out, transform $motion-base $ease-out;
}
.hero-ring {
  position: absolute;
  border-radius: 50%;
  border: 1rpx solid $on-ink-line;
  pointer-events: none;
}
.hero-ring.r1 { width: 360rpx; height: 360rpx; right: -120rpx; bottom: -190rpx; }
.hero-ring.r2 { width: 560rpx; height: 560rpx; right: -220rpx; bottom: -290rpx; border-color: rgba(255, 255, 255, 0.045); }

.hero-top { position: relative; }
.hero-eyebrow {
  font-family: $font-mono;
  font-size: 18rpx;
  font-weight: $weight-bold;
  color: $on-ink-3;
  letter-spacing: 2.6rpx;
}

.hero-id {
  position: relative;
  display: flex;
  align-items: center;
  gap: 22rpx;
  margin-top: 22rpx;
}

/* 头像：墨圆 + 朱砂环绕光束（只有 4rpx 环露出光束） */
.avatar-wrap {
  position: relative;
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-beam {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  border-radius: 50%;
  background: conic-gradient(from 0deg, rgba(192, 57, 43, 0) 0%, $verm 18%, rgba(192, 57, 43, 0) 36%, rgba(192, 57, 43, 0) 100%);
  animation: beamSpin 6s linear infinite;
}
@keyframes beamSpin {
  to { transform: rotate(360deg); }
}
.avatar-inner {
  position: relative;
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: #1B1712;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.avatar-letter {
  font-size: 40rpx;
  font-weight: $weight-heavy;
  color: rgba(255, 255, 255, 0.9);
}
.avatar-img { width: 100%; height: 100%; }

.hero-id-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.hero-name {
  font-family: $font-display;
  font-size: 38rpx;
  font-weight: $weight-heavy;
  color: #FFFFFF;
  letter-spacing: -0.8rpx;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hero-sub {
  font-size: 22rpx;
  color: $on-ink-2;
  margin-top: 8rpx;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 编辑入口：朱砂描边小方标 */
.hero-edit {
  width: 64rpx;
  height: 64rpx;
  border-radius: $radius-sm;
  border: 1rpx solid rgba(192, 57, 43, 0.65);
  background: rgba(192, 57, 43, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.hero-edit-press { opacity: 0.7; transform: scale(0.94); }
.hero-edit-icon { width: 28rpx; height: 28rpx; }

/* ===== 个性签名：藏书票 =====
 * 全页唯一「实线墨边 + 硬质偏移投影」的卡 —— 它像被实实在在印在页面上。 */
.signature-block {
  position: relative;
  padding: 26rpx 28rpx 30rpx;
  margin-bottom: $sp-4;
  background: $paper-card;
  /* v35：原来 1rpx 纯黑描边 + 硬质偏移投影，在白底上重得像一张贴纸，
     而且全站只有这一处用黑框（孤例）。改成**压印纸面**：
     极淡描边 + 内凹阴影 —— 读作"纸上划出的一个框"，不是贴上去的卡片。 */
  border: 1rpx solid $rule;
  border-radius: $radius-sm;
  box-shadow: $emboss-1;
}
.sig-paper {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  border-radius: inherit;
}
.sig-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}
.sig-labels { display: flex; align-items: baseline; gap: 12rpx; }
.sig-label {
  font-size: 24rpx;
  font-weight: $weight-bold;
  color: $text-2;
  letter-spacing: 0;
}
.sig-label-en {
  font-family: $font-mono;
  font-size: 17rpx;
  font-weight: $weight-bold;
  color: $text-4;
  letter-spacing: 2rpx;
}
.sig-edit {
  display: flex;
  align-items: center;
  gap: 7rpx;
  flex-shrink: 0;
  transition: opacity $motion-fast $ease-out;
}
.sig-edit-icon { width: 24rpx; height: 24rpx; }
.sig-edit-text { font-size: 23rpx; color: $verm; font-weight: $weight-semibold; }
/* 短规则线：编辑系统里 36px 短规则是「标点符号」，比整条横线克制得多 */
.sig-rule {
  width: 40rpx;
  height: 2rpx;
  background: $ink;
  margin: 18rpx 0 20rpx;
  border-radius: 1rpx;
}
.sig-body { min-height: 76rpx; }
.sig-text {
  display: block;
  font-size: 29rpx;
  line-height: 1.72;
  color: $text-1;
  letter-spacing: 0.2rpx;
}
.signature-block.is-empty .sig-text { color: $text-4; }
.sig-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10rpx;
  margin-top: 18rpx;
}
.sig-foot-dash { font-size: 22rpx; color: $text-4; }
.sig-foot-name {
  font-family: $font-mono;
  font-size: 20rpx;
  color: $text-3;
  letter-spacing: 0.8rpx;
}

/* ===== 工牌卡：等级印章 + 读数轨（v35.3 第十九批）=====
 * 原独立「段位数据卡」整体收编进墨色身份卡 —— 一张卡回答"你是谁 + 练得怎么样"。
 * 印章用 $grade-*-lit 提亮版（一级色压黑卡只有 ~3:1，第十五批已实锤）。 */
.hseal {
  position: absolute;
  top: 26rpx;
  right: 30rpx;
  width: 92rpx;
  height: 92rpx;
  border-radius: $radius-sm;
  border: 2rpx solid currentColor;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transform: rotate(-6deg);
  opacity: 0.94;
}
.hseal-letter {
  font-family: $font-mono;
  font-size: 42rpx;
  font-weight: $weight-black;
  line-height: 1;
  letter-spacing: -1rpx;
}
.hseal-cap {
  font-family: $font-mono;
  font-size: 13rpx;
  font-weight: $weight-bold;
  letter-spacing: 1.2rpx;
  margin-top: 4rpx;
  opacity: 0.8;
}
.hseal-s { color: $grade-s-lit; }
.hseal-a { color: $grade-a-lit; }
.hseal-b { color: $grade-b-lit; }
.hseal-c { color: $grade-c-lit; }
.hseal-d { color: $grade-d-lit; }

.hero-rule-ink {
  height: 1rpx;
  background: $on-ink-line;
  margin-top: 26rpx;
}
.hero-stats {
  display: flex;
  align-items: stretch;
  margin-top: 6rpx;
}
.hstat {
  flex: 1;
  padding: 20rpx 0 6rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.hstat-div {
  width: 1rpx;
  background: $on-ink-line;
  margin: 16rpx 0;
}
.hstat-num {
  @include readout(34rpx);
  font-weight: $weight-bold;
  color: $on-ink-1;
}
.hstat-label {
  font-size: 19rpx;
  color: $on-ink-3;
  font-weight: $weight-semibold;
  margin-top: 8rpx;
  letter-spacing: 0.4rpx;
}

/* ===== 区块（勋章展柜） ===== */
.section { margin-bottom: $sp-6; }
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  margin-bottom: 16rpx;
}
.section-title-wrap { display: flex; align-items: center; gap: 12rpx; min-width: 0; }
.section-no { @include mono-index; }
.section-title {
  @include sec-heading;
  flex-shrink: 0;
}
.section-title-line {
  width: 36rpx;
  height: 1rpx;
  background: $rule-strong;
  flex-shrink: 0;
}
.section-more {
  font-family: $font-mono;
  font-size: 20rpx;
  color: $text-3;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.medal-hint {
  display: block;
  font-size: 21rpx;
  color: $text-3;
  margin-bottom: 20rpx;
  line-height: 1.55;
}

/* 勋章横滑展柜 */
.medal-scroll { width: 100%; }
.medal-track { display: flex; gap: 14rpx; padding: 2rpx 0 8rpx; }
.medal-card {
  flex-shrink: 0;
  width: 196rpx;
  padding: 24rpx 18rpx 20rpx;
  border-radius: $radius-lg;
  background: $paper-card;
  border: 1rpx solid $rule;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
/* 徽章底盘：已解锁 = 墨材质半球；未解锁 = 虚线空位 */
.medal-disc {
  position: relative;
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16rpx;
  /* 未解锁：虚线描边 —— 单色体系里唯一可靠的「未完成」语言 */
  border: 2rpx dashed $rule-strong;
  background: $paper-sunken;
  overflow: hidden;
}
.medal-disc-on {
  border: none;
  background: $ink-gradient;
  box-shadow: $ink-edge;
}
/* 已解锁扫光：斜向白光缓慢巡游 */
.medal-shine {
  position: absolute;
  top: -50%;
  left: -60%;
  width: 60rpx;
  height: 200%;
  background: linear-gradient(90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.30) 50%,
    rgba(255, 255, 255, 0) 100%);
  transform: rotate(22deg);
  animation: medalShine 4.2s $ease-out infinite;
}
@keyframes medalShine {
  0%   { transform: rotate(22deg) translateX(-40rpx); }
  60%, 100% { transform: rotate(22deg) translateX(240rpx); }
}
.medal-img { width: 40rpx; height: 40rpx; position: relative; z-index: 1; }
.medal-name {
  font-size: 24rpx;
  font-weight: $weight-bold;
  color: $text-1;
  text-align: center;
  letter-spacing: -0.2rpx;
}
.medal-desc {
  font-size: 19rpx;
  color: $text-3;
  margin-top: 8rpx;
  text-align: center;
  line-height: 1.45;
}
.medal-card.medal-locked .medal-name { color: $text-2; }
.medal-desc-progress {
  font-family: $font-mono;
  color: $verm;
  font-weight: $weight-bold;
  font-variant-numeric: tabular-nums;
}
/* 未解锁进度轨：墨色细条 */
.medal-progress {
  width: 100%;
  height: 4rpx;
  border-radius: 2rpx;
  background: $paper-sunken;
  margin-top: 10rpx;
  overflow: hidden;
}
.medal-progress-fill {
  height: 100%;
  border-radius: 2rpx;
  background: $verm;
}

/* ===== 主按钮 ===== */
.main-action { margin-bottom: $sp-6; }
.main-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100rpx;
  border-radius: $radius-btn;
  background: $ink;
  transition: opacity $motion-base $ease-out, transform $motion-base $ease-out;
}
.main-btn-text {
  font-size: 31rpx;
  font-weight: $weight-bold;
  color: #FFFFFF;
  letter-spacing: 0.6rpx;
}
.login-agree {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  margin-top: 20rpx;
}
.login-agree-text { font-size: 20rpx; color: $text-4; }
.login-agree-link { font-size: 20rpx; color: $text-3; }

/* ===== 列表：分组卡 ===== */
.list {
  background: $paper-card;
  border: 1rpx solid $rule;
  border-radius: $radius-lg;
  padding: 0 26rpx;
  margin-bottom: $sp-4;
}
.list-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  min-height: 104rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid $rule;
  transition: opacity $motion-fast $ease-out;
}
.list-row:last-child { border-bottom: none; }
/* 图标底座：浅槽 + 发丝描边（v35 修正「图标和背景不搭配」）。
   旧实现只有背景色，而它($paper-sunken)、卡片(纯白)、页面底($paper)三方明度极近，
   底块边界几乎不可见 —— 看起来像图标背后一块脏印，而不是一个容器。
   改用「线」界定边界：既能看清，又不像重填充那样把导航行压出层级。 */
.list-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: $radius-md;
  background: $paper-sunken;
  border: 1rpx solid $rule-strong;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.list-icon-img { width: 32rpx; height: 32rpx; }
.list-text {
  flex: 1;
  font-size: 29rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  letter-spacing: -0.2rpx;
}
.list-arrow { width: 24rpx; height: 24rpx; flex-shrink: 0; }

/* ===== 退出登录 ===== */
.logout-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  height: 92rpx;
  border-radius: $radius-btn;
  background: $paper-card;
  border: 1rpx solid $rule;
  margin-bottom: $sp-5;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.logout-icon { width: 28rpx; height: 28rpx; }
.logout-text { font-size: 27rpx; color: $text-2; font-weight: $weight-medium; }

/* ===== 品牌收尾 ===== */
.footer { padding: 8rpx 0 16rpx; text-align: center; }
.footer-text {
  font-family: $font-mono;
  font-size: 18rpx;
  color: $text-4;
  letter-spacing: 3rpx;
}
.spacer-bottom { height: calc(80rpx + env(safe-area-inset-bottom)); }
</style>
