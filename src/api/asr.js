import http from './request'

// 语音识别（服务端百炼 qwen3-asr-flash）：base64 音频 → 文本
// silent：识别失败由 voice-button 统一提示，不在这里弹 toast
export const requestAsr = (audioBase64, mime = 'audio/mp3') =>
  http.request({ url: '/asr', method: 'POST', data: { audio: audioBase64, mime }, timeout: 30000, silent: true })
