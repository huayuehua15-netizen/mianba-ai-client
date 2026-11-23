<template>
  <!-- 弹层期间锁掉页面滚动（v25 滚动穿透修复 · 真机实测同类问题）。
       设置页是长列表，弹层打开后在面板上滑动最容易带动背景。
       ⚠️ page-meta 必须是页面内第一个节点、且不能被 wx:if/wx:for 动态增删，
       故写在页面里，用 style 绑定切换而非 v-if。 -->
  <page-meta :page-style="sheetLockStyle" />

  <view class="page" :style="pageStyle">
    <!-- 自定义导航栏：全局 .pg-nav（样式在 App.vue）。
         navBarStyle（状态栏高度 + 胶囊宽度）仍由 :style 注入。 -->
    <view class="pg-nav" :style="navBarStyle">
      <view class="pg-nav-side pg-nav-left">
        <view
          class="pg-nav-back-tile"
          :class="{ pressed: backPressed }"
          hover-class="none"
          @touchstart="backPressed = true"
          @touchend="backPressed = false"
          @touchcancel="backPressed = false"
          @click="goBack"
        >
          <image class="pg-nav-back" :src="ICONS['arrow-left']" mode="aspectFit" />
        </view>
      </view>
      <view class="pg-nav-center">
        <text class="pg-nav-title">设置</text>
      </view>
      <view class="pg-nav-side pg-nav-right"></view>
    </view>

    <!-- 占位块：与 fixed 导航栏等高，避免正文被盖住 -->
    <view class="pg-nav-hold" :style="navHoldStyle">
      <view class="pg-nav-hold-inner"></view>
    </view>

    <view class="content">
      <!-- 刊头：等宽英文眉标 + 版本读数（书刊版权页式的两条对位），
           与首页 AI MOCK INTERVIEW / 历史页 INTERVIEW LOG 是同一套跨页语言。
           这里不放中文大标题 —— 导航栏已经有「设置」，再放一遍是重复。 -->
      <view class="masthead">
        <text class="mast-kicker">SETTINGS</text>
        <text class="mast-ver">v{{ version }}</text>
      </view>

      <!-- 加载骨架：沿用真实版式（分组线 + 行线），数据到达时是填空而不是重排 -->
      <view v-if="loading" class="skeleton-wrap">
        <view class="sk-group" v-for="n in 3" :key="n">
          <view class="sk-title"></view>
          <view class="sk-card">
            <view class="sk-row" v-for="m in 2" :key="m"></view>
          </view>
        </view>
      </view>

      <template v-else>
        <!-- ① 外观与阅读 -->
        <view class="menu-group">
          <view class="group-title">
            <text class="group-index">01</text>
            <text class="group-title-text">外观与阅读</text>
            <view class="group-line"></view>
          </view>
          <view class="menu-list">
            <view hover-class="hover-press" class="menu-item column">
              <view class="row-lead">
                <view class="row-icon"><image class="row-icon-img" :src="ICONS.type" mode="aspectFit" /></view>
                <view class="menu-text-wrap">
                  <text class="menu-text">对话字号</text>
                  <!-- 说清生效范围（用户真机反馈「调大了没反应」）：
                       本设置只作用于面试页的题目与回答气泡，其他页面字号固定。 -->
                  <text class="menu-desc">仅作用于「面试进行中」页的题目与回答文字，其他页面字号固定</text>
                </view>
              </view>
              <!-- 字号三档：凹槽轨道 + 抽出的白卡（与 App.vue 的 .seg-bar 同一语言），
                   选中项不用墨底反白 —— 纸本里"抽出一张纸"比"整块变黑"更轻。 -->
              <view class="font-options">
                <view
                  v-for="opt in fontOptions"
                  :key="opt.value"
                  class="font-option"
                  :class="{ active: fontSize === opt.value }"
                  hover-class="hover-press"
                  @click="selectFontSize(opt.value)"
                >
                  <text class="font-option-text" :class="'sample-' + opt.value">Aa</text>
                  <text class="font-option-label">{{ opt.label }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- ② 互动反馈 -->
        <view class="menu-group">
          <view class="group-title">
            <text class="group-index">02</text>
            <text class="group-title-text">互动反馈</text>
            <view class="group-line"></view>
          </view>
          <view class="menu-list">
            <view hover-class="hover-press" class="menu-item">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS.volume" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">自动播报题目</text>
                <text class="menu-desc">AI 出题后自动朗读，换高质量音色播报</text>
              </view>
              <switch :checked="voiceBroadcast" @change="onSwitchVoice" :color="accentColor" />
            </view>
            <view hover-class="hover-press" class="menu-item">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS.smartphone" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">震动反馈</text>
                <text class="menu-desc">开始录音等关键节点轻震动</text>
              </view>
              <switch :checked="haptic" @change="onSwitchHaptic" :color="accentColor" />
            </view>
            <view hover-class="hover-press" class="menu-item">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS['bookmark']" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">保留面试进度</text>
                <text class="menu-desc">中途退出时自动保存，下次可继续</text>
              </view>
              <switch :checked="keepProgress" @change="onSwitchKeepProgress" :color="accentColor" />
            </view>
          </view>
        </view>

        <!-- ③ 隐私与数据 -->
        <view class="menu-group">
          <view class="group-title">
            <text class="group-index">03</text>
            <text class="group-title-text">隐私与数据</text>
            <view class="group-line"></view>
          </view>
          <view class="menu-list">
            <view hover-class="hover-press" class="menu-item" @click="showDataVisibility">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS.eye" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">数据可见性</text>
                <text class="menu-desc">面试记录与评分仅本人可见</text>
              </view>
              <text class="menu-extra-text">仅本人</text>
            </view>
            <view hover-class="hover-press" class="menu-item" @click="clearCache">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS.database" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">存储与缓存</text>
                <text class="menu-desc">{{ cacheLoading ? '正在计算占用…' : (cacheSize === '0 B' ? '暂无缓存可清理' : '已占用 ' + cacheSize) }}</text>
              </view>
              <image class="menu-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
            </view>
            <view hover-class="hover-press" class="menu-item" @click="goPrivacy">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS.shield" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">隐私政策</text>
                <text class="menu-desc">我们如何收集与使用你的数据</text>
              </view>
              <image class="menu-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
            </view>
            <view hover-class="hover-press" class="menu-item" @click="goAgreement">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS['file-text-2']" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">用户协议</text>
                <text class="menu-desc">服务范围、使用规范与免责说明</text>
              </view>
              <image class="menu-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
            </view>
            <view hover-class="hover-press" class="menu-item danger-item" @click="onClearMyData">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS.trash" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text danger">清空我的数据</text>
                <text class="menu-desc">永久删除全部面试记录与报告</text>
              </view>
              <image class="menu-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
            </view>
            <view hover-class="hover-press" class="menu-item danger-item" @click="onAccountDelete">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS['man-delete']" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text danger">注销账号</text>
                <text class="menu-desc">删除账号与全部数据，操作不可恢复</text>
              </view>
              <image class="menu-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
            </view>
          </view>
        </view>

        <!-- ④ 账号 -->
        <view class="menu-group">
          <view class="group-title">
            <text class="group-index">04</text>
            <text class="group-title-text">账号</text>
            <view class="group-line"></view>
          </view>
          <view class="menu-list">
            <view hover-class="hover-press" class="menu-item" @click="goEditProfile">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS.user" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">个人资料</text>
                <text class="menu-desc">修改头像、昵称与简介</text>
              </view>
              <image class="menu-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
            </view>
            <view hover-class="hover-press" class="menu-item">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS['log-in']" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">登录方式</text>
                <text class="menu-desc">{{ loginWay }}</text>
              </view>
              <text class="menu-extra-text">{{ userStore.isLoggedIn ? '已登录' : '未登录' }}</text>
            </view>
            <view hover-class="hover-press" class="menu-item" @click="onResetSettings">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS['rotate-ccw']" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">恢复默认设置</text>
                <text class="menu-desc">重置全部偏好，不影响面试数据</text>
              </view>
              <image class="menu-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
            </view>
          </view>
        </view>

        <!-- ⑤ 关于 -->
        <view class="menu-group">
          <view class="group-title">
            <text class="group-index">05</text>
            <text class="group-title-text">关于</text>
            <view class="group-line"></view>
          </view>
          <view class="menu-list">
            <view hover-class="hover-press" class="menu-item" @click="goHelp">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS['help-circle']" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">帮助与反馈</text>
                <text class="menu-desc">常见问题与联系我们</text>
              </view>
              <image class="menu-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
            </view>
            <view hover-class="hover-press" class="menu-item" @click="checkUpdate">
              <view class="row-icon"><image class="row-icon-img" :src="ICONS['refresh-cw']" mode="aspectFit" /></view>
              <view class="menu-text-wrap">
                <text class="menu-text">检查更新</text>
                <text class="menu-desc">我的面试小屋 {{version}}</text>
              </view>
              <text v-if="checkingUpdate" class="menu-extra-text">检查中…</text>
              <image v-else class="menu-arrow" :src="ICONS['chevron-right-ash']" mode="aspectFit" />
            </view>
          </view>
        </view>

        <!-- 退出登录：凹槽底方圆角（可逆操作，不用朱砂也不用描边） -->
        <view hover-class="hover-press" class="logout-card" @click="onLogout" v-if="userStore.isLoggedIn">
          <image class="logout-icon" :src="ICONS['log-out']" mode="aspectFit" />
          <text class="logout-text">退出登录</text>
        </view>
      </template>
    </view>

    <!-- 注销账号确认抽屉：替代原来的两个原生 showModal 连环弹 -->
    <confirm-sheet
      v-model:visible="accountSheetVisible"
      title="注销账号"
      desc="注销将删除你的账号与全部数据，操作不可恢复。请确认以下内容将被清除："
      :items="accountItems"
      check-label="我已了解：账号删除后无法找回"
      confirm-text="确认注销"
      :busy="deletingAccount"
      loading-text="正在注销…"
      @confirm="onAccountDeleteConfirm"
    />

    <!-- 清空数据确认抽屉：与注销同语言，不可恢复的操作都不用原生弹窗 -->
    <confirm-sheet
      v-model:visible="clearSheetVisible"
      title="清空我的数据"
      desc="将永久删除你的全部练习数据，账号仍会保留。请确认以下内容将被清除："
      :items="clearItems"
      check-label="我已了解：数据删除后无法恢复"
      confirm-text="确认清空"
      :busy="clearingData"
      loading-text="删除中…"
      @confirm="onClearMyDataConfirm"
    />

    <!-- 清除缓存确认：light 变体 + 黑键（清本机缓存，可恢复，非破坏性） -->
    <confirm-sheet
      v-model:visible="clearCacheSheetVisible"
      variant="light"
      title="清除缓存？"
      desc="将清理本机临时数据，不影响登录态与面试记录。"
      confirm-text="清除"
      cancel-text="取消"
      @confirm="onClearCacheConfirm"
    />

    <!-- 退出登录确认：light 变体 + 黑键（退出不删云端数据，非破坏性） -->
    <confirm-sheet
      v-model:visible="logoutSheetVisible"
      variant="light"
      title="退出登录？"
      desc="本机的面试进度与该账号的本地数据将一并清除，云端记录不受影响。"
      confirm-text="退出"
      cancel-text="取消"
      @confirm="onLogoutConfirm"
    />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/store/modules/user'
import { clearMyData, deleteAccount } from '@/api/user'
import ConfirmSheet from '@/components/confirm-sheet/confirm-sheet.vue'
import { ICONS } from '@/utils/svg-icons'

const userStore = useUserStore()
const version = '1.0.0'
const accentColor = '#17130E'

const loading = ref(true)
const voiceBroadcast = ref(true)
const haptic = ref(true)
const keepProgress = ref(true)
const fontSize = ref('medium')
const cacheSize = ref('0 B')
const cacheLoading = ref(false)
const checkingUpdate = ref(false)

const fontOptions = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' }
]

