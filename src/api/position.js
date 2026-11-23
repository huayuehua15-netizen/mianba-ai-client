import http from './request'

// 获取岗位列表
export const getPositions = (params) => http.request({ url: '/positions', data: params })

// 获取岗位题目
export const getPositionQuestions = (id) => http.request({ url: `/positions/${id}/questions` })
