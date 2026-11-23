import http from './request'

// 获取评分报告
// 报告由 AI 异步生成（30-60s），首次请求可能恰好在生成中，
// 默认 15s 超时不够，统一放宽到 60s
export const getReport = (interviewId) =>
  http.request({ url: `/interviews/${interviewId}/report`, timeout: 60000 })
