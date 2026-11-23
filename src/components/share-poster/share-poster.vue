<template>
  <view class="poster-wrap">
    <!-- 绘制画布：套在离屏容器里移出可视区，只负责离屏绘制。
         ⚠️ 不能用 position: fixed 把画布藏到屏幕外——微信官方对原生组件的限制写明
         「无法定义原生组件为 position: fixed」，同层渲染一旦退化（iOS 节点树不稳定 /
         Android 缺同层渲染内核），fixed 立即失效：本该在屏幕外的画布会漂进视野并
         跟随页面滚动（用户实锤的「滚动漂移」bug，同层渲染正常时它表现为偶发错位）。
         也不能给 canvas 加 background / box-shadow / 圆角（v6 实锤会触发同层渲染退化）。
         对策（2026-10-12 闪烁修复）：绝对定位 top:-2000rpx 移出可视区 + 父容器
         overflow:hidden 裁掉 —— 同层渲染正常/退化两种情形都不会闪现在弹层里；
         导出成功立即 v-if 销毁画布，DOM 里不留存原生 canvas 节点；
         弹层只展示导出后的 <image>，普通组件不存在这些问题 -->
    <view class="poster-canvas-offscreen">
      <canvas
        v-if="canvasVisible"
        type="2d"
        id="posterCanvas"
        class="poster-canvas"
        :style="{ width: CANVAS_W + 'rpx', height: CANVAS_H + 'rpx' }"
      ></canvas>
    </view>

    <!-- ===== 结果区：占位块与图片**叠放在同一个位置**，图片加载完才淡入 =====
         ⚠️ 2026-10-12 第二次修复（重要，勿改回 v-if/v-else）：
         上一版用 v-if="posterImage" / v-else 切换，仍然"突然出现 + 闪"。
         根因：`mode="widthFix"` 的 <image> 在**图片真正解码完成之前高度为 0**。
         v-if 切过去的瞬间，1120rpx 的占位块已被移除、图片却还是 0 高 →
         面板高度塌陷 → 图片加载完再撑回 1120rpx：这一塌一撑就是用户看到的闪烁。
         淡入动画作用在"元素插入那一刻"，那时图片还没加载完，等于白做。

         正确做法（本版）：
           · 占位块**留在文档流里**（撑住 1120rpx 高度），直到图片 onLoad 才收起
           · 图片绝对定位铺在占位块之上，onLoad 后才加 .img-in 淡入
           · 高度由占位块全程撑住 → 全程无塌陷、无跳变
         代价：多渲染一个占位块节点（可忽略），换来绝对稳定的高度。 -->
    <view class="poster-stage">
      <!-- 占位块：**永久留在文档流里**（两个职责合一）
             ① 结构职责：全程撑住 1120rpx 高度 —— widthFix 图片解码前高度为 0，
                若它被撤掉，面板会塌陷再撑开，那就是闪烁。
             ② 视觉职责：图片 onLoad 后淡出（.is-done），与图片淡入形成交叉溶解。
             ⚠️ 不要改成 v-if —— 小程序不支持 Vue <transition>，v-if 会让它硬消失。 -->
      <view class="poster-placeholder" :class="{ 'is-done': imgLoaded }">
        <template v-if="!exportFailed">
          <image class="poster-loading-mascot" src="/static/ip_mianba_smile.png" mode="aspectFit" />
          <view class="poster-loading-dots">
            <view class="poster-loading-dot"></view>
            <view class="poster-loading-dot"></view>
            <view class="poster-loading-dot"></view>
          </view>
          <text class="poster-placeholder-text">正在生成海报…</text>
        </template>
        <template v-else>
          <text class="poster-placeholder-text">海报生成失败，请关闭后重试</text>
        </template>
      </view>

      <!-- 结果图：onLoad 后才揭晓（此时它的高度已经确定，不会塌陷） -->
      <image
        v-if="posterImage"
        class="poster-img"
        :class="{ 'img-in': imgLoaded }"
        :src="posterImage"
        mode="widthFix"
        @load="onImgLoad"
        @error="onImgError"
      />
    </view>

    <view class="poster-actions">
      <!-- v31：saving 此前是个死变量（定义了、模板从没用），用户点了没有任何反馈，
           只能靠"相册里有没有多一张图"判断成功。改成 disabled + 文案切换。 -->
      <button
        class="pa-btn save"
        :class="{ busy: saving }"
        :disabled="saving"
        @click="saveToAlbum"
        hover-class="hover-press"
      >{{ saving ? '保存中…' : '保存到相册' }}</button>
    </view>
  </view>
