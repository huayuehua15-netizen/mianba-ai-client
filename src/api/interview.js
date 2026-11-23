import http from './request'

// 创建面试
// 后端 create 内同步生成首题（AI 最长 60s），默认 15s 必超时 —— 「开始面试加载很久然后失败」的根因
export const createInterview = (data) => http.request({ url: '/interviews', method: 'POST', data, timeout: 60000 })

// 提交回答（流式）
export const submitAnswer = (id, data, onChunk) =>
  http.streamRequest({ url: `/interviews/${id}/answer`, method: 'POST', data, onChunk })

// 结束面试
// 后端在 complete 内同步生成报告（AI 30-60s），默认 15s 必超时，单独放宽到 60s
export const completeInterview = (id) => http.request({ url: `/interviews/${id}/complete`, method: 'POST', timeout: 60000 })

// 获取面试列表
export const getInterviewList = (params) => http.request({ url: '/interviews', data: params })

/* 查询今日面试额度（v31）
 * 面试配置页用来展示「今日剩余 N/10 场」，让用户在点开始之前就有预期，
 * 而不是点了才被 429 拒绝 —— 后者会让人以为程序坏了。
 * silent：额度查询失败不该弹 toast 打扰用户（拿不到就当不限次，不阻塞开始面试）。 */
export const getDailyQuota = () => http.request({ url: '/interviews/quota', silent: true })

// ===== 面试详情：预取 + 消费 =====
// 场景：统计页日历弹窗点明细行跳详情。点击瞬间先发请求，与「行内转圈节拍 +
// 页面转场」并行跑，详情页 onLoad 消费时请求多半已回来 —— 首屏直接出内容。
// 一次性缓存：消费即清，不会读到旧数据；无人消费时静默吞 rejection；
// 预取失败时 getInterviewDetail 落回正常请求重发一次。
let detailPrefetch = { id: '', promise: null }

export const prefetchInterviewDetail = (id) => {
  if (!id) return
  if (detailPrefetch.id === id && detailPrefetch.promise) return
  const promise = http.request({ url: `/interviews/${id}` })
  promise.catch(() => {})
  detailPrefetch = { id, promise }
}

export const getInterviewDetail = async (id) => {
  if (detailPrefetch.id === id && detailPrefetch.promise) {
    const { promise } = detailPrefetch
    detailPrefetch = { id: '', promise: null }
    try {
      return await promise
    } catch (e) {
      // 预取失败（网络抖动等）：不把错误直接抛给详情页，走下方正常请求兜底
    }
  }
  return http.request({ url: `/interviews/${id}` })
}

// 删除面试记录
export const deleteInterview = (id) => http.request({ url: `/interviews/${id}`, method: 'DELETE' })

/* 说明（P2 清理，2026-10-08）：这里原本还有一个
   `getInterviewReport(id)`，与 api/report.js 的 `getReport(id)` 是**完全相同的
   endpoint / 超时 / 语义**（两处各写一份）。实际使用方（report 页）走的是 getReport，
   本函数零引用。两份实现意味着超时值、silent 开关、后续缓存策略只要改一处就会漂移，
   故删除，统一走 api/report.js。 */

// 单题快速练习：提交回答获取点评
export const quickAnswer = (data) => http.request({ url: '/practice/quick-answer', method: 'POST', data })

// 单题快速练习：随机取一道题
export const getPracticeQuestion = (params) => http.request({ url: '/practice/question', data: params })
