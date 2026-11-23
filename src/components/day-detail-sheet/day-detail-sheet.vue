<template>
  <!-- 当日详情 v10 = 「练习小票」票证卡（数字 + 24h 时间轴 + 撕裂线 + 条形码）。
       材质跟随统计页的纸面语言（首页/报告页黑卡已饱和，这台记录仪必须是纸）：
       把 v9 暗示过的小票身份做完整——一张真的可以撕的票：
       ① 票根（stub）：眉行 PRACTICE SLIP + 日期头（墨标 + 完整日期 + 周几 +
          「今天」实心墨章）+ 主读数（场次 104rpx 巨号主角 | 时长 56rpx 副读数 +
          首末注脚）+ 24h 时间轴
       ② 撕裂线：细密虚线 + 左右两枚「真打孔」——用 mask 径向渐变在卡片边缘
          挖出半圆缺口，透出遮罩后的页面（不是画一个假圆），票证的身份一眼成立
       ③ 票身（body）：小票点线明细（时间 + 岗位 + 点线 + 时长，可跳转复盘）
       ④ 票脚：全幅承托带上的一行票号（日期 + 当日场次，mono 落款，
          两侧发丝线收拢）——NO.20261001-03 · MIANBA · AI
       惊艳感来自「印刷工序」式的入场编排：盖章「今天」墨章与场次巨号 →
       数字滚读 → 轨道从左划出 → 练习区间墨段 → 墨点按时间落位 →
       明细错峰报到 → 条码浮现。
       【父级协作 · 重要】与旧版完全一致的契约（父级代码无需任何改动）：
       emit('close') 表示「用户要求关闭」，收回动画固定 CLOSE_MS = 320ms 播完，
       父级在 320ms 后把 visible 置 false 卸载即可；组件被父级单方面收回时
       也会自己播满 320ms 再卸载。
       居中卡没有跟手下拉（那是抽屉的手势），关闭走遮罩点击 / 右上 ×。
       结构：根节点只是定位坐标系，**遮罩与卡片是兄弟节点**。
       【滚动穿透修复 · v25】遮罩上的 `@touchmove.stop.prevent` 只能拦住**落在遮罩上**的
       手指，而弹窗打开后，用户的手指落在**卡片内那条 scroll-view** 上
       （scroll-view 是 scroll-y，touchmove 会被它消费掉，不会冒泡到遮罩，
       `.prevent` 因此根本没机会执行）—— 于是页面照旧被拖动，
       表现为「弹窗里滚明细，背后整页跟着滑」。
       修法（与 confirm-sheet / medal-detail 同思路，三处一起上）：
         ① 遮罩用 `catchtouchmove`（比 stop+prevent 更底层，直接吞掉事件）；
         ② scroll-view 加 `catchtouchmove`，把内部滚动**限定在自己身上**，
            不让它冒泡去带动页面；
         ③ 由**宿主页面**（pages/stats）在本弹层挂载期间用 `page-meta` 的
            `disable-scroll` 锁掉页面滚动 —— 这是唯一能兜住「惯性续滚 /
            个别机型内核仍放行 touchmove」的根手段，与事件拦截互为双保险。
            ⚠️ page-meta 只能写在**页面**里、且必须是页面内第一个节点、
            不能被 wx:if/wx:for 动态增删（本组件内放它会直接报
            「<page-meta> 只能是页面内的第一个节点」）。故由宿主页面负责。
       【打孔的实现约束】卡片拆成 stub / body 两段连续白面（圆角各管半边，
       阴影挂在不透明白的外层 dialog 上），打孔 mask 分别挂在两段自己的
       边缘角上（stub 的 100% 高 / body 的 0 高）——孔的位置永远跟着撕裂线走，
       与内容实际高度解耦；mask 双层用 51% 宽的左右半幅 tile 并集铺满，
       不依赖 mask-composite（兼容最稳）。mask 不被支持时孔消失、卡片照常完整。 -->
  <view v-if="mounted" class="dds-root">
    <view
      class="dds-mask"
      :style="maskStyle"
      @click="requestClose"
      catchtouchmove="noop"
    ></view>
    <view class="dds-dialog" :style="dialogStyle" @click.stop="noop">
      <!-- 关闭钮：右上角圆形填充钮（居中卡惯例，不抢视觉） -->
      <view
        class="dds-close"
        hover-class="dds-close-press"
        :hover-stay-time="90"
        @click.stop="requestClose"
      >
        <view class="dds-close-btn"><image class="dds-close-icon" :src="ICONS['close']" mode="aspectFit" /></view>
      </view>

      <!-- ===== 票根：眉行 + 日期头 + 主读数 + 24h 时间轴 + 撕裂线（按日期 key 化，换一天重新「盖章」） ===== -->
      <view class="dds-stub" :key="dateKey">
        <view class="dds-eyebrow">
          <text class="dds-eyebrow-t">PRACTICE SLIP</text>
        </view>

        <!-- 日期头：墨标 + 完整日期 + 周几 + 「今天」墨章（呼吸灯在章内，语义=今天在直播） -->
        <view class="dds-head">
          <view class="dds-head-mark"></view>
          <text class="dds-head-date">{{ dateText }}</text>
          <text class="dds-head-week" v-if="weekLabel">{{ weekLabel }}</text>
          <view class="dds-head-today" v-if="relDay === '今天'">
            <view class="dds-head-today-dot"></view>
            <text class="dds-head-today-t">今天</text>
          </view>
          <text class="dds-head-rel" v-else-if="relDay">{{ relDay }}</text>
        </view>

        <!-- 主读数：场次是绝对主角（用户点日历就是来看「练了几次」，与格子上的盖章读数同一事实），
             时长退为副读数。左巨右中的不对称字阶 = 一眼分清主次 -->
        <view class="dds-hero" v-if="countValue > 0">
          <view class="dds-hero-cell dds-hero-count">
            <text class="dds-cell-label">练习场次</text>
            <view class="dds-count-row">
              <text class="dds-count">{{ countDisplay }}</text>
              <text class="dds-count-unit">场</text>
            </view>
          </view>
          <view class="dds-hero-sep"></view>
          <view class="dds-hero-cell dds-hero-dur">
            <text class="dds-cell-label">当日时长</text>
            <view class="dds-num-row">
              <text class="dds-num">{{ minutesDisplay }}</text>
              <text class="dds-num-unit">分钟</text>
            </view>
            <text class="dds-dur-sub" v-if="durSubText">{{ durSubText }}</text>
          </view>
        </view>

        <!-- 24h 时间轴：轨道 → 练习区间墨段 → 白晕墨环节点（并簇挂 ×N）→ 刻度线 → 端点读数
     → 「现在」细标（仅今天）。
     v25 重做标签层：原实现用 flex + space-between 排 00/06/12/18/24 五个标签，
     标签有自身宽度，两端中心落在 0%/100% 之外、中间三个也与 25/50/75% 刻度线错开，
     「标签对着刻度」这件事其实是假的。现在改成绝对定位按百分比居中，
     标签中心严格对齐刻度（见 .dds-tl-ends / .dds-tl-end 的 left+translateX）。 -->
        <view class="dds-tl" v-if="countValue > 0">
          <view class="dds-tl-track"></view>
          <view class="dds-tl-span" v-if="spanStyle" :style="spanStyle"></view>
          <view class="dds-tl-tick" style="left: 25%"></view>
          <view class="dds-tl-tick" style="left: 50%"></view>
          <view class="dds-tl-tick" style="left: 75%"></view>
          <!-- 节点：重叠时刻已并簇（count>1），簇下方挂 ×N 角标表达「这里叠了几场」 -->
          <view
            v-for="(n, i) in timelineNodes"
            :key="i"
            class="dds-tl-node"
            :class="{ 'is-cluster': n.count > 1 }"
            :style="{ left: n.x + '%', animationDelay: 400 + i * 60 + 'ms' }"
          >
            <view class="dds-tl-node-core"></view>
            <text class="dds-tl-node-n" v-if="n.count > 1">×{{ n.count }}</text>
          </view>
          <!-- 「现在」细标（仅今天）：竖线落在轨道真实时刻 -->
          <view v-if="isToday" class="dds-tl-now" :style="{ left: nowX + '%' }"></view>
        </view>
        <!-- 端点读数：绝对定位按百分比居中，与刻度线严格对齐（v25 修正 space-between 的假对齐） -->
        <view class="dds-tl-ends" v-if="countValue > 0">
          <text class="dds-tl-end" style="left: 0%">00</text>
          <text class="dds-tl-end" style="left: 25%">06</text>
          <text class="dds-tl-end" style="left: 50%">12</text>
          <text class="dds-tl-end" style="left: 75%">18</text>
          <text class="dds-tl-end" style="left: 100%">24</text>
        </view>

        <!-- 撕裂线：细密虚线横贯全幅，与两枚打孔共同组成可撕的票缝 -->
        <view class="dds-perf"></view>
      </view>

      <!-- ===== 票身：明细 / 空态（按日期 key 化重播） ===== -->
      <view class="dds-body" :key="detailKey">
        <block v-if="hasSessions">
          <view class="dds-list-head">
            <text class="dds-list-label">练习明细</text>
            <view class="dds-list-rule"></view>
          </view>
          <view class="dds-scroll-wrap">
            <view class="dds-fade dds-fade-top" v-if="showTopFade"></view>
            <scroll-view
              class="dds-scroll"
              scroll-y
              :show-scrollbar="false"
              @scroll="onScroll"
              catchtouchmove
            >
              <view class="dds-scroll-inner">
                <view
                  v-for="(s, i) in sessionList"
                  :key="i"
                  class="dds-row"
                  :class="{ 'dds-row-link': !!s.interview_id }"
                  :style="{ animationDelay: rowDelay(i) + 'ms' }"
                  :hover-class="s.interview_id ? 'dds-row-press' : 'none'"
                  :hover-start-time="0"
                  :hover-stay-time="90"
                  @click="onSelect(s)"
                >
                  <view class="dds-time"><text class="dds-time-t">{{ s.time }}</text></view>
                  <view class="dds-pos"><text class="dds-pos-t">{{ s.position }}</text></view>
                  <!-- 点线引导：小票的「项 → 金额」连线 -->
                  <view class="dds-leader"></view>
                  <text class="dds-dur">{{ fmtMinutes(s.minutes) }}</text>
                  <!-- 箭头槽固定宽：被点的行原地转圈（正在打开），可点行放箭头，
                       时长列右缘永远对齐 -->
                  <view class="dds-arrow-slot">
                    <view class="dds-row-spinner" v-if="openingId === s.interview_id"></view>
                    <view class="dds-arrow" v-else-if="s.interview_id"></view>
                  </view>
                </view>
              </view>
            </scroll-view>
            <view class="dds-fade dds-fade-bottom" v-if="showBottomFade"></view>
          </view>

          <!-- 票脚：全幅承托带上的一行票号（日期 + 场次），两侧发丝线收拢——
               印刷物的落款，安静收尾不抢戏 -->
          <view class="dds-foot">
            <view class="dds-foot-rule"></view>
            <text class="dds-serial">{{ serialText }} · MIANBA · AI</text>
            <view class="dds-foot-rule"></view>
          </view>
        </block>

        <!-- 空态：这一天没有练习（日历只放行有墨的日子，此路径多为防御） -->
        <view class="dds-empty" v-else-if="countValue === 0">
          <view class="dds-empty-ring"><view class="dds-empty-tick"></view></view>
          <text class="dds-empty-title">这一天没有练习记录</text>
          <text class="dds-empty-sub">日历上落了墨的日期才有明细</text>
        </view>
        <!-- 有场次但明细缺失：说实话，而不是谎报「没有练习」 -->
        <view class="dds-note" v-else>
          <text class="dds-note-text">这一天有 {{ countValue }} 场练习，明细暂未同步</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useCountUp } from '@/composables/useCountUp'