const loginWay = computed(() => {
  if (userStore.userInfo?.nickname) return '微信授权登录'
  return '微信一键登录（免注册）'
})

const STORAGE_KEYS = {
  voice: 'voiceBroadcast',
  haptic: 'haptic',
  font: 'fontSize',
  keep: 'keepProgress'
}

const getBool = (key, def) => {
  const v = uni.getStorageSync(key)
  if (v === '' || v === null || v === undefined) return def
  return !!v
}
const getStr = (key, def) => {
  const v = uni.getStorageSync(key)
  if (v === '' || v === null || v === undefined) return def
  return String(v)
}
const persist = (key, val) => uni.setStorageSync(key, val)

const loadSettings = () => {
  voiceBroadcast.value = getBool(STORAGE_KEYS.voice, true)
  haptic.value = getBool(STORAGE_KEYS.haptic, true)
  keepProgress.value = getBool(STORAGE_KEYS.keep, true)
  fontSize.value = getStr(STORAGE_KEYS.font, 'medium')
}

const onSwitchVoice = (e) => {
  voiceBroadcast.value = !!e.detail.value
  persist(STORAGE_KEYS.voice, voiceBroadcast.value)
}
const onSwitchHaptic = (e) => {
  haptic.value = !!e.detail.value
  persist(STORAGE_KEYS.haptic, haptic.value)
}
const onSwitchKeepProgress = (e) => {
  keepProgress.value = !!e.detail.value
  persist(STORAGE_KEYS.keep, keepProgress.value)
}