</template>

<script setup>
/**
 * 分享海报组件（Canvas 2D 绘制 → 导出图片 → <image> 展示）
 * v6.2 架构：画布在弹层内绝对定位、压在不透明占位块下方只做绘制，draw 完立即
 * canvasToTempFilePath 导出临时图片；导出成功即刻 v-if 销毁画布，DOM 里不留存
 * 原生 canvas 节点，弹层只渲染 <image>。
 *
 * 为什么不用 position:fixed + left:-9999px 藏画布（v6.1 的做法）：
 * 微信官方对原生组件的限制写明「无法定义原生组件为 position: fixed」。同层渲染
 * 正常时 fixed 侥幸能用，但同层渲染会在 iOS 节点树不稳定 / Android 缺内核时退化，
 * 一退化 fixed 立即失效——藏在 -9999px 的画布漂进视野、跟随页面滚动，正是用户
 * 实锤的「滚动漂移」。弹层内绝对定位 + 用完即销毁，两种情形都不会再出现。
 *
 * v6.3 视觉：头部带升级为渐变黑材质 + 顶沿内亮边 + 右上柔光 + 溢出同心圆；
 * 分数环加 12 等分刻度点 + 渐变进度弧；等级胶囊改实心墨色印章；五维条渐变填充；
 * 底部带浅渐变。全图仍是黑白灰三级色，材质感来自光与渐变而非彩色。
 */
import { ref, computed, onMounted, onUnmounted, getCurrentInstance, nextTick } from 'vue'
import { ensurePrivacyAuthorize } from '@/utils/privacy'

const props = defineProps({
  score: { type: Number, default: 0 },
  grade: { type: String, default: '' },
  positionName: { type: String, default: '' },
  dimensionScores: { type: Array, default: () => [] }
})

// 画布逻辑尺寸（px）。W=300 与报告页弹层 .poster-panel(660rpx - 60rpx 内边距) 精确对齐
const W = 300
const H = 560
// 画布显示尺寸（rpx）：W:H = 300:560 = 600:1120rpx，与占位块等比等宽，
// 绝对定位压在占位块下方时完全重合，不变形、不露缝
const CANVAS_W = 600
const CANVAS_H = 1120
const canvasId = 'posterCanvas'
const instance = getCurrentInstance()
const saving = ref(false)
// 导出完成的临时图片路径：弹层展示与保存都用它
const posterImage = ref('')
// 导出彻底失败（重试耗尽）：占位块改显失败文案，并销毁画布
const exportFailed = ref(false)
/* ⚠️ 2026-10-12（第二次修复）：图片是否**真正加载完成**。
   关键认知：`<image mode="widthFix">` 在图片解码完成前**高度是 0**。
   如果一拿到 posterImage 就用 v-if 把占位块换掉，面板会先塌陷再被撑开，
   这个"塌陷→撑开"就是用户看到的闪烁。所以必须等 @load 事件，
   在那之前占位块一直留在文档流里撑住 1120rpx。 */
const imgLoaded = ref(false)
const onImgLoad = () => { imgLoaded.value = true }
/* 图片加载失败（tempFilePath 失效、相册权限异常等）：
   不能一直停在 loading，要给失败出口。 */
const onImgError = () => {
  exportFailed.value = true
  posterImage.value = ''
  uni.showToast({ title: '海报加载失败，请关闭后重试', icon: 'none' })
}
/* ⚠️ 2026-10-12 闪烁修复（第二道保险）：
   画布挂载再推迟一帧。原生 canvas 插入 DOM 时若弹层正在做任何合成动画
   （父级 opacity/transform），微信原生组件可能不跟随动画而以全不透明闪现。
   虽然已把遮罩的 fadeIn 去掉，但这里再等一拍更稳：等弹层这一帧渲染完再挂 canvas，
   用户看到的第一个画面永远是"正在生成海报…"占位块，不会闪过白画布。 */
