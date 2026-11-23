import http from './request'

// 微信登录
export const login = (code) => http.request({ url: '/auth/login', method: 'POST', data: { code } })

// 获取用户统计
export const getUserStats = () => http.request({ url: '/user/stats' })

// 更新用户档案
export const updateProfile = (data) => http.request({ url: '/user/profile', method: 'PUT', data })

// 清空我的全部面试数据（隐私合规）
export const clearMyData = () => http.request({ url: '/user/data', method: 'DELETE' })

// 注销账号：清空业务数据后删除账号本体（不可恢复）
export const deleteAccount = () => http.request({ url: '/user/account', method: 'DELETE' })