const selectFontSize = (v) => {
  if (fontSize.value === v) return
  fontSize.value = v
  persist(STORAGE_KEYS.font, v)
  uni.showToast({ title: '字号已切换', icon: 'none' })
}

const calcCacheSize = () => {
  cacheLoading.value = true
  setTimeout(() => {
    try {
      const info = uni.getStorageInfoSync()
      const keys = info.keys || []
      let total = 0
      keys.forEach(k => {
        try {
          const v = uni.getStorageSync(k)
          const str = typeof v === 'string' ? v : JSON.stringify(v || '')
          total += str.length
        } catch (e) {}
      })
      if (total < 1024) cacheSize.value = `${total} B`
      else if (total < 1024 * 1024) cacheSize.value = `${(total / 1024).toFixed(1)} KB`
      else cacheSize.value = `${(total / 1024 / 1024).toFixed(2)} MB`
    } catch (e) {
      cacheSize.value = '--'
    } finally {
      cacheLoading.value = false
    }
  }, 120)
}

// 清除缓存 → 自研确认弹层（light 变体 + 黑色确认键）。
// v25：原生 showModal → confirm-sheet。
// 为什么是 light + 黑色键：清缓存只清本机临时数据，不删云端面试记录/评分，
// 属于「可恢复」操作（下次进入会重新拉取），红色键会制造过度的紧张感。
// 真正的不可逆操作（清空数据/注销）仍走下方默认 danger 重模式（清单+勾选+红键）。
const clearCacheSheetVisible = ref(false)