const canvasMounted = ref(false)
// 画布只在「弹层已渲染一帧 + 还没导出成功 + 未放弃」时存在于 DOM——
// 导出成功立即 v-if 销毁，DOM 里不留存原生 canvas 节点，从根上杜绝原生层漂移/错位
const canvasVisible = computed(() => canvasMounted.value && !posterImage.value && !exportFailed.value)

const getDpr = () => {
  try {
    const info = uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()
    return info.pixelRatio || 2
  } catch (e) {
    return 2
  }
}

/* 圆角矩形路径（低版本基础库无 ctx.roundRect，手动 arcTo） */
const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const draw = (canvas) => {
  const dpr = getDpr()
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)

  // 色板：与全站 v35 纸本朱砂体系对齐。
  // ⚠️ canvas 绘制不吃 CSS 变量，只能写字面量 —— 所以这里的每个值
  // 都必须与 uni.scss 的同名令牌保持一致，改令牌时这里也要跟着改。
  //   INK   ← $ink        #17130E 暖墨
  //   INK_HI ← $ink-gradient 亮端 #2E2822
  //   SUB   ← $ink-soft   #4A443C
  //   MUTED ← $mauve      #877D71
  //   FAINT ← $ash        #C2B8AC
  //   TRACK ← $paper-sunken #F1ECE3
  //   BAND  ← $paper      #F9F6F1
  //   LINE  ← $rule       #E4DCD0
  const INK = '#17130E'
  const INK_HI = '#2E2822'
  const SUB = '#4A443C'
  const MUTED = '#877D71'
  const FAINT = '#C2B8AC'
  const TRACK = '#F1ECE3'
  const BAND = '#F9F6F1'
  const LINE = '#E4DCD0'
  const M = 24 // 统一左右页边距

  ctx.textBaseline = 'middle'

  // ===== 1. 头部品牌带（黑）：渐变 + 内亮边 + 右上角受光，与全站黑材质同源 =====
  const headGrad = ctx.createLinearGradient(0, 0, W, 90)
  headGrad.addColorStop(0, '#2A251E')
  headGrad.addColorStop(1, '#100D09')
  ctx.fillStyle = headGrad
  ctx.fillRect(0, 0, W, 90)
  // 顶沿内亮边（受光面），是黑材质「不塑料」的关键 1px
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(0, 0, W, 1)
  // 右上角柔光，暗示单一光源
  const glow = ctx.createRadialGradient(W - 40, 0, 0, W - 40, 0, 150)
  glow.addColorStop(0, 'rgba(255,255,255,0.10)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, 90)
  // 溢出同心圆：右下角溢出被带子裁掉，与首页 Hero 同一装饰语言
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  ;[40, 64].forEach((rr2) => {
    ctx.beginPath()
    ctx.arc(W - 16, 90, rr2, 0, Math.PI * 2)
    ctx.stroke()
  })
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'left'
  ctx.font = 'bold 24px sans-serif'
  ctx.fillText('我的面试小屋', M, 38)
  ctx.font = '11px sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  ctx.fillText('AI 实时面试模拟', M, 66)
  const now = new Date()
  const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fillText(dateStr, W - M, 38)

  // ===== 2. 场次 overline =====
  ctx.fillStyle = MUTED
  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  const posName = String(props.positionName || '综合面试').slice(0, 14)
  ctx.fillText(`模拟面试 · ${posName}`, W / 2, 118)

  // ===== 3. 分数环：细轨道 + 圆帽渐变进度 + 刻度点，居中 =====
  const cx = W / 2
  const cy = 218
  const r = 54
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = TRACK
  ctx.stroke()
  // 外侧刻度点：12 等分小圆点，仪表盘的精密感（不填彩色，纯灰阶）
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (Math.PI * 2 * i) / 12
    const tx = cx + Math.cos(a) * (r + 12)
    const ty = cy + Math.sin(a) * (r + 12)
    ctx.beginPath()
    ctx.arc(tx, ty, 1.6, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(26,26,26,0.22)'
    ctx.fill()
  }
  /* score < 0：评分降级（AI 故障，总分不可信）。此时绝不能画「0 分 + D 级」——
     页面内 totalDisplay 已经诚实地显示「—」，海报作为对外传播物更不该把
     我们的服务故障印成用户的能力结论。改为环内一句「未完成评分」。
     （调用方报告页传 scoringDegraded ? -1 : total_score） */
  const degraded = Number(props.score) < 0
  const pct = degraded ? 0 : Math.max(0, Math.min(100, Number(props.score) || 0)) / 100
  if (pct > 0) {
    const start = -Math.PI / 2
    // 进度弧用纵向渐变（深→浅），单一光源在上的语言
    const arcGrad = ctx.createLinearGradient(0, cy - r, 0, cy + r)
    arcGrad.addColorStop(0, '#2A251E')
    arcGrad.addColorStop(1, INK)
    ctx.beginPath()
    ctx.arc(cx, cy, r, start, start + Math.PI * 2 * pct)
    ctx.strokeStyle = arcGrad
    ctx.stroke()
  }
  if (degraded) {
    ctx.fillStyle = SUB
    ctx.font = 'bold 20px sans-serif'
    ctx.fillText('未完成评分', cx, cy - 4)
    ctx.font = '10px sans-serif'
    ctx.fillStyle = FAINT
    ctx.fillText('本次 AI 评分服务未响应', cx, cy + 22)
  } else {
    ctx.fillStyle = INK
    ctx.font = 'bold 42px sans-serif'
    ctx.fillText(String(props.score), cx, cy - 4)
    ctx.font = '10px sans-serif'
    ctx.fillStyle = FAINT
    ctx.fillText('综合评分', cx, cy + 22)
  }

  // ===== 4. 等级胶囊：实心墨色 + 顶部内亮边，像一枚印章 =====
  // 降级时不盖章：没有评分就没有等级（与页内"不显示等级徽章"同一口径）
  if (props.grade && !degraded) {
    const pw = 60
    const ph = 24
    const px = cx - pw / 2
    const py = 296
    ctx.fillStyle = INK
    rr(ctx, px, py, pw, ph, ph / 2)
    ctx.fill()
    // 顶部 1px 内亮边（受光），与黑材质三件套同源
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    rr(ctx, px + 1, py + 1, pw - 2, 1, 0.5)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 12px sans-serif'
    ctx.fillText(`${props.grade} 级`, cx, py + ph / 2 + 0.5)
  }

  // ===== 5. 五维条：圆角药丸轨道 + 渐变填充 + 右对齐数值 =====
  let y = 348
  const trackX = 100
  const trackW = 136
  const labels = props.dimensionScores || []
  labels.forEach((d) => {
    const score = Math.max(0, Math.min(10, Number(d.score) || 0))
    const shown = Math.round(score * 10) / 10
    ctx.fillStyle = SUB
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(d.name, M, y)
    ctx.fillStyle = TRACK
    rr(ctx, trackX, y - 4, trackW, 8, 4)
    ctx.fill()
    if (score > 0) {
      // 填充用横向渐变（左浅右深），与报告页 dim-fill 同一光的语言
      const fillGrad = ctx.createLinearGradient(trackX, 0, trackX + trackW, 0)
      fillGrad.addColorStop(0, INK_HI)
      fillGrad.addColorStop(1, INK)
      ctx.fillStyle = fillGrad
      rr(ctx, trackX, y - 4, Math.max(8, trackW * score / 10), 8, 4)
      ctx.fill()
    }
    ctx.fillStyle = INK
    ctx.textAlign = 'right'
    ctx.fillText(`${shown}/10`, W - M, y)
    y += 25
  })

  // ===== 6. 发丝线 + AI 免责声明（海报会脱离小程序传播，必须自带标识） =====
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(M, 472)
  ctx.lineTo(W - M, 472)
  ctx.stroke()
  ctx.fillStyle = FAINT
  ctx.font = '9px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('成绩由 AI 生成，仅供学习参考', W / 2, 490)

  // ===== 7. 底部信息带：浅渐变 + 品牌方块 + 引导文案 =====
  const bandGrad = ctx.createLinearGradient(0, 506, 0, H)
  bandGrad.addColorStop(0, '#F2EEE7')
  bandGrad.addColorStop(1, BAND)
  ctx.fillStyle = bandGrad
  ctx.fillRect(0, 506, W, H - 506)
  ctx.fillStyle = INK
  rr(ctx, M, 518, 30, 30, 8)
  ctx.fill()
  // 方块顶部内亮边，与头部带子的黑材质呼应
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  rr(ctx, M + 1, 519, 28, 1, 0.5)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText('我', M + 15, 533)
  ctx.fillStyle = INK
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('微信搜索「我的面试小屋」', 64, 525)
  ctx.font = '10px sans-serif'
  ctx.fillStyle = MUTED
  ctx.fillText('立即开启模拟面试', 64, 543)
}

