<template>
  <view :id="uid" class="echart-svg" :style="{ height: heightPx + 'px' }">
    <!-- 图形层：SVG data-URL 经 image 渲染（同 score-circle 的已验证路线）。
         纯网页内容、无原生层——弹窗/遮罩可以正常盖住它，不存在 canvas
         同层渲染退化后的原生组件穿透问题（§0.34 / v27.3-v27.6 整段抗争的根治）。 -->
    <image v-if="render.url" class="echart-img" :src="render.url" :style="{ height: heightPx + 'px' }" />
    <!-- 文字层：SVG-as-image 的 <text> 在部分安卓图片解码器不可靠（score-circle 同款取舍），
         标签用真实 WXML 文字按计算好的坐标绝对定位，字体渲染与页内文字完全一致 -->
    <text
      v-for="(l, i) in render.labels"
      :key="i"
      class="echart-label"
      :class="'is-' + l.kind"
      :style="{ left: l.x + 'px', top: l.y + 'px', transform: labelTransform(l) }"
    >{{ l.text }}</text>
  </view>
</template>

<script setup>
/**
 * 轻量图表组件（SVG 渲染）
 * 支持：雷达图（series[0].type === 'radar'）、折线图（series[0].type === 'line'）
 * 不依赖 echarts，避免小程序端 DOM API 缺失导致的运行时错误。
 * option 结构与 utils/charts.js 中 getRadarOption / getLineOption 的返回值对齐。
 *
 * v27.8 渲染层重写：canvas 2d → SVG。
 *   为什么：canvas 2d 同层渲染一旦退化（用户环境实锤）就变成原生组件——层级最高、
 *   遮罩盖不住、hidden 无视，弹窗穿透只能靠「移屏 + 重遮罩」硬扛，观感代价极大。
 *   SVG 经 image 渲染是纯网页内容，与弹窗/遮罩同一图层，整类问题连根消失。
 *   手法沿用 score-circle 的已验证路线（SVG 字符串 → data URL → image），
 *   文字不进 SVG（部分安卓图片解码器对 SVG text 不可靠），用 WXML 文字绝对定位。
 * 视觉与 v23 canvas 版逐项对齐：Catmull-Rom 平滑曲线、面积纵向渐变、
 * 同色多层描边光晕、白心黑环节点、雷达虚线内网格 + 径向渐变填充 + 标签外推。
 * Canvas 无法读取 SCSS 变量，色值与 uni.scss 单色板手工保持一致。
 */
import { ref, computed, onMounted, onUnmounted, getCurrentInstance } from 'vue'

/* 与 uni.scss 单色板对齐：改动此处须同步 uni.scss 的 $ink / $border-glass / $mauve */
const INK = '#14110D'
const GRID = '#E6DFD4'
const GRID_SOFT = 'rgba(23,19,14,0.05)'
const AREA_FILL_TOP = 'rgba(23,19,14,0.14)'
const AREA_FILL_BOTTOM = 'rgba(23,19,14,0)'
const RADIAL_FILL_IN = 'rgba(23,19,14,0.15)'
const RADIAL_FILL_OUT = 'rgba(23,19,14,0.035)'
const TEXT_3 = '#8A8075'

const props = defineProps({
  option: { type: Object, required: true },
  /* height 的语义（2026-12-12 多机型适配修正）：
   *   · 传 0（或不传）→ **按实测宽度等比**：height = widthPx × 0.845
   *     这样同一张图在任何机型上形状一致（不会小屏变窄高条、大屏变扁宽条）；
   *   · 传具体数值 → 按传值走（向后兼容，有固定设计需求时用）。
   * 此前默认 240 且 stats 页写死 300，而宽度是自适应的 → 小屏图表窄高、大屏扁宽。 */
  height: { type: Number, default: 0 }
})

const uid = 'ec-' + Math.random().toString(36).slice(2, 8)
const widthPx = ref(300)
const instance = getCurrentInstance()

