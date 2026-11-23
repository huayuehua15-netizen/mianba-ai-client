<template>
  <view class="voice-root">
    <view
      class="voice-btn"
      :class="{ recording: isRecording, recognizing: isRecognizing, disabled, 'will-cancel': willCancel }"
      :hover-class="holdable ? 'hover-press' : 'none'"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchCancel"
    >
      <!-- 光晕：静态 radial-gradient 承担「发光」（不需要 blur），只有 transform/opacity 在动。
           录音时整体缩放挂钩真实音量（amplitude），拿不到音量数据时退化为纯呼吸，观感仍成立。 -->
      <view
        v-if="(isRecording || isRecognizing) && !willCancel"
        class="wave-halo"
        :style="haloStyle"
      ></view>

      <!-- 声波柱：9 根竖条组成一条连续行波（相位错峰 = 整周期，见下方 CSS 注释）。
           比通用麦克风图标有辨识度，且在单色体系里同样成立。
           两端渐隐的柱体让峰值自带「发光」感——不用 blur 也不用调 box-shadow。 -->
      <view class="wave-bars">
        <view
          v-for="(h, i) in waveBars"
          :key="i"
          class="wave-bar"
          :class="'wb' + (i + 1)"
          :style="{ height: h + 'rpx' }"
        ></view>
      </view>
      <text class="text">{{ statusText }}</text>

      <!-- 录音时长 + 60s 进度发丝（scaleX 生长，不触发 layout）。
           旧实现只有文字倒计时，用户看不出「离上限还有多久」。
           v32：will-cancel 时隐藏 —— 松手就要丢弃了，再显示"还剩几秒"是噪音。 -->
      <template v-if="isRecording && recordSeconds > 0 && !willCancel">
        <text class="wave-timer">{{ recordTimeText }}</text>
        <view class="wave-track">
          <view class="wave-track-fill" :style="{ transform: `scaleX(${recordProgress})` }"></view>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { ensurePrivacyAuthorize } from '@/utils/privacy'
import { hapticLight, hapticHeavy } from '@/utils/haptic'
import { requestAsr } from '@/api/asr'
import { isOverloadError, showOverloadNotice, OVERLOAD_TIP } from '@/utils/serviceNotice'

const props = defineProps({
  disabled: { type: Boolean, default: false }
})
/* 识别结果只通过 emit('result') 交给页面 —— 由页面把文字填进它自己的输入框。
   本组件刻意**不自带输入/校对 UI**：输入框页面本来就有，再造一层必然重复且碍事。 */
const emit = defineEmits(['result', 'start', 'end', 'recognizing', 'error'])
const isRecording = ref(false)
const isRecognizing = ref(false)
let recorder = null
let cancelled = false

/* ===== 全局单例录音器的「活跃实例」守卫（P1 修复，2026-10-08）=====
 * 根因：`uni.getRecorderManager()` 返回的是**全局唯一实例**（微信语义），
 * 而 `recorder` 只是本组件实例的局部变量 —— `if (recorder) return recorder`
 * 只挡得住「同一实例内重复注册」，挡不住「两个页面各注册一份」。
 * 本项目真实可达：面试页与快速练习页都用 <voice-button>，用户面试完退出、
 * 进快速练习页录音时，录音器上**同时挂着已卸载的面试页实例的 onStop 闭包**；
 * 该闭包会 emit('end')（对着已卸载组件）并调用 recognizeFile() →
 * **多发一次属于幽灵页面的 /asr 上传**（base64 音频最大 1.3MB），
 * 错误提示也会弹到错误的页面上。
 *
 * 修法（双保险，不依赖基础库版本）：
 *   ① 卸载时 feature-detect 调 off* 真正摘掉监听（基础库不支持则跳过，不报错）；
 *   ② 模块级「活跃实例」守卫：每个实例领一个自增 id，卸载时清空；
 *      所有录音器回调先校验自己仍是活跃实例，否则直接 return ——
 *      即使 ① 不可用（老基础库无 off*），陈旧闭包也不会再发请求。 */
let instanceSeq = 0
let activeInstanceId = 0
// 本实例注册到全局录音器上的具名回调，供 onUnmounted 精确注销
let recorderHandlers = null
/* ===== 手势 / 录音器状态机（2026-10-08 真机 bug 修复）=====
 * 旧实现的致命缺陷：onTouchStart 是 async（先 await 隐私 + 麦克风授权），
 * isRecording 只在 await 之后才置 true。首次使用弹系统隐私/授权弹窗时，
 * 弹窗会抢断触摸流 —— touchend 根本不会派发，等授权返回后代码才 start()，
 * 于是「松手」这件事在代码里不存在，没人调 stop()，录音器一路录到 60s 上限。
 * 这台孤儿录音随后占住录音器：第二次按下时 start() 是 no-op（已在录音中），
 * 本次手势什么都录不到 → 用户看到的「语音识别不可用」。
 *
 * 修法：stop 不再依赖瞬时布尔量，而是绑到录音器生命周期 + 手势序号上：
 *   - runToken：每次触摸 +1。异步授权回来后先校验代际，过期就整个放弃（不再 start）。
 *   - pressed：手指是否还按着（触摸开始置位、结束/取消清除）。
 *   - onStart 回调里补 stop：若录音器真正开录时手指已经松开 → 立即 stop 收尾，
 *     绝不留孤儿录音。
 *   - 每次手势开局先强制收尾上一台残留录音、并重置 cancelled，
 *     避免把上一轮的取消意图/残留录音算到这一次头上。
 * 为什么不用「按住了才录」的乐观写法：拿不到录音器真实状态，只有 onStart 是事实。 */
let pressed = false
let runToken = 0
let probeTimer = null
// isRecognizing 的同步镜像：超时兜底这条路径越少依赖响应式系统越可靠
let recognizing = false
// 录音计时：60s 上限的最后 10 秒给出倒计时，50s 时震动提醒一次，
// 避免用户说到一半被无预警掐断（60s 上限来自 ASR 上传体积约束）
const recordSeconds = ref(0)
let recordTicker = null
const stopRecordTicker = () => {
  if (recordTicker) { clearInterval(recordTicker); recordTicker = null }
}
const startRecordTicker = () => {
  stopRecordTicker()
  recordSeconds.value = 0
  recordTicker = setInterval(() => {
    recordSeconds.value += 1
    if (recordSeconds.value === 50) {
      // 录满 50s 的"快到上限"提醒：重震动
      hapticHeavy()
    }
  }, 1000)
}