let canvasNode = null
// 重试计数器：每次重新挂载（弹层再开）时归零，否则第二次打开直接放弃导出
let exportRetries = 0
// 重试定时器：组件卸载时必须清理，否则在弹层已销毁后还在操作已失效的画布节点
let retryTimer = null

// 绘制 → 导出临时图片。导出偶发失败（画布时序冲突）自动重试，最多 3 次
const exportPoster = () => {
  uni.canvasToTempFilePath({
    canvas: canvasNode,
    destWidth: W * getDpr(),
    destHeight: H * getDpr(),
    success: (r) => {
      posterImage.value = r.tempFilePath
    },
    fail: () => {
      if (exportRetries++ < 3) {
        retryTimer = setTimeout(exportPoster, 300)
      } else {
        // 彻底失败：销毁画布节点，占位块改显失败文案（toast 仍提示一次操作出口）
        exportFailed.value = true
        uni.showToast({ title: '海报生成失败，请关闭后重试', icon: 'none' })
      }
    }
  })
}

/* 等 canvas 节点就绪的轮询（P2 修复，2026-10-08）。
   旧实现是裸 `setTimeout(init, 120)` 且**无次数上限、不记录 timer、无卸载守卫** ——
   同文件对「导出重试」做得很正确（retryTimer 记录 + onUnmounted 清理，注释还专门
   解释了原因），唯独这条路径在管理之外。后果：只要 canvas 节点永远拿不到
   （组件已销毁、或 canvasVisible 已因 exportFailed 变 false），就会每 120ms 发起一次
   createSelectorQuery().exec() 并**永久递归**；弹层是 v-if 挂载/卸载的，
   反复开关海报会累积多条递归链，每条都在对已销毁的组件查节点。
   现在：① 复用 retryTimer 一起清理；② 加次数上限（120ms × 20 ≈ 2.4s，
   超时按失败处理，不再无限转）；③ 卸载后不再续期。 */