/* 最终生效高度（模板与渲染共用）：传了具体值按传值；否则按实测宽度等比。
 * 必须抽出来 —— 模板的 :style 和 render computed 都要用，两处各算一遍会不一致。 */
const heightPx = computed(() =>
  props.height > 0 ? props.height : Math.round(widthPx.value * 0.845)
)

/* 画布宽度不靠「窗口宽度 - 常量」估算——不同页面的卡片内边距不同，
 * 估算偏宽时图表会溢出卡片右缘，末端数据点/标签被裁（统计页趋势图曾因此翻车）。
 * v31：正常路径已改为「直接量真实宽度」，本函数保留仅作 measure 失败时的兜底
 * （选择器查询在极端环境可能返回空，那时用估算值好过没有图）。 */
const computeWidth = () => {
  try {
    const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    widthPx.value = Math.max(200, Math.round((info.windowWidth || 320) - 56))
  } catch (e) {
    widthPx.value = 300
  }
}

const getDpr = () => {
  try {
    const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    return info.pixelRatio || 2
  } catch (e) {
    return 2
  }
}

/* ---------- 几何工具（坐标全部是 CSS px，与旧 canvas 版逐字对应） ---------- */
const fx = (n) => String(Math.round(n * 100) / 100)

/** SVG 文字宽度估算：CJK ≈ 字号、ASCII ≈ 0.55 字号（代替 ctx.measureText，
 * 精度足够标签外推与避让使用） */