import { prefetchInterviewDetail } from '@/api/interview'
import { ICONS } from '@/utils/svg-icons'
import { hapticLight } from '@/utils/haptic'

const props = defineProps({
  visible: { type: Boolean, default: false },
  detail: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['close', 'select-session'])

/* ===== 常量（唯一出处，父级按同口径协作） =====
 * 【父级协作 · 重要】emit('close') 只表示「用户要求关闭」，收回动画由组件自己播，
 * 时长固定 CLOSE_MS = 320ms。
 *   · 父级按本项目接法收到 close 后，在 CLOSE_MS(320ms) 之后把 visible 置 false 即可
 *     —— 那时卡片已收回，visible=false 只负责「卸载」，不会出现收一半被切断的跳切。
 *   · 若父级提前把 visible 置 false，组件也不会被打断：收回动画一定播满 CLOSE_MS 再卸载。
 * 组件是「无条件挂载」的（父级没有 v-if），所以不可见时根节点必须自行 v-if 掉，
 * 不能留下 fixed 遮罩挡住整页。
 */
const ENTER_MS = 400                                   // 卡片入场：scale + 淡入
const CLOSE_MS = 320                                   // 卡片收回（父级按此时序卸载，不可改）
const MASK_ENTER_MS = 360                              // 遮罩淡入
const MASK_FADE_MS = 280                               // 遮罩淡出
const ENTER_NEXT_FRAME_MS = 24                         // 挂载 → 下一帧激活，过渡才有真实起点
const SHEET_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'    // 卡片专属曲线
const EASE_OUT = 'cubic-bezier(0.22, 0.61, 0.36, 1)'  // = uni.scss $ease-out
const ROW_STAGGER_MS = 50                             // 明细行错峰步长
const ROW_FIRST_DELAY_MS = 300                        // 首行延迟：等票根排版 + 撕裂线先落定，明细随后「打印」
const ROW_DELAY_CAP_MS = 420                          // 错峰上限：末行 420 + 单行 280 = 700ms 内结束
const VISIBLE_ROWS = 3                                // 超过 3 条即进入滚动（200rpx ≈ 3.1 行）
const SCROLL_MAX_RPX = 200                            // 明细区最大高度
const NAV_BEAT_MS = 200                               // 行内转圈的最短停留：让「正在打开」被看见，
                                                      // 请求在此期间已预取发出，不白等

/* ===== 24h 横向时间轴 =====
 * 节点位置 = 开始时刻（分钟/1440），相邻节点最小间距 3.5%；
 * 「现在」细标只画在今天。纯 view 实现，无 SVG/图片。 */
/* 时间轴节点：按真实时刻落位，重叠则「合并」而非「推挤」。
 *
 * 【为什么改】旧实现对过近的点做右推（x < prev + NODE_GAP 就把 x 顶到 prev+3.5），
 * 视觉上解决了重叠，但把点挪离了它的真实时刻：实测 00:28 / 00:42 两场
 * （真实 1.94% / 2.92%）被画成 1.94% / 5.44%，第二个点读起来像 01:18。
 * 这是一张「练习数据票」，点位即事实 —— 点画错位置比两点重叠更严重：
 * 用户会以为自己在 01:18 又练了一次。
 *
 * 【现在的做法】距离小于阈值就并成一个簇：簇心取组内真实时刻的均值，
 * 位置仍然落在真实区间内，只是用「一点 + ×N」表达"这里叠了 N 场"。
 * 位置不失真，重叠也消失。
 */
const CLUSTER_GAP = 3.5   // 相邻节点小于此间距（占轨道宽 %）视为同一簇

const timelineNodes = computed(() => {
  const items = []
  for (const s of sessionList.value) {
    const m = /^(\d{1,2}):(\d{2})/.exec(s.time)
    if (!m) continue
    const hh = Number(m[1])
    const mm = Number(m[2])
    if (hh > 23 || mm > 59) continue
    items.push(((hh * 60 + mm) / 1440) * 100)
  }
  if (!items.length) return []
  items.sort((a, b) => a - b)

  const out = []
  let group = [items[0]]
  const flush = () => {
    // 簇心 = 组内真实时刻均值（仍是真实位置，不做任何外推）
    const center = group.reduce((a, b) => a + b, 0) / group.length
    out.push({ x: Math.round(center * 100) / 100, count: group.length })
  }
  for (let i = 1; i < items.length; i++) {
    if (items[i] - group[group.length - 1] < CLUSTER_GAP) {
      group.push(items[i])
    } else {
      flush()
      group = [items[i]]
    }
  }
  flush()
  return out
})
/* 练习区间墨段：首末节点之间的轨道上墨，一眼读出「练集中在哪个时段」。
 * 单场（或解析不出时刻）没有区间可言，不画。 */
const spanStyle = computed(() => {
  const nodes = timelineNodes.value
  if (nodes.length < 2) return null
  const l = nodes[0].x
  const r = nodes[nodes.length - 1].x
  if (r - l < 1) return null
  return { left: l + '%', width: (r - l) + '%' }
})
// 「现在」细标：只画在今天。打开瞬间的真实时刻，读一次就够（卡片生命周期极短）
const nowX = computed(() => {
  const n = new Date()
  return Math.round(((n.getHours() * 60 + n.getMinutes()) / 1440) * 10000) / 100
})

/* ===== 进出场状态机 =====
 * mounted：DOM 是否挂着。挂载权在组件自己手里——父级是无条件挂载（没有 v-if），
 *          所以不可见时根节点必须 v-if 掉，否则 fixed 遮罩会盖死整页。
 * active ：终态开关。true 时 :style 不下发缩放/透明（终态即基础态），false 才下发。
 * closing：收回动画进行中。此期间冻结内容快照（父级会在同一时刻把 detail 清空，
 *          不冻结的话退场瞬间会闪一下空态），并按时刻表卸载。
 */
const mounted = ref(false)
const active = ref(false)
const closing = ref(false)
const shownDetail = ref(props.detail || {})
const openingId = ref('')   // 正在打开的行（interview_id）：箭头位置原地变成转圈
let enterTimer = null
let exitTimer = null
let selectTimer = null      // 「转圈节拍」结束后再跳转的定时器
let exitAt = 0     // 收回动画结束时刻，用来吸收父级 visible=false 的到达时机
const noop = () => {}

const scrollTop = ref(0)
const contentPx = ref(0)   // scroll-view 内容高度，由 scroll 事件的 scrollHeight 带回

// 小程序端没有 matchMedia，取不到就按「无减弱」处理；一旦命中，直接落到终态、跳过位移帧
const reduceMotion = () => {
  try {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch (e) {
    return false
  }
}

const clearEnterTimer = () => {
  if (enterTimer) { clearTimeout(enterTimer); enterTimer = null }
}
const clearExitTimer = () => {
  if (exitTimer) { clearTimeout(exitTimer); exitTimer = null }
}

const openSheet = () => {
  clearEnterTimer()
  clearExitTimer()
  closing.value = false
  shownDetail.value = props.detail || {}
  mounted.value = true
  scrollTop.value = 0     // scroll-view 会随挂载重建，量测值也要跟着归零，否则渐隐蒙层判断会错
  contentPx.value = 0
  // 卡片已经展开（只是换了日期）或用户要求减弱动效：直接落到终态，不重播位移
  if (active.value || reduceMotion()) { active.value = true; return }
  enterTimer = setTimeout(() => {
    enterTimer = null
    active.value = true
  }, ENTER_NEXT_FRAME_MS)
}

// 卸载：DOM 清空 + 状态复位，保证「不可见时零残留、零拦截」
const finishExit = () => {
  clearEnterTimer()
  clearExitTimer()
  if (selectTimer) { clearTimeout(selectTimer); selectTimer = null }
  mounted.value = false
  active.value = false
  closing.value = false
  openingId.value = ''
}

// 开始收回：立刻改缩放（用户一点就有反馈），CLOSE_MS 后卸载。
// instant=true 用于「点明细跳转」场景：收回动画不再播——它与 uni.navigateTo
// 的页面转场叠加会掉帧（转场还要对当前页做快照，带着 fixed 遮罩 + mask 打孔
// + 多层阴影的页面快照成本很高），新页滑入本身就有连续的视觉运动，
// 弹层直接卸载完全无感；父级 320ms 定时器到点时组件已卸载，只是空操作。
const beginExit = (notify, instant = false) => {
  if (closing.value) return
  clearEnterTimer()
  // 节拍等待中被用户关闭（✕/遮罩）：取消待发的跳转
  if (selectTimer) { clearTimeout(selectTimer); selectTimer = null; openingId.value = '' }
  if (instant) {
    if (notify) emit('close')
    finishExit()
    return
  }
  closing.value = true
  active.value = false
  if (notify) emit('close')
  exitAt = Date.now() + CLOSE_MS
  clearExitTimer()
  // +20ms 余量：等过渡真正播完再卸，最后一帧不会被切掉；也是父级不接 close 时的兜底卸载
  exitTimer = setTimeout(finishExit, CLOSE_MS + 20)
}

// 请求关闭：遮罩点击 / 关闭钮都走这里
const requestClose = () => beginExit(true)

const onVisibleChange = (v) => {
  if (v) { openSheet(); return }
  if (!mounted.value) return
  // 父级单方面要求收起（没有先经过 close）：补一段 320ms 收回动画，播完再卸载
  if (!closing.value) { beginExit(false); return }
  // 已在收回中：父级如约在 320ms 后置 false → 到点直接卸；提前到达也不打断动画
  if (Date.now() >= exitAt - 24) finishExit()
}

watch(() => props.visible, onVisibleChange, { immediate: true })

// 明细变化：①换一天 → 内容重播；②收回途中父级清空 detail → 冻结快照，不闪空态
watch(() => props.detail, (v) => {
  const nd = v || {}
  const date = String(nd.date || '')
  if (closing.value) {
    // 只有「换到另一天」才算用户在收回动画里又点开了日历；清空 detail 属于正常收尾
    if (props.visible && date && date !== String(shownDetail.value.date || '')) {
      clearExitTimer()
      closing.value = false
      shownDetail.value = nd
      mounted.value = true
      active.value = true     // 从当前位置弹回终态，而不是重新播一次入场
    }
    return
  }
  shownDetail.value = nd
  // 兜底：父级没接 close 时 visible 会一直是 true，新一天的数据到了就得自己重新打开
  if (props.visible && !mounted.value && date) openSheet()
})

onUnmounted(() => {
  clearEnterTimer()
  clearExitTimer()
  if (selectTimer) { clearTimeout(selectTimer); selectTimer = null }
})

/* ===== 卡片位移 / 遮罩联动（全部走 :style） =====
 * 入场用 ENTER_MS（400ms 从容弹出），收回用 CLOSE_MS（320ms 爽快缩回）——
 * closing 是两者的切换开关。translate(-50%,-50%) 是居中定位本身，
 * 与动效缩放叠加在同一个 transform 里，不可拆开写。 */
const dialogStyle = computed(() => {
  const scale = active.value && !closing.value ? 1 : 0.94
  const opacity = active.value && !closing.value ? 1 : 0
  const ms = closing.value ? CLOSE_MS : ENTER_MS
  return {
    transform: `translate(-50%, -50%) scale(${scale})`,
    opacity: String(opacity),
    transition: `transform ${ms}ms ${SHEET_EASE}, opacity ${ms}ms ${EASE_OUT}`
  }
})

const maskStyle = computed(() => {
  const opacity = active.value && !closing.value ? 1 : 0
  const ms = closing.value ? MASK_FADE_MS : MASK_ENTER_MS
  return {
    opacity: String(opacity),
    transition: `opacity ${ms}ms ${EASE_OUT}`
  }
})

/* ===== 数据规范化（脏数据不许把渲染搞崩）
 * 读的是 shownDetail 快照：收回途中父级清空 detail 也不会让内容闪一下。 */
const d = computed(() => shownDetail.value)
const parsedDate = computed(() => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d.value.date || ''))
  if (!m) return null
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return { md: Number(m[2]), d: Number(m[3]), week: WEEK_NAMES[dt.getDay()] }
})
const mdValue = computed(() => {
  const v = Number(d.value.md)
  if (Number.isFinite(v) && v >= 1 && v <= 12) return v
  return parsedDate.value ? parsedDate.value.md : 0
})
const dValue = computed(() => {
  const v = Number(d.value.d)
  if (Number.isFinite(v) && v >= 1 && v <= 31) return v
  return parsedDate.value ? parsedDate.value.d : 0
})
// 日期印刷：两位数日号 JS 里补零——WXML 里调 padStart 会编译失败（契约 §4.5）
const pad2 = (n) => String(n).padStart(2, '0')
// 卡头日期：解析失败退回原始 ISO 串，不显示「0月0日」
const dateText = computed(() => {
  if (mdValue.value && dValue.value) return `${mdValue.value}月${pad2(dValue.value)}日`
  return d.value.date ? String(d.value.date) : '—'
})
const dateKey = computed(() => String(d.value.date || ''))
const weekLabel = computed(() => {
  const w = String(d.value.week == null ? '' : d.value.week).trim()
  // 只认「三」「周三」这种单字：脏数据（数字、长文本）不往日期头里塞
  if (/^周?[一二三四五六日天]$/.test(w)) return w.indexOf('周') === 0 ? w : `周${w}`
  return parsedDate.value ? `周${parsedDate.value.week}` : ''
})

