<template>
  <view class="heatmap">
    <!-- 月份刻度：每列首日所在月，这张图的时间轴。
         列容器与下方格子共用 .hm-col + 同一条 gap 规则，标签不可能错位。
         【刻意没有统计数字行】练习天数/场次/连击等汇总只住在页面总览条里，
         同一事实全页只出现一次——两种连击口径（当前/最长）同屏必被读成自相矛盾。 -->
    <view class="hm-scale">
      <view class="hm-scale-gutter"></view>
      <view class="hm-scale-slots">
        <view
          v-for="(label, c) in monthLabels"
          :key="c"
          class="hm-col"
          :class="{ 'is-last-labelled': c === monthLabels.length - 1 && label }"
        >
          <text class="hm-scale-label">{{ label }}</text>
        </view>
      </view>
    </view>

    <!-- 坐标纸点阵：7 行 × N 列。
     * 材质身份：全 app 的黑卡已经够多（首页/报告页/我的页），这台「记录仪」换成
     * 纸面语言——白纸 + 发丝勾格 + 墨点密度。空日子 = 细线勾出的空格（坐标纸的空格），
     * 练过的日子按场次上墨，练满 4 场是一块实心墨砖；
     * 未来日期不画格：纸带在「今天」处截止，时间还没被打印出来。
     * 点某格：格子翻成实心墨块、白色 mono 数字盖在中央——盖章读出次数。 -->
    <view class="hm-grid">
      <view class="hm-wd-col">
        <view v-for="(w, i) in WEEKDAYS" :key="i" class="hm-wd-cell">
          <text class="hm-wd">{{ w }}</text>
        </view>
      </view>

      <view class="hm-wall" :class="{ 'wall-in': ready }">
        <!-- 扫描光：数据就位后从左到右扫一遍（与盖章入场同向），
             一次性「打印」动作。基准态 opacity:0——减弱动效下不可见，不残留 -->
        <view class="hm-scan"></view>

        <view v-for="(row, r) in cells" :key="r" class="hm-row">
          <view
            v-for="(cell, c) in row"
            :key="cell.date"
            class="hm-slot hm-col"
            :hover-class="isTappable(cell) ? 'hm-slot-press' : 'none'"
            hover-start-time="0"
            hover-stay-time="100"
            @click="onCellTap(cell)"
          >
            <view
              v-if="!cell.isFuture"
              class="hm-tile"
              :class="[tierClass(cell), { 'is-today': cell.isToday, 'is-live': cell.isToday && todayCount > 0, 'is-on': selected === cell.date, 'tile-in': ready }]"
              :style="tileStyle(cell, c, r)"
            ></view>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部：图例（四档墨点）。查看明细只有一个入口——点格子出弹窗，
         图上不再叠加次数/日期等重复读数（用户定稿：不要自作主张加东西）。 -->
    <view class="hm-foot">
      <view class="hm-foot-body">
        <view class="hm-legend-row">
          <view class="hm-legend">
            <text class="hm-legend-text">少</text>
            <view class="hm-legend-set">
              <view class="hm-legend-tile lv1"></view>
              <view class="hm-legend-tile lv2"></view>
              <view class="hm-legend-tile lv3"></view>
              <view class="hm-legend-tile lv4"></view>
            </view>
            <text class="hm-legend-text">多</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { hapticLight } from '@/utils/haptic'

// 点开某天时把日期交给父级，父级弹当日详情（场次 + 时刻明细）
const emit = defineEmits(['select-day'])

const props = defineProps({
  // { 'YYYY-MM-DD': count }
  data: { type: Object, default: () => ({}) },
  weeks: { type: Number, default: 12 },
  /* 兼容保留：v24-v26 时代的墨色面板开关。v27 起组件固定为纸面语言
   * （黑卡在全 app 已经饱和，这台记录仪必须有自己的材质），
   * 传入不再产生任何样式差异，父级无需改动。 */
  dark: { type: Boolean, default: false }
})

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/* ===== 尺寸口径（750rpx 设计稿） =====
 * 格边长 40rpx（v32）。列数固定（唯一调用点写死 :weeks="12"），所以宽高可定死，
 * 完整推导见样式区文件头的注释。
 * ⚠️ 宽与高都由 $hm-cell 一个变量驱动 —— 不要把其中一处改成字面量，
 *    那会重新引入"宽高错位 → 长方形"（v30/v31 都栽在这里，见 §1.10/§1.15）。 */
