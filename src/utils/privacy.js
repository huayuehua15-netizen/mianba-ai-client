/**
 * 隐私授权工具（微信小程序隐私合规）
 *
 * 为什么需要：
 *   本项目用到两个隐私接口 —— uni.chooseImage（更换头像，访问相册/相机）
 *   与录音（语音作答，访问麦克风）。微信要求调用前必须获得用户明确授权，
 *   否则接口会被直接拦截，且审核可能被拒（已在 manifest 开启 __usePrivacyCheck__）。
 *
 * 策略（稳健且解耦后端配置）：
 *   1) 已同意过（本地存储标记）→ 直接放行；
 *   2) 未同意 → 优先走微信官方隐私接口 wx.requirePrivacyAuthorize（需公众平台已配置《隐私保护指引》）；
 *   3) 官方接口不可用（后端未配置隐私指引）→ 降级为自定义授权弹窗，用户同意后放行并持久化标记。
 *
 * 同时提供 registerPrivacyInterceptor()，在 App 启动时挂 wx.onNeedPrivacyAuthorize，
 * 这样即便后续接入官方隐私指引，也始终走我们统一的授权弹窗。
 */

const PRIVACY_AGREED_KEY = 'mianba_privacy_agreed'

export const hasPrivacyAgreed = () => {
  try {
    return uni.getStorageSync(PRIVACY_AGREED_KEY) === true
  } catch (e) {
    return false
  }
}

export const markPrivacyAgreed = () => {
  try {
    uni.setStorageSync(PRIVACY_AGREED_KEY, true)
  } catch (e) { /* 存储异常忽略 */ }
}

// 按场景区分的授权说明：告知的用途必须与实际行为一致（虚假告知是审核红线），
// 「保存海报」时弹「用于设置头像」这种张冠李戴的说明同样会被看出粗糙。
// default 用于全局拦截器（wx.onNeedPrivacyAuthorize 触发时无法得知具体接口场景）。
const PURPOSE_TEXTS = {
  avatar:
    '为了设置头像，「我的面试小屋」需要访问你的相册或相机。选取的图片将上传至服务器存储。\n\n' +
    '完整说明见「我的 → 设置 → 隐私政策」。',
  record:
    '语音作答需要使用麦克风。录音将上传至服务端转写为文字，音频文件不长期保存。\n\n' +
    '完整说明见「我的 → 设置 → 隐私政策」。',
  poster:
    '保存成绩海报需要写入你的相册，仅写入海报图片，不会读取相册内容。\n\n' +
    '完整说明见「我的 → 设置 → 隐私政策」。',
  default:
    '为了提供面试服务，「我的面试小屋」需要以下权限：\n\n' +
    '· 相册/相机：用于设置头像，图片将上传至服务器存储；\n' +
    '· 麦克风：用于语音作答，录音将上传至服务端转写为文字，音频文件不长期保存。\n\n' +
    '上传的信息仅用于生成面试评分与报告。完整说明见「我的 → 设置 → 隐私政策」。'
}

// 自定义隐私授权弹窗（Promise 化）。resolve(true) = 用户同意
// 文案必须与实际数据处理一致（审核红线：隐私告知与实现不符会被判定虚假告知）
export const showPrivacyModal = (purpose = 'default') => new Promise((resolve) => {
  uni.showModal({
    title: '隐私授权说明',
    content: PURPOSE_TEXTS[purpose] || PURPOSE_TEXTS.default,
    confirmText: '同意并继续',
    cancelText: '暂不使用',
    success: (res) => {
      if (res.confirm) {
        markPrivacyAgreed()
        resolve(true)
      } else {
        resolve(false)
      }
    },
    fail: () => resolve(false)
  })
})

/**
 * 统一入口：调用隐私接口前 await 此方法。
 * @param {string} purpose 场景标识（avatar / record / poster），用于匹配授权说明文案
 * @returns {Promise<boolean>} true = 已授权可继续
 */
export const ensurePrivacyAuthorize = async (purpose = 'default') => {
  if (hasPrivacyAgreed()) return true

  // 优先走微信官方隐私接口（需公众平台已配置隐私指引）
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && typeof wx.requirePrivacyAuthorize === 'function') {
    try {
      // 超时兜底：官方接口在《用户隐私保护指引》未配置时可能双不回调（不 success 不 fail），
      // 没有超时会永久挂起 → 用户看到「点了没反应」
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('官方隐私接口超时')), 3000)
        wx.requirePrivacyAuthorize({
          success: () => { clearTimeout(timer); resolve() },
          fail: () => { clearTimeout(timer); reject(new Error('官方隐私接口不可用')) }
        })
      })
      markPrivacyAgreed()
      return true
    } catch (e) {
      // 超时/失败降级到自定义弹窗
    }
  }
  // #endif

  return await showPrivacyModal(purpose)
}

/**
 * 全局注册隐私授权拦截器（App.onLaunch 调用一次即可）。
 * 兼容两种回调签名：旧版直接传 resolve 函数，新版传含 .resolve 的对象。
 */
export const registerPrivacyInterceptor = () => {
  // #ifdef MP-WEIXIN
  if (typeof wx === 'undefined' || typeof wx.onNeedPrivacyAuthorize !== 'function') return
  wx.onNeedPrivacyAuthorize((arg) => {
    // 统一取出 resolve 函数
    const resolve = typeof arg === 'function' ? arg : (arg && typeof arg.resolve === 'function' ? arg.resolve : null)
    if (!resolve) return
    if (hasPrivacyAgreed()) {
      resolve({ event: 'agree' })
      return
    }
    showPrivacyModal().then((ok) => resolve({ event: ok ? 'agree' : 'disagree' }))
  })
  // #endif
}