const INIT_MAX_TRIES = 20
let initTries = 0
// 组件是否已销毁：定时器回调可能在卸载那一瞬间正在执行，靠它做最后一道守卫
// （必须声明在 initPoll 之前 —— 否则回调体里引用的 const/let 会落在 TDZ 里）
let destroyed = false

const init = () => {
  // 每次挂载重置状态：再次打开弹层时重新走「绘制 → 导出」全流程
  exportRetries = 0
  initTries = 0
  exportFailed.value = false
  /* 先让弹层（遮罩 + 占位块）渲染完一帧，再挂 canvas ——
     这样用户看到的第一个画面是"正在生成海报…"，而原生 canvas 是在
     弹层已经稳定之后才插入的，不存在"跟着合成动画一起闪现"的机会。
     用 nextTick + 一个大 rAF 等价的 setTimeout(0)：nextTick 只保证本次
     数据变更渲染完成，原生层插入还需要再一拍。 */
  nextTick(() => {
    if (destroyed) return
    canvasMounted.value = true
    initPoll()
  })
}

const initPoll = () => {
  const query = uni.createSelectorQuery().in(instance && instance.proxy ? instance.proxy : null)
  query
    .select('#' + canvasId)
    .fields({ node: true, size: true })
    .exec((res) => {
      if (destroyed) return
      if (!res || !res[0] || !res[0].node) {
        if (++initTries >= INIT_MAX_TRIES) {
          // 节点始终拿不到：按失败收场，给用户明确出口（而不是无声空转）
          exportFailed.value = true
          uni.showToast({ title: '海报画布初始化失败，请关闭后重试', icon: 'none' })
          return
        }
        retryTimer = setTimeout(initPoll, 120)
        return
      }
      canvasNode = res[0].node
      draw(canvasNode)
      exportPoster()
    })
}