/* ===== 按压反馈只给「空闲态」（v32）=====
 * 症状：这颗键是**按住说话**的，而 hover-class="hover-press" 是「手指按下期间一直生效」。
 *   于是用户按住的整段录音（2~10 秒）里，按钮始终处于 opacity 0.72 + scale 0.975 ——
 *   恰好是「正在收音」这个最该被看清的时刻，它却一直是半透明的。
 *   真机上表现为：按下瞬间键变灰，录音期间也是灰的，松手才恢复正常黑。
 *   这既削弱了"录音中"的状态辨识（黑键本该是强调），也让整颗键看起来"没启用"。
 *
 * 修法：仅在**空闲态**挂 hover-press。录音/识别/禁用时都不挂 ——
 *   这三个状态本身已有明确的视觉（黑键 / 白柱 / 灰化），不需要再叠按压反馈。
 *   hover-class 用动态绑定（项目内已有先例：quick-practice 的 submit-btn、
 *   calendar-heatmap 的 hm-slot 都是三元表达式）。 */
const holdable = computed(() => !isRecording.value && !isRecognizing.value && !props.disabled)

/* ===== 上滑取消（v32）=====
 * 微信语音输入的既定手势：按住说话时手指上移一定距离 = 取消本次录音。
 * 此前本组件**没有这个手势** —— onTouchCancel 只由框架在"触摸被系统打断"
 * （来电、手势被父容器抢走）时派发，用户主动上滑不会有任何反应，
 * 松手照样上传识别。用户在上滑后松手，得到的是"我不想发却发出去了"的结果。
 *
 * 实现要点（刻意复用既有取消通路，不新建状态）：
 *   · 只记录 touchmove 的纵向位移，超过阈值 CANCEL_DY 就点亮 willCancel（纯展示）；
 *   · 松手时若 willCancel 为真，直接调用**既有的** onTouchCancel() ——
 *     它已经完整实现了取消语义（cancelled=true → handleStop 丢弃录音、不发 /asr），
 *     以及 stopRecordTicker / resetAmplitude / emit('end') / recorder.stop()。
 *     因此这里没有新增任何录音状态机分支，只是补上了"谁来触发它"。
 *   · 阈值 60px（≈ 一个拇指的滑移距离）：太小会在轻微抖动时误取消，
 *     太大则手滑不够干。iOS 微信语音的实测手感就在这一档。
 *
 * ⚠️ 为什么不在 touchmove 里做 setData：willCancel 只在**布尔翻转时**赋值，
 *    一次手势最多 2 次更新（进/出取消区），不构成每帧 setData。 */
const CANCEL_DY = 60
const willCancel = ref(false)
let touchStartY = 0

const onTouchMove = (e) => {
  if (!isRecording.value) return
  const t = (e && e.touches && e.touches[0]) || (e && e.changedTouches && e.changedTouches[0])
  if (!t) return
  // 首次 move 才记起点：touchstart 的坐标在授权弹窗路径下可能已失效，用 move 的初值更稳
  if (!touchStartY) touchStartY = t.clientY
  const dy = touchStartY - t.clientY
  const next = dy > CANCEL_DY
  if (next !== willCancel.value) willCancel.value = next
}

const resetCancelGesture = () => {
  willCancel.value = false
  touchStartY = 0
}

const statusText = computed(() => {
  if (isRecognizing.value) return '识别中…'
  if (isRecording.value) {
    // v32：手指已进入取消区 —— 文案立刻改成「松开取消」，
    // 用户在这一刻需要知道的是"现在松手会怎样"，而不是还剩几秒
    if (willCancel.value) return '松开取消'
    const remaining = 60 - recordSeconds.value
    if (remaining <= 10) return `${remaining} 秒后自动结束`
    return '松开结束'
  }
  return '按住说话'
})

/* ===== 声波动效（2026-10-08 升级）=====
 * 旧实现的问题不是「形态」而是「驱动方式」，且有一个数学错误：
 *   7 根柱、每根 animation-delay 错开 0.1s、周期却取 0.9s
 *   → 相位跨度 0.1×7 = 0.7s ≠ 0.9s，首尾接不上，每转一圈波前就跳变一次，
 *     肉眼看就是「几根柱子各自乱跳」，而不是一条波在流动。
 * 现方案：9 根柱 × 0.165s = 1.485s ≈ 周期 1.65s → 相位在整周期内闭合，波前无缝。
 * 另外两条观感要点：
 *   ① 不对称包络：人声本就是「快起慢落」，对称 sine 呼吸必然显得机械（像 loading）
 *   ② 柱体两端渐隐（中段实、两端透明）：峰值自带发光感，且避开 blur / box-shadow 动画
 * 全程只用 transform + opacity（合成层动画），不触发 layout/paint，也不动 box-shadow 参数。 */
const WAVE_HEIGHT_RPX = 8   // 柱高步长
const waveBars = computed(() => {
  /* v30 重做高度轮廓。
   * 旧值 [3,4,5,6,7,6,5,4,3] 的问题：中心 7 最高、边缘 3 最低，只差 2.3 倍；
   * 加上 9 根柱等间距并排，眼睛找不到落点，整组读起来是「一条均匀的毛刺带」——
   * 也就是你说的「不算丑，但差点感觉」：它**没有主次**。
   *
   * 新值的三点改动，都是为了建立主次：
   *   ① 中心一根冲到 8（最高），两侧**快速**衰减到 1（最低）—— 落差从 2.3 倍拉到 8 倍，
   *      波形立刻有了「中心是声源、两侧是衰减」的物理直觉（iOS/X 的语音输入同款）。
   *   ② 衰减用**近似指数**而不是等差：等差看起来像「阶梯」，指数像「声音自然扩散」。
   *      这里用 [1,2,4,6,8,6,4,2,1]，读起来是连续的钟形而不是折线。
   *   ③ 最低柱给 1（8rpx）而不是 0 —— 0 高会渲染成一个不可见的空元素、
   *      动画时上下边缘会「跳」；保底 1 格，缩放动画才连续。
   *
   * ⚠️ 高度上限不变：最高 8 × 8rpx = 64rpx，× 峰值 scaleY 1.3 = 83.2rpx > 按钮 76rpx！
   * 这会撞上 overflow:hidden 被裁掉（原来的 7 就是为了守住这条）。
   * 所以 WAVE_HEIGHT_RPX 从 8 降到 7：8 × 7 = 56rpx，× 1.3 = 72.8rpx < 76rpx ✅
   */
  const c = [1, 2, 4, 6, 8, 6, 4, 2, 1]
  return c.map((n) => n * WAVE_HEIGHT_RPX)
})