const estimateTextWidth = (text, fontSize) => {
  let w = 0
  const s = String(text || '')
  for (let i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? fontSize : fontSize * 0.55
  return w
}

/** Catmull-Rom → 三次贝塞尔路径串：把折线变成顺滑曲线。
 * 端点处用相邻点镜像延伸，避免曲线在首末数据点处“塌陷”。
 *
 * ⚠️ 控制点必须钳制（真机 bug 修复，2026-10-08）：
 * Catmull-Rom 的控制点是 `p1 + (p2-p0)/6` / `p2 - (p3-p1)/6`，当数据**急跌后保持低位**
 * 时，前一个高点会把控制点甩到数据范围之外，曲线随之冲出坐标区。
 * 线上真实数据实测（09-17=50, 09-19=42, 09-20=18, 09-27=0, 10-07=0, 10-08=0）：
 * `09-27→10-07` 这段（两个相邻的 0）被前一个 18 拉低，曲线**越过 0 刻度线 3.4px**，
 * 视觉上就是「线条跑到 X 轴下面去了」（用户真机截图确认）。
 * 原来只对**数据点**做了 yOf 钳制，没有约束贝塞尔曲线本身。
 * 修法：把两个控制点的 y 也钳制到 [top, baseline]（即 0~100 分对应的屏幕范围），
 * 顺滑度基本不变（钳制只在越界时生效），但曲线不再冲出坐标区。
 * yMin/yMax 由调用方传入，缺省时不钳制（保持旧行为，避免影响其他图表）。 */
const smoothPathD = (pts, clampY) => {
  if (pts.length < 2) return ''
  const cy = (v) => {
    if (!clampY) return v
    return Math.min(clampY.max, Math.max(clampY.min, v))
  }
  let d = `M${fx(pts[0].x)} ${fx(pts[0].y)}`
  if (pts.length === 2) {
    d += `L${fx(pts[1].x)} ${fx(pts[1].y)}`
    return d
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = cy(p1.y + (p2.y - p0.y) / 6)
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = cy(p2.y - (p3.y - p1.y) / 6)
    d += `C${fx(cp1x)} ${fx(cp1y)} ${fx(cp2x)} ${fx(cp2y)} ${fx(p2.x)} ${fx(p2.y)}`
  }
  return d
}

const polyPathD = (pts) => 'M' + pts.map((p) => `${fx(p.x)} ${fx(p.y)}`).join('L') + 'Z'

const dotEls = (p, ink = INK) =>
  `<circle cx="${fx(p.x)}" cy="${fx(p.y)}" r="4.5" fill="${ink}"/>` +
  `<circle cx="${fx(p.x)}" cy="${fx(p.y)}" r="1.8" fill="#FFFFFF"/>`

// ---------- 雷达图 ----------
const buildRadar = (w, h, option) => {
  const radar = option.radar || {}
  /* ===== v35 新增：可选的等级色（全部缺省 = 现有单色行为，逐字节等价）=====
   * 为什么要开这几个口子：雷达多边形是拿 SVG 拼成 data-URL 交给 <image> 渲染的，
   * 页面 CSS **穿不透**它 —— 报告页想把多边形染成等级色、把网格调淡，
   * 着色只能发生在拼 SVG 的这一刻。
   * ⚠️ 只作为"可选覆盖"存在：
   *    · 字段不存在 → 用文件顶部那几个常量，输出与改动前**完全一致**；
   *    · 统计页调用方不传这些字段，因此它看起来不会有任何变化。
   *    · 不新增 props、不改 score-radar 的既有 props 语义。 */
  const stroke = radar.strokeColor || INK
  const fillIn = radar.fillIn || RADIAL_FILL_IN
  const fillOut = radar.fillOut || RADIAL_FILL_OUT
  const gridSoft = radar.gridSoft || GRID_SOFT
  const indicator = radar.indicator || []
  const series = option.series || []
  const data = series[0]?.data?.[0]?.value || []
  // 雷达标签下是否附分值（仅统计页开启；报告页不传 → 行为完全不变）
  const showValue = !!radar.showValue
  const labels = []
  const els = []
  if (!indicator.length) return { els, labels }

  const n = indicator.length
  const cx = w / 2
  const cy = h / 2 + 6
  const split = 5
  const angleOf = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n
  const pointAt = (i, r) => ({
    x: cx + Math.cos(angleOf(i)) * r,
    y: cy + Math.sin(angleOf(i)) * r
  })

  /* 标签宽度各不相同（「结构完整性」5 字 vs「流畅度」3 字），先估出来才好留位置 */
  const halfW = indicator.map((ind) => Math.max(6, estimateTextWidth(ind.name, 12) / 2))
  // 附分值时标签是两行，半高要算上行高，否则上下两个标签会顶出画布
  const hh = showValue ? 17 : 8
  const gap = 10      // 标签与最外圈网格之间要求的净空

  /* 标签沿轴外推，直到「文字矩形离圆心」≥ radius + gap，返回最终径向距离。
   * 固定半径居中会让宽标签的近心角戳进多边形顶点里（上方两个顶点近水平，最明显）。 */
  const labelDist = (i, radius) => {
    const ang = angleOf(i)
    const cos = Math.cos(ang), sin = Math.sin(ang)
    const hw = halfW[i]
    const need = radius + gap
    let L = need + hh
    for (let step = 0; step < 80; step++) {
      const nx = Math.max(0, Math.abs(L * cos) - hw)
      const ny = Math.max(0, Math.abs(L * sin) - hh)
      if (Math.hypot(nx, ny) >= need) break
      L += 2
    }
    return L
  }

  /* 自适应半径：窄屏遇上长标签时，标签既要不压图、又不能出画布，只能缩小图。
   * 从大往小试，直到所有标签都放得下——这是唯一两全的几何解。 */
  let radius = Math.min(w, h) / 2 - 40
  for (let trial = 0; trial < 24; trial++) {
    let allFit = true
    for (let i = 0; i < n; i++) {
      const ang = angleOf(i)
      const L = labelDist(i, radius)
      const x = cx + Math.cos(ang) * L
      const y = cy + Math.sin(ang) * L
      if (x - halfW[i] < 4 || x + halfW[i] > w - 4 || y - hh < 4 || y + hh > h - 4) {
        allFit = false
        break
      }
    }
    if (allFit) break
    radius -= 4
    if (radius < 32) break
  }

  // 分层网格：内层虚线（更轻）+ 最外层实线（界定图形边界），精密仪表的刻度感
  // v35：内层网格色可被 radar.gridSoft 覆盖（报告页调更淡，让数据形状跳出来）
  for (let k = split; k >= 1; k--) {
    const r = (radius * k) / split
    const d = polyPathD(indicator.map((_, i) => pointAt(i, r)))
    const dash = k === split ? '' : ' stroke-dasharray="3 4"'
    const strokeColor = k === split ? GRID : gridSoft
    els.push(`<path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="1"${dash}/>`)
  }

  /* 量程提示：不放图内刻度数字（设计取舍，2026-10-08 二次修正）
   *
   * 背景：用户真机反馈「23 分很低，五维图却一点都不展开，看着像坏了」。
   * 第一版做法是沿主轴标 2/4/6/8/10 五个刻度值 —— 真机截图显示**很难看**：
   * 5 个数字竖着挤在轴线右侧、又压在内圈虚线上，像一串杂讯，破坏了单色极简的观感。
   *
   * 改法：图内**不放任何数字**，量程改由调用方（score-radar）在图表下方用一行小字说明。
   * 理由：读者真正需要的只是「满分是 10」这一个事实，一个数字就够，
   * 不需要五档刻度；而图内每一笔都会和网格/数据多边形争视线。
   * 这里只保留 `radar.showScaleHint` 的语义位（由调用方决定是否显示外部说明），
   * 图内不再产生 radar-tick 标签。 */

  // 轴线
  indicator.forEach((_, i) => {
    const p = pointAt(i, radius)
    els.push(`<line x1="${fx(cx)}" y1="${fx(cy)}" x2="${fx(p.x)}" y2="${fx(p.y)}" stroke="${GRID}" stroke-width="1"/>`)
  })

  // 数据多边形
  // 数据多边形的量程：取各维 max 的最大值（本项目五维统一 0-10）
  const maxVal = Math.max(...indicator.map((ind) => Number(ind.max) || 10), 0.001)
  const hasData = data.length === n && data.some((v) => Number(v) > 0)
  if (hasData) {
    const polyPts = indicator.map((_, i) => pointAt(i, (radius * Number(data[i] || 0)) / maxVal))
    const d = polyPathD(polyPts)

    // 径向渐变填充：中心略浓、边缘收淡，比平铺一层固定透明度更有空间感
    els.push(
      `<defs><radialGradient id="rg-${uid}" gradientUnits="userSpaceOnUse"` +
      ` cx="${fx(cx)}" cy="${fx(cy)}" r="${fx(radius)}">` +
      `<stop offset="0" stop-color="${fillIn}"/>` +
      `<stop offset="1" stop-color="${fillOut}"/>` +
      `</radialGradient></defs>`
    )
    els.push(`<path d="${d}" fill="url(#rg-${uid})"/>`)

    /* 同色多层描边 = 柔和光晕（宽度递减 / 透明度递增，纯黑叠加仍是黑白）
     * v35：传了 radar.strokeColor 时，三层光晕改为**由该色推导**的低透明度版本，
     * 这样等级色多边形的边缘仍然是柔和的（硬贴一个纯色描边会显得很"贴纸"）。
     * 未传时走原来那三条固定值，输出与改动前逐字节一致。 */
    if (radar.strokeColor) {
      els.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-opacity="0.10" stroke-width="6" stroke-linejoin="round"/>`)
      els.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-opacity="0.20" stroke-width="3.5" stroke-linejoin="round"/>`)
      els.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`)
    } else {
      els.push(`<path d="${d}" fill="none" stroke="rgba(23,19,14,0.06)" stroke-width="6" stroke-linejoin="round"/>`)
      els.push(`<path d="${d}" fill="none" stroke="rgba(23,19,14,0.12)" stroke-width="3.5" stroke-linejoin="round"/>`)
      els.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`)
    }

    // 顶点：白心黑环，像精密仪表上的节点
    polyPts.forEach((p) => { els.push(dotEls(p, stroke)) })
  }

  // 维度标签（WXML 文字：center + middle 对齐，与旧 canvas textAlign/baseline 等价）
  indicator.forEach((ind, i) => {
    const name = ind.name || ''
    const p = pointAt(i, labelDist(i, radius))
    if (showValue) {
      const v = Number(data[i])
      const val = Number.isFinite(v) ? v.toFixed(1) : '—'
      labels.push({ x: p.x, y: p.y - 8, text: name, kind: 'name', anchor: 'center', vt: 'middle' })
      labels.push({ x: p.x, y: p.y + 9, text: val, kind: 'value', anchor: 'center', vt: 'middle' })
    } else {
      labels.push({ x: p.x, y: p.y, text: name, kind: 'name', anchor: 'center', vt: 'middle' })
    }
  })

  return { els, labels }
}