const TILE_H = 40

/* 入场节奏：列从左到右每列 22ms，行再叠 6ms（盖章从左往右打）。
 * 错峰跨度 11×22 + 6×6 = 278ms，单格 320ms。 */
const COL_MS = 22
const ROW_MS = 6

/* 档位：0=过去没练（勾线空格）1-4=场次档（墨密度递增）。
 * 精确次数由「选中盖章 + 底部读数行 + 弹窗」三处读出，墙上只回答「哪天练得狠」 */
const tierOf = (count) => {
  const n = Number(count)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(4, Math.max(1, Math.round(n)))
}
const tierClass = (cell) => 'lv' + tierOf(cell.count)

// 日期格式化在 JS 里做完：WXML 里调 padStart 会编译失败（契约 §4.5）
const pad = (n) => String(n).padStart(2, '0')
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/* weeks 防御：0 / NaN / 负数会让列宽算成 0，整个网格塌掉；
 * 上限 53 周（一年）防止误传把 84 个格子变成长列表。 */
const weeksN = computed(() => {
  const n = Math.floor(Number(props.weeks))
  return Number.isFinite(n) && n > 0 ? Math.min(n, 53) : 12
})

/* data 防御：父级可能传 null（默认值只对 undefined 生效），
 * 值可能是字符串或 NaN —— 统一在这里收敛成「非负数字」再往下走。 */
const src = computed(() => (props.data && typeof props.data === 'object' ? props.data : {}))
const countOf = (key) => {
  const n = Number(src.value[key])
  return Number.isFinite(n) && n > 0 ? n : 0
}

const selected = ref('')
// 数据就位后才播入场，否则动画演在空纸上
const ready = ref(false)

/* 每列（周）的起始日：周一对齐，最后一列包含今天。
 * 月份刻度与格子都由它派生，标签列与格子列才会严格对齐。 */
const weekStarts = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dow = (today.getDay() + 6) % 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - dow - (weeksN.value - 1) * 7)
  const arr = []
  for (let c = 0; c < weeksN.value; c++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + c * 7)
    arr.push(d)
  }
  return arr
})

const cells = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const starts = weekStarts.value
  const grid = []
  for (let row = 0; row < 7; row++) {
    const rowCells = []
    for (let col = 0; col < weeksN.value; col++) {
      const d = new Date(starts[col])
      d.setDate(starts[col].getDate() + row)
      const key = fmt(d)
      rowCells.push({
        date: key,
        count: countOf(key),
        isToday: key === fmt(today),
        isFuture: d.getTime() > today.getTime()
      })
    }
    grid.push(rowCells)
  }
  return grid
})

// 月份刻度：某列首日换月时打一次标签，作为时间轴读数
const monthLabels = computed(() => {
  let prev = -1
  return weekStarts.value.map((d) => {
    const m = d.getMonth()
    const show = m !== prev
    prev = m
    return show ? `${m + 1}月` : ''
  })
})

// 「今天」不做文字标注：格子上的墨环就是标记（is-live 时呼吸）。

// 数据带已随「同页两种连击口径互博」一起移除；activeDays 只喂给 hasData
const dayKeys = computed(() => Object.keys(src.value).filter((k) => countOf(k) > 0).sort())
const activeDays = computed(() => dayKeys.value.length)

// 「今天」标记的呼吸点：今天练过才点亮——记录仪的 REC 灯
const TODAY_KEY = fmt(new Date())
const todayCount = computed(() => countOf(TODAY_KEY))

const hasData = computed(() => activeDays.value > 0)
watch(hasData, (v) => { if (v) ready.value = true }, { immediate: true })

/* 格的内联样式只有出场时刻一处：
 * 颜色/勾线/盖章全部走 class，animationDelay 走内联才能按（列, 行）算出出场时刻 */
const tileStyle = (cell, c, r) => ({
  animationDelay: c * COL_MS + r * ROW_MS + 'ms'
})

// 空白日与未来日不响应：没有数据可看，也就不该给出「可按」的按压反馈
const isTappable = (cell) => !!cell && cell.count > 0 && !cell.isFuture