const clearCache = () => {
  if (cacheLoading.value) return
  if (cacheSize.value === '0 B') {
    uni.showToast({ title: '暂无缓存可清理', icon: 'none' })
    return
  }
  clearCacheSheetVisible.value = true
}

const onClearCacheConfirm = () => {
  try {
    /* safeKeys = 「清缓存不该动的东西」白名单（P2 修复，2026-10-08）。
       `mianba_logged_out` 必须在内：它是「用户主动退出登录」的意愿标记
       （store/modules/user.js），不在白名单就会被清掉 → wxLogin(false) 的
       「已退出则拒绝静默重登」守卫失效 → **下次冷启动自动重新登录**。
       用户点过「确定退出当前账号吗」再清一次缓存，退出状态就被静默撤销了，
       而本弹窗文案承诺的是「不影响登录态」——它确实没删 token，但删掉了比 token
       更关键的意愿标记，等于承诺没兑现。
       api_base_url 也一并保护：它是联调用的后端地址覆盖，属开发态配置。
       `mianba_account_authorized` 与 `wx_identity_fp` 同理必须保护（实测发现的同族缺陷）：
         · 前者是「用户已授权建档」标记 —— 被清掉后，token 过期时 wxLogin(false)
           会拒绝静默重登（用户已授权过却要重新点「微信一键登录」），
           「不影响登录态」的承诺同样没兑现；
         · 后者是登录弹窗展示的微信身份指纹，属账号级凭证而非缓存。 */
    const safeKeys = [
      'token', 'userInfo', 'voiceBroadcast', 'haptic', 'fontSize', 'keepProgress',
      'current_custom_questions', 'custom_questions', 'mianba_privacy_agreed',
      'interview_progress', 'wxUserInfo', 'lastTtsVoice', 'medalSeen',
      'mianba_logged_out', 'api_base_url', 'mianba_account_authorized', 'wx_identity_fp'
    ]
    const info = uni.getStorageInfoSync()
    ;(info.keys || []).forEach(k => {
      if (!safeKeys.includes(k)) { try { uni.removeStorageSync(k) } catch (e) {} }
    })
    calcCacheSize()
    clearCacheSheetVisible.value = false
    uni.showToast({ title: '已清除', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: '清除失败', icon: 'none' })
  }
}

const showDataVisibility = () => {
  uni.showModal({
    title: '数据可见性',
    content: '你的面试记录、评分报告仅本人可见，不会公开给其他用户。\n\n清除缓存或退出登录不会删除云端数据；如需彻底删除，请使用「清空我的数据」。',
    showCancel: false
  })
}
/* 隐私政策从"弹窗里三行字"改为独立页面 ——
   合规要求完整条款，弹窗塞不下，也不该塞。 */
const goPrivacy = () => uni.navigateTo({ url: '/pages/privacy/index' })
const goAgreement = () => uni.navigateTo({ url: '/pages/agreement/index' })
const goHelp = () => uni.navigateTo({ url: '/pages/help/index' })