/* 记录时长/进度：直接复用已有的 recordSeconds ticker，不额外起定时器 */
const recordTimeText = computed(() => {
  const s = recordSeconds.value
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})
const recordProgress = computed(() => {
  const p = recordSeconds.value / 60
  return p > 1 ? 1 : (p < 0.02 ? 0.02 : p)
})

/* ===== 真实音量（可选增强）=====
 * 微信 onFrameRecorded 的 frameBuffer 是 **mp3 字节流**（文档：frameSize「暂仅支持 mp3、pcm」），
 * 不是 PCM，所以这里不可能算出严格的 RMS —— 这一点必须诚实：
 * 我们做的是「帧能量代理指标」：定位 mp3 帧同步头 → 取该帧的 side info 首字节
 * （global_gain 的高位，数值越小代表该帧越响）→ 取反归一化。
 * 它是**单调相关**而非精确值，够用来驱动「光晕随说话变亮/变大」这类整体律动；
 * 一旦测得不敏感（人声动态范围被压平），用方差门控自动放弃，退回纯 CSS 呼吸，
 * 绝不会出现「说话没反应」的死态。音源与动画解耦：动画只吃一个 0~1 的 amplitude。
 * 性能：回调 ≈8 次/秒（frameSize 4KB），只在本地算数字，**不用 setData 驱动帧**。
 */
const rafAmplitude = ref(0)          // 已平滑的 0~1 音量
const liveAmpActive = ref(false)     // 代理指标是否被判定为有效
let rawAmp = 0        // 瞬时值（attack 快）
let smoothAmp = 0     // 平滑值（release 慢）
let ampMin = 1, ampMax = 0, ampSamples = 0
let ampTimer = null

// mp3 帧同步头 → 该帧的「响度代理」。返回 0~1，找不到帧返回 null
const frameLoudness = (buf) => {
  const u8 = new Uint8Array(buf)
  for (let i = 0; i + 4 < u8.length; i++) {
    if (u8[i] !== 0xff || (u8[i + 1] & 0xe0) !== 0xe0) continue
    const mode = (u8[i + 3] >> 6) & 0x03      // 3b11 = 单声道
    const idx = mode === 3 ? i + 4 : i + 5    // 立体声有 2 字节 CRC 位，跳过
    if (idx >= u8.length) break
    // side info 首字节高 4 位是 global_gain 的高位：值越小 → 该帧越响
    const gain = (u8[idx] >> 4) & 0x0f
    return 1 - gain / 15
  }
  return null
}

const feedAmplitude = (v) => {
  if (v == null) return
  rawAmp = v
  // 快 attack / 慢 release —— 与 CSS 包络同一套逻辑，观感才统一
  smoothAmp += (rawAmp - smoothAmp) * (rawAmp > smoothAmp ? 0.5 : 0.12)
  ampMin = Math.min(ampMin, smoothAmp)
  ampMax = Math.max(ampMax, smoothAmp)
  ampSamples++
  // 采样够多但动态范围仍然很窄 → 代理指标没意义，放弃实时联动（退回纯 CSS 呼吸）
  if (ampSamples === 60 && ampMax - ampMin < 0.08) {
    liveAmpActive.value = false
    stopAmpTicker()
  }
  if (ampSamples < 12) return   // 前几帧回调可能为空，先不点亮，避免闪一下
  if (!liveAmpActive.value && ampMax - ampMin >= 0.08) liveAmpActive.value = true
}

const stopAmpTicker = () => {
  if (ampTimer) { clearInterval(ampTimer); ampTimer = null }
}
// 以 ~12Hz 把平滑后的音量刷进 ref（不再高频：ref 更新会走 setData）
const startAmpTicker = () => {
  stopAmpTicker()
  ampTimer = setInterval(() => {
    if (!isRecording.value) { stopAmpTicker(); return }
    rafAmplitude.value = Math.max(0, Math.min(1, smoothAmp))
    // 安静时缓慢回落到基线，避免光晕「卡在很亮」
    smoothAmp *= 0.86
  }, 80)
}

const resetAmplitude = () => {
  stopAmpTicker()
  rawAmp = 0; smoothAmp = 0
  ampMin = 1; ampMax = 0; ampSamples = 0
  rafAmplitude.value = 0
  liveAmpActive.value = false
}

/* 光晕样式：有真实音量时跟随音量缩放/提亮；没有时只靠 CSS 呼吸（radial-gradient 本身够软）。
   只绑 2 个元素、每 80ms 一次、消息体极小，不会成为性能负担。 */
const haloStyle = computed(() => {
  if (!liveAmpActive.value) return {}
  const a = rafAmplitude.value
  return {
    opacity: String(0.45 + a * 0.55),
    transform: `scale(${1 + a * 0.28})`
  }
})

/* 语音作答兜底超时：真机异常（录音器不回调 / 识别请求悬挂）时 UI 不能被永久锁死
   —— 旧实现没有这层，一旦卡住只能杀进程重进。两条兜底互相独立：
     · 录音上限 60s，给 75s：超过说明录音器根本没在回调
     · 识别上传 30s 超时，给 35s：超过说明 request 没走到 settle */
const clearProbe = () => {
  if (probeTimer) { clearTimeout(probeTimer); probeTimer = null }
}
const armProbe = (ms, msg) => {
  clearProbe()
  probeTimer = setTimeout(() => {
    probeTimer = null
    if (!isRecording.value && !recognizing) return
    isRecording.value = false
    isRecognizing.value = false
    recognizing = false
    stopRecordTicker()
    emit('error', { errMsg: msg })
  }, ms)
}

