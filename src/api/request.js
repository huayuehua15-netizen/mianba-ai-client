// API 请求封装
//
// 后端地址通过环境变量注入（构建期静态替换）：
//   VITE_API_BASE_URL      生产环境接口地址，例如 https://api.example.com/api/v1
//   VITE_API_BASE_URL_DEV  开发环境接口地址，例如 http://127.0.0.1:3100/api/v1
// 复制仓库根目录的 .env.example 为 .env.local 后填写；.env.local 不会入库。
//
// 小程序上线前需在微信公众平台「开发设置 → 服务器域名」把生产域名加入
// request 合法域名（必须 HTTPS，不能带端口和路径），并用真机体验版验收。
//
// 临时覆盖（仅开发构建生效）：
//   uni.setStorageSync('api_base_url', 'http://127.0.0.1:3100/api/v1')
import { useUserStore } from '@/store/modules/user'

// 生产地址必须来自环境变量；留空时在控制台明确报错，避免静默请求到错误地址
// __API_BASE_URL__ / __API_BASE_URL_DEV__ 由 vite.config.js 在构建期注入
const PROD_BASE_URL = __API_BASE_URL__
// 开发默认指向本机后端；需要直连测试服时在 .env.local 里覆盖
const DEV_BASE_URL = __API_BASE_URL_DEV__

if (process.env.NODE_ENV !== 'development' && !PROD_BASE_URL) {
  console.error('[request] 未配置 VITE_API_BASE_URL，生产构建无法请求后端')
}

const resolveBaseUrl = () => {
  /* 生产构建下彻底忽略 storage 覆盖：
   * 联调时写入的 api_base_url 会跨重新编译残留，若线上正式包读取它，
   * 全部用户流量会被静默打到本地/测试地址。这里从代码层堵死。 */
  if (process.env.NODE_ENV !== 'development') return PROD_BASE_URL
  // 运行时覆盖优先（仅开发构建生效，是联调利器）
  try {
    const override = uni.getStorageSync('api_base_url')
    if (override && typeof override === 'string' && override.trim()) {
      console.warn(`[request] BASE_URL 来自 storage 覆盖（非编译值）：${override.trim()}`)
      return override.trim()
    }
  } catch (e) { /* storage 异常时忽略，走编译期默认值 */ }
  return DEV_BASE_URL
}

const BASE_URL = resolveBaseUrl()

if (process.env.NODE_ENV === 'development') {
  console.warn(`[request] 当前后端地址：${BASE_URL}`)
}

// 默认超时 15s；AI 生成较慢，调用方可通过 options.timeout 覆盖
const DEFAULT_TIMEOUT = 15000
// AI 流式回答耗时较长，单独放宽
const STREAM_TIMEOUT = 60000

// 统一的登录态清理。
// 除清 storage 外必须通知 store 清内存态：401 后若 pinia 里的 token 还是旧值，
// isLoggedIn 仍为 true、wxLogin() 也会因「已有 token」直接返回，整场会话无法自愈，只能杀进程重进。
const clearAuth = () => {
  uni.removeStorageSync('token')
  uni.removeStorageSync('userInfo')
  uni.$emit('auth:invalid')
}