const checkUpdate = () => {
  if (checkingUpdate.value) return
  checkingUpdate.value = true

  const done = (msg) => {
    checkingUpdate.value = false
    if (msg) uni.showToast({ title: msg, icon: 'none' })
  }

  // #ifdef MP-WEIXIN
  /* 开发版/体验版（含开发者工具）里 getUpdateManager 把「每次重新编译/重新上传」
   * 都当作新版本：一点就弹「发现新版本」→ applyUpdate 重启小程序 → 页面骨架屏
   * 闪一下又恢复，看起来就像「页面结构显示、过一会又显示」。
   * 这不是线上行为——正式版只有上传新发布后才会有更新。
   * 非正式版一律跳过；getAccountInfoSync 不可用时也跳过（宁可不查，不乱重启）。 */
  let envVersion = 'release'
  let envKnown = false
  try {
    const account = uni.getAccountInfoSync()
    const v = account && account.miniProgram && account.miniProgram.envVersion
    if (v) { envVersion = v; envKnown = true }
  } catch (e) {}
  if (envVersion !== 'release' || !envKnown) {
    done('该功能将在正式版启用，当前版本无需检查更新')
    return
  }

  const um = uni.getUpdateManager()
  /* 这一版修的 bug：原实现是
   *     const timer = setTimeout(() => { done(); toast('已是最新') }, 3000)
   *     um.onCheckForUpdate(() => { clearTimeout(timer) })      // ← 只清了 timer
   *   onCheckForUpdate 的回调里没有 done()。而 um 的语义是：
   *     · 有新版本 → onCheckForUpdate(res.hasUpdate=true) 之后还会触发 onUpdateReady / onUpdateFailed
   *     · 已是最新 → **只**触发 onCheckForUpdate(res.hasUpdate=false)，另两个永远不来
   *   于是"已是最新版本"这条路径上：timer 被清掉、done() 没人调 →
   *   checkingUpdate 永久为 true → 按钮一直显示"检查中…"，用户点一下就像卡死了。
   *   这就是「点一下怎么加载那么久」的真正原因。
   */
  let settled = false
  const finish = (msg) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    done(msg)
  }
  // 兜底改成 8 秒且如实报告超时：原来的 3 秒会谎报"已是最新版本"
  const timer = setTimeout(() => finish('检查超时，请稍后再试'), 8000)

  um.onCheckForUpdate((res) => {
    // 有新版本时保持"检查中"，等下载结果（onUpdateReady / onUpdateFailed）
    if (res && res.hasUpdate) return
    finish('当前已是最新版本')
  })
  um.onUpdateReady(() => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    done()
    uni.showModal({
      title: '发现新版本',
      content: '新版本已准备好，是否立即重启并应用？',
      success: (r) => { if (r.confirm) um.applyUpdate() }
    })
  })
  um.onUpdateFailed(() => finish('新版本下载失败，请稍后再试'))
  // #endif

  // #ifndef MP-WEIXIN
  setTimeout(() => done('当前已是最新版本'), 600)
  // #endif
}

const onResetSettings = () => {
  uni.showModal({
    title: '恢复默认设置',
    content: '将重置全部偏好为默认值，不会影响你的面试数据。',
    success: (res) => {
      if (!res.confirm) return
      voiceBroadcast.value = true; persist(STORAGE_KEYS.voice, true)
      haptic.value = true; persist(STORAGE_KEYS.haptic, true)
      keepProgress.value = true; persist(STORAGE_KEYS.keep, true)
      fontSize.value = 'medium'; persist(STORAGE_KEYS.font, 'medium')
      uni.showToast({ title: '已恢复默认', icon: 'success' })
    }
  })
}

// 清空数据：与注销同款确认抽屉（不可恢复的操作不再用原生弹窗）
const clearSheetVisible = ref(false)
const clearItems = [
  '全部面试记录与作答内容',
  '五维评分报告与历史成绩',
  '自定义题目与练习进度'
]
const onClearMyData = () => { clearSheetVisible.value = true }

/* v32：请求期间的反馈从原生 uni.showLoading 换成 confirm-sheet 自带的 busy 态。
 * 为什么换：
 *   ① 原生 showLoading 是居中小胶囊，浮在一个自己刚打开的底部抽屉之上 ——
 *      同一个动作出现两层弹层，层级关系读不出来；
 *   ② 它会盖住抽屉，而抽屉的「确认清空」键正是用户刚点的那个位置，
 *      视觉上等于「按钮被抢走又还回来」；
 *   ③ 本项目的加载语言是 loading-overlay（IP + 三点），原生小胶囊是第三套。
 * 换成 busy 之后：确认键原地变成「删除中… + 旋转点」，卡片不动、层级不乱。 */
const clearingData = ref(false)