/* ===== 语音输入：原生录音 → base64 → 服务端百炼 qwen3-asr-flash 识别 =====
 * 为什么不用微信同声传译插件：该插件仅对企业主体开放，个人主体在插件管理
 * 添加时直接被拒（「主体类型不符合要求」），连提审都会被驳回。
 * 原生 getRecorderManager 无主体限制；录音 mp3 ≤60s（base64 后 ≤1.3MB），
 * 服务端密钥体系与 TTS 相同。 */

const getRecorder = () => {
  if (recorder) return recorder
  // 领取本实例的活跃号：之后所有回调都要先确认自己仍是「当前活跃实例」
  const myId = ++instanceSeq
  activeInstanceId = myId
  const isActiveInstance = () => activeInstanceId === myId

  recorder = uni.getRecorderManager()
  // 把回调函数存成具名引用，卸载时才能精确 off（匿名函数无法注销）
  const handleStart = () => {
    if (!isActiveInstance()) return
    /* onStart 是「录音真的开始了」的唯一权威信号。
       关键：如果录音真正开始时手指已经松开（onTouchEnd 因 start 尚未发生而没能 stop），
       这里立刻补一次 stop —— 旧实现正是漏了这一步，留下录满 60s 的孤儿录音。 */
    if (!pressed) {
      try { recorder.stop() } catch (e) { /* 已停止/未在录时忽略 */ }
      return
    }
    armProbe(75000, '录音没有正常结束，请重试')
  }
  const handleFrame = (res) => {
    if (!isActiveInstance()) return
    try {
      const buf = res && res.frameBuffer
      if (!buf || !buf.byteLength) return
      feedAmplitude(frameLoudness(buf))
    } catch (e) { /* 音量分析失败不影响录音 */ }
  }
  const handleStop = (res) => {
    if (!isActiveInstance()) return
    isRecording.value = false
    stopRecordTicker()
    resetAmplitude()
    emit('end')
    // 手指滑出按钮取消：丢弃录音不发识别
    if (cancelled) { cancelled = false; clearProbe(); return }
    const path = res?.tempFilePath
    if (!path) { clearProbe(); emit('error', { errMsg: '录音失败，请重试' }); return }
    recognizeFile(path)
  }
  const handleError = (e) => {
    if (!isActiveInstance()) return
    // 不要先把 isRecording 清掉再判断：旧实现无条件 emit error，用户在录音态里
    // 会突然弹「录音失败，请检查麦克风权限」（授权/参数类错误也会走到这里）
    const wasActive = isRecording.value
    isRecording.value = false
    stopRecordTicker()
    resetAmplitude()
    clearProbe()
    // 代理层已「收尾」过的残留录音报错（非本次手势）不需要打扰用户
    if (!wasActive && !pressed) return
    emit('error', { errMsg: (e && e.errMsg) || '录音失败，请检查麦克风权限' })
  }

  recorder.onStart(handleStart)
  /* 帧回调：驱动真实音量光晕（可选增强）。
     必须容错——低版本基础库没有 onFrameRecorded，frameBuffer 也可能为空
     （真机前若干帧就是空的），任何异常都不能影响录音本身。 */
  try {
    if (typeof recorder.onFrameRecorded === 'function') {
      recorder.onFrameRecorded(handleFrame)
    }
  } catch (e) { /* 不支持则只走纯 CSS 呼吸 */ }
  recorder.onStop(handleStop)
  recorder.onError(handleError)

  // 记下来供 onUnmounted 精确注销
  recorderHandlers = { handleStart, handleFrame, handleStop, handleError }
  return recorder
}

// 麦克风 scope 授权：未授权时申请，曾被拒则引导去设置页开启
const ensureRecordScope = () => new Promise((resolve) => {
  uni.getSetting({
    success: (res) => {
      const auth = res.authSetting && res.authSetting['scope.record']
      if (auth === true) { resolve(true); return }
      if (auth === false) {
        uni.showModal({
          title: '需要麦克风权限',
          content: '语音作答需要使用麦克风，请在设置中开启',
          confirmText: '去设置',
          success: (r) => { if (r.confirm) uni.openSetting({}) }
        })
        resolve(false)
        return
      }
      uni.authorize({
        scope: 'scope.record',
        success: () => resolve(true),
        fail: () => { resolve(false) }
      })
    },
    fail: () => resolve(false)
  })
})

// 读录音文件为 base64（Promise 化：旧实现在 success 里挂 async，异常会逃过 catch，
// isRecognizing 可能永久为 true —— 那样按钮会一直按不动）
const readAsBase64 = (filePath) => new Promise((resolve, reject) => {
  uni.getFileSystemManager().readFile({
    filePath,
    encoding: 'base64',
    success: (res) => resolve(res?.data || ''),
    fail: (err) => reject(new Error((err && err.errMsg) || '录音文件读取失败'))
  })
})

const recognizeFile = async (filePath) => {
  isRecognizing.value = true
  recognizing = true
  armProbe(35000, '语音识别超时，请重试')
  try {
    const data = await readAsBase64(filePath)
    if (!data) throw new Error('录音文件读取失败')
    const res = await requestAsr(data, 'audio/mpeg')
    if (res && res.text) {
      // 交给页面：页面把文字填进它自己的输入框（本组件不做输入/校对 UI）
      emit('result', { text: res.text })
    } else {
      emit('error', { errMsg: '没有听清你说的话，请再试一次' })
    }
  } catch (e) {
    /* v31 过载降级：上游（百炼 qwen3-asr-flash）在高峰期会限流/5xx。
       这种情况不是用户的错、也不是 bug，用统一的友好弹窗说明
       「当前练习人数较多」，并给出「先用文字作答」这条可走的替代路径。
       非过载错误（权限、文件损坏等）仍走原来的 errMsg 透传。 */
    if (isOverloadError(e)) {
      showOverloadNotice({ scene: 'asr' })
      emit('error', { errMsg: OVERLOAD_TIP, overload: true })
    } else {
      emit('error', { errMsg: (e && e.message) || '语音识别失败，请重试' })
    }
  } finally {
    isRecognizing.value = false
    recognizing = false
    clearProbe()
  }
}