/* 相对日期：今天 / 昨天 / N 天前。未来日期（不该出现）返回空串不显示。 */
const relDay = computed(() => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d.value.date || ''))
  if (!m) return ''
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today - day) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  return diff > 1 ? `${diff} 天前` : ''
})
const isToday = computed(() => relDay.value === '今天')

const sessionList = computed(() => {
  const raw = d.value.sessions
  if (!Array.isArray(raw)) return []
  const out = []
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i]
    if (!s || typeof s !== 'object') continue
    const min = Number(s.minutes)
    const usableMin = Number.isFinite(min) && min > 0
    const time = typeof s.time === 'string' ? s.time.trim() : ''
    const pos = typeof s.position === 'string' ? s.position.trim() : ''
    // 三个字段全空且没有 id 的对象 = 零信息的幽灵行，直接丢掉；
    // 有 id 的即使没数据也留着（点进去能看到真正的记录）
    if (!time && !pos && !usableMin && !s.interview_id) continue
    out.push({
      time: time || '--:--',
      minutes: usableMin ? Math.round(min) : 0,
      position: pos || '未指定岗位',
      interview_id: s.interview_id ? String(s.interview_id) : ''
    })
  }
  // 统一按时间升序：明细列表、盘面落点、首末时刻三处共用同一份秩序
  // （后端顺序不可信；解析不出时刻的行沉到末尾，不插队）
  out.sort((a, b) => parseTimeMin(a.time) - parseTimeMin(b.time))
  return out
})
// 「HH:MM」→ 当日分钟数；解析失败按一天的尽头算（沉底）
const parseTimeMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''))
  if (!m) return 1441
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh > 23 || mm > 59) return 1441
  return hh * 60 + mm
}
const hasSessions = computed(() => sessionList.value.length > 0)