const onClearMyDataConfirm = async () => {
  if (clearingData.value) return      // 与 confirm-sheet 的 busy 拦截构成双保险
  clearingData.value = true
  try {
    await clearMyData()
    clearSheetVisible.value = false
    /* P3 修复（2026-10-11，实测确认）：服务端在清空数据后会 `$inc: { tokenVersion: 1 }`，
       让该用户**全部历史 token 立即失效**（隐私设计，见 userController.js:557-560）。
       也就是说这次调用返回成功的同时，本地这份 token 已经作废了。
       旧写法紧接着调 `userStore.fetchStats()` —— 用一把已死的 token 再请求，必然是 401。
       好在 request.js 对 401 会静默重登，用户通常无感；但有两个真实问题：
         ① 文案只说「已全部清除」，用户不知道会话已被重置。若恰好静默重登失败
            （弱网/被限流），他随后进面试页会被莫名其妙要求登录；
         ② 那次注定 401 的请求会额外触发一次 wx.login 往返，纯浪费。
       这里改为：**主动重建会话**（清掉本地登录态后显式重登一次），
       并把结果如实告诉用户，而不是让他在无感知中等一次隐式重登。 */
    userStore.clearSession()
    try {
      await userStore.wxLogin(true)
      userStore.fetchStats()
      uni.showToast({ title: '已全部清除', icon: 'success' })
    } catch (e) {
      // 重登失败不影响"数据已清空"这一事实，但要明确告知需要重新登录
      uni.showToast({ title: '数据已清除，请重新登录', icon: 'none' })
    }
  } catch (e) {
    uni.showToast({ title: e.message || '操作失败', icon: 'none' })
  } finally {
    clearingData.value = false
  }
}

// 注销账号：最高危操作。v2 改为「确认抽屉 + 勾选」取代原来的两个原生
// showModal 连环弹——连环弹窗体验生硬、长文字不可扫读、红色确认键与 app
// 语言脱节。抽屉里清单式列出删除范围，必须勾选「我已了解」才能提交。
//（服务端账号已删除，下次冷启动会以新账号自动登录）
const accountSheetVisible = ref(false)
const accountItems = [
  '全部面试记录与作答内容',
  '五维评分报告与历史成绩',
  '自定义题目与练习进度',
  '头像、昵称与个性签名等个人资料'
]
const onAccountDelete = () => { accountSheetVisible.value = true }

const deletingAccount = ref(false)
const onAccountDeleteConfirm = async () => {
  if (deletingAccount.value) return
  deletingAccount.value = true
  try {
    // v32：不在这里 uni.showLoading —— confirm-sheet 的 busy 态已在确认键上
    // 给出「正在注销… + 旋转点」，再叠一个原生胶囊就是第三层弹层（同清空数据处的说明）
    await deleteAccount()
    accountSheetVisible.value = false
    userStore.accountDeleted()
    uni.showToast({ title: '账号已注销', icon: 'none' })
    setTimeout(() => uni.reLaunch({ url: '/pages/index/index' }), 600)
  } catch (e) {
    uni.showToast({ title: e.message || '注销失败，请稍后重试', icon: 'none' })
  } finally {
    deletingAccount.value = false
  }
}

// 退出登录 → 自研确认弹层（light 变体 + 黑色确认键）。与 profile 页同一套。
// v25：原生 showModal → confirm-sheet。理由见 profile 页 onLogout 注释：
// 退出只结束本机会话、云端记录不动，属可逆操作，红色确认键会制造错误紧张感。
const logoutSheetVisible = ref(false)
const loggingOut = ref(false)

const onLogout = () => {
  if (loggingOut.value) return
  logoutSheetVisible.value = true
}

const onLogoutConfirm = () => {
  loggingOut.value = true
  try {
    userStore.logout()
    uni.removeStorageSync('wxUserInfo')
    logoutSheetVisible.value = false
    uni.reLaunch({ url: '/pages/index/index' })
  } catch (e) {
    loggingOut.value = false
    uni.showToast({ title: '操作失败', icon: 'none' })
  }
}

/* 弹层期间的页面级滚动锁（见模板顶部 page-meta 处说明）。
   覆盖本页全部 4 个弹层：注销账号、清空数据、清缓存、退出登录。
   定义在四个 SheetVisible 之后。 */
const sheetLockStyle = computed(() => {
  const anyOpen = clearCacheSheetVisible.value || clearSheetVisible.value ||
                  accountSheetVisible.value || logoutSheetVisible.value
  return anyOpen ? 'overflow:hidden;' : ''
})

const goEditProfile = () => uni.navigateTo({ url: '/pages/profile-edit/index' })

const goBack = () => {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/profile/index' })
}