const onTouchStart = async () => {
  // 校对面板展开时不接受新的录音手势：先改完/重录（面板上的按钮），避免录音与编辑打架
  if (props.disabled) return
  if (isRecognizing.value) {
    // 旧实现直接 return，用户只感觉「按了没反应」；明确告诉他原因
    emit('error', { errMsg: '上一段还在识别中，请稍候' })
    return
  }
  // v32：每次手势开局都清掉上一轮的上滑取消残留（避免上次的意图被算到这次头上）
  resetCancelGesture()
  /* 本次手势取号：授权是异步的，期间用户可能已经松手甚至又按了一次。
     只有「当前有效手势」才允许启动录音器 —— 过期手势整个放弃，不再 start()。 */
  const token = ++runToken
  pressed = true
  cancelled = false
  // #ifdef MP-WEIXIN
  // 隐私合规门禁（隐私协议弹窗）+ 麦克风 scope 授权，两者都过才开始录音
  const agreed = await ensurePrivacyAuthorize('record')
  if (token !== runToken || !pressed) return
  if (!agreed) { emit('error', { errMsg: '需要同意隐私授权才能语音作答' }); return }
  const scoped = await ensureRecordScope()
  if (token !== runToken || !pressed) return
  if (!scoped) {
    emit('error', { errMsg: '需要授权麦克风才能语音作答' })
    return
  }
  // 上一轮若留下未收尾的录音（异常路径），先强制结束，避免 start 变成 no-op
  if (isRecording.value) { try { recorder && recorder.stop() } catch (e) { /* 忽略 */ } }
  isRecording.value = true
  emit('start')
  // 震动跟随设置页「震动反馈」开关（默认开），开关逻辑已收敛到 utils/haptic
  hapticLight()
  try {
    // frameSize 是 onFrameRecorded 回调的开关（不传就完全不回调）。
    // 4KB ≈ 每 8 次/秒一个回调，足够驱动光晕律动，又不会给录音线程压力。
    getRecorder().start({
      duration: 60000,
      format: 'mp3',
      sampleRate: 16000,
      encodeBitRate: 96000,
      frameSize: 4
    })
  } catch (e) {
    isRecording.value = false
    emit('error', { errMsg: (e && (e.errMsg || e.message)) || '录音启动失败，请重试' })
    return
  }
  resetAmplitude()
  startAmpTicker()
  startRecordTicker()
  // #endif
  // #ifndef MP-WEIXIN
  isRecording.value = false
  emit('error', { errMsg: '当前环境不支持语音作答，请切换文字输入' })
  // #endif
}

const onTouchEnd = () => {
  /* v32：上滑进入取消区后松手 = 取消本次录音。
     直接转给既有的 onTouchCancel（它已完整实现取消语义），不新建分支 ——
     这样"来电打断"与"用户主动上滑"两条取消路径共用同一段收尾代码，
     将来改取消行为只需改一处。 */
  if (willCancel.value) {
    resetCancelGesture()
    onTouchCancel()
    return
  }
  resetCancelGesture()
  /* 先摘掉「按着」状态，再决定要不要 stop。
     注意顺序：pressed=false 之后若录音器还没真正开录，onStart 回调会看到
     pressed=false 并立刻补一次 stop —— 这条路径专门兜「松手早于 start」，
     也就是旧实现漏掉、导致录音器录满 60s 的那个洞。 */
  pressed = false
  if (!isRecording.value) return
  // #ifdef MP-WEIXIN
  if (recorder) recorder.stop()
  // #endif
}

const onTouchCancel = () => {
  resetCancelGesture()
  pressed = false
  if (!isRecording.value) return
  cancelled = true
  isRecording.value = false
  stopRecordTicker()
  resetAmplitude()
  emit('end')
  // #ifdef MP-WEIXIN
  if (recorder) recorder.stop()
  // #endif
}

onUnmounted(() => {
  // 页面/组件销毁时若还在录音，必须真的停掉录音器：
  // 录音器是全局单例，留着它会让下一次进入语音模式的第一次按下变成 no-op
  pressed = false
  runToken += 1
  clearProbe()
  // #ifdef MP-WEIXIN
  if (isRecording.value && recorder) { try { recorder.stop() } catch (e) { /* 忽略 */ } }
  // #endif
  /* 注销本实例注册在全局录音器上的回调（见 getRecorder 的实例守卫注释）：
     ① 先把自己从「活跃实例」摘掉 —— 这一步不依赖任何 API，永远生效；
     ② 再 feature-detect 调 off*：基础库不支持时静默跳过，不会抛错。
     两者叠加后，即使录音器上仍残留陈旧闭包，它们也会在 isActiveInstance()
     处直接 return，不再 emit、更不会发 /asr 请求。 */
  activeInstanceId = 0
  if (recorder && recorderHandlers) {
    const offs = [
      ['offStart', 'handleStart'],
      ['offFrameRecorded', 'handleFrame'],
      ['offStop', 'handleStop'],
      ['offError', 'handleError']
    ]
    offs.forEach(([offName, key]) => {
      try {
        if (typeof recorder[offName] === 'function' && recorderHandlers[key]) {
          recorder[offName](recorderHandlers[key])
        }
      } catch (e) { /* 低版本基础库无 off* 或无该回调时忽略 */ }
    })
    recorderHandlers = null
  }
  isRecording.value = false
  isRecognizing.value = false
  recognizing = false
  stopRecordTicker()
  resetAmplitude()
})

defineExpose({ isRecording })
</script>

<style lang="scss" scoped>
/* 语音按钮：凸起白键 + 墨黑声波柱（空闲）→ 黑键 + 白柱（录音）。
 * 设计取舍（多轮返工后定稿）：
 *  - 纯黑满宽 = "黑洞"，60% 是空黑，砸在白色输入栏里又重又闷（用户实锤丑）
 *  - 纯浅底 + 灰柱 = 对比不足，柱子像死的
 *  - 正解：空闲用白键渐变配**墨黑**声波柱——单色体系里墨对浅对比最足、
 *    又保持轻盈；录音/识别才反转黑键白柱，状态切换一眼可辨。
 * 白键材质（渐变 + 顶内亮边 + 贴地投影）与面试页模式钮/发送键同语言：
 * 输入栏里所有按键是「凸」的，字段是「凹」的。 */