// count / minutes 以 detail 声明值为准；与明细条数冲突时以明细为准
// （明细是用户看得见的事实，声明值只可能是脏数据或口径差异）
const countValue = computed(() => {
  const c = Number(d.value.count)
  const declared = Number.isFinite(c) && c >= 0 ? Math.round(c) : null
  const actual = sessionList.value.length
  if (declared === null) return actual
  return actual > declared ? actual : declared
})
const minutesValue = computed(() => {
  const sum = sessionList.value.reduce((acc, s) => acc + s.minutes, 0)
  const m = Number(d.value.minutes)
  const declared = Number.isFinite(m) && m >= 0 ? Math.round(m) : null
  if (declared === null) return sum
  return sum > declared ? sum : declared
})

// 换日期就重建整块内容：入场动效重播，滚动位置也回到顶部
const detailKey = computed(() => `${d.value.date || ''}|${countValue.value}|${minutesValue.value}`)
watch(detailKey, () => { scrollTop.value = 0; contentPx.value = 0 })

/* ===== 时长注脚：首末跨度（单场没有跨度可言，说「始于」） ===== */
const firstTime = computed(() => (hasSessions.value ? sessionList.value[0].time : '--:--'))
const lastTime = computed(() =>
  hasSessions.value ? sessionList.value[sessionList.value.length - 1].time : '--:--'
)
const durSubText = computed(() => {
  if (!hasSessions.value) return ''
  if (sessionList.value.length > 1) return `首末 ${firstTime.value} – ${lastTime.value}`
  return `始于 ${firstTime.value}`
})

