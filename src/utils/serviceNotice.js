/**
 * 服务繁忙 / 过载的统一友好提示（v31 新增）
 * ============================================================================
 * 背景：TTS（阿里云百炼 CosyVoice）与 ASR（qwen3-asr-flash）共用上游额度，
 * 上线后同时使用的人多时上游会限流（429）或 5xx。这类失败**不是用户的问题，
 * 也不是 bug**，但若把 "timeout of 30000ms exceeded" / "429" 直接弹给用户，
 * 用户会以为小程序坏了，甚至给差评。
 *
 * 这里把「上游过载」这一类错误识别出来，统一换成有温度、且**给出下一步动作**
 * 的提示，让用户明白：这是暂时的容量问题，会自己恢复，不需要做任何操作。
 *
 * ===== 文案设计的三条原则 =====
 * 1. **归因于容量，不归因于用户**：说"当前练习人数较多"，而不是"你的网络有问题"
 *    —— 后者会让用户去折腾自己的 Wi-Fi，问题却没解决。
 * 2. **明确"会自己好"**：用户最怕的是"这是不是坏了、要不要重装"。
 *    所以必须写清"稍后自动恢复"，减少焦虑与无效操作。
 * 3. **给出可走的替代路径**：只说"失败了"是死路，要告诉用户"现在还能怎么做"。
 *    且 TTS 与 ASR 的替代路径**不同**（见下），不能共用一句。
 */

/** 场景化文案：TTS 与 ASR 失败后用户能做的事不一样，必须分开写 */
const SCENE_COPY = {
  // 语音播报（TTS）：题目文字已经在屏幕上，用户直接看即可
  tts: {
    tip: '语音播报暂时繁忙，题目文字就在上方，可以直接阅读作答',
    extra: '稍后会自动恢复，不影响你的答题进度。'
  },
  // 语音识别（ASR）：用户改用手打
  asr: {
    tip: '语音识别暂时繁忙，可以改用键盘输入作答',
    extra: '稍后会自动恢复，不影响你的答题进度。'
  },
  // 未指定场景时的通用文案
  default: {
    tip: '语音功能暂时繁忙，可先改用文字作答',
    extra: '稍后会自动恢复，不影响你的答题进度。'
  }
}

export const OVERLOAD_TITLE = '当前练习人数较多'

/** 默认（ASR）提示语，保持向后兼容 —— 面试页的语音作答是最常见触发路径 */
export const OVERLOAD_TIP = SCENE_COPY.asr.tip

/**
 * 判断一个错误是否为「上游过载 / 服务繁忙」
 * 后端会把这类错误统一成 code='UPSTREAM_OVERLOAD' + HTTP 503，
 * 这里同时兼容旧形态（429 / 503 裸状态码、message 含限流关键词），
 * 避免后端尚未升级时前端就已经换了判定口径。
 */
export const isOverloadError = (e) => {
  if (!e) return false
  if (e.code === 'UPSTREAM_OVERLOAD') return true
  if (e.statusCode === 429 || e.statusCode === 503) return true
  const msg = String(e.message || e.errMsg || '')
  return /人数较多|繁忙|限流|rate limit|throttl|too many requests|overload/i.test(msg)
}

/**
 * 展示「服务繁忙」提示。
 *
 * 用 showModal 而不是 showToast：toast 一闪而过，用户可能没看清就重试了；
 * 语音是核心功能，中断时需要用户明确知情并知道替代方案。
 * 但模态框会打断操作，所以：
 *   · 同一会话内只弹一次（用户已知情，后续失败降级为轻提示），避免反复打断
 *   · 用户正在录音/识别时才值得弹模态，否则 toast 足矣
 *
 * @param {object} opts
 *   - scene: 'tts' | 'asr'  决定文案（默认按 asr 处理）
 *   - force: 跳过"本会话只弹一次"的限制（调试或用户主动重试时用）
 */
let modalShownThisSession = false

export const showOverloadNotice = ({ scene = 'asr', force = false } = {}) => {
  const copy = SCENE_COPY[scene] || SCENE_COPY.default

  if (!force && modalShownThisSession) {
    // 已提示过：降级为轻提示，不再次打断
    uni.showToast({ title: copy.tip, icon: 'none', duration: 2600 })
    return
  }
  modalShownThisSession = true

  uni.showModal({
    title: OVERLOAD_TITLE,
    // 三段结构：发生了什么 → 现在能怎么做 → 会不会自己好
    // 用 \n\n 分段（微信 modal 支持换行），避免挤成一坨读不下去
    content: `${copy.tip}。\n\n${copy.extra}`,
    confirmText: '知道了',
    showCancel: false
  })
}

/** 供测试或长会话重置使用 */
export const resetOverloadNotice = () => { modalShownThisSession = false }
