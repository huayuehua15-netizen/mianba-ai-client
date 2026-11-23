/**
 * 触觉反馈统一出口（v31 新增）
 * ============================================================================
 * 背景：设置页有「震动反馈」开关（storage key: haptic），
 * 但此前全项目 4 处 vibrateShort 里**只有 2 处**读了它：
 *   ✅ voice-button.vue:116（音量峰值 heavy）、:444（录音开始/结束 light）
 *   ❌ calendar-heatmap.vue:221（点日历格子 light）
 *   ❌ day-detail-sheet.vue:606（点明细行 light）
 * 后两处硬调 → 用户在设置页把震动关掉，点日历/点明细仍然震动。
 * 这是"设置项承诺与实现不一致"，属于会被投诉的功能缺陷。
 *
 * 这里收敛成单一出口：开关逻辑只写一遍，任何新调用点都自动遵守设置。
 * 默认值为 true（未设置过 = 开启），与 settings/index.vue:334 的读法一致。
 */

/** 是否开启了震动反馈 */
export const isHapticOn = () => {
  try {
    const hp = uni.getStorageSync('haptic')
    return (hp === '' || hp === null || hp === undefined) ? true : !!hp
  } catch (e) {
    return true   // storage 读失败时按开启处理，不因环境问题静默丢失反馈
  }
}

/**
 * 轻震动：用于"点中了/确认了"这类中性反馈。
 * @param {boolean} force 传 true 可绕过设置（如"录音开始"这类关键节点）
 */
export const hapticLight = (force = false) => {
  if (!force && !isHapticOn()) return
  try { uni.vibrateShort({ type: 'light' }) } catch (e) { /* 部分设备/模拟器不支持 */ }
}

/**
 * 重震动：用于"录音开始""音量峰值"这类需要明确存在感的事件。
 */
export const hapticHeavy = (force = false) => {
  if (!force && !isHapticOn()) return
  try { uni.vibrateShort({ type: 'heavy' }) } catch (e) { /* 同上 */ }
}