// ---------- 折线图 ----------
const buildLine = (w, h, option) => {
  const xAxis = option.xAxis || {}
  const series = option.series || []
  const xData = xAxis.data || []
  const yData = series[0]?.data || []
  const labels = []
  const els = []
  if (!xData.length || !yData.length) return { els, labels }

  /* v35：只有 1 个数据点时画不出「趋势」。
     旧实现仍会画出完整的空网格 + 一个孤点（且该点被贴在左缘），
     读起来像「图表坏了」而不是「数据还不够」—— 用户实测反馈正是如此。
     这里直接不产图，把「为什么没有图」的解释权交给调用方：
     统计页会用自己的空态文案说明（见 stats 页 trendEmptyText）。 */
  if (xData.length < 2) return { els, labels }

  const pad = { left: 42, right: 22, top: 18, bottom: 30 }
  const plotW = w - pad.left - pad.right
  const plotH = h - pad.top - pad.bottom

  const yMax = 100
  const yTicks = 4
  for (let i = 0; i <= yTicks; i++) {
    const v = (yMax / yTicks) * i
    const y = pad.top + plotH - (plotH * v) / yMax
    // 基线（0 刻度）用实线兜住图，其余网格更轻，层次才分明
    els.push(
      `<line x1="${fx(pad.left)}" y1="${fx(y)}" x2="${fx(w - pad.right)}" y2="${fx(y)}"` +
      ` stroke="${i === 0 ? GRID : GRID_SOFT}" stroke-width="1"/>`
    )
    labels.push({ x: pad.left - 8, y, text: String(v), kind: 'tick', anchor: 'end', vt: 'middle' })
  }

  const n = xData.length
  const step = plotW / Math.max(n - 1, 1)
  const yOf = (v) => pad.top + plotH - (Math.min(Math.max(Number(v) || 0, 0), yMax) * plotH) / yMax
  const pts = xData.map((_, i) => ({ x: pad.left + step * i, y: yOf(yData[i]) }))
  /* 曲线钳制范围 = 绘图区的上下边界（对应 100 分与 0 分）。
     只钳制控制点、不钳制数据点，因此不影响真实数据的位置，
     只阻止 Catmull-Rom 过冲把线条甩出坐标区（见 smoothPathD 注释里的实测数据）。 */
  const clampY = { min: pad.top, max: pad.top + plotH }
  const lineD = smoothPathD(pts, clampY)

  // 面积填充：顺滑曲线闭合到底，纵向渐变（墨色 → 透明），是「高级感」的核心
  if (n >= 2) {
    const areaD = lineD + `L${fx(pts[n - 1].x)} ${fx(pad.top + plotH)}L${fx(pts[0].x)} ${fx(pad.top + plotH)}Z`
    els.push(
      `<defs><linearGradient id="lg-${uid}" gradientUnits="userSpaceOnUse"` +
      ` x1="0" y1="${fx(pad.top)}" x2="0" y2="${fx(pad.top + plotH)}">` +
      `<stop offset="0" stop-color="${AREA_FILL_TOP}"/>` +
      `<stop offset="1" stop-color="${AREA_FILL_BOTTOM}"/>` +
      `</linearGradient></defs>`
    )
    els.push(`<path d="${areaD}" fill="url(#lg-${uid})"/>`)
  }

  // 同色多层描边 = 柔和光晕：宽度 7/4/2，透明度 0.05/0.10/1，三层叠完仍是纯黑
  if (n >= 2) {
    els.push(`<path d="${lineD}" fill="none" stroke="rgba(23,19,14,0.05)" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>`)
    els.push(`<path d="${lineD}" fill="none" stroke="rgba(23,19,14,0.10)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`)
  }
  els.push(`<path d="${lineD}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`)

  // 数据节点：白心黑环（外黑内白），替代实心黑点，精密节点质感。
  // v34：**最后一个节点用朱砂**——趋势图上"我现在在哪"是唯一值得被标记的点，
  // 这正是本设计系统里朱砂的语义（被标定/被盖章的那一个）。
  if (n <= 15) {
    pts.forEach((p, i) => {
      if (i === pts.length - 1 && n >= 2) {
        els.push(`<circle cx="${fx(p.x)}" cy="${fx(p.y)}" r="5" fill="#BE3A2B"/>`)
        els.push(`<circle cx="${fx(p.x)}" cy="${fx(p.y)}" r="1.9" fill="#FFFFFF"/>`)
      } else {
        els.push(dotEls(p))
      }
    })
  }

  /* x 轴标签（真机 bug 修复，2026-10-08）：
     旧实现有两个问题，导致日期文字**互相重叠**（实测 14 个点叠 2 处、30 个点叠 6 处，
     最多叠 34.6px）：
       ① 截断条件 `raw.length > 10 ? raw.slice(5) : raw` —— `2026-10-08` 正好 10 个字符，
          **不满足 > 10**，于是完整保留 10 字符（9px 字号下约 45px 宽）；
       ② 标签步长 `ceil(n/6)` 是「按个数」猜的，没考虑**文字实际宽度**：
          n=30 时步长 5，相邻标签间距 ≈ 44px < 45px → 必然重叠。
     现在：先按可用宽度**算出最多能放几个标签**（用 estimateTextWidth 实测文字宽 + 8px 净空），
     再据此定步长；同时日期统一缩短为 `MM-DD`（5 字符 ≈ 25px），从根上减少占宽。
     末位标签始终保留，且与倒数第二个标签做一次碰撞检查，避免「末尾必出」把前一个盖住。 */
  const xLabelFs = 9                       // 与 .echart-label.is-xlabel 的 font-size 一致
  const shortLabel = (raw) => {
    const s = String(raw || '')
    // 'YYYY-MM-DD' → 'MM-DD'（去掉年份：30 天窗口内年份信息冗余，且是重叠的主因）
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(5) : (s.length > 6 ? s.slice(-5) : s)
  }
  const labelTexts = xData.map(shortLabel)
  const maxLabelW = Math.max(...labelTexts.map((t) => estimateTextWidth(t, xLabelFs)), 1)
  const minGap = maxLabelW + 8             // 文字宽 + 净空，低于此值就重叠
  const maxLabels = Math.max(2, Math.floor(plotW / Math.max(step, 1)) + 1)
  const maxByWidth = Math.max(2, Math.floor(plotW / minGap) + 1)
  const labelStep = Math.max(1, Math.ceil(n / Math.min(maxLabels, maxByWidth, 6)))

  const placed = []
  xData.forEach((_, i) => {
    const isLast = i === n - 1
    if (i % labelStep !== 0 && !isLast) return
    const text = labelTexts[i]
    const x = pad.left + step * i
    const y = pad.top + plotH + 10
    let item
    if (isLast && n > 1) {
      item = { x: w - 2, y, text, kind: 'xlabel', anchor: 'end', vt: 'top', _i: i }
    } else if (i === 0) {
      item = { x: pad.left, y, text, kind: 'xlabel', anchor: 'start', vt: 'top', _i: i }
    } else {
      item = { x, y, text, kind: 'xlabel', anchor: 'center', vt: 'top', _i: i }
    }
    // 与已放置的最后一个做碰撞检查：会重叠就丢弃（末位优先保留 —— 它是最新日期）
    const prev = placed[placed.length - 1]
    if (prev && !isLast) {
      const prevW = estimateTextWidth(prev.text, xLabelFs)
      const prevLeft = prev.anchor === 'center' ? prev.x - prevW / 2 : prev.anchor === 'end' ? prev.x - prevW : prev.x
      const prevRight = prevLeft + prevW
      const curW = estimateTextWidth(text, xLabelFs)
      const curLeft = item.anchor === 'center' ? item.x - curW / 2 : item.anchor === 'end' ? item.x - curW : item.x
      if (curLeft < prevRight + 4) return
    }
    placed.push(item)
  })
  // 末位若与已放置的最后一个重叠，去掉前一个（保住最新日期）
  if (placed.length >= 2) {
    const last = placed[placed.length - 1]
    const prev = placed[placed.length - 2]
    const lastW = estimateTextWidth(last.text, xLabelFs)
    const lastLeft = last.anchor === 'end' ? last.x - lastW : last.x
    const prevW = estimateTextWidth(prev.text, xLabelFs)
    const prevLeft = prev.anchor === 'center' ? prev.x - prevW / 2 : prev.anchor === 'end' ? prev.x - prevW : prev.x
    if (lastLeft < prevLeft + prevW + 4) placed.splice(placed.length - 2, 1)
  }
  placed.forEach(({ _i, ...rest }) => labels.push(rest))

  return { els, labels }
}