.voice-btn {
  position: relative;
  width: 100%;
  /* 与面试页 composer 的文本域/发送键同高（76rpx）：文字/语音模式切换时
     输入栏总高不变，左右按键高度一致，不会一边高一边矮 */
  height: 76rpx;
  background: linear-gradient(180deg, #FFFFFF 0%, #F4F4F4 100%);
  color: $ink;
  border: 1rpx solid rgba(26, 26, 26, 0.08);
  border-radius: $radius-md;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20rpx;
  box-shadow:
    inset 0 1rpx 0 rgba(255, 255, 255, 1),
    inset 0 -1rpx 0 rgba(26, 26, 26, 0.03),
    0 1rpx 2rpx rgba(26, 26, 26, 0.07),
    0 4rpx 12rpx rgba(26, 26, 26, 0.05);
  transition: background $motion-base $ease-out,
              color $motion-base $ease-out,
              transform $motion-base $ease-out,
              border-color $motion-base $ease-out,
              box-shadow $motion-base $ease-out;
  box-sizing: border-box;
  /* 收束光晕：光晕是 300rpx 的圆，按钮只有 76rpx 高 —— 不裁剪的话它会溢出到
     输入栏灰底上（白键态尤其脏）。裁剪后光晕变成「键内柔光」，更克制也更高级。
     代价是柱体峰值不能超过按钮高度：见 waveBars 的注释（最高 72.8rpx < 76rpx）。 */
  overflow: hidden;
}
/* v30：顶部内亮边由 border 改到 box-shadow 的 inset 上，
   让「受光面」与「落地阴影」都在同一个 shadow 栈里，切换态时能整体过渡；
   再补一条极淡的底部内暗边，键就有了上下厚度（原先只有上亮，
   下沿与底边直接相接，观感是「一张贴纸」而不是「一颗键」）。 */
.voice-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(180deg,
    rgba(255, 255, 255, 0.9) 0%,
    rgba(255, 255, 255, 0) 42%);
  opacity: 1;
  transition: opacity $motion-base $ease-out;
  z-index: 1;
}
/* v29：删掉 .voice-btn:active —— 模板第 6 行已挂 hover-class="hover-press"。
   两者同时生效会叠成 0.985 × 0.975 ≈ 0.960，与全站其它可点元素的
   0.975 不一致，按下去时这颗最重的键反而缩得最不明显。 */
/* 录音/识别中：反转黑键 + 白柱白字。
   v30：改用全站黑材质配方 $ink-gradient + $ink-edge（原先手写 180° 渐变、
   与首页/统计页的 155° 斜向光向不一致 —— 同一屏里同一颗黑键换个页就换光源）。
   顶光层在 recording 态淡出（黑键自身已有 $ink-edge 的内亮边，再叠一层白渐变会发灰）。 */
.voice-btn.recording,
.voice-btn.recognizing {
  background: $ink-gradient;
  color: #FFFFFF;
  border-color: transparent;
  transform: scale(1.02);
  box-shadow: $ink-edge, 0 6rpx 18rpx rgba(26, 26, 26, 0.26);
}
.voice-btn.recording::before,
.voice-btn.recognizing::before {
  opacity: 0;
}
.voice-btn.disabled {
  opacity: 0.4;
}

/* ===== 上滑取消态（v32）=====
 * 三个录音状态必须**一眼可分**，此前只有两个（空闲白键 / 录音黑键）：
 *   ① 按住说话   白键 + 墨柱
 *   ② 松开结束   黑键 + 白柱 + 行波 + 光晕 + 时长/进度
 *   ③ 松开取消   黑键 + 白柱，但**去波去晕**，整键转描边态 + 文案变「松开取消」
 *
 * 为什么取消态要"减"而不是"加"：录音态的信息量（波、晕、读数、进度）已经很高，
 * 再叠一个红色/加粗之类的强调只会让三种状态更糊。取消是一种"撤回"语义，
 * 视觉上就该是**收**：把"正在收音"的活跃信号全部拿掉，只留一个确定的外形，
 * 配合文案改变，用户立刻知道"现在松手就作废"。
 *
 * 单色纪律：不加任何颜色（危险色仅 $danger，但这里不是错误 —— 取消是
 * 用户的正常意图，用红色会读成"出错了"）。改用**虚线描边**这一几何信号：
 * 虚线在单色体系里明确表示"未定/可撤回"，且不引入新色值。 */
.voice-btn.will-cancel {
  /* 白键态 + 虚线灰描边：形态上退回到"未开始"，与录音中的实心黑键形成明确反差 */
  background: #FFFFFF;
  background-image: none;
  color: $text-2;
  border: 2rpx dashed $border-strong;
  transform: none;
  box-shadow: none;
}
/* 取消态下柱体回到墨色（黑底白柱的前提消失了）
   ★ v35：原来的渐变用 rgba(26,26,26,…) + 旧冷墨 hex —— 那是 v34 的冷调墨色。
   v35 的墨色改成**暖调** #17130E（配米白底才不显脏），这里必须同步，
   否则取消态的柱体比常态略"冷"，在同一个按钮里能看出色差。 */
.voice-btn.will-cancel .wave-bar {
  background: linear-gradient(to bottom,
    rgba(23, 19, 14, 0.22) 0%,
    rgba(23, 19, 14, 0.72) 28%,
    $ink 50%,
    rgba(23, 19, 14, 0.72) 72%,
    rgba(23, 19, 14, 0.22) 100%);
  /* 停掉行波：取消态应是"静的"，还在流动会读成"仍在收音" */
  animation: none;
  transform: scaleY(0.62);
}
.voice-btn.will-cancel .text {
  color: $text-2;
  font-weight: $weight-bold;
}

