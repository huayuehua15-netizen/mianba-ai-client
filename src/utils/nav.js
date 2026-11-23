/**
 * 页面转场统一封装（v31 新增）
 * ============================================================================
 * 背景：本项目全站 47 处跳转（navigateTo / redirectTo / switchTab）此前
 * **零处**配置 animationType / animationDuration，全部走微信默认的 300ms
 * 线性横滑。问题不在"慢"，而在"没有情绪"——
 * 面试结束 → 报告页这种情绪高潮时刻，转场完全没参与叙事。
 *
 * 用法：
 *   import { go, replace, NAV } from '@/utils/nav'
 *   go('/pages/report/index?id=1', NAV.reveal)
 *   replace('/pages/interview/index', NAV.cover)
 *
 * 为什么时间比微信默认的 300ms 短一点（240~320）：
 * 小程序转场 API 不支持自定义贝塞尔曲线，只能调时长。
 * 300ms 线性偏"拖"，280ms 略利落；再短（<220ms）会显得生硬跳切，
 * 再长（>360ms）会被感知为"卡"。所以统一落在 240~320ms 区间。
 */

/**
 * 转场语义预设。
 *
 * ⚠️⚠️ 重要事实（2026-10-12 查官方文档后确认，务必先读）：
 *   **微信小程序不支持 animationType / animationDuration。**
 *   uni-app 官方文档「窗口动画」一节原文：
 *     「本API仅App支持。小程序自身不支持自定义动画。」
 *   参数表的「平台差异说明」列也明确标着 **App**。
 *
 *   也就是说：下面这些 animationType 在小程序端**会被静默忽略**，
 *   实际永远走微信的默认转场（从右推入）。本项目是纯小程序，
 *   所以这套"转场情绪"设计**从未真正生效过**。
 *
 *   为什么保留它们：① 参数无害（微信忽略未知/不支持的字段，不会报错）；
 *   ② 若将来发 App 端（HBuilderX 打包），这些配置立刻生效；
 *   ③ 语义键（enter/reveal/cover…）让 47 处调用点读起来有意图，
 *      改天若要换成小程序端可实现的转场（如自绘过渡层），只需改这一个文件。
 *
 *   ⚠️ 不要因为"看不出效果"就反复删改这里 —— 它本来就不会在小程序里生效。
 *      曾经为排查"跳转闪现"把它整段删掉又恢复，纯属空转（见
 *      导航转场的历史事故记录）。
 *
 * 关于时长（仅 App 端有效）：240~320ms。小程序转场 API 不支持自定义贝塞尔
 * 曲线，只能调时长；300ms 线性偏"拖"，280ms 略利落，再短会显得生硬跳切。
 */
export const NAV = {
  // 默认：横向推入（App 端与小程序默认行为一致，不会突兀）
  push: { animationType: 'slide-in-right', animationDuration: 280 },

  // 进入面试：自下浮起，暗示"进入一段对话"（App 端生效）
  enter: { animationType: 'slide-in-bottom', animationDuration: 300 },

  // 揭晓报告：淡入，配合报告页自身的 fadeUp 元素入场（App 端生效）
  // 面试刚结束、用户情绪最高，此刻应该是"揭幕"而非"翻页"
  reveal: { animationType: 'fade-in', animationDuration: 320 },

  // 覆盖：底部抽屉式（App 端生效）
  cover: { animationType: 'slide-in-bottom', animationDuration: 300 },

  // 轻推：次级跳转（App 端生效）
  quick: { animationType: 'slide-in-right', animationDuration: 240 }
}

/**
 * ⚠️ 关键：**只有真正存在 animationType 时才写进参数对象**。
 * 早期实现无条件写 `animationType: undefined` —— 微信收到该键（哪怕值是
 * undefined）仍按"自定义动画"处理，于是闪现依旧。现在用条件展开，
 * 值为空时这个键**根本不出现在参数里**，从而 100% 走微信默认合成路径。
 */
const merge = (opt, extra) => ({
  ...(opt && opt.animationType ? { animationType: opt.animationType } : {}),
  ...(opt && opt.animationDuration ? { animationDuration: opt.animationDuration } : {}),
  ...extra
})

/** 打开新页面（保留当前页，返回键可用） */
export const go = (url, opt = NAV.push, extra = {}) =>
  uni.navigateTo(merge(opt, { url, ...extra }))

/** 替换当前页（不保留返回栈） */
export const replace = (url, opt = NAV.push, extra = {}) =>
  uni.redirectTo(merge(opt, { url, ...extra }))

/**
 * 切换 tabBar 页。
 * 注意：微信对 switchTab **不支持** animationType（会直接忽略），
 * 所以这里只是把调用收敛到一个入口，便于将来统一加 loading 提示，
 * 不要误以为这里设了转场就会生效。
 */
export const tab = (url, extra = {}) => uni.switchTab({ url, ...extra })

/** 关闭全部页面回到指定 tab（登录失效、清缓存后回首页） */
export const relaunch = (url) => uni.reLaunch({ url })