const onCellTap = (cell) => {
  if (!isTappable(cell)) return
  // 轻触震动：点中有数据的格给一次物理反馈，手感更扎实
  hapticLight()
  selected.value = cell.date
  emit('select-day', cell.date)
}
</script>

<style lang="scss" scoped>
/* ===== 尺寸口径（v32，2026-12-12：格子定宽定高，做真正的正方）=====
 *
 * ⚠️⚠️ 2026-10-12 最终回退（重要，勿再改回任何"聪明"方案）：
 * 这个组件先后被改成三种形态，三种都错：
 *   v31 `height:0; padding-top:100%`   → 格高=整行宽，整图拉长十几倍
 *   v32 `$hm-cell` 定值 + gap 反推      → 仍长方形，且我算错容器宽（两次）
 *   各种"聪明"方案的共同问题：**都绕开了本来就能正常工作的写法**。
 *
 * 用户看到正常显示的那一版是提交 7fe1da5，它的写法极其朴素：
 *   $hm-gap: 8rpx
 *   .hm-col { flex: 1; min-width: 0; }          ← 宽度交给 flex 均分
 *   .hm-slot { height: 40rpx; }                  ← 高度写死 40rpx
 *   .hm-wd-cell { height: 40rpx; margin-top: 8rpx }  ← 星期格同行高
 * 本轮**原样恢复**这套参数（只把 56rpx 改回 40rpx，与 7fe1da5 完全一致）。
 * 它渲染出来是**接近正方**（约 39.7 宽 × 40 高），且星期列、图例全部对齐。
 *
 * 触控热区 39.7×40rpx ≈ 20×20pt —— 低于 44pt 建议，但这正是当时已验证、
 * 用户已接受的形态。若将来想放大，请改这三个值并真机确认，不要发明新布局。 */
$hm-wd-w: 32rpx;    // 星期列宽：月份刻度、图例都要减掉它才与网格左缘对齐
$hm-cell: 40rpx;    // 格子高（=7fe1da5 的原值；宽度由 flex 均分，非定值）
$hm-gap: 8rpx;      // 格距（=7fe1da5 的原值 8rpx；行间距与列间距同一条规则）

