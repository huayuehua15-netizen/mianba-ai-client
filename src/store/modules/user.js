import { defineStore } from 'pinia'
import { login as apiLogin, getUserStats, updateProfile } from '@/api/user'
import { useMedalStore } from '@/store/modules/medal'

// 并发去重：多个页面同时触发登录时，共享同一次请求，避免重复 wx.login / 重复建号
let loginPromise = null

// 「已退出登录」标记：设置后不再静默自动登录（微信 openid 无感重登会让「退出登录」形同虚设），
// 直到用户显式登录（wxLogin(true)）才会清除标记重新建档
const LOGGED_OUT_KEY = 'mianba_logged_out'
const isLoggedOutMarked = () => uni.getStorageSync(LOGGED_OUT_KEY) === '1'

/* 「已授权建立账号」标记（2026-11-07 合规改造）
 * ------------------------------------------------------------------
 * 背景：旧实现在 App.vue onLaunch 里直接 wxLogin() —— 用户一打开小程序、
 *   什么都没点，uni.login() 就拿到 code，后端 code2session 换 openid 并建档、
 *   签发 JWT。等价于「未征得同意先建立用户身份标识」，是微信隐私规范与
 *   代码审核重点看的项；用户侧也表现为「点登录只是转个圈就好了」，
 *   因为账号其实早就建好了。
 *
 * 规则：
 *   · 未写过本标记 → wxLogin(false) 一律不发起登录（返回 null），只展示登录入口；
 *   · 用户显式点「微信一键登录」→ wxLogin(true)，登录成功后写入本标记；
 *   · 之后 token 过期/401 自愈仍可静默重登（用户已授权过，无需再问一次）；
 *   · logout() 清除本标记，回到「需要显式授权」状态。
 *
 * 为什么不用「token 是否存在」代替：token 会过期/被清，用它判断会把
 *   老用户的每次冷启动都变成重新授权；本标记是账号级、跨会话持久的。 */
const ACCOUNT_AUTHORIZED_KEY = 'mianba_account_authorized'
export const isAccountAuthorized = () => {
  try { return uni.getStorageSync(ACCOUNT_AUTHORIZED_KEY) === '1' } catch (e) { return false }
}
const markAccountAuthorized = () => {
  try { uni.setStorageSync(ACCOUNT_AUTHORIZED_KEY, '1') } catch (e) { /* 存储异常忽略 */ }
}
const clearAccountAuthorized = () => {
  try { uni.removeStorageSync(ACCOUNT_AUTHORIZED_KEY) } catch (e) { /* 忽略 */ }
}

// 账号级本地数据：换账号/退出/注销时必须清理，
// 否则新账号会看到上一账号的面试进度、勋章已读标记与自定义题目
const ACCOUNT_KEYS = ['interview_progress', 'medalSeen', 'current_custom_questions', 'custom_questions', 'lastTtsVoice', 'quick_position']
const purgeAccountKeys = () => {
  ACCOUNT_KEYS.forEach((k) => {
    try { uni.removeStorageSync(k) } catch (e) { /* 忽略单个 key 清理失败 */ }
  })
}