/* ===== 票号：日期 + 当日场次（NO.20261001-03）。日期脏时退回占位横线 ===== */
const serialText = computed(() => {
  const date = String(d.value.date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'NO.——————'
  return `NO.${date.replace(/-/g, '')}-${pad2(Math.min(countValue.value, 99))}`
})

/* ===== 读数滚动 =====
 * 源挂在 active 上：卡片一激活就从 0 滚到真值；收回时归 0，下次打开必然重新滚一遍。
 * 场次与时长两只数字一起滚——次数是主角，先滚完（600ms < 880ms）。
 *
 * v31：加 fps=32（30fps）——本组件挂在统计页内，与该页 5 个 useCountUp 是
 * 「同时段并行」的（合计 7 个），必须一起降帧；
 * delay 错开让场次领先时长，读数层级更清楚。 */
const countDisplay = useCountUp(
  computed(() => (active.value && countValue.value > 0 ? countValue.value : 0)),
  { duration: 600, fps: 32, delay: 0 }
)
const minutesDisplay = useCountUp(
  computed(() => (active.value && minutesValue.value > 0 ? minutesValue.value : 0)),
  { duration: 880, fps: 32, delay: 100 }
)

/* ===== 明细 ===== */
// 单行入场 280ms + 错峰上限 240ms ⇒ 最后一行 520ms 内结束；行多时错峰收窄而不是无限等待
const rowDelay = (i) => Math.min(ROW_FIRST_DELAY_MS + i * ROW_STAGGER_MS, ROW_DELAY_CAP_MS)
// 诚实时长：不足 1 分钟不凑成「1 分钟」，也不显示「0 分钟」
const fmtMinutes = (m) => (m > 0 ? `${m} 分钟` : '不足 1 分钟')

const onSelect = (s) => {
  if (!s.interview_id || closing.value || openingId.value) return   // 节拍中防重复点击
  // 轻触震动：与日历格子的手感一致
  // v31：改走 utils/haptic —— 原先这里硬调 uni.vibrateShort，
  // 没读设置页的「震动反馈」开关，用户关掉后点日历/明细仍会震动
  hapticLight()
  // 反馈先于一切：箭头原地变成转圈（纯 WXML，必定可见——原生 showLoading
  // 紧贴 navigateTo 调用会被页面转场吞掉）；同时预取详情，请求与节拍、
  // 转场并行跑，详情页首屏直接出内容
  openingId.value = s.interview_id
  prefetchInterviewDetail(s.interview_id)
  selectTimer = setTimeout(() => {
    selectTimer = null
    // 节拍期间被用户关闭（✕/遮罩）：安静取消，不再跳转
    if (closing.value || !mounted.value) { openingId.value = ''; return }
    emit('select-session', { ...s })               // 传规范化副本：父级永远拿到同样形状的字段
    // 父级立刻 navigateTo，这里同步瞬时卸载（不播收回动画，见 beginExit 注释）。
    // 不回 emit close：close 的语义是「用户要求关闭」，父级已从 select-session 知道
    beginExit(false, true)
  }, NAV_BEAT_MS)
}

/* ===== 滚动渐隐 =====
 * scroll-view 的 scroll 事件带回 scrollHeight，用它判断「下面还有没有」，
 * 只在真的还能滚时显示底部蒙层；顶部蒙层只在滚下去之后出现。
 */
const scrollable = computed(() => sessionList.value.length > VISIBLE_ROWS)
const viewportPx = () => {
  try {
    if (typeof uni !== 'undefined' && typeof uni.upx2px === 'function') return uni.upx2px(SCROLL_MAX_RPX)
  } catch (e) {}
  return SCROLL_MAX_RPX / 2   // 750rpx 设计稿下 1rpx = 0.5px
}
const showTopFade = computed(() => scrollable.value && scrollTop.value > 4)
const showBottomFade = computed(() => {
  if (!scrollable.value) return false
  if (!contentPx.value) return true   // 还没量到内容高度：先认为下面还有
  return scrollTop.value < contentPx.value - viewportPx() - 4
})
const onScroll = (e) => {
  const t = (e && e.detail) || {}
  scrollTop.value = Number(t.scrollTop) || 0
  const h = Number(t.scrollHeight)
  if (Number.isFinite(h) && h > 0) contentPx.value = h
}
</script>

<style lang="scss" scoped>
/* ===== 根容器 =====
 * 只是「遮罩 + 卡片」的定位坐标系，自己不拦事件：不可见时整棵树被 v-if 摘掉，
 * 可见时拦截交给遮罩与卡片各自负责。
 *
 * ⚠️ 居中定位的 translate(-50%,-50%) 写在卡片自己的 transform 里（与缩放叠加），
 * 不依赖祖先；根节点保持无 transform，fixed 遮罩才能相对视口通屏。 */
.dds-root {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 99;   // 与现状一致：盖住页面内容，不与 uView 弹层抢层级
  pointer-events: none;
}

/* ===== 遮罩 =====
 * 与卡片是兄弟节点：这里的 preventDefault 只作用于页面本身，
 * 不会越过卡片去拦内部 scroll-view 的滚动。
 * 居中卡用稍深的遮罩（0.5 匀色）——四周没有卡体压边，靠遮罩聚焦；
 * 打孔透出的就是这层遮罩后的页面，孔才「真的透」。 */
.dds-mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  pointer-events: auto;   // 根节点 pointer-events:none，遮罩必须自己收回来
  background: rgba(26, 26, 26, 0.5);
  opacity: 0;
}

/* ===== 卡片外壳 =====
 * 票据被拆成 stub / body 两段连续白面，外壳自己不铺底色：
 * ① 三层阴影（贴边近影 + 中距 + 远柔影）只挂在外壳上——拆开挂会在撕裂线处断光；
 * ② 两段白面各自的打孔 mask 直接挖到外壳后面，透出遮罩与页面，
 *    孔才是「真孔」而不是画上去的假圆。
 * scale 基准态 = 终态（减弱动效下直接是完整卡片）。 */
.dds-dialog {
  position: absolute;
  left: 50%;
  top: 46%;
  width: 620rpx;
  max-height: 76vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-radius: 40rpx;
  /* 浮层阴影上限刻度（原三层字面值上收到 $shadow-dialog，全站浮层不得重于它） */
  box-shadow: $shadow-dialog;
  pointer-events: auto;
}

/* 关闭钮：右上角圆形填充钮（#F2EEE7 圆面 + 按压缩放） */
.dds-close {
  position: absolute;
  top: 10rpx;
  right: 10rpx;
  width: 68rpx;
  height: 68rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}