const request = (options) => {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token')
    uni.request({
      url: BASE_URL + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      timeout: options.timeout || DEFAULT_TIMEOUT,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode === 200) {
          if (res.data.code === 0) {
            resolve(res.data.data)
          } else {
            // 静默失败开关：部分接口（如拉取统计）失败时不希望弹 toast 打扰用户
            if (!options.silent) {
              uni.showToast({ title: res.data.message || '请求失败', icon: 'none' })
            }
            reject(res.data)
          }
        } else if (res.statusCode === 401) {
          // 401 有两种完全不同的成因，处理必须分开（否则出现「永不重登」死循环）：
          //   a) token 过期/被顶号 → 清态后静默重登一次并重放原请求，用户无感自愈；
          //   b) 用户主动退出过（mianba_logged_out 标记）→ 尊重用户选择不静默重登，
          //      reject 携带 authRequired，由页面展示「去登录」引导。
          // 注意：clearAuth 只清 storage 并广播（App 侧走 clearSession，不写退出标记），
          // 旧实现广播给 logout() 会把「过期」误标成「已退出」，导致重登被永久拒绝。
          const loggedOut = (() => { try { return uni.getStorageSync('mianba_logged_out') === '1' } catch (e) { return false } })()
          clearAuth()
          if (!loggedOut && !options._authRetry) {
            // 静默重登（wxLogin 内部有并发去重，多个请求同时 401 只会触发一次登录）
            useUserStore().wxLogin()
              .then(() => {
                if (useUserStore().isLoggedIn) {
                  // 重放一次（_authRetry 防止重放后的 401 再次触发登录循环）
                  resolve(request(Object.assign({}, options, { _authRetry: true })))
                  return
                }
                reject(Object.assign({}, res.data, { statusCode: 401, authRequired: true, message: '登录已过期，请重新登录' }))
              })
              .catch(() => {
                reject(Object.assign({}, res.data, { statusCode: 401, authRequired: true, message: '登录已过期，请重新登录' }))
              })
            return
          }
          reject(Object.assign({}, res.data, { statusCode: 401, authRequired: true, message: loggedOut ? '请先登录' : '登录已过期，请重新登录' }))
        } else {
          // 502/503/504 通常是后端未启动、端口被防火墙拦截或局域网 IP 失效导致，
          // 给出可操作的提示，避免开发者误以为是前端代码报错。
          const isGatewayError = [502, 503, 504].includes(res.statusCode)
          /* v30：非 2xx 一律要带上**服务端的 message**。
             此前的写法是裸 `reject(res)` —— 传的是 uni.request 的原始响应，
             它只有 { data, statusCode, errMsg }，**没有 message 字段**，
             而调用方一致读 `e?.message`（全站 10 处）→ 恒为 undefined →
             一律落到兜底文案。真实后果：后端 `userController.js:404`
             返回的「头像图片过大，请更换更小的图片」经 HTTP 400 抵达前端后
             变成一句笼统的「保存失败」，用户不知道该换小图。
             三种 reject 形态（本支 / code!==0 的 res.data / streamRequest 的合并对象）
             在此归一到相同形状：{ code, message, statusCode, data }。 */
          const serverMsg = (res.data && typeof res.data === 'object' && res.data.message)
            ? res.data.message
            : ''
          if (isGatewayError) {
            /* 优先用服务端文案：QUOTA_CHECK_UNAVAILABLE / TTS 过载降级等
               503 都带了具体的「请稍后再试」原因，笼统的「服务暂时不可用」
               会把可操作的提示覆盖掉（历史问题：报告生成中的真实原因被吞）。
               没有 message 时才回落到通用网关文案。 */
            uni.showToast({
              title: serverMsg || '服务暂时不可用，请稍后重试',
              icon: 'none',
              duration: 2500
            })
            /* 诊断信息只在开发构建里输出。
               原因（v31）：这段 console.warn 之前无条件编译进**生产包**，
               文案里写着「请确认后端已运行在 ${BASE_URL}，Windows 防火墙已放行对应端口，
               且局域网 IP 未变化」—— 那是**开发者**的排查指引，对正式版用户毫无意义，
               而且把「这是本地开发环境」的痕迹留在了线上包里（审核/用户都可能看到）。
               正式版用户遇到 502 只需知道「服务暂时不可用，请稍后重试」。 */
            if (process.env.NODE_ENV === 'development') {
              console.warn(
                `[request] 网关错误 ${res.statusCode}：请确认后端已运行在 ${BASE_URL}，` +
                `Windows 防火墙已放行对应端口，且局域网 IP 未变化。`
              )
            }
          } else if (!options.silent) {
            /* 文案按状态码分流：4xx 是**请求本身的问题**，说「网络错误」会把人
               引向排查网络（实际是参数/权限/内容不合规），属诊断误导。
               有服务端文案就用服务端的（它最清楚哪里不对）。 */
            const fallback = res.statusCode >= 500
              ? '服务暂时不可用，请稍后重试'
              : (res.statusCode === 404 ? '请求的内容不存在' : '请求失败，请重试')
            uni.showToast({ title: serverMsg || fallback, icon: 'none' })
          }
          reject(Object.assign({}, res.data, {
            statusCode: res.statusCode,
            // 与上面的 toast 同源：服务端有文案就透传，别用通用文案覆盖掉
            message: serverMsg || (res.statusCode >= 500 ? '服务暂时不可用，请稍后重试' : '请求失败，请重试')
          }))
        }
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        // 超时单独提示，避免与断网混淆
        if (/timeout/i.test(msg)) {
          uni.showToast({ title: '请求超时，请检查网络', icon: 'none' })
        } else if (!options.silent) {
          uni.showToast({ title: '网络连接失败', icon: 'none' })
        }
        reject(err)
      }
    })
  })
}

