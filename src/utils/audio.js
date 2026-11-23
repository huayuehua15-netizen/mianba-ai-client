/**
 * 音频播放管理
 *
 * 播放器策略（2026-09-16 重构）：
 * - 每次播放新建 InnerAudioContext，结束/打断即销毁——旧实现复用单实例但从不销毁，
 *   换源播放时状态残留、onEnded 监听器越积越多
 * - 支持 播放/暂停/继续/停止 四态，供面试页「播报 ↔ 暂停」按钮切换
 * - onEnded/onError 回调由调用方注入，播放态 UI 不再靠 setTimeout 猜时长
 */
import { textToSpeechApi, pollTtsJob } from '@/api/tts'

let currentCtx = null
let currentKey = null
let paused = false
// 播放代际：每次 playTts 自增，stopAudio 时置为 -1。
// playTts 的异步分段循环在推进每一段前校验本代际仍有效，否则停止创建新实例。
// 仅有 stopAudio 销毁「当前那一个」ctx 不够：循环醒来还会 new 出下一段的
// InnerAudioContext 继续播（用户结束面试后语音仍在响，就是这个漏）。代际是
// 「这次播放整体作废」的开关，比逐个销毁实例可靠。
let playGeneration = 0

const destroyCurrent = () => {
  if (currentCtx) {
    try { currentCtx.stop(); currentCtx.destroy() } catch (e) { /* 已销毁时忽略 */ }
    currentCtx = null
    currentKey = null
    paused = false
  }
}

/**
 * 播放音频（自动打断上一次播放）
 * @param {string} url 音频地址
 * @param {object} opts { onEnded, onError } 播放结束/出错回调（可选）
 */
export const playAudio = (url, opts = {}) => {
  destroyCurrent()
  const ctx = uni.createInnerAudioContext()
  ctx.src = url
  if (typeof opts.onEnded === 'function') ctx.onEnded(() => opts.onEnded())
  if (typeof opts.onError === 'function') ctx.onError((e) => opts.onError(e))
  currentCtx = ctx
  currentKey = url
  paused = false
  ctx.play()
  return ctx
}

export const stopAudio = () => {
  // 整次播放作废：销毁当前实例 + 让 playTts 的分段循环不再创建新实例
  playGeneration = -1
  destroyCurrent()
}

/**
 * 顺序播放音频列表（分段合成的多段 mp3 无缝衔接）
 * 暂停/继续作用于当前段；换新的播放列表自动打断旧的
 */
export const playPlaylist = (urls, opts = {}) => {
  destroyCurrent()
  if (!Array.isArray(urls) || urls.length === 0) return
  let idx = 0
  const playNext = () => {
    if (idx >= urls.length) { if (typeof opts.onEnded === 'function') opts.onEnded(); return }
    const url = urls[idx++]
    const ctx = uni.createInnerAudioContext()
    ctx.src = url
    ctx.onEnded(() => playNext())
    if (typeof opts.onError === 'function') ctx.onError((e) => opts.onError(e))
    currentCtx = ctx
    currentKey = url
    paused = false
    ctx.play()
  }
  playNext()
}

export const pauseAudio = () => {
  if (currentCtx && !paused) { currentCtx.pause(); paused = true }
}

export const resumeAudio = () => {
  if (currentCtx && paused) { currentCtx.play(); paused = false }
}

// 当前播放是否处于暂停态（供 UI 判断「继续/暂停」文案）
export const isPaused = () => paused
// 当前是否有实例在播（含暂停态）
export const hasActiveAudio = () => !!currentCtx
// 当前播放的 key（url），供页面判断"按的是不是同一条"
export const currentAudioKey = () => currentKey

/**
 * 文本转语音并播放（首段就绪即开口，后续段渐进衔接）
 * 实现"实时感"：首段 = 第一句，最短路径 ~2s 出声；后续段在首段语音时长内陆续就绪。
 * 与后端预合成叠加：题目生成时已启动 TTS，文字渲染到屏幕时首段往往已就绪 → 开口几乎与文字同步。
 *
 * @param {string} text 待合成文本
 * @param {object} opts { isCancelled, onEnded, onError }
 *   - isCancelled: ()=>boolean，返回 true 时中止播放（页面切到别条时调用方返回 true）
 *   - onEnded: 全部段播放完回调
 *   - onError: 失败回调（兜底也失败时）
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 把后端 job 的失败信息转成 Error（v31）
 * 后端的 job.error 是给用户看的中文文案（字符串），过载标记单独放在 errorCode。
 * 这里把 errorCode 挂到 Error.code 上，让上层（面试页 onError）能用
 * isOverloadError 区分「上游人多限流」和「真的坏了」——
 * 前者要提示"稍后再试/改用文字"，后者才该报错。
 */
const makeJobError = (job, fallback = '语音合成失败') => {
  const err = new Error(job.error || fallback)
  if (job.errorCode) err.code = job.errorCode
  return err
}

