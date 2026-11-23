/**
 * 面试会话本地缓存管理
 */
const INTERVIEW_PROGRESS_KEY = 'interview_progress'

export const saveInterviewProgress = (data) => {
  uni.setStorageSync(INTERVIEW_PROGRESS_KEY, JSON.stringify(data))
}

export const getInterviewProgress = () => {
  const data = uni.getStorageSync(INTERVIEW_PROGRESS_KEY)
  if (!data) return null
  // 兼容两种存储形态：早期直接存对象、统一工具会 stringify 后再存
  try {
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch (e) {
    // 本地数据可能被旧版本写坏或半途写入中断，坏数据直接按无进度处理并清掉，避免页面崩
    try { uni.removeStorageSync(INTERVIEW_PROGRESS_KEY) } catch (_) { /* 忽略 */ }
    return null
  }
}

export const clearInterviewProgress = () => {
  uni.removeStorageSync(INTERVIEW_PROGRESS_KEY)
}

export const hasInterviewProgress = () => {
  return !!uni.getStorageSync(INTERVIEW_PROGRESS_KEY)
}