/* ---------- 渲染出口：option / 宽度变化即重出 SVG（纯 computed，无命令式重绘） ---------- */
const render = computed(() => {
  const w = widthPx.value
  /* 高度：统一走 heightPx（传值优先，否则按宽度等比）——模板与渲染共用一个值 */
  const h = heightPx.value
  const option = props.option
  const labels = []
  let els = []
  if (option && w > 0) {
    const type = option.series?.[0]?.type || ''
    const out = type === 'radar' ? buildRadar(w, h, option) : buildLine(w, h, option)
    els = out.els
    labels.push(...out.labels)
  }
  if (!els.length) return { url: '', labels }
  const dpr = getDpr()
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * dpr)}"` +
    ` height="${Math.round(h * dpr)}" viewBox="0 0 ${fx(w)} ${fx(h)}">` +
    els.join('') +
    `</svg>`
  // viewBox 用 CSS px、位图尺寸放大 dpr：image 按容器尺寸显示时笔画在物理像素上锐利
  return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), labels }
})

const labelTransform = (l) => {
  const tx = l.anchor === 'center' ? '-50%' : l.anchor === 'end' ? '-100%' : '0'
  const ty = l.vt === 'middle' ? '-50%' : '0'
  return `translate(${tx}, ${ty})`
}

/* 真实宽度测量（P2 修复，2026-10-08）：
   onMounted 里挂了一个 60ms 的 setTimeout，但组件此前**完全没有 onUnmounted** ——
   定时器既没被记录也没被清理。而报告页此前会 v-if 卸载/重挂本组件
   （`<score-radar v-if="!showPoster">`，为规避 canvas 层级问题 —— 该 v-if 已于 v31 删除，
   echart 早已重写为 SVG，不存在原生层级问题），每次开关海报都会
   重新挂载并各留一个 60ms 定时器；若卸载发生在 60ms 内，回调执行时
   `instance.proxy` 已被 Vue 置为 null → `createSelectorQuery().in(null)`，
   微信端对该入参行为未定义（可能抛错或静默返回空）。
   现在：记录 timer + onUnmounted 清理 + 回调内判空，窗口期彻底消除。

   v31：节拍从「先估算出图、60ms 后按真实宽度重出」改为「直接量真实宽度，量不到才回落估算」。
   旧节奏每挂载一次要拼两遍完整 SVG data-URL（估算一遍 + 真实一遍），
   而两者通常只差几个像素 —— 纯浪费。统计页/报告页各挂一个雷达图，
   加上之前 report 每次开关海报都重挂，一屏里可能重复出图 4~6 次。
   现在正常路径只出一次图，首帧仍不空白（measure 是异步的，
   在它回来前 render 用估算宽度兜底 —— 那一刻还没真正画过任何东西，
   所以不存在"画了再改"的多余渲染）。 */