onMounted(init)
onUnmounted(() => {
  // 清理重试定时器：弹层关闭时导出可能还在重试中，不清理会在组件销毁后
  // 继续回调已失效的 canvas 节点。
  // destroyed 标记同时兜住「定时器已触发、回调正在执行」的窗口期（P2 修复）。
  destroyed = true
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
})

const saveToAlbum = async () => {
  if (saving.value) return   // 双击守卫：saving 已是现成变量，此前只是没在入口查
  if (!posterImage.value) {
    uni.showToast({ title: '海报生成中，请稍候', icon: 'none' })
    return
  }
  /* v31：锁必须在**第一个 await 之前**置位。
   * 原来锁写在 `await ensurePrivacyAuthorize` 之后 —— 而隐私授权弹窗要等用户
   * 点「同意/拒绝」才 resolve，这中间是可重入窗口：用户连点会并发起多次
   * ensurePrivacyAuthorize，最终触发多次 saveImageToPhotosAlbum，
   * 相册里会存下好几张同样的海报。 */
  saving.value = true
  try {
    // 隐私门禁：写相册属隐私接口，走分场景授权说明（首次使用时弹出，用途文案与行为一致）
    const agreed = await ensurePrivacyAuthorize('poster')
    if (!agreed) {
      // 用户拒绝：给出明确回应而不是静默 return（否则像"点了没反应"）
      uni.showToast({ title: '已取消保存', icon: 'none' })
      saving.value = false
      return
    }
  } catch (e) {
    // 授权流程自身抛错（非用户拒绝）：必须解锁，否则按钮永久停在"保存中…"
    saving.value = false
    uni.showToast({ title: '保存失败，请重试', icon: 'none' })
    return
  }
  /* ⚠️ 解锁必须放在 complete 回调里，不能用 finally ——
   * uni.saveImageToPhotosAlbum 是**回调式** API，调用后 try 块同步结束，
   * finally 会立刻执行，导致 saving 在真正保存完成前就被置回 false：
   * 「保存中…」文案与 :disabled 守卫形同虚设，双击仍能存下多张。
   * （HEAD 旧实现就是放在 complete 里的，本次重写一度改错，已改回。） */
  uni.saveImageToPhotosAlbum({
    filePath: posterImage.value,
    success: () => uni.showToast({ title: '已保存到相册', icon: 'success' }),
    fail: (e) => {
      if (String(e.errMsg || '').includes('auth')) {
        uni.showModal({ title: '需要相册权限', content: '请在设置中允许保存到相册后重试', showCancel: false })
      } else {
        uni.showToast({ title: '保存失败', icon: 'none' })
      }
    },
    complete: () => {
      saving.value = false
    }
  })
}
</script>