/* 自定义导航栏几何 */
const navMetrics = ref({ statusBar: 44, capsuleGap: 96 })
const initNavMetrics = () => {
  try {
    const win = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
    const statusBar = win.statusBarHeight || 44
    let capsuleGap = 96
    // #ifdef MP-WEIXIN
    try {
      const rect = uni.getMenuButtonBoundingClientRect()
      if (rect && rect.width > 0) capsuleGap = win.windowWidth - rect.left + 14
    } catch (e) {}
    // #endif
    navMetrics.value = { statusBar, capsuleGap }
  } catch (e) {}
}
const navBarStyle = computed(() => ({
  paddingTop: navMetrics.value.statusBar + 'px',
  paddingRight: navMetrics.value.capsuleGap + 'px'
}))

onMounted(() => {
  loadSettings()
  calcCacheSize()
  setTimeout(() => { loading.value = false }, 150)
})

/* v30：几何初始化提到模块级 —— 必须**首帧就是真值**。
   原先放在上面的 onMounted 里，导致首帧用兜底 44/96 渲染、挂载后才跳成真值，
   整页"跳一下"，并在转场时留下错位残影（首页那个 bug 的同族问题）。
   面试页的注释早写明这条规则，这里与它对齐。
   注意：onShow 里若需要重测（旋转屏/分屏）仍可再调一次，本函数可复用。 */
initNavMetrics()

/* ===== v33 吸顶导航配套 =====
 * backPressed：hover-class 在 fixed 元素上偶发不触发，改用 touch 事件自己控按压态。
 * navHoldStyle：占位块只注入状态栏高度，内容高与底间距由 WXSS 的 rpx 承担。
 * pageStyle：把状态栏高度写进 CSS 变量，供 .pg-nav-center 让标题在内容区居中。 */
const backPressed = ref(false)
const navHoldStyle = computed(() => ({
  paddingTop: navMetrics.value.statusBar + 'px'
}))
const pageStyle = computed(() => ({
  '--nav-pad-top': navMetrics.value.statusBar + 'px'
}))
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 设置 · 纸本目录（v34）
 * ============================================================================
 * 版面意图：这不是"一堆开关"，而是一份**被排过版的目录**。
 *   · 刊头一行等宽眉标（SETTINGS / v1.0.0），像版权页的版次
 *   · 每个分组：朱砂序号（01）→ 大标题 → 向右延伸的发丝线，收成一条目视线
 *   · 分组的条目**不用卡片包裹**：通栏发丝线分隔，行与行之间只有纸面本身
 *   · 控件（开关 / 字号档位）收敛到凹槽底 + 方圆角，选中态是"抽出一张白卡"
 *
 * 为什么不上卡片：一个分组 3-6 行，套白卡会变成 5 张"设置卡"，
 * 与首页/历史页的账本语言打架；而目录本来就不该有边框。
 * ========================================================================== */