// SSE 流式请求封装（用于AI对话）
const streamRequest = (options) => {
  // #ifdef MP-WEIXIN
  // 兼容性：微信基础库 <2.24 或部分模拟器环境无 TextDecoder，需降级 UTF-8 解码
  // 关键：必须用同一个 TextDecoder 实例跨 chunk 连续解码（stream 模式），
  // 否则中文多字节字符在 chunk 边界被拆散会输出 U+FFFD，导致 JSON.parse 失败、数据损坏。
  let utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { stream: true }) : null
  const decodeChunk = (buffer) => {
    if (utf8Decoder) {
      try { return utf8Decoder.decode(buffer, { stream: true }) } catch (e) { return utf8Decoder.decode(buffer) }
    }
    // 降级：逐字节解码 UTF-8（含多字节中文），不依赖全局 TextDecoder
    const bytes = new Uint8Array(buffer)
    let str = ''
    let i = 0
    while (i < bytes.length) {
      const b = bytes[i]
      if (b < 0x80) { str += String.fromCharCode(b); i += 1 }
      else if (b >= 0xc0 && b < 0xe0) { str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2 }
      else if (b >= 0xe0 && b < 0xf0) { str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)); i += 3 }
      else if (b >= 0xf0) { str += String.fromCharCode(((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f)); i += 4 }
      else { i += 1 }
    }
    return str
  }

  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token')
    let settled = false
    let timer = null
    const requestTask = uni.request({
      url: BASE_URL + options.url,
      method: options.method || 'POST',
      data: options.data || {},
      timeout: options.timeout || STREAM_TIMEOUT,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        'Accept': 'text/event-stream'
      },
      // 流式响应必须用 arraybuffer 才能走 onChunkReceived 拿到二进制分块
      responseType: 'arraybuffer',
      enableChunked: true,
      success: (res) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        // 校验 HTTP 状态码：流式接口出错时（400/401/500）success 也会触发，不能当成功处理
        if (res.statusCode !== 200) {
          if (res.statusCode === 401) {
            clearAuth()
            // SSE 不做静默重登重放（流式重建复杂度高，且面试中 token 过期极罕见）：
            // 标记 authRequired 供页面识别，文案区分「已退出」与「过期」
            const loggedOut = (() => { try { return uni.getStorageSync('mianba_logged_out') === '1' } catch (e) { return false } })()
            reject(Object.assign({}, res.data, { statusCode: 401, authRequired: true, message: loggedOut ? '请先登录' : '登录已过期，请重试' }))
            return
          }
          /* 修复（实测复现）：responseType=arraybuffer 时 res.data 是 ArrayBuffer，
             直接 res.data.message 恒为 undefined —— 服务端下发的真实原因
             （如 SSE 端点 422 + code 1002「内容包含违规信息」）会被吞成笼统文案。
             先解码再解析 JSON 取 message；decodeChunk 是流式 UTF-8 解码器，
             对完整 buffer 同样适用。 */
          let serverData = null
          try {
            const text = res.data instanceof ArrayBuffer
              ? decodeChunk(res.data)
              : (typeof res.data === 'string' ? res.data : '')
            serverData = text ? JSON.parse(text) : null
          } catch (e) { serverData = null }
          const msg = (serverData && serverData.message)
            ? serverData.message
            : (res.statusCode >= 500 ? '服务暂时不可用，请稍后重试' : '请求失败，请重试')
          if (!options.silent) uni.showToast({ title: msg, icon: 'none' })
          reject(Object.assign({}, serverData || {}, { statusCode: res.statusCode, message: msg }))
          return
        }
        resolve(res)
      },
      fail: (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(err)
      }
    })

    // 兜底超时：AI 卡死时 onChunk 可能既不 success 也不 fail，
    // 必须主动 abort，否则页面 isLoading 永远为 true，用户彻底卡在「思考中」。
    // 关键：每收到一个 chunk 就重置计时——只要流还在推进，就不该因上游慢被掐断。
    const startTimeout = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (settled) return
        settled = true
        try { requestTask.abort && requestTask.abort() } catch (e) { /* 已结束时忽略 */ }
        reject(new Error('AI 响应超时，请重试'))
      }, options.timeout || STREAM_TIMEOUT)
    }

    // 监听流式数据
    requestTask.onChunkReceived && requestTask.onChunkReceived((res) => {
      const chunk = decodeChunk(res.data)
      if (options.onChunk) options.onChunk(chunk)
      startTimeout()
    })

    startTimeout()
  })
  // #endif
  // #ifndef MP-WEIXIN
  // H5 等平台：fetch + ReadableStream
  // 关键：fetch 失败（断网/DNS/超时）、HTTP 非 200、reader.read() 抛错时都必须 reject，
  // 否则 .catch 不会被触发，调用方会拿到 undefined 以为是成功，面试流式 SSE 静默卡死
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = setTimeout(() => controller && controller.abort(), options.timeout || STREAM_TIMEOUT)
  return fetch(BASE_URL + options.url, {
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${uni.getStorageSync('token')}`
    },
    body: JSON.stringify(options.data || {}),
    signal: controller ? controller.signal : undefined
    }).then(async (res) => {
    if (!res.ok) {
      // 非 2xx：HTTP 401 / 500 等要走 reject，否则 SSE 永远不进入 catch
      if (res.status === 401) clearAuth()
      /* 与小程序端同口径：尽量透传服务端 message（如 422 + 1002「内容包含违规信息」），
         没有就回落到状态码文案。 */
      let serverMsg = ''
      try {
        const text = await res.text()
        const data = text ? JSON.parse(text) : null
        if (data && typeof data.message === 'string') serverMsg = data.message
      } catch (e) { serverMsg = '' }
      const msg = serverMsg || (res.status >= 500 ? '服务暂时不可用，请稍后重试' : `请求失败（${res.status}）`)
      // 不弹 toast：交给上层 page/store 统一提示（避免与页面内 toast 重复）
      throw Object.assign(new Error(msg), { statusCode: res.status })
    }
    const reader = res.body && res.body.getReader ? res.body.getReader() : null
    if (!reader) return
    // 跨 chunk 连续解码：中文多字节字符跨分片时不产生 U+FFFD
    const decoder = new TextDecoder('utf-8', { stream: true })
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      if (options.onChunk) options.onChunk(chunk)
    }
  }, (err) => {
    // fetch 本身失败（断网/DNS/超时）：重新抛出，往上传导
    throw err
  }).finally(() => clearTimeout(timer))
  // #endif
}

// 同时提供默认导出与具名导出 http：
// 部分已编译产物以 require('./request').http 的方式访问，只有默认导出会导致 e.http 为 undefined
const http = { request, streamRequest, BASE_URL }
export default http
export { http }