.dds-close-btn {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: $bg-fill;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.dds-close-press { opacity: $press-opacity; }
.dds-close-press .dds-close-btn { transform: scale($press-scale); }
/* v28：原为文字字符 ✕（font-size 22rpx + color $mauve），换成 close 图标。
   ⚠️ 图标色必须与按钮底色匹配：按钮底是 $bg-fill（浅灰 $paper-sunken），
   故用墨色 close（$ink）—— 若误用 close-white 会在浅底上"隐身"。
   尺寸 20rpx ≈ 原字符墨迹大小（字符 ✕ 在 22rpx 下墨迹约 15rpx，图标含留白故略放大）。 */
.dds-close-icon {
  width: 20rpx;
  height: 20rpx;
}

/* ===== 票根（上半）：眉行 + 双栏字段 + 时间轴 + 撕裂线 =====
 * 打孔：mask 两层 = 左右各一枚径向渐变孔（孔心在自身下缘两角 = 撕裂线两端），
 * 每层 tile 只铺 51% 宽的半幅，两层并集恰好铺满整段，不需要 mask-composite。
 * 孔径 32rpx：票证缺口的存在感，又不至于咬到内容（内容左右留 36rpx 安全边）。 */
.dds-stub {
  position: relative;
  flex-shrink: 0;
  box-sizing: border-box;
  background: $bg-card;
  border-radius: 40rpx 40rpx 0 0;
  padding: 26rpx 36rpx 0;
  overflow: hidden;
  /* 打孔渐变一律双声明：px 版在前保底（部分基础库/内核解析渐变内 rpx 会整条失效），
   * rpx 版在后（能解析的内核用它，孔径随屏幕精确缩放）。 */
  -webkit-mask-image:
    radial-gradient(circle 9px at 0 100%, transparent 8.5px, #000 9px),
    radial-gradient(circle 9px at 100% 100%, transparent 8.5px, #000 9px);
  -webkit-mask-image:
    radial-gradient(circle 18rpx at 0 100%, transparent 17rpx, #000 18rpx),
    radial-gradient(circle 18rpx at 100% 100%, transparent 17rpx, #000 18rpx);
  -webkit-mask-size: 51% 100%, 51% 100%;
  -webkit-mask-position: left top, right top;
  -webkit-mask-repeat: no-repeat;
  mask-image:
    radial-gradient(circle 9px at 0 100%, transparent 8.5px, #000 9px),
    radial-gradient(circle 9px at 100% 100%, transparent 8.5px, #000 9px);
  mask-image:
    radial-gradient(circle 18rpx at 0 100%, transparent 17rpx, #000 18rpx),
    radial-gradient(circle 18rpx at 100% 100%, transparent 17rpx, #000 18rpx);
  mask-size: 51% 100%, 51% 100%;
  mask-position: left top, right top;
  mask-repeat: no-repeat;
}

/* 眉行：mono 小字印刷眉，票据身份的第一眼 */
.dds-eyebrow {
  display: flex;
  align-items: center;
  animation: ddsFadeUp 0.26s $ease-out backwards;
}
.dds-eyebrow-t {
  font-family: $font-mono;
  font-size: 18rpx;
  font-weight: $weight-bold;
  letter-spacing: 4rpx;
  color: $ash;
  line-height: 1.3;
}

/* ===== 日期头：墨标 + 完整日期 + 周几 + 「今天」墨章 ===== */
.dds-head {
  display: flex;
  align-items: center;
  margin-top: 22rpx;
  animation: ddsFadeUp 0.24s 0.04s $ease-out backwards;
}
/* 墨色竖标：首页 section-title-mark 的同语言，给日期一个「条目起点」 */
.dds-head-mark {
  width: 6rpx;
  height: 26rpx;
  border-radius: 3rpx;
  background: $ink;
  margin-right: 14rpx;
  flex-shrink: 0;
}
.dds-head-date {
  font-size: 32rpx;
  font-weight: $weight-heavy;
  color: $ink;
  letter-spacing: -0.5rpx;
  line-height: 1.2;
}
.dds-head-week {
  margin-left: 14rpx;
  font-size: 24rpx;
  font-weight: $weight-semibold;
  color: $mauve;
}
/* 「今天」墨章：实心墨胶囊 + 白字 + 白呼吸点——整张票唯一的反白元素，
   与 S 级徽章同一种「奖励」语言；呼吸灯语义 = 今天在直播 */
.dds-head-today {
  display: flex;
  align-items: center;
  margin-left: 14rpx;
  padding: 4rpx 16rpx;
  border-radius: $radius-pill;
  background: $ink;
  animation: ddsStamp 0.34s cubic-bezier(0.16, 1, 0.3, 1) 0.18s backwards;
  transform-origin: left center;
}
.dds-head-today-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: #FFFFFF;
  margin-right: 8rpx;
  animation: ddsRelPulse 1.6s $ease-out infinite alternate;
}
.dds-head-today-t {
  font-size: 20rpx;
  font-weight: $weight-bold;
  color: #FFFFFF;
  line-height: 1.3;
}
/* 非今天的相对日期（昨天 / N 天前）：弱注脚，不与墨章争抢 */
.dds-head-rel {
  margin-left: 14rpx;
  font-size: 24rpx;
  font-weight: $weight-semibold;
  color: $mauve;
}

/* ===== 主读数：场次（绝对主角）| 时长（副读数） =====
 * 左巨右中的不对称字阶：场次 104rpx 是整张票唯一的焦点——
 * 用户点日历就是来看「练了几次」，与格子上的盖章读数是同一事实的放大重印 */
.dds-hero {
  display: flex;
  align-items: stretch;
  margin-top: 26rpx;
  animation: ddsFadeUp 0.26s 0.08s $ease-out backwards;
}
.dds-hero-cell { min-width: 0; }
.dds-hero-count { flex-shrink: 0; }
.dds-hero-dur { flex: 1; min-width: 0; }
.dds-hero-sep {
  width: 1rpx;
  background: $hint;
  margin: 4rpx 32rpx 4rpx 36rpx;
  flex-shrink: 0;
}
.dds-cell-label {
  display: block;
  font-size: 18rpx;
  font-weight: $weight-semibold;
  color: $mauve;
  letter-spacing: 3rpx;
  line-height: 1.3;
}
/* 巨号场次：盖章入场（砸下 → 微回弹 → 停稳，与日历格 tileStamp 同语言） */
.dds-count-row {
  display: flex;
  align-items: baseline;
  margin-top: 10rpx;
}
.dds-count {
  font-family: $font-mono;
  font-size: 104rpx;
  font-weight: $weight-heavy;
  color: $ink;
  line-height: 0.9;
  letter-spacing: -4rpx;
  font-variant-numeric: tabular-nums;
  animation: ddsStamp 0.34s cubic-bezier(0.16, 1, 0.3, 1) 0.12s backwards;
  transform-origin: left bottom;
}
.dds-count-unit {
  margin-left: 12rpx;
  font-size: 28rpx;
  font-weight: $weight-semibold;
  color: $ink-soft;
}

/* 副读数：时长 56rpx（比主角低两级字阶）+ 首末注脚，标签语言与主角同一套 */
.dds-num-row {
  display: flex;
  align-items: baseline;
  margin-top: 10rpx;
}
.dds-num {
  font-family: $font-mono;
  font-size: 56rpx;
  font-weight: $weight-heavy;
  color: $ink;
  line-height: 1;
  letter-spacing: -2rpx;
  font-variant-numeric: tabular-nums;
}
.dds-num-unit {
  margin-left: 10rpx;
  font-size: 24rpx;
  font-weight: $weight-semibold;
  color: $mauve;
}
/* 时长注脚：首末跨度，mono 数字混排 */
.dds-dur-sub {
  display: block;
  margin-top: 10rpx;
  font-size: 20rpx;
  color: $mauve;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

/* ===== 24h 横向时间轴 =====
 * 轨道从左划出 → 练习区间墨段横向生长 → 白晕墨环节点带落感弹到位
 * → 刻度与端点读数浮现 → 「现在」细标最后压上真实时刻 */
.dds-tl {
  position: relative;
  height: 44rpx;
  margin-top: 28rpx;
}
.dds-tl-track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 8rpx;
  margin-top: -4rpx;
  border-radius: 4rpx;
  background: $track;
  transform-origin: left center;
  animation: ddsTrackIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.18s backwards;
}
/* 练习区间：首末节点之间的一段墨，轨道上「练集中在何时」一眼可读 */
.dds-tl-span {
  position: absolute;
  top: 50%;
  height: 8rpx;
  margin-top: -4rpx;
  border-radius: 4rpx;
  background: rgba(26, 26, 26, 0.24);
  transform-origin: left center;
  animation: ddsTrackIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.34s backwards;
}
/* 06/12/18 细刻度：无字刻线，让轨道读起来是一根真的轴 */
.dds-tl-tick {
  position: absolute;
  top: 50%;
  width: 2rpx;
  height: 16rpx;
  margin-top: -8rpx;
  border-radius: 1rpx;
  background: $rule-strong;
  animation: ddsFadeUp 0.3s 0.5s $ease-out backwards;
}
.dds-tl-node {
  position: absolute;
  top: 50%;
  width: 16rpx;
  height: 16rpx;
  margin: -8rpx 0 0 -8rpx;
  border-radius: 50%;
  background: $ink;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 白晕把节点从轨道上「托」起来（halo = 纸面底色）+ 微落影 */
  box-shadow: 0 0 0 4rpx $bg-card, 0 2rpx 5rpx rgba(26, 26, 26, 0.18);
  animation: ddsNodeIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
@keyframes ddsNodeIn {
  from { opacity: 0; transform: scale(0.4); }
  to { opacity: 1; transform: none; }
}
/* 白心：与趋势图数据节点完全同一语言 */
.dds-tl-node-core {
  width: 6rpx;
  height: 6rpx;
  border-radius: 50%;
  background: #FFFFFF;
}
/* 并簇节点：该时刻叠了多场（count>1）。
   点略放大 + 加一圈实墨环，与单场节点一眼可辨；下方挂 ×N 角标说明叠了几场。 */
.dds-tl-node.is-cluster {
  width: 20rpx;
  height: 20rpx;
  margin: -10rpx 0 0 -10rpx;
  box-shadow: 0 0 0 4rpx $bg-card, 0 0 0 5rpx rgba(26, 26, 26, 0.28);
}
.dds-tl-node.is-cluster .dds-tl-node-core {
  width: 7rpx;
  height: 7rpx;
}
.dds-tl-node-n {
  position: absolute;
  top: 20rpx;
  left: 50%;
  transform: translateX(-50%);
  font-family: $font-mono;
  font-size: 16rpx;
  font-weight: 700;
  color: $mauve;
  line-height: 1;
  white-space: nowrap;
}
/* 「现在」细标（仅今天）：竖线落在轨道真实时刻，最后浮现 */
.dds-tl-now {
  position: absolute;
  top: 50%;
  width: 2rpx;
  height: 32rpx;
  margin: -16rpx 0 0 -1rpx;
  border-radius: 1rpx;
  background: rgba(26, 26, 26, 0.35);
  animation: ddsFadeUp 0.3s 0.62s $ease-out backwards;
}
/* 端点时刻读数：00 / 06 / 12 / 18 / 24，mono 轴标。
   v25：由 flex + space-between 改为绝对定位（每项 left 百分比 + translateX(-50%)）。
   旧写法的对齐是假的：五个标签等距铺满，但标签有自身宽度，两端中心落在 0%/100% 之外，
   中间三个也和 25/50/75% 刻度线错开 —— 看起来「标签对着刻度」，实际对不齐。 */
.dds-tl-ends {
  position: relative;
  height: 24rpx;
  margin-top: 8rpx;
}
.dds-tl-end {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-family: $font-mono;
  font-size: 18rpx;
  /* $ash(#C4BAAE) 在白底仅 1.67:1，几乎不可读；提到 $text-3(#888) 3.54:1。
     刻度是「读数」不是装饰，必须可辨认。 */
  color: $mauve;
  line-height: 1;
  white-space: nowrap;
  animation: ddsFadeUp 0.3s 0.5s $ease-out backwards;
}

/* ===== 撕裂线：细密虚线横贯全幅（负 margin 出血到卡缘），与打孔对位。
 * 用 $ash 而非 $border-strong：撕裂线是票证的签名笔画，太淡概念就立不住 ===== */
.dds-perf {
  height: 2rpx;
  margin: 22rpx -36rpx 0;
  /* 双声明同打孔：px 保底 + rpx 精确缩放（见 .dds-stub 注释） */
  background: repeating-linear-gradient(
    90deg,
    $ash 0 5px,
    transparent 5px 9px
  );
  background: repeating-linear-gradient(
    90deg,
    $ash 0 10rpx,
    transparent 10rpx 18rpx
  );
  animation: ddsFadeUp 0.3s 0.3s $ease-out backwards;
}

/* ===== 票身（下半）：明细 + 票脚 =====
 * 打孔对位：孔心在自身上缘两角，与票根下缘的孔拼成两枚完整的圆 */
.dds-body {
  position: relative;
  flex-shrink: 1;
  min-height: 0;
  box-sizing: border-box;
  background: $bg-card;
  border-radius: 0 0 40rpx 40rpx;
  padding: 20rpx 36rpx 26rpx;
  display: flex;
  flex-direction: column;
  /* 裁掉票脚承托带出血到圆角外的部分（打孔 mask 在裁切结果上继续挖孔） */
  overflow: hidden;
  -webkit-mask-image:
    radial-gradient(circle 9px at 0 0, transparent 8.5px, #000 9px),
    radial-gradient(circle 9px at 100% 0, transparent 8.5px, #000 9px);
  -webkit-mask-image:
    radial-gradient(circle 18rpx at 0 0, transparent 17rpx, #000 18rpx),
    radial-gradient(circle 18rpx at 100% 0, transparent 17rpx, #000 18rpx);
  -webkit-mask-size: 51% 100%, 51% 100%;
  -webkit-mask-position: left top, right top;
  -webkit-mask-repeat: no-repeat;
  mask-image:
    radial-gradient(circle 9px at 0 0, transparent 8.5px, #000 9px),
    radial-gradient(circle 9px at 100% 0, transparent 8.5px, #000 9px);
  mask-image:
    radial-gradient(circle 18rpx at 0 0, transparent 17rpx, #000 18rpx),
    radial-gradient(circle 18rpx at 100% 0, transparent 17rpx, #000 18rpx);
  mask-size: 51% 100%, 51% 100%;
  mask-position: left top, right top;
  mask-repeat: no-repeat;
}

/* 明细栏头：小标 + 延伸发丝线 */
.dds-list-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-bottom: 4rpx;
  animation: ddsFadeUp 0.26s 0.26s $ease-out backwards;
}
.dds-list-label {
  font-size: 22rpx;
  font-weight: $weight-semibold;
  color: $mauve;
  letter-spacing: 2rpx;
}
.dds-list-rule {
  flex: 1;
  height: 1rpx;
  background: $hint;
  margin-left: 16rpx;
}
.dds-scroll-wrap {
  position: relative;
  min-height: 0;
  margin-top: 4rpx;
}
.dds-scroll { max-height: 200rpx; }   // ≈3.1 行：第 4 行露半个头，滚动是看得见的
.dds-scroll-inner { padding: 2rpx 0 10rpx; }
/* 渐隐蒙层：纯渐变条（纸面色），不用 mask-image */
.dds-fade {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 2;
  pointer-events: none;
}
.dds-fade-top {
  top: 0;
  height: 30rpx;
  background: linear-gradient(180deg, #FFFFFF 0%, rgba(255, 255, 255, 0) 100%);
}
.dds-fade-bottom {
  bottom: 0;
  height: 48rpx;
  background: linear-gradient(0deg, #FFFFFF 42%, rgba(255, 255, 255, 0) 100%);
}

/* 行：时间 + 岗位 + 点线引导 + 时长（+ 可点箭头）。
   点线对齐时间的基线（align-self: flex-end + 底距 = 行高与字高的差的一半），
   是小票「项 → 金额」的经典连线 */
.dds-row {
  display: flex;
  align-items: center;
  min-height: 64rpx;
  padding: 0 8rpx;
  border-radius: 12rpx;
  animation: ddsRowIn 0.28s $ease-out backwards;
  transition: background-color $motion-fast $ease-out;
}
/* 基准态 = 终态：动画被禁用时行依然完好可读；
   用 backwards 而非 both，结束帧不占用 transform，按压反馈才不会被吃掉 */
@keyframes ddsRowIn {
  from { opacity: 0; transform: translateY(14rpx); }
  to { opacity: 1; transform: none; }
}
/* 按压反馈：整行垫一层 #F2EEE7 圆角底（0.16s 同速进出），
   比缩放更「列表项」；只给可点的行 —— 不可点的行不承诺交互，
   也不该有「按下去了」的错觉。
   v31：原先是 `.dds-row-link:active, .dds-row-press { ... }` 逗号组合，
   其中 :active 伪类小程序不支持（白写一条），真正生效的是模板上的
   hover-class="dds-row-press"。已删掉失效的那一半。 */
.dds-row-press {
  background: $bg-muted;
  border-radius: 12rpx;
}

.dds-time {
  width: 96rpx;
  flex-shrink: 0;
}
.dds-time-t {
  font-family: $font-mono;
  font-size: 26rpx;
  font-weight: $weight-bold;
  color: $ink;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5rpx;
}
/* 岗位名：flex 收缩 + min-width:0 才能真的截断；点线最少留 24rpx，
   超长岗位名在点线让到尽头后才断字 */
.dds-pos {
  flex: 0 1 auto;
  min-width: 0;
  margin-left: 4rpx;
  overflow: hidden;
}
.dds-pos-t {
  display: block;
  font-size: 25rpx;
  color: $ink-soft;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 点线引导：小票的身份笔画。高度 0 + 虚线边框 = 一行纯点 */
.dds-leader {
  flex: 1 1 24rpx;
  min-width: 24rpx;
  height: 0;
  margin: 0 12rpx;
  margin-bottom: 19rpx;
  align-self: flex-end;
  border-bottom: 2rpx dotted $border-strong;
}
/* 时长列：mono 右对齐 + 固定最小宽，不同长度的时间数字右缘永远成一条线。
   时长是小票的「金额」，用主墨色压住行尾 */
.dds-dur {
  font-family: $font-mono;
  font-size: 23rpx;
  font-weight: $weight-semibold;
  color: $ink;
  font-variant-numeric: tabular-nums;
  text-align: right;
  min-width: 148rpx;
  flex-shrink: 0;
  line-height: 1.2;
}
/* 箭头槽固定 22rpx：可点行放箭头、不可点行留白，时长列右缘不漂移 */
.dds-arrow-slot {
  width: 22rpx;
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}
/* 「可点」暗示：极淡右箭头，只在有 interview_id 的行出现 */
.dds-arrow {
  width: 12rpx;
  height: 12rpx;
  border-top: 2rpx solid $ash;
  border-right: 2rpx solid $ash;
  transform: rotate(45deg);
}
/* 行内打开指示：被点的行箭头原地变成小转圈（纯 WXML，必定可见）。
 * 减弱动效下停成静态圆环：墨色顶边仍在，依旧是个指示器 */
.dds-row-spinner {
  width: 22rpx;
  height: 22rpx;
  border-radius: 50%;
  border: 3rpx solid $hint;
  border-top-color: $ink;
  animation: ddsSpin 0.7s linear infinite;
}
@keyframes ddsSpin {
  to { transform: rotate(360deg); }
}

/* ===== 票脚：一行票号，落在全幅承托带上 =====
 * #F2EEE7 浅灰带 + 发丝上缘，把「印刷物到此为止」收得稳稳的；
 * 负 margin 出血贴到卡缘，圆角由 body 裁切。
 * 两侧发丝线与明细栏头的「小标 + 延伸线」首尾呼应，是落款不是装饰。 */
.dds-foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin: 18rpx -36rpx -26rpx;
  padding: 22rpx 36rpx;
  background: $bg-muted;
  border-top: 1rpx solid $hint;
  animation: ddsFadeUp 0.3s 0.44s $ease-out backwards;
}
.dds-foot-rule {
  flex: 1;
  height: 1rpx;
  background: $border-strong;
}
.dds-serial {
  flex-shrink: 0;
  font-family: $font-mono;
  font-size: 18rpx;
  letter-spacing: 2rpx;
  color: $mauve;
  line-height: 1.3;
}

/* ===== 空态 ===== */
.dds-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30rpx 0 26rpx;
  animation: ddsFadeUp 0.28s 0.06s $ease-out backwards;
}
.dds-empty-ring {
  width: 110rpx;
  height: 110rpx;
  box-sizing: border-box;
  border: 1rpx solid $hint;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 环里的短线 = 刻度归零，不是纯装饰 */
.dds-empty-tick {
  width: 38rpx;
  height: 2rpx;
  border-radius: 2rpx;
  background: $ash;
}
.dds-empty-title {
  margin-top: 26rpx;
  font-size: 27rpx;
  font-weight: $weight-semibold;
  color: $ink-soft;
}
.dds-empty-sub {
  margin-top: 12rpx;
  font-size: 23rpx;
  color: $mauve;
}

/* 有场次但明细缺失时的注脚 */
.dds-note {
  padding: 30rpx 0 22rpx;
  text-align: center;
}
.dds-note-text {
  font-size: 25rpx;
  color: $mauve;
}

@keyframes ddsFadeUp {
  from { opacity: 0; transform: translateY(6rpx); }
  to { opacity: 1; transform: none; }
}
/* 盖章（两段式）：砸下 → 微回弹 → 停稳，与日历格子的 tileStamp 同语言 */
@keyframes ddsStamp {
  0% { opacity: 0; transform: scale(1.18); }
  62% { opacity: 1; transform: scale(0.985); }
  100% { opacity: 1; transform: none; }
}
/* 「今天」呼吸点：基准态 = 全亮，减弱动效下停在全亮 */
@keyframes ddsRelPulse {
  from { opacity: 0.35; transform: scale(0.82); }
  to { opacity: 1; transform: scale(1); }
}
/* 轨道/区间划出：基准态即终态（scaleX(1)），减弱动效下静止为完整轨道 */
@keyframes ddsTrackIn {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

/* 减弱动效：动画/过渡全关。因为基准态就是终态，关掉后图形与文字依然完整 */
@media (prefers-reduced-motion: reduce) {
  .dds-mask,
  .dds-dialog,
  .dds-eyebrow,
  .dds-head,
  .dds-head-today,
  .dds-hero,
  .dds-count,
  .dds-tl-track,
  .dds-tl-span,
  .dds-tl-tick,
  .dds-tl-node,
  .dds-tl-now,
  .dds-tl-end,
  .dds-perf,
  .dds-list-head,
  .dds-row,
  .dds-row-spinner,
  .dds-empty,
  .dds-close-btn,
  .dds-foot,
  .dds-head-today-dot {
    animation: none !important;
    transition: none !important;
  }
}
</style>