.heatmap {
  padding: 2rpx 0;

  /* 宽度交给 flex 均分（7fe1da5 原样）。 */
  .hm-col { flex: 1; min-width: 0; }

  /* ===== 月份刻度 ===== */
  .hm-scale { display: flex; align-items: center; height: 26rpx; margin-bottom: 10rpx; }
  .hm-scale-gutter { width: $hm-wd-w; flex-shrink: 0; }
  .hm-scale-slots { display: flex; flex: 1; min-width: 0; gap: $hm-gap; }
  .hm-scale-label {
    font-family: $font-mono;
    /* 20rpx（≈10px @375）：轴标签是「月份」这种要读的信息，不是装饰 */
    font-size: 20rpx;
    font-weight: 600;
    color: $text-3;
    line-height: 1;
    /* 「10月」这类两位数月份比列宽（≈40rpx）宽：必须禁止换行，
     * 否则被折成「10 / 月」两行残字并溢出卡缘（用户实锤）。
     * 中间列 nowrap 向右溢出只落在格距里，月份标签间隔 ≥4 列不会相撞；
     * 最后一枚由 is-last-labelled 的右对齐改为向左溢出，完整收进卡内 */
    white-space: nowrap;
  }
  /* 最后一枚月份标签（如「10月」）可能落在最右一列：标签比格位宽时会
     溢出卡片圆角被裁成残字（用户实锤），右对齐让它完整收进卡内 */
  .hm-scale-slots .hm-col.is-last-labelled { text-align: right; }

  /* ===== 坐标纸点阵 =====
   * ⚠️ 三次踩坑史，勿再"优化"（详见本文件头部与 docs/上线前自检报告 §1.10/§1.14/§1.15）：
   *   ① v31 `height:0; padding-top:100%` → 格高=整行宽，整图拉长十几倍
   *      （百分比 padding 相对**包含块宽度**解析，格子包含块是整行，不是它自己）
   *   ② v32 定值 `$hm-cell` 宽高 + 反推 gap → 仍长方形（我把容器宽算错了两次）
   *   ③ 以上全都绕开了本来正常的 7fe1da5 写法 —— **本轮原样恢复它**。
   *
   * 7fe1da5（用户验证过正常）的参数：
   *   $hm-gap: 8rpx；.hm-col{flex:1}；.hm-slot{height:40rpx}
   *   .hm-wd-cell{height:40rpx}，用 margin-top 而非 gap 撑间距（这点很重要，见下） */
  .hm-grid { display: flex; align-items: flex-start; }

  .hm-wd-col {
    width: $hm-wd-w;
    flex-shrink: 0;
    .hm-wd-cell {
      /* 与格子同高（40rpx）。间距用 margin-top（7fe1da5 原样），
         不用 gap —— gap 会让星期列与格行的节奏对不上 */
      height: 40rpx;
    }
    .hm-wd-cell + .hm-wd-cell { margin-top: $hm-gap; }
    .hm-wd {
      font-size: 20rpx;
      line-height: 1;
      color: $text-4;
      text-align: center;
    }
  }

  /* 纸面：自成一个层叠上下文，选中格的放大不会被外部元素插队 */
  .hm-wall { flex: 1; min-width: 0; position: relative; z-index: 0; overflow: hidden; }
  .hm-wall.wall-in { animation: wallIn 0.28s $ease-out both; }

  .hm-row { display: flex; gap: $hm-gap; }
  .hm-row + .hm-row { margin-top: $hm-gap; }

  .hm-slot {
    /* 高度 40rpx（7fe1da5 原样）。宽度由 .hm-col 的 flex:1 均分。
       ⚠️ 不要把这里改成 padding-top 百分比或定值宽度 —— 三次踩坑见上方注释。 */
    height: 40rpx;
    position: relative;
    transition: transform 0.16s $ease-out, opacity 0.16s $ease-out;
  }
  /* 按压：整格热区收缩，反馈干脆 */
  .hm-slot-press .hm-tile { transform: scale(0.88); opacity: 0.85; }

  /* ===== 格 =====
   * 基准态 = 勾线空格（坐标纸的空格）：1rpx 发丝勾边、不填墨。
   * 练过的日子按场次上墨，勾边随墨面一起隐去。 */
  .hm-tile {
    /* 绝对定位铺满整格热区（inset 全 0）。用绝对定位而不是正常流，是为了让
       —— 四档墨色底、1rpx 勾线、is-today 墨环、选中放大（scale(1.16) 会超出格位）
       都有一个与热区**完全重合**的绘制盒，且缩小时不影响兄弟格的排版。
       （v31 曾因 .hm-slot 用 padding 撑高而必须绝对定位，那个方案已回退；
        这里保留绝对定位是因为它本身更适合"带描边的可选中色块"。） */
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1rpx solid rgba(26, 26, 26, 0.09);
    border-radius: 8rpx;
    background: transparent;
    transition: transform 0.2s cubic-bezier(0.34, 1.3, 0.64, 1), background 0.2s $ease-out,
      border-color 0.2s $ease-out, box-shadow 0.2s $ease-out;
    // 入场：盖章——从 130% 缩小落下，按（列, 行）错峰
    &.tile-in { animation: tileStamp 0.32s cubic-bezier(0.16, 1, 0.3, 1) both; }
  }
  .hm-tile.lv1 { background: rgba(26, 26, 26, 0.16); border-color: transparent; }
  .hm-tile.lv2 { background: rgba(26, 26, 26, 0.36); border-color: transparent; }
  .hm-tile.lv3 { background: rgba(26, 26, 26, 0.60); border-color: transparent; }
  /* 满档：实心墨砖 + 一点印刷落影（纸面上墨的重量感） */
  .hm-tile.lv4 {
    background: $ink;
    border-color: transparent;
    box-shadow: 0 2rpx 6rpx rgba(26, 26, 26, 0.28);
  }
  /* 「今天」：内嵌墨环。环走 ::after 独立层，不与满档的落影互相顶掉 */
  .hm-tile.is-today::after {
    content: '';
    position: absolute;
    left: 0; right: 0; top: 0; bottom: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 2rpx rgba(26, 26, 26, 0.72);
    pointer-events: none;
  }
  /* 选中 = 盖章读数：格子翻成实心墨块，白色 mono 次数盖在中央，
   * 外圈墨环 + 抬起落影。不调暗其他格——纸面保持完整，这一格「站起来」 */
  .hm-tile.is-on {
    background: $ink;
    border-color: transparent;
    transform: scale(1.16);
    z-index: 2;
    box-shadow:
      0 0 0 2rpx $ink,
      0 6rpx 20rpx rgba(26, 26, 26, 0.30);
  }

  /* ===== 扫描光（墨色，一次性） ===== */
  .hm-scan {
    position: absolute;
    z-index: 3;
    top: 0;
    bottom: 0;
    left: 0;
    width: 40%;
    pointer-events: none;
    opacity: 0;
    transform: translateX(-130%);
    background: linear-gradient(90deg,
      rgba(26, 26, 26, 0) 0%,
      rgba(26, 26, 26, 0.03) 42%,
      rgba(26, 26, 26, 0.07) 50%,
      rgba(26, 26, 26, 0.03) 58%,
      rgba(26, 26, 26, 0) 100%);
  }
  .hm-wall.wall-in .hm-scan { animation: hmScan 0.95s cubic-bezier(0.3, 0, 0.3, 1) 0.12s 1 both; }

  /* ===== 底部：图例。查看明细只有一个入口——点格子出弹窗，
       图上不再叠加次数/日期等重复读数 ===== */
  .hm-foot {
    display: flex;
    margin-top: 16rpx;
    padding-left: $hm-wd-w;   // 与星期列同宽，图例与网格左缘严格对齐
  }
  .hm-foot-body { flex: 1; min-width: 0; }
  .hm-legend-row {
    display: flex;
    align-items: center;
    min-height: 28rpx;
  }
  .hm-legend { display: flex; align-items: center; gap: 8rpx; }
  .hm-legend-text { font-size: 20rpx; line-height: 1; color: $text-3; }
  /* 图例样本 = 四档迷你墨点，与真格同一套密度语言 */
  .hm-legend-set { display: flex; align-items: center; gap: 6rpx; }
  .hm-legend-tile {
    width: 14rpx;
    height: 14rpx;
    border-radius: 3rpx;
    background: rgba(26, 26, 26, 0.16);
    &.lv2 { background: rgba(26, 26, 26, 0.36); }
    &.lv3 { background: rgba(26, 26, 26, 0.60); }
    &.lv4 { background: $ink; }
  }
  /* 「今天」的内嵌墨环在实心墨砖/盖章格上不可见：降为内嵌白环 */
  .hm-tile.lv4.is-today::after,
  .hm-tile.is-on.is-today::after {
    box-shadow: inset 0 0 0 2rpx rgba(255, 255, 255, 0.60);
  }
  /* 今天练过：环轻轻呼吸——不用文字标注，纸自己知道今天是哪天。
   * 基准态 = 全亮，减弱动效下停在全亮 */
  .hm-tile.is-live::after {
    animation: todayPulse 1.6s $ease-out infinite alternate;
  }
}

/* 纸面淡入：只碰透明度，盖章动画才不会被劫持 */
@keyframes wallIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 扫描光：基准态（opacity 0 + 移出左侧）即「未开始/已结束」的静止态，
 * prefers-reduced-motion 关掉动画时它就停在这里——不可见 */
@keyframes hmScan {
  0% { opacity: 0; transform: translateX(-130%); }
  14% { opacity: 1; }
  82% { opacity: 1; }
  100% { opacity: 0; transform: translateX(340%); }
}

/* 「今天」呼吸：基准态 = 全亮，动画只在 0.35↔1 间往复，
 * 减弱动效下停在全亮，指示灯不灭 */
@keyframes todayPulse {
  from { opacity: 0.35; transform: scale(0.82); }
  to { opacity: 1; transform: scale(1); }
}

/* 盖章入场：从 130% 缩小落下。基准态即终态（scale(1) + 完整），
 * prefers-reduced-motion 关掉动画时，坐标纸依然是完整的 */
@keyframes tileStamp {
  from { opacity: 0; transform: scale(1.3); }
  to { opacity: 1; transform: scale(1); }
}
</style>