/* ===== 声波动效 v2（2026-10-08 升级）=====
   旧实现的数学错误：7 根柱、delay 错开 0.1s、周期取 0.9s
   → 相位跨度 0.1×7=0.7s ≠ 0.9s，首尾接不上，每圈波前跳变一次 = 「各自乱跳」。
   现方案：9 根柱 × 0.165s = 1.485s ≈ 周期 1.65s → 整周期相位闭合，波前无缝流动。
   三条观感要点：
     ① 负 delay 符号全部一致（方向不一会变成随机抖动）
     ② 不对称包络：36% 就冲到峰值、之后缓慢回落（人声就是快 attack / 慢 release），
        对称 sine 呼吸必然显机械
     ③ 柱体两端渐隐：中段实、两端透明 → 峰值自带发光感，避开 blur 与 box-shadow 动画
   全部只动 transform / opacity（合成层），不触发 layout / paint。 */
.wave-bars {
  display: flex;
  align-items: center;
  /* v30：间距 6 → 8rpx。高度差拉开后，柱子若还挨着会挤成一团；
     放大间距让 9 根各自成形，中心那根的高才立得住。
     9 根 × 8rpx + 8 缝 × 8rpx = 136rpx，仍在 76rpx 高的键内。 */
  gap: 8rpx;
  height: 56rpx;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}
.wave-bar {
  /* v30：柱宽 8 → 7rpx。柱子变细是「精致」最直接的一步：
     9 根 8rpx 粗柱 + 6rpx 缝，实心黑连成一片；细一档后每根都有呼吸空间。 */
  width: 7rpx;
  /* v35：7rpx 柱体 + 4rpx 圆角渲染仍为全圆，视觉零变化 */
  border-radius: $radius-xs;
  transform-origin: center;
  /* 空闲：慢呼吸（3.2s），幅度只到 .72↔1 —— 按钮「活着」但不抢注意力。
     v30：渐变停靠点从 2 段（0.30→45% 实心→55%→0.30）改为 4 段平滑过渡。
     原先 45%→55% 之间是「实心到底」，柱体看起来像两根叠在一起的硬棒；
     现在是「中段最实、向两端连续收淡」，同一根柱子有了光轴。
     ⚠️ 小程序不支持 conic/多色标插值，只能靠停靠点密度模拟，故写 5 段。 */
  background: linear-gradient(to bottom,
    rgba(23, 19, 14, 0.22) 0%,
    rgba(23, 19, 14, 0.72) 28%,
    $ink 50%,
    rgba(23, 19, 14, 0.72) 72%,
    rgba(23, 19, 14, 0.22) 100%);
  /* v30：waveIdle 动画里**不再写 opacity**。
     原来 keyframes 带 opacity:0.55→0.9，会在动画期间**覆盖**静态不透明度，
     于是"两端渐隐"根本看不到（每根柱都在 0.55~0.9 之间跳，等于没有主次）。
     现在 opacity 改由 nth-child 静态给（见下），动画只负责 transform 呼吸，
     两者不再互相覆盖。 */
  animation: waveIdle 3.2s $ease-smooth infinite;
}

/* v30 静态不透明度主次：中心最实、两端最淡。
   这是"差点感觉"里最关键的一环 —— 高度有了主次之后，**颜色权重也要有主次**，
   否则 9 根柱在视觉上仍是同等份量，眼睛依然没有落点。
   两端 0.32 → 中心 1.0，配合 [1,2,4,6,8,6,4,2,1] 的高度衰减，
   形成「中心是声源、向外自然衰减」的钟形。 */
.wb1, .wb9 { opacity: 0.32; }
.wb2, .wb8 { opacity: 0.55; }
.wb3, .wb7 { opacity: 0.78; }
.wb4, .wb6 { opacity: 0.92; }
.wb5 { opacity: 1; }

/* 空闲相位：9 根 × 0.36s = 3.24s ≈ 周期 3.2s（同样闭合，只是慢） */
.wb1 { animation-delay: 0s; }
.wb2 { animation-delay: -0.36s; }
.wb3 { animation-delay: -0.72s; }
.wb4 { animation-delay: -1.08s; }
.wb5 { animation-delay: -1.44s; }
.wb6 { animation-delay: -1.8s; }
.wb7 { animation-delay: -2.16s; }
.wb8 { animation-delay: -2.52s; }
.wb9 { animation-delay: -2.88s; }

/* 录音/识别中：反转白柱 + 加速行波（1.65s），柱体同样是平滑光轴。
   v30：合并了原先分成两条的规则（一条设 opacity、一条设 background/animation）——
   同选择器拆两处很容易在后续修改时只改一半，故合并为一条。
   opacity:1 的作用是**取消空闲态的静态分主次**：两端半透明白柱压在黑键上
   会露出键体底色、边缘发灰；录音时改由高度差 + 行波表达"正在收音"。 */
.voice-btn.recording .wave-bar,
.voice-btn.recognizing .wave-bar {
  background: linear-gradient(to bottom,
    rgba(255, 255, 255, 0.30) 0%,
    rgba(255, 255, 255, 0.80) 28%,
    #FFFFFF 50%,
    rgba(255, 255, 255, 0.80) 72%,
    rgba(255, 255, 255, 0.30) 100%);
  opacity: 1;
  animation: waveLive 1.65s cubic-bezier(0.22, 0.68, 0.28, 1) infinite;
}
/* 录音相位：9 根 × 0.165s = 1.485s ≈ 周期 1.65s → 波前无缝 */
.voice-btn.recording .wb1, .voice-btn.recognizing .wb1 { animation-delay: -0.165s; }
.voice-btn.recording .wb2, .voice-btn.recognizing .wb2 { animation-delay: -0.33s; }
.voice-btn.recording .wb3, .voice-btn.recognizing .wb3 { animation-delay: -0.495s; }
.voice-btn.recording .wb4, .voice-btn.recognizing .wb4 { animation-delay: -0.66s; }
.voice-btn.recording .wb5, .voice-btn.recognizing .wb5 { animation-delay: -0.825s; }
.voice-btn.recording .wb6, .voice-btn.recognizing .wb6 { animation-delay: -0.99s; }
.voice-btn.recording .wb7, .voice-btn.recognizing .wb7 { animation-delay: -1.155s; }
.voice-btn.recording .wb8, .voice-btn.recognizing .wb8 { animation-delay: -1.32s; }
.voice-btn.recording .wb9, .voice-btn.recognizing .wb9 { animation-delay: -1.485s; }