export const playTts = async (text, opts = {}) => {
  // 本次播放的代际：stopAudio 会把全局代际打成 -1，循环里据此判断是否已作废。
  // 用局部 gen 快照而非每次读全局，是为了「同一次调用内部状态一致」。
  playGeneration++
  const gen = playGeneration
  const cancelled = () => gen !== playGeneration || (opts.isCancelled && opts.isCancelled())

  /* v31 安全阀：两个轮询 while（等首段 / 等分段）必须有总时长上限。
   * 旧版 textToSpeech（:194）有 60 次上限 = 30s，而升级后的 playTts
   * 把这个上限丢了 —— 后端 job 若既不 done 也不带 error（合成卡死、
   * 网关半开），这里就会每 500ms 无限打一次 /tts/job/:id，
   * 直到用户离开面试页触发 stopAudio 才跳出：白白打满服务端 CPU 与带宽，
   * 用户侧表现为「播报按钮一直转圈」。
   * 取 45s：长题面的多段合成需要比旧版 30s 更宽，但仍是硬上限。 */
  const deadline = Date.now() + (opts.maxWait || 45000)
  const expired = () => Date.now() > deadline

  // 创建（或复用）合成 job；后端重启会丢内存 job，轮询 404 时自动重建一次
  const openJob = async () => {
    const post = await textToSpeechApi(text, opts.voice)
    if (post.urls) return { jobId: null, urls: post.urls, done: true, error: null }
    if (!post.jobId) throw new Error('TTS 响应异常')
    return { jobId: post.jobId, urls: [], done: false, error: null }
  }

  let job = await openJob()
  let rebuilt = false

  const fetchState = async () => {
    if (!job.jobId) return job
    try {
      const j = await pollTtsJob(job.jobId)
      /* v31：error_code 必须一起取回来。
       * 后端在 job 失败时返回 { error: '中文文案', error_code: 'UPSTREAM_OVERLOAD' | null }，
       * 而 error 是**字符串**（保留它是为了兼容下方 `new Error(job.error)` 的用法）。
       * 若这里只取 error，过载标记就断在传输层，调用方无法区分
       * 「上游人多限流」和「真的坏了」—— 两者给用户的提示应该完全不同。 */
      job = {
        jobId: job.jobId,
        urls: j.urls || [],
        done: !!j.done,
        error: j.error,
        errorCode: j.error_code || null
      }
    } catch (e) {
      // 404 = 后端重启导致 job 丢失 → 重建一次（否则永久卡在轮询里无声无息）
      const notFound = e?.code === 'TTS_JOB_NOT_FOUND' || e?.statusCode === 404
      if (notFound && !rebuilt) { rebuilt = true; job = await openJob(); return job }
      throw e
    }
    return job
  }

  // 等首段就绪（首段 ~2s；预合成命中时一次轮询即就绪）
  await fetchState()
  while (!job.urls[0]) {
    if (cancelled()) { stopAudio(); return }
    if (expired()) { stopAudio(); throw new Error('语音合成超时，请稍后重试') }
    if (job.done) {
      throw makeJobError(job, 'TTS 首段缺失')
    }
    await sleep(500)
    await fetchState()
  }

  // 逐段播放：当前段就绪 → 播 → onEnded → 下一段（未就绪则等）
  let i = 0
  while (true) {
    if (cancelled()) { stopAudio(); return }
    while (!job.urls[i]) {
      if (job.done) {
        if (job.error) throw makeJobError(job)
        if (typeof opts.onEnded === 'function') opts.onEnded()
        return
      }
      if (cancelled()) { stopAudio(); return }
      // 同上：同样必须有上限，否则分段轮询也是无限循环
      if (expired()) { stopAudio(); throw new Error('语音合成超时，请稍后重试') }
      await sleep(500)
      await fetchState()
    }
    // 播放前最后校验一次代际：stopAudio 可能在上一段 onEnded 到此处之间触发
    if (cancelled()) { stopAudio(); return }
    let settled = false
    await new Promise((resolve, reject) => {
      const ctx = uni.createInnerAudioContext()
      ctx.src = job.urls[i]
      ctx.onEnded(() => { settled = true; resolve() })
      ctx.onError((e) => { settled = true; reject(new Error((e && (e.errMsg || e.errCode)) || '音频播放失败')) })
      // 外部 stopAudio 已销毁前段实例并作废代际时，本段 Promise 必须落地，
      // 否则外层 await 永久挂起，页面引用泄漏（组件已卸载还在等一个不会来的 resolve）
      ctx.onStop(() => { if (!settled) { settled = true; resolve() } })
      currentCtx = ctx
      currentKey = job.urls[i]
      paused = false
      ctx.play()
    })
    // 段播放结束就再校验代际：被 stop 后不再推进下一段
    if (cancelled()) { stopAudio(); return }
    i++
    await fetchState()
    if (job.done && i >= job.urls.length) {
      if (typeof opts.onEnded === 'function') opts.onEnded()
      return
    }
  }
}

// 兼容旧调用方：返回 url 列表（已不推荐，新代码用 playTts）
export const textToSpeech = async (text) => {
  const post = await textToSpeechApi(text)
  if (post.urls) return post.urls
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    const job = await pollTtsJob(post.jobId)
    if (job.done && Array.isArray(job.urls) && job.urls.length) return job.urls
    if (job.done && job.error) throw new Error(job.error)
  }
  throw new Error('TTS 轮询超时')
}