<style lang="scss" scoped>
.poster-wrap {
  /* 画布绝对定位的锚点 */
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* ===== 画布离屏容器（2026-10-12 闪烁修复）=====
 *
 * 用户实锤：点「分享海报」时画面闪一下 —— 与跳转穿透是**不同的机制**：
 *   本页的画布是 **canvas 2d 原生组件**。同层渲染一旦退化（iOS 节点树不稳定 /
 *   Android 缺内核），原生组件会浮到所有普通 view 之上，且**不受 z-index 控制** ——
 *   于是「占位块 z-index:1 盖住 canvas」这个假设失效，canvas 连同它的白底
 *   在绘制/导出过程中直接闪现在弹层之上。
 *
 * 修法（与 v6.1 的 fixed:-9999px 不同，规避了「原生组件不能 fixed」的官方限制）：
 *   画布仍用 `position:absolute`（原生组件允许），但用 `top:-2000rpx` **移出可视区**，
 *   再套一层 `overflow:hidden` 的父容器把溢出部分裁掉 —— 双保险，
 *   同层渲染正常与退化两种情形下画布都不会闪现在弹层里。
 *   绘制与导出不受影响：canvasToTempFilePath 对屏外画布照常工作。
 * 占位块保持不变（生成期间显示"正在生成海报…"）。 */
.poster-canvas-offscreen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 0;              /* 不占布局高度 */
  overflow: hidden;       /* 把 -2000rpx 的画布裁掉 → 视觉上完全不可见 */
  pointer-events: none;
}
.poster-canvas {
  /* 位于离屏容器内：移出可视区（top:-2000rpx），被容器的 overflow:hidden 裁掉。
     不设任何 background / box-shadow / 圆角——带视觉样式的 canvas 2d
     会触发同层渲染退化（v6 实锤）。 */
  position: absolute;
  left: 0;
  top: -2000rpx;
}
/* 弹层里展示的是导出后的图片：普通组件，圆角/投影随便加，不会再有渲染怪象 */
/* ===== 结果区舞台（2026-10-12）=====
 * 占位块与结果图叠放在同一位置：
 *   · 占位块**在文档流里**，负责撑住 1120rpx 高度
 *   · 结果图 position:absolute 铺满，onLoad 后才淡入
 * 这样图片解码期间高度由占位块顶着，全程无"塌陷→撑开"的跳变。 */
.poster-stage {
  position: relative;
  width: 100%;
  min-height: 1120rpx;
}
.poster-img {
  display: block;
  width: 100%;
  border-radius: 16rpx;
  box-shadow: 0 4rpx 24rpx rgba(26, 26, 26, 0.08);
  /* 绝对定位覆盖在占位块之上：图片自身高度变化不影响布局 */
  position: absolute;
  top: 0;
  left: 0;
  /* z-index 必须高于占位块（占位块是 z-index:1）——
     否则交叉溶解时图片会被那层灰底压在下面。 */
  z-index: 2;
  /* 淡入：未 onLoad 前不可见。onLoad 后才加 .img-in 转为可见。
     用 opacity 而不是 v-if —— 元素一直在，只是透明度变化，
     不触发任何布局重算。 */
  opacity: 0;
  transition: opacity 0.26s ease-out;
}
/* ===== 结果图揭晓动画（2026-10-12 精修）=====
 * 设计目标：从"淡入"升级为"揭幕"——与报告页分数落定（gradeLand/scoreLand）
 * 同一种手感，因为二者语义相同：都是"等待后结果揭晓"的高光时刻。
 *
 * 三段式（克制但有仪式感，不用大位移"飘入"）：
 *   ① 淡入 + 轻微上浮（12rpx，与全站 .anim-in 的位移量一致）
 *   ② 有控制的过冲（scale 1.012，远小于报告页的 1.035 ——
 *      海报是大面积矩形，缩放幅度必须比小字号元素更保守，
 *      否则边缘会像"呼吸"一样明显）
 *   ③ 回落稳定，并用 $ease-bounce 收尾（项目已有的回弹曲线）
 *
 * 时长 0.46s：比普通入场（0.24s）长、比报告页落定（0.62s）短。
 * 理由：海报是大图，太快会显得"闪过去"，太慢会让用户等；
 * 0.46s 落在"能用余光看清它落定"的区间。
 *
 * 同时让静置时的落影稍微收一点再展开，强化"放下来"的物理感。 */