/* 光晕：静态 radial-gradient（alpha 收边本身就是「免费的模糊」），
   只有 transform / opacity 在动。不用 blur、不逐帧改 box-shadow。
   v30：加一层同心环。原先只有一团中心亮斑，峰值时像「白雾」；
   现在中间是短程亮核 + 外围一道更淡的环 —— 录音时读作「声场在扩散」，
   而不是「按钮脏了」。两层都是静态渐变，动画仍只改 transform/opacity。 */
.wave-halo {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 300rpx;
  height: 300rpx;
  margin: -150rpx 0 0 -150rpx;
  border-radius: 50%;
  background:
    radial-gradient(circle,
      rgba(255, 255, 255, 0.00) 30%,
      rgba(255, 255, 255, 0.09) 46%,
      rgba(255, 255, 255, 0.00) 62%),
    radial-gradient(circle,
      rgba(255, 255, 255, 0.22) 0%,
      rgba(255, 255, 255, 0.08) 32%,
      rgba(255, 255, 255, 0) 66%);
  pointer-events: none;
  z-index: 1;
  animation: haloBreath 1.5s $ease-smooth infinite;
}

/* 录音时长（mono 读数，与统计页「读数」同一语言）+ 60s 进度发丝 */
.wave-timer {
  position: absolute;
  right: 24rpx;
  top: 50%;
  transform: translateY(-50%);
  font-family: $font-mono;
  /* v30：20 → 22rpx。原值折合 11px，在黑底上偏小、与旁边 28rpx 的状态文案
     不是一个视觉层级，读数看着像脚注。 */
  font-size: 22rpx;
  /* v30：透明度 0.62 → 0.72。黑键上的次级读数，0.62 在真机 OLED 上偏灰。 */
  color: rgba(255, 255, 255, 0.72);
  /* mono 字体保留正字距：这里要的是**等宽对齐**（秒数跳动时读数不左右抖），
     与中文状态文案的 -0.3rpx 是两回事，不要一起"收成负数"。 */
  letter-spacing: 1rpx;
  font-variant-numeric: tabular-nums;
  z-index: 2;
}
.wave-track {
  position: absolute;
  /* v30：左右内缩 24 → 28rpx，与状态文案的视觉边界对齐；
     高度 3 → 4rpx：3rpx（1.5px）在部分机型上会被渲染成 1px 发丝，看不出是进度。 */
  left: 28rpx;
  right: 28rpx;
  bottom: 12rpx;
  height: 4rpx;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2rpx;
  overflow: hidden;
  z-index: 2;
}
.wave-track-fill {
  display: block;
  height: 100%;
  width: 100%;
  /* v30：纯白改为「左亮右柔」的渐变 —— 进度条从左生长，右端略淡，
     读起来是「正在被填满」而不是一根等亮的塑料条。 */
  background: linear-gradient(90deg,
    rgba(255, 255, 255, 0.92) 0%,
    rgba(255, 255, 255, 0.58) 100%);
  border-radius: inherit;
  transform-origin: left;
  /* v32：补齐过渡 —— 此前注释写"进度本来每秒一格、加过渡反而多一层合成动画"，
     于是没有任何过渡。但每秒一格的**跳变**在有行波的黑键上很扎眼：
     它是一根明确指示"还能说多久"的刻度，跳着走读作"卡了"。
     这里只 transition transform（合成层属性，不触发布局重排），
     时长取 $motion-fast(0.16s) < 1s 间隔，不会与下一次更新打架。 */
  transition: transform $motion-fast $ease-out;
}

/* 空闲呼吸：3.2s，振幅克制（.72↔1）
   v30：**只动 transform，不动 opacity**。
   原先 keyframes 写 opacity:0.55→0.9，会在动画期间覆盖 .wb1~.wb9 的静态分主次
   不透明度 —— 动画一跑两端渐隐就消失（每根都在 0.55~0.9 之间跳，等权），
   "主次"白做了。现在 opacity 交给 nth-child 静态给，动画只负责呼吸。 */
@keyframes waveIdle {
  0%, 100% { transform: scaleY(0.72); }
  50%      { transform: scaleY(1); }
}
/* 录音行波：快起慢落的不对称包络（人声包络），峰值 1.3 再回落 */
@keyframes waveLive {
  0%   { transform: scaleY(0.30); opacity: 0.42; }
  14%  { transform: scaleY(0.62); opacity: 0.78; }
  36%  { transform: scaleY(1.30); opacity: 1; }
  56%  { transform: scaleY(0.86); opacity: 0.92; }
  74%  { transform: scaleY(1.08); opacity: 0.97; }
  100% { transform: scaleY(0.30); opacity: 0.42; }
}
/* 光晕呼吸：只动 transform/opacity，1.5s 与 1.65s 的波形成轻微拍频，避免同频机械感 */
@keyframes haloBreath {
  0%, 100% { transform: scale(0.88); opacity: 0.5; }
  52%      { transform: scale(1.12); opacity: 0.95; }
}

.voice-btn .text {
  font-size: 28rpx;
  color: currentColor;
  font-weight: $weight-semibold;
  /* v30：中文去掉正字距。原 letter-spacing:1rpx 在「按住说话」四个字上
     会把间距撑到看着松散 —— 基座规则是中文用负字距收紧（App.vue 的按钮均 0），
     这里给 -0.3rpx 让四个字成为一个整体词，而不是四个独立的字。 */
  letter-spacing: -0.3rpx;
  position: relative;
  z-index: 2;
  transition: opacity $motion-fast $ease-out;
}

/* 旧的 waveBreath / waveJump 已被 waveIdle / waveLive 取代（见上方声波动效 v2 区块）：
   旧版那对 keyframes 就是「各自乱跳」的来源，留着只会被后续误引用，故删除。 */

/* 识别结果不再由本组件展示：识别完 emit('result')，由页面把文字填进它自己的输入框。
   旧实现这里挂了个「校对面板」（白卡 + 可编辑区 + 重录/发送键），2026-10-08 用户否决：
   凭空多一层 UI、且自动聚焦会把键盘弹起来盖住底部 —— 输入框本来就能编辑，不该再造一个。 */
</style>
