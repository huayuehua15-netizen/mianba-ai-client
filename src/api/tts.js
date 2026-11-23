import http from './request'

// AI 播报（阿里云百炼 CosyVoice，分句并行合成）：
// POST 返回 { done, urls }（就绪）或 { done:false, job_id }（轮询）
// voice 可选：用户在面试配置页选择的音色（白名单校验在后端）
// silent：TTS 失败时要静默回落微信插件，不能每个请求都弹 toast
export const textToSpeechApi = async (text, voice) => {
  const res = await http.request({ url: '/tts', method: 'POST', data: { text, voice }, timeout: 30000, silent: true })
  if (res && res.done && Array.isArray(res.urls) && res.urls.length) {
    return { urls: res.urls }
  }
  if (res && res.job_id) {
    return { jobId: res.job_id }
  }
  throw new Error('TTS 响应异常')
}

// 轮询 job 直到完成（后端分句并行合成，预合成命中的话第一次轮询即 done）
export const pollTtsJob = (jobId) => http.request({ url: `/tts/job/${jobId}`, timeout: 15000, silent: true })