.page {
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
  padding: 0 $page-padding calc(#{$safe-bottom-gap} + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

/* v32：底部留白只在 .page 上给一次（$safe-bottom-gap + env()），
   .content 不再补底部内边距，避免安全区算两次。 */
.content { padding: $sp-1 0 0; }

/* ===== 刊头 =====
 * 两行对位：左侧等宽英文眉标（朱砂），右侧版本读数（墨）。
 * 与其他页的眉标同语言：首页 AI MOCK INTERVIEW / 历史页 INTERVIEW LOG。 */
.masthead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: $sp-2 0 $sp-3;
  border-bottom: 1rpx solid $rule;
  margin-bottom: $sp-5;
}
.mast-kicker {
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.8rpx;
}
.mast-ver {
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-regular;
  color: $text-4;
  letter-spacing: 0.8rpx;
  font-variant-numeric: tabular-nums;
}

/* ===== 加载骨架 =====
 * 骨架的行高照抄真实构成（分组标题 34rpx + 两行 104rpx），
 * 数据到达时是填空而不是整页重排。 */
.skeleton-wrap { padding-top: 4rpx; }
.sk-group { margin-bottom: $sp-6; }
.sk-title { width: 190rpx; height: 24rpx; background: $paper-sunken; border-radius: $radius-xs; margin: 0 0 $sp-3; }
.sk-card { border-top: 1rpx solid $rule; }
.sk-row { height: 76rpx; background: $paper-sunken; border-radius: $radius-xs; margin: 14rpx 0; }
.sk-row + .sk-row { margin-top: 28rpx; }

/* ===== 分组：编目式眉标 =====
 * 序号（朱砂等宽）+ 标题（@include sec-heading）+ 延伸线。
 * 三种元素共用一条基线，读起来是"目录的一项"，不是"分区标题"。 */
.menu-group { margin-bottom: $sp-6; }
.menu-group:last-of-type { margin-bottom: $sp-4; }
.group-title {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  padding: 0 4rpx $sp-3;
}
/* 朱砂等宽两位序号：本设计系统的"盖章"位之一（与报告页 .sec-no 同源） */
.group-index {
  @include mono-index;
}
.group-title-text {
  @include sec-heading;
  flex-shrink: 0;
}
/* 标题右侧延伸发丝线：把标题和条目串成一条目视线 */
.group-line {
  flex: 1;
  height: 1rpx;
  background: $rule;
  transform: translateY(-6rpx);
}

/* ===== 条目：通栏发丝线，不套卡片 =====
 * 行高与 App.vue 的 .list-row 同刻度（min-height 104rpx / padding 32rpx 0），
 * 但左右留 4rpx —— 与分组标题的缩进对齐，目录才齐整。 */
.menu-list {
  border-top: 1rpx solid $rule;
}
.menu-item {
  display: flex;
  align-items: center;
  min-height: 104rpx;
  padding: $sp-4 4rpx;
  box-sizing: border-box;
  border-bottom: 1rpx solid $rule;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.menu-item:last-child { border-bottom: none; }
/* v31：删掉 .menu-item:active —— 微信小程序 WXSS 不支持 :active 伪类，
   按压统一走模板上的 hover-class="hover-press"（全局类，App.vue 定义）。 */
.menu-item.column { flex-direction: column; align-items: stretch; }

.row-lead { display: flex; align-items: center; }

/* 图标列：固定 48rpx 宽，保证所有行的文字左缘落在同一条竖线上。
   ⚠️ 不再给每个图标垫浅色方块 —— 六行六个灰块会把"目录"读成"卡片墙"，
   墨色线性图标本身就是纸上的小批注。 */
.row-icon {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 22rpx;
}
.row-icon-img {
  width: 34rpx;
  height: 34rpx;
}

.menu-text-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.menu-text {
  font-size: 30rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  line-height: 1.35;
  letter-spacing: -0.3rpx;
}
/* 危险项：文字仍是墨（红字标题在纸本里读作"报错"），
   只在图标下垫一枚极浅朱砂方章 —— 克制的一眼识别位。 */
.menu-text.danger { color: $text-1; }
.danger-item .row-icon {
  background: $verm-soft;
  border-radius: $radius-xs;
  height: 52rpx;
}
.menu-desc {
  font-size: 23rpx;
  color: $text-3;
  margin-top: 8rpx;
  line-height: 1.45;
}
/* 右侧值（仅本人 / 已登录 / 检查中…）：等宽读数，与左侧文字区分层级 */
.menu-extra-text {
  font-family: $font-mono;
  font-size: 23rpx;
  color: $text-3;
  flex-shrink: 0;
  margin-left: $sp-3;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}
.menu-arrow { width: 15rpx; height: 15rpx; flex-shrink: 0; margin-left: 12rpx; }

/* ===== 字号档位 =====
 * 凹槽轨道（$paper-sunken）+ 三档方圆角（$radius-sm）。
 * 选中项不是"整块变黑"，而是**从轨道里抽出一张白卡**：
 * 纸本语言里，纸的抬起靠底色差，不靠颜色反转。 */
.font-options {
  display: flex;
  gap: 8rpx;
  margin-top: $sp-3;
  padding: 6rpx;
  background: $paper-sunken;
  border-radius: $radius-md;
}
.font-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20rpx 0;
  border-radius: $radius-sm;
  border: 1rpx solid transparent;
  transition: background-color $motion-fast $ease-out, border-color $motion-fast $ease-out;
}
.font-option.active {
  background: $paper-card;
  border-color: $rule;
}
.font-option-text {
  color: $text-1;
  font-weight: $weight-bold;
  line-height: 1.2;
  letter-spacing: -0.4rpx;
}
.font-option.active .font-option-text { color: $ink; }
/* 三档的样张字号差是功能本身（让用户先看到效果再点），保留原刻度 */
.sample-small { font-size: 26rpx; }
.sample-medium { font-size: $font-lg; }
.sample-large { font-size: $font-xl; }
.font-option-label {
  font-size: 21rpx;
  color: $text-3;
  margin-top: 8rpx;
  font-weight: $weight-medium;
}
.font-option.active .font-option-label { color: $text-2; }

/* ===== 退出登录 =====
 * 可逆操作：凹槽底 + 方圆角，不用描边也不用朱砂。
 * 与上方通栏线区分开 —— 它是动作，不是目录里的又一项。 */
.logout-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
  height: 96rpx;
  margin-top: $sp-5;
  border-radius: $radius-btn;
  background: $paper-sunken;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out, background-color $motion-fast $ease-out;
}
.logout-icon { width: 32rpx; height: 32rpx; }
.logout-text {
  font-size: 29rpx;
  font-weight: $weight-semibold;
  color: $text-2;
  letter-spacing: -0.2rpx;
}
</style>