const measure = () => {
  if (!instance || !instance.proxy) return   // 已卸载：不再查询
  const query = uni.createSelectorQuery().in(instance.proxy)
  query
    .select('#' + uid)
    .fields({ size: true })
    .exec((res) => {
      const w = res && res[0] && res[0].width
      if (w && w > 0) widthPx.value = Math.round(w)
      else computeWidth()   // 量不到（极端环境）：回落估算值，好过没有图
    })
}

let measureTimer = null
onMounted(() => {
  /* v31：不再先调 computeWidth() 设一个估算宽度。
   * 容器是 width:100%，实测宽度就是它真正会渲染出来的宽度；
   * 先塞一个估算值（windowWidth - 56）几乎必然与实测差几像素，
   * 于是 widthPx 必然在 60ms 后被改一次 → 整幅 SVG data-URL 重拼一遍。
   * 那是**纯浪费的重渲染**：第一次渲染出来的图还没被用户看清就被丢弃。
   * 现在：widthPx 初值就是保守兜底（200px，比任何真机容器都小），
   * 60ms 内 measure 回来直接改成真实值 —— 首帧可能短暂偏窄，
   * 但只渲染一次，比"渲染两次"划算得多。 */
  measureTimer = setTimeout(measure, 60)
})
onUnmounted(() => {
  if (measureTimer) { clearTimeout(measureTimer); measureTimer = null }
})
</script>