.poster-img.img-in {
  opacity: 1;
  animation: posterReveal 0.46s $ease-bounce both;
}
@keyframes posterReveal {
  0%   { opacity: 0; transform: translateY(12rpx) scale(0.985); box-shadow: 0 2rpx 12rpx rgba(26, 26, 26, 0.04); }
  62%  { opacity: 1; transform: translateY(-3rpx) scale(1.012); box-shadow: 0 8rpx 32rpx rgba(26, 26, 26, 0.10); }
  100% { opacity: 1; transform: translateY(0) scale(1);      box-shadow: 0 4rpx 24rpx rgba(26, 26, 26, 0.08); }
}
/* ===== 占位块的退场 = 交叉溶解（2026-10-12 精修）=====
 * 目标：图片浮上来的同时，灰底沉下去 —— 两层交叉过渡才是"丝滑"的关键。
 * 若占位块直接消失（v-if 移除），即使图片在淡入，底下那层突然不见
 * 仍会有"抽一下"的观感。
 *
 * ⚠️ 实现选择（重要，勿改成 <transition> 或 v-if）：
 *   微信小程序**不支持 Vue 的 <transition> 组件**（uni-app 官方限制），
 *   v-if 移除的节点也不会播退场动画。所以这里用最稳的办法：
 *   **占位块永久留在文档流里**（它同时负责撑住高度），只切换 opacity。
 *   · 零构建风险（不用 transition、不用动画钩子）
 *   · 高度全程稳定（占位块从不离开 → 绝无塌陷）
 *   · 交叉溶解自然发生（两层各自过渡 opacity）
 *   opacity:0 后加 pointer-events:none，确保它不再拦截任何交互。 */
.poster-placeholder {
  /* 高度 = 图片等比高度（300×560 = 600×1120rpx）。
     ⚠️ 这个高度**必须一直在**（见 .poster-stage 说明）：
     widthFix 图片解码前高度为 0，若占位块提前撤掉，面板会塌陷再撑开 —— 那就是闪烁。
     所以它是"永久高度占位 + 可淡出的 loading 视觉"两个职责的合体。 */
  transition: opacity 0.22s ease-out;
  /* 不透明灰底同时盖住下层的绘制画布 */
  position: relative;
  z-index: 1;
  width: 100%;
  /* 默认不透明；图片 onLoad 后 .is-done 让它淡出，与图片淡入形成交叉溶解 */
  opacity: 1;
  height: 1120rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20rpx;
  background: $paper-sunken;
  border-radius: 16rpx;
}
/* 图片已就绪 → 占位视觉淡出。
   注意：高度仍由本元素撑住（不销毁、不收缩），所以面板高度全程稳定；
   淡出后加 pointer-events:none，避免这个透明层拦截下方交互。 */
.poster-placeholder.is-done {
  opacity: 0;
  pointer-events: none;
}
/* 复用全站 loading 语言（与 loading-overlay 同源的 IP + 三点跳动） */
.poster-loading-mascot {
  width: 96rpx;
  height: 96rpx;
  animation: posterFloat 2.4s ease-in-out infinite;
}
@keyframes posterFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8rpx); }
}
.poster-loading-dots {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.poster-loading-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: $ink;
  opacity: 0.25;
  animation: posterDot 1.4s infinite ease-in-out both;
}
.poster-loading-dot:nth-child(1) { animation-delay: -0.32s; }
.poster-loading-dot:nth-child(2) { animation-delay: -0.16s; }
.poster-loading-dot:nth-child(3) { animation-delay: 0s; }
@keyframes posterDot {
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
  40%           { opacity: 1;    transform: scale(1); }
}
.poster-placeholder-text {
  font-size: 24rpx;
  color: $text-3;
}
.poster-actions {
  margin-top: 24rpx;
  width: 100%;
}
.pa-btn.save {
  background: $ink;
  color: #fff;
  /* v35：按钮 = $radius-btn，海报浮层也不例外 */
  border-radius: $radius-btn;
  font-size: 32rpx;
  font-weight: $weight-semibold;
  line-height: 2.6;
}
.pa-btn.save::after {
  border: none;
}
/* 保存中：降一档明度并禁止按压反馈，让"正在存"这件事本身成为可读状态。
   不用 spinner —— 这个操作通常 1s 内结束，加转圈反而显得卡。 */
.pa-btn.save.busy {
  background: #4A4A4A;
  color: rgba(255, 255, 255, 0.75);
}
.pa-btn.save.busy.hover-press {
  opacity: 1;
  transform: none;
}
</style>