export const useUserStore = defineStore('user', {
  state: () => ({
    userInfo: null,
    token: '',
    stats: null
  }),

  getters: {
    isLoggedIn: (state) => !!state.token
  },

  actions: {
    // 从本地存储恢复登录态
    checkLogin() {
      const token = uni.getStorageSync('token')
      const userInfo = uni.getStorageSync('userInfo')
      if (token && userInfo) {
        this.token = token
        this.userInfo = userInfo
      }
    },

    // 微信登录（真机/开发者工具：wx.login 拿 code → 后端换 openid → 拿 JWT）
    // force=true 表示「用户显式点击了登录入口」：这是唯一允许首次建档的路径
    async wxLogin(force = false) {
      if (this.token) return { token: this.token, user: this.userInfo }
      if (loginPromise) return loginPromise

      /* 未授权过的新用户：未经用户主动触发，绝不发起 wx.login / 建档。
         force=true 是各页「微信一键登录」按钮传入的，代表用户已明确同意。 */
      if (!force && !isAccountAuthorized()) return null
      // 用户手动退出后：未显式操作前，不再无感自动登录（force 由登录按钮/取消退出跳转触发）
      if (!force && isLoggedOutMarked()) return null

      // 真机调试/弱网下常见 ERR_NETWORK_CHANGED / request:fail，仅对网络类错误自动重试（最多 3 次、指数退避）
      const isNetworkError = (err) => {
        const msg = (err && (err.errMsg || err.message)) || ''
        return err && (err.errno === 3 || /ERR_NETWORK_CHANGED|request:fail|timeout|socket/i.test(msg))
      }
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

      loginPromise = (async () => {
        const MAX_RETRY = 3
        let lastErr = null
        for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
          try {
            let res
            // #ifdef MP-WEIXIN
            // 修复 P1-5：wx.login() 自身失败也走指数退避重试（之前只有 apiLogin 重试，
            // wx.login() 拿不到 code 时直接抛错，用户没感）。最多 3 次仍失败则提示用户。
            const { code } = await uni.login().catch((e) => {
              throw new Error(`微信登录失败: ${e?.errMsg || e?.message || '未知错误'}`)
            })
            if (!code) {
              if (attempt < MAX_RETRY) {
                await sleep(800 * attempt)
                continue
              }
              throw new Error('获取微信登录 code 失败')
            }
            res = await apiLogin(code)
            // #endif
            // #ifndef MP-WEIXIN
            // 非微信环境（H5 / 本地浏览器预览）模拟登录，便于联调 UI
            res = {
              token: 'dev_token',
              user: { id: '1', nickname: '开发者', avatar_url: '', is_new_user: false }
            }
            // #endif

            this.token = res.token
            this.userInfo = res.user
            uni.setStorageSync('token', res.token)
            uni.setStorageSync('userInfo', res.user)
            /* 微信身份指纹（v6）：后端把 openid 脱敏成 "ornl****Ti38" 下发，
               用于登录弹窗展示「上次登录凭证」，让用户确信走的是微信官方接口
               而不是前端 mock。只存脱敏串，不存完整 openid。
               首次登录/老版本后端没有该字段时忽略即可。 */
            try {
              const fp = res.wx_identity && res.wx_identity.fingerprint
              if (fp) uni.setStorageSync('wx_identity_fp', fp)
            } catch (e) { /* 存储异常不影响登录 */ }
            uni.removeStorageSync(LOGGED_OUT_KEY) // 登录成功即清除「已退出」标记
            markAccountAuthorized()               // 此后 401 可静默重登（用户已授权过）
            return res
          } catch (err) {
            lastErr = err
            if (attempt < MAX_RETRY && isNetworkError(err)) {
              await sleep(800 * attempt)
              continue
            }
            throw err
          }
        }
        throw lastErr
      })()

      try {
        return await loginPromise
      } finally {
        loginPromise = null
      }
    },

    // 获取统计数据（401 时自动清登录态，触发上层重新登录）
    // 短时去重：首页/统计/我的三个 tab 的 onShow 都会调它，快速切 tab 时
    // 2 秒内会重复发 3~4 个一模一样的请求，把微信的 10 并发上限挤满、
    // 拖慢所有后续请求。同一窗口内直接返回同一次结果，逻辑完全不变。
    async fetchStats(force = false) {
      const now = Date.now()
      if (!force && this._statsPromise && now < (this._statsExpireAt || 0)) {
        return this._statsPromise
      }
      this._statsExpireAt = now + 2000
      const p = (async () => {
        let ok = false
        try {
          this.stats = await getUserStats()
          ok = true
          /* 成就解锁检测挂在这里：任何页面拉到最新 stats 都会立刻检测并抛出仪式，
             不再依赖「用户主动打开我的页」。
             旧实现的检测写在 pages/profile 的 onShow 里，导致做完面试在报告页
             看不到任何反馈，要等哪天点开「我的」才补播 —— 成就的价值就是达成瞬间的反馈。
             检测是幂等的（前端 seen 集合与后端 unlocked 做 diff），重复调用无副作用。 */
          try { useMedalStore().detect(this.stats) } catch (e) { /* 勋章检测失败不能影响 stats */ }
        } catch (e) {
          // 401：token 无效/过期，清掉登录态；下次 onLaunch 会重新走 wxLogin
          if (e && (e.code === 401 || e.statusCode === 401)) {
            this.token = ''
            this.userInfo = null
            uni.removeStorageSync('token')
            uni.removeStorageSync('userInfo')
          }
        }
        /* 返回值语义（P1 修复，2026-10-08）：**成功才返回 stats，失败返回 null**。
           旧实现无论成败都 `return this.stats`，于是「本次失败」会返回上一次成功的旧对象 ——
           而消费方（stats 页）的注释明确假设「失败返回 null → 进错误态」，两者不一致导致：
           只要本会话曾成功拉过一次，后续刷新失败都会静默展示**过期数据**
           （例如刚做完面试回统计页刷新失败，仍显示面试前的场次与平均分，且无任何失败提示）。
           现在 this.stats 仍保留旧缓存（其它页面直接读缓存不受影响），
           但调用方可以用返回值区分成败。 */
        return ok ? this.stats : null
      })()
      this._statsPromise = p
      // 失败也让窗口尽快到期，别卡住下一次正常重试
      p.catch(() => {}).finally(() => {
        if (this._statsPromise === p) this._statsPromise = null
      })
      return p
    },

    // 保存用户资料（昵称 / 头像 / 目标岗位等）
    async saveProfile(data) {
      const updated = await updateProfile(data)
      this.userInfo = { ...this.userInfo, ...updated }
      uni.setStorageSync('userInfo', this.userInfo)
      return updated
    },

    // 系统级清除登录态（token 过期/被顶号 401 时由 request 层触发）：
    // 与 logout 的区别是【不写「已退出」标记】——否则过期 token 会把用户锁死在
    // 「永不重登」状态（401 → logout → 标记 → wxLogin 被拒 → 死循环）。
    // 清完后 wxLogin(false) 即可正常静默重登。
    clearSession() {
      this.token = ''
      this.userInfo = null
      this.stats = null
      uni.removeStorageSync('token')
      uni.removeStorageSync('userInfo')
    },

    // 用户主动退出登录：清登录态 + 账号级本地数据 + 写「已退出」标记
    //（标记存在期间 wxLogin(false) 拒绝静默重登，直到用户显式点击登录 wxLogin(true)）
    logout() {
      this.clearSession()
      purgeAccountKeys()
      // 标记退出：本次会话内（App 未冷启动）不再无感自动登录，除非用户显式登录
      uni.setStorageSync(LOGGED_OUT_KEY, '1')
      /* 退出即回到「需要用户重新显式授权」状态：下次冷启动不再静默建档，
         必须再点一次「微信一键登录」。这是隐私合规的关键一环。 */
      clearAccountAuthorized()
    },

    // 注销账号成功后调用：清登录态与账号级本地数据。
    // 账号已不存在 → 授权标记一并清除，下次要重新点「微信一键登录」建档
    //（旧注释写「下次冷启动自动登录」是静默登录时代的语义，现已不适用）。
    accountDeleted() {
      this.clearSession()
      purgeAccountKeys()
      clearAccountAuthorized()
    }
  }
})