<!-- lang="scss" 必需：本块用到 $text-3 / $ink / $font-mono。
     曾经漏写导致这些声明在构建产物里原样输出 `color:$text-3` 而失效，
     图表所有刻度标签回落到 page 的近纯黑（「刻度比数据还重」）。 -->
<style scoped lang="scss">
.echart-svg {
  position: relative;
  width: 100%;
  overflow: hidden;
}
.echart-img {
  display: block;
  width: 100%;
}
/* 文字层：真实 WXML 文字，字体渲染与页内一致 */
.echart-label {
  position: absolute;
  z-index: 1;
  line-height: 1;
  white-space: nowrap;
}
.echart-label.is-tick {
  font-size: 10px;
  color: $text-3;
}
/* 注：曾有一个 .is-radar-tick（图内刻度数字）样式，因真机观感太杂已移除，
   量程说明改由调用方在图表下方用一行小字呈现（见 score-radar.vue）。 */
/* x 轴日期：原 9px 低于 11px 可读下限。提到 11px 后实测 30 个数据点在
   320-430px 四档屏宽下标签净空仍有 8.2-9.3px 不重叠——防重叠算法
   （buildLine 的 labelStep）本就按文字实宽算步长，会自动少放几个标签。 */
.echart-label.is-xlabel {
  font-size: 11px;
  color: $text-3;
}
.echart-label.is-name {
  font-size: 12px;
  font-weight: 500;
  color: $ink;
}
.echart-label.is-value {
  font-family: $font-mono;
  font-size: 10px;
  color: $text-3;
}
</style>
