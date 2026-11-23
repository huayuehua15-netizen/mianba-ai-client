<template>
  <!-- 布局：根节点 100vh 正常流 + flex 三段（顶栏 / 对话 / 输入托盘），
       高度全自动分配，顶栏或输入托盘变高时对话区自适应，互不遮挡。
       进度条宽度沿用预定义类 w1~w20；状态栏高度与胶囊避让由 JS 实测后经 :style 注入。

       ⚠️ v35 只改视觉：所有 @click / v-if / v-for 的表达式与改版前逐一对应，
       脚本段（setup）一行未动。 -->
  <view class="exam-page">
    <!-- ===== 顶部：考试仪表条 =====
         改版前这里有一个真实缺陷：「结束」按钮与岗位标题重叠。
         根因是 .nav-bar 没写 justify-content（默认 flex-start，结束紧跟返回键），
         而标题层是 absolute 满宽居中 —— 两者必然压在一起。
         v35 把标题放回**正常流**（flex:1 + min-width:0 + 单行省略），
         结束靠右，结构上就不可能再重叠。 -->
    <view class="exam-bar" :style="topBarStyle">
      <view class="exam-nav" :style="navBarStyle">
        <view class="back-tile" hover-class="hover-press" @click="handleBack">
          <image class="back-icon" :src="ICONS['arrow-left']" mode="aspectFit" />
        </view>
        <view class="nav-text">
          <text class="nav-eyebrow">INTERVIEW · 面试进行中</text>
          <text class="nav-title">{{ interviewStore.config?.position_name || '面试中' }}</text>
        </view>
        <view
          class="end-btn"
          hover-class="end-btn-press"
          hover-stay-time="120"
          @click="handleEndInterview"
        >
          <text class="end-label">结束</text>
        </view>
      </view>

      <!-- 仪器读数行：巨号轮次读数（72rpx 等宽）与微型等宽标签（18rpx）同屏，
           这是 v35 的「比例张力」—— 印刷品的张力来自比例差，不来自字号数量。 -->
      <view class="exam-meter">
        <view class="meter-readout">
          <text class="meter-cur">{{ interviewStore.currentRound }}</text>
          <text class="meter-sep">/</text>
          <text class="meter-total">{{ interviewStore.config?.total_rounds || 8 }}</text>
          <text class="meter-cap">ROUND</text>
        </view>
        <!-- 右侧读数栈：状态 + 模式 + 计时（计时显示开关仍由配置页 timer_enabled 决定，
             语义未变，只是从输入托盘挪进仪表条 —— 读数就该和读数待在一起）。 -->
        <view class="meter-tail">
          <view class="status-row">
            <view class="status-mark" :class="statusClass"></view>
            <text class="status-text">{{ statusText }}</text>
            <view v-if="interviewStore.config?.timer_enabled && timer > 0" class="timer-chip">
              <text class="timer-dot"></text>
              <text class="timer-text">{{ formatTime(timer) }}</text>
            </view>
          </view>
          <text class="meter-sub">MODE · {{ interviewStore.answerMode === 'text' ? '文字作答' : '语音作答' }}</text>
        </view>
      </view>

      <!-- 进度轨：压印凹槽 + 刻度。刻度用 repeating-linear-gradient 画（零 DOM、可缩放），
           压在填充之上，读作「仪表刻度」而不是「进度条控件」。 -->
      <view class="meter-track">
        <view class="progress-fill" :class="'w' + clampRound"></view>
        <view class="meter-ticks"></view>
      </view>

      <!-- 齿孔撕线：仪表条是从考卷上撕下来的一联 -->
      <view class="bar-perf"></view>
    </view>

    <!-- ===== 对话区：纸面 ===== -->
    <!-- scroll-with-animation 绑定「是否正在打字」：
         打字时每 4 拍（128ms）就要重定位一次气泡底部，而微信的平滑滚动
         动画固定 300ms —— 等于每 128ms 打断并重启一次 300ms 的动画，
         滚动永远追不上，肉眼可见地顿挫抖动。
         所以打字期间关掉动画（瞬时定位反而跟手），演完后由 stopTyping
         补一次平滑滚动，让气泡稳稳落在底部。
         throttle 保持 true（默认 16ms）：v32 起本页有了 @scroll 监听
         （用于判断「用户是否已自行上滑」），但该处理器只写普通变量、
         仅在布尔翻转时才写 ref，16ms 节流足以吞掉合成滚动的高频事件，
         又不会让"滚出底部"的判定延迟可观。 -->
    <scroll-view
      scroll-y
      class="chat-area"
      :scroll-into-view="scrollToId"
      :scroll-with-animation="!typingKeyReactive"
      :throttle="true"
      @scroll="onChatScroll"
    >
      <view v-if="interviewStore.rounds.length === 0 && !interviewStore.isLoading" class="empty-state">
        <image class="empty-mascot" src="/static/ip_mianba_smile.png" mode="aspectFit" />
        <!-- 恢复失败（v24）：给明确出口，而不是停在「正在准备开场白...」假加载态 -->
        <template v-if="resumeFailed">
          <text class="empty-title">这场面试没能恢复</text>
          <text class="empty-tip">会话可能已在别处结束，或网络暂时不可用</text>
          <view class="empty-actions">
            <view class="btn btn-primary btn-sm empty-btn" hover-class="hover-press" @click="goToConfigFromFail">重新开始一场</view>
            <view class="btn btn-outline btn-sm empty-btn" hover-class="hover-press" @click="goHomeFromFail">返回首页</view>
          </view>
        </template>
        <template v-else>
          <text class="empty-title">准备开始</text>
          <text class="empty-tip">面霸君正在准备开场白...</text>
        </template>
      </view>

      <!-- AI 免责声明：置顶常驻，回答由大模型实时生成，仅供模拟练习参考。
           v35 改成「纸边注脚」：虚线立边 + 小字，像印在页边的一行脚注 ——
           合规标识必须真正可读，但不该在视觉上抢走题面。 -->
      <view class="ai-disclaimer">
        <view class="disclaimer-rule"></view>
        <text class="disclaimer-text">AI 模拟面试 · 以上回复与评分由 AI 生成，仅供学习参考，不构成任何官方录用依据</text>
      </view>

      <view
        v-for="(round, idx) in interviewStore.rounds"
        :key="idx"
        :id="'round-' + idx"
        class="round-block"
      >
        <!-- ===== 面试官批注（主问题）=====
             不是聊天气泡：它是**批注纸**上的一段红笔提问。
             构成：等宽题号 Q1（朱砂）+ 头像署名 + 题型标签 + 一条通到右边缘的发丝线，
             正文左侧是一条上深下浅的朱砂批注线。
             首题（idx===0 且页面刚进入）已在打字机逐字揭示，不再叠加位移淡入，
             否则从配置页跳进来会「闪一下」；后续新题才播入场动画。 -->
        <view class="q-note" :class="{ 'no-anim': idx === 0 && isFirstQuestionTyping }">
          <view class="note-head">
            <text class="note-no">Q{{ idx + 1 }}</text>
            <image class="note-mascot" src="/static/ip_mianba_smile.png" mode="aspectFit" />
            <text class="note-name">面霸君</text>
            <text class="note-type" v-if="round.questionType && round.questionType !== '专业知识'">{{ round.questionType }}</text>
            <view class="note-line"></view>
          </view>
          <view class="note-body">
            <view class="q-content" :class="['fs-' + fontSize, { 'is-typing': isTyping('r' + (idx + 1)) }]">
              <text>{{ typedText('r' + (idx + 1), round.question) }}</text>
              <!-- 打字光标（v32）：.q-content.is-typing::after 的零宽竖线，
                   不再是追加在字尾的行内文字节点。
                   旧实现把 «▍» 当 inline text 拼在最后 —— 它**占用排版宽度**：
                   一行刚好填满时，光标被挤到下一行 → 气泡当场高出一行；下一字进来后
                   文字重排、光标又缩回上一行 → 气泡再缩回去。于是**每到一个换行点，
                   气泡就「长一下、缩回去」抖一次**，滚动条随之跳动（流式文字最常见的抖动源）。
                   零宽伪元素（width:0 + border-right）保留墨线视觉，layout 宽度恒为 0，
                   气泡高度只随文字单调增长，不再回跳。 -->
            </view>
            <view class="note-actions" v-if="showAudio">
              <!-- v32 bug 修复：paused 必须**同时**要求"这一条正是当前播报条"。
                   旧写法 `paused: audioPaused` 只判断全局暂停标记 ——
                   整个页面有 N 条播报胶囊（每道题 + 每条追问各一枚），
                   只要当前那条被暂停，**所有**胶囊都会被挂上 .paused（描边加深），
                   看起来像是"每一条都在暂停状态"。多句并发/长对话时尤其明显。
                   现在改为 playingTag === 本条 && audioPaused，与 playing 同源判定。 -->
              <view class="tts-pill" :class="{ playing: playingTag === 'q' + idx, paused: playingTag === 'q' + idx && audioPaused, played: isPlayed('q' + idx) }" hover-class="hover-press" @click="playQuestion(round.question, 'q' + idx)">
                <!-- v28：播报中/暂停两态用 morph-icon 播放 播放↔暂停 的变形帧；
                     空闲态（还没点过）仍是静态灰喇叭，不参与变形。
                     两态图标颜色相反（黑材质底上白图标 / 白底上黑图标），
                     故用 frames + frames-alt 双序列 + 透明度交叉淡入。 -->
                <morph-icon
                  v-if="playingTag === 'q' + idx"
                  class="tts-pill-icon"
                  frames="play-pause"
                  frames-alt="play-pause-white"
                  :active="!audioPaused"
                  :fallback="ICONS['play']"
                  :fallback-alt="ICONS['pause-white']"
                />
                <image v-else class="tts-pill-icon" :src="ICONS['volume-deep']" mode="aspectFit" />
                <text class="tts-pill-text">{{ ttsPillText('q' + idx) }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- ===== 你的答题纸（用户回答）=====
             v35 把墨色实心泡换成**纸上的答题格**：浅凹槽 + 压印，抬头一条虚线写「你的回答 / 用时」。
             为什么改掉黑泡：一屏里出现两块深色实体会让"墨"失去专属性；
             而且长回答白字压黑底，是这一页读起来最累的地方。 -->
        <view class="a-sheet" v-if="round.userAnswer">
          <view class="sheet-head">
            <view class="sheet-tag">
              <view class="tag-dot"></view>
              <text class="tag-text">你的回答</text>
            </view>
            <text class="sheet-meta" v-if="round.answerDuration">
              <text class="meta-cap">用时</text>
              <text class="meta-num">{{ round.answerDuration }}</text>
              <text class="meta-cap">秒</text>
            </text>
          </view>
          <view class="a-content" :class="'fs-' + fontSize">
            <text>{{ round.userAnswer }}</text>
          </view>
        </view>

        <!-- 本轮 AI 点评：让「AI 刚听完我的回答、给出了判断」变成看得见的事。
             v35 做成**批改章**：朱砂方章压住分数，右侧一句点评。 -->
        <view class="fb" v-if="round.userAnswer && hasRoundFeedback(round)">
          <view class="fb-badge" v-if="roundAvg(round)">
            <text class="fb-score">{{ roundAvg(round) }}</text>
            <text class="fb-max">/10</text>
          </view>
          <view class="fb-body">
            <text class="fb-label">AI 点评</text>
            <text class="fb-text" v-if="round.roundComment">{{ round.roundComment }}</text>
          </view>
        </view>

        <!-- 追问列表 -->
        <template v-for="(fu, fIdx) in round.followUps" :key="'fu-' + fIdx">
          <!-- v32：追问加 .is-follow —— 此前追问与主问题长得**完全一样**，
               唯一的区别是 meta 行里那枚「追问 1/2」小标签（19rpx 灰底）。
               滚动浏览时那一行很容易被跳过，于是「这题为什么又问一遍」的困惑
               常出现在连续追问里。现在用三个层次一起说明"这是同一条追问链"：
                 · 署名头像缩一档并降透明度（发言人仍是同一个，但退为次要）
                 · 批注线改浅（主问题 0.58→0.16，追问 0.34→0.10）
                 · 整体左缩 24rpx（"从属于上一题"的空间语义）
               不做背景块/不做卡片 —— 本页语法是"纸面批注"，加底色会造出
               第三种容器层级，与设计系统的「层次只靠描边或浅填充」相冲突。 -->
          <view class="q-note is-follow">
            <view class="note-head">
              <text class="note-no">Q{{ idx + 1 }}·{{ fIdx + 1 }}</text>
              <image class="note-mascot" src="/static/ip_mianba_smile.png" mode="aspectFit" />
              <text class="note-name">面霸君</text>
              <text class="follow-tag">追问 {{ fIdx + 1 }}/2</text>
              <view class="note-line"></view>
            </view>
            <view class="note-body">
              <view class="q-content" :class="['fs-' + fontSize, { 'is-typing': isTyping(`r${idx + 1}-fu${fIdx + 1}`) }]">
                <text>{{ typedText(`r${idx + 1}-fu${fIdx + 1}`, fu.question) }}</text>
              </view>
              <view class="note-actions" v-if="showAudio">
                <view class="tts-pill" :class="{ playing: playingTag === 'q' + idx + '-fu' + fIdx, paused: playingTag === 'q' + idx + '-fu' + fIdx && audioPaused, played: isPlayed('q' + idx + '-fu' + fIdx) }" hover-class="hover-press" @click="playQuestion(fu.question, 'q' + idx + '-fu' + fIdx)">
                  <!-- 与主问题同款：播报中/暂停两态走 morph-icon 变形，空闲态保持静态灰喇叭 -->
                  <morph-icon
                    v-if="playingTag === 'q' + idx + '-fu' + fIdx"
                    class="tts-pill-icon"
                    frames="play-pause"
                    frames-alt="play-pause-white"
                    :active="!audioPaused"
                    :fallback="ICONS['play']"
                    :fallback-alt="ICONS['pause-white']"
                  />
                  <image v-else class="tts-pill-icon" :src="ICONS['volume-deep']" mode="aspectFit" />
                  <text class="tts-pill-text">{{ ttsPillText('q' + idx + '-fu' + fIdx) }}</text>
                </view>
              </view>
            </view>
          </view>
          <view class="a-sheet" v-if="fu.userAnswer">
            <view class="sheet-head">
              <view class="sheet-tag">
                <view class="tag-dot"></view>
                <text class="tag-text">你的回答</text>
              </view>
            </view>
            <view class="a-content" :class="'fs-' + fontSize">
              <text>{{ fu.userAnswer }}</text>
            </view>
          </view>
          <!-- 追问的 AI 点评：与主回答同一语言 -->
          <view class="fb" v-if="fu.userAnswer && hasRoundFeedback(fu)">
            <view class="fb-badge" v-if="roundAvg(fu)">
              <text class="fb-score">{{ roundAvg(fu) }}</text>
              <text class="fb-max">/10</text>
            </view>
            <view class="fb-body">
              <text class="fb-label">AI 点评</text>
              <text class="fb-text" v-if="fu.roundComment">{{ fu.roundComment }}</text>
            </view>
          </view>
        </template>

        <!-- 面试收尾：AI 的结束语（同款批注样式） -->
        <view class="q-note is-ending" v-if="round.endingRemark">
          <view class="note-head">
            <text class="note-no">END</text>
            <image class="note-mascot" src="/static/ip_mianba_smile.png" mode="aspectFit" />
            <text class="note-name">面霸君</text>
            <view class="note-line"></view>
          </view>
          <view class="note-body">
            <view class="q-content" :class="['fs-' + fontSize, { 'is-typing': isTyping(`r${idx + 1}-end`) }]">
              <text>{{ typedText(`r${idx + 1}-end`, round.endingRemark) }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- AI思考中（v32）：文案随时长三档递进（见 thinkingText），
           长等待补一行安抚副行；三点波浪节奏放慢到 1.4s（原 1.4s 但
           关键帧分布偏"急"，改为整周期内缓起缓落，读作"在想"而不是"在转"） -->
      <view v-if="interviewStore.isLoading" class="thinking-bubble">
        <view class="thinking-dots">
          <view class="dot"></view>
          <view class="dot"></view>
          <view class="dot"></view>
        </view>
        <view class="thinking-body">
          <text class="thinking-text">{{ thinkingText }}</text>
          <text class="thinking-hint" v-if="thinkingHint">{{ thinkingHint }}</text>
        </view>
      </view>

      <view id="chat-bottom" style="height: 1rpx;"></view>
    </scroll-view>

    <!-- ===== 输入托盘：压印槽（v35 圆角收敛，禁止胶囊）===== -->
    <view class="input-area">
      <!-- 回到底部（v32）：用户向上翻阅历史时自动跟随让位，由这枚浮标给他出口。
           为什么需要它：长对话里用户上滑重读上一题后，新消息仍在到达；若不给按钮，
           用户只能自己一路划回去（且分不清"现在到底是不是最新"）。
           ⚠️ 定位：挂在 .input-area 内部（该容器 position:relative + z-index:10），
           bottom:100% 让它正好**贴在输入托盘上方**，随托盘高度（键盘弹起）自动跟着走 ——
           若改成相对整页 bottom 定值，托盘一变高就会被压住。
           形态：白底 + 发丝描边 + 小圆角，热区 88rpx=44pt；进出走 fadeIn（不位移），
           避免与滚动的像素抢注意力。 -->
      <view v-if="chatDetached" class="back-to-bottom" hover-class="hover-press" @click="backToBottom">
        <image class="back-to-bottom-icon" :src="ICONS['chevron-down-gray']" mode="aspectFit" />
        <text class="back-to-bottom-text">回到最新</text>
      </view>

      <!-- 槽头：微型等宽标签 + 模式提示。压印槽必须「有抬头」，否则只是一块灰底 -->
      <view class="composer-cap">
        <text class="cap-label">ANSWER</text>
        <text class="cap-hint">{{ interviewStore.answerMode === 'text' ? '写下你的回答' : '按住说话 · 松手识别' }}</text>
      </view>

      <!-- 统一输入条：压印槽内排 模式钮 + 输入/语音 + 发送键。
           关键：input 必须用 <view> 包一层，否则微信小程序原生 input 在 flex 容器里会换行独占一行 -->
      <view class="composer" :class="{ focused: inputFocused }">
        <!-- 模式切换：朱砂描边的圆形钮（朱砂 = "录音/言语"这一语义色），点击在 语音↔文字 之间切；
             AI 处理期间禁用防误触。
             v28：改用 morph-icon —— 话筒↔键盘之间播放 morphicons 烘焙的变形帧，
             切换时话筒的机身会"长"成键盘的外框，比硬切换更能说明"模式变了"。 -->
        <view
          class="mode-btn"
          :class="{ disabled: interviewStore.isLoading }"
          hover-class="hover-press"
          @click="!interviewStore.isLoading && setMode(interviewStore.answerMode === 'text' ? 'voice' : 'text')"
        >
          <morph-icon
            class="mode-icon"
            frames="mic-keyboard"
            :active="interviewStore.answerMode === 'voice'"
            :fallback="interviewStore.answerMode === 'text' ? ICONS.mic : ICONS.keyboard"
          />
        </view>

        <!-- 输入主体：textarea 自增高，长回答可以完整回看开头（原为单行 input，会横向滚走） -->
        <view v-if="interviewStore.answerMode === 'text'" class="input-wrapper">
          <textarea
            v-model="inputText"
            class="text-input"
            placeholder="输入你的回答..."
            placeholder-style="color: #C2B8AC"
            :maxlength="2000"
            auto-height
            :fixed="true"
            :show-confirm-bar="false"
            :disable-default-padding="true"
            :cursor-spacing="24"
            :adjust-position="true"
            confirm-type="send"
            :confirm-hold="true"
            @focus="inputFocused = true"
            @blur="inputFocused = false"
            @confirm="sendAnswer"
          />
        </view>
        <view v-else class="voice-area">
          <!-- 语音识别结果直接填进下方的输入框（自动切回文字模式），可改可发 —— 不另造预览层 -->
          <voice-button :disabled="interviewStore.isLoading" @result="onVoiceResult" @error="onVoiceError" />
        </view>

        <!-- 发送键：无输入时是空描边（还不能发），有输入时墨实底白箭头（激活态才提亮）。
             ⚠️ disabled 必须真的拦住点击（v31 修复）：
             此前只切了图标与 class，@click 仍然触发 sendAnswer ——
             用户在「AI 思考中」点发送，会走到 submitAnswer 的早退分支。
             配合 sendAnswer 的「受理才清空」，现在两条路径都不会丢输入；
             这里再补 disabled 让"不可点"与"看起来不可点"一致（避免无谓的点按与 toast 打扰）。 -->
        <view
          v-if="interviewStore.answerMode === 'text'"
          class="send-btn"
          :class="{ active: inputText.trim() && !interviewStore.isLoading, loading: interviewStore.isLoading }"
          hover-class="hover-press"
          @click="!interviewStore.isLoading && sendAnswer()"
        >
          <image class="send-icon" :src="inputText.trim() && !interviewStore.isLoading ? ICONS['arrow-up'] : ICONS['arrow-up-muted']" mode="aspectFit" />
        </view>
      </view>

      <!-- 识别结果直接进输入框，本页不再有独立预览层（旧的 .recognized-* 已删除） -->
    </view>

    <!-- 生成报告遮罩：盖在跳转与状态清空之上，页面销毁时自动消失。
         v35.3 第二十一批：等待凭证票（批阅章 + 真实计时） -->
    <loading-overlay
      v-if="isGenerating"
      title="生成报告中"
      sub="AI 正在回顾你的全部作答"
      :stages="reportStages"
      stamp="批阅"
      eyebrow="REVIEW · 批阅中"
    />
  </view>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { onShow, onHide, onLoad } from '@dcloudio/uni-app'
import { useInterviewStore } from '@/store/modules/interview'
import { getInterviewDetail } from '@/api/interview'
import { ICONS } from '@/utils/svg-icons'
import { stopAudio, pauseAudio, resumeAudio, isPaused, hasActiveAudio, playTts } from '@/utils/audio'
import LoadingOverlay from '@/components/loading-overlay/loading-overlay.vue'
// 显式引入：模板直接用了 <voice-button> 与 <morph-icon>，原先靠全局注册兜底。
// 全局 usingComponents 已删除，补 import 后行为不变且不再拖累其它 11 个页面。
import VoiceButton from '@/components/voice-button/voice-button.vue'
import MorphIcon from '@/components/morph-icon/morph-icon.vue'
import { replace, tab, relaunch, NAV } from '@/utils/nav'
import { isOverloadError, showOverloadNotice } from '@/utils/serviceNotice'

const interviewStore = useInterviewStore()

const inputText = ref('')
const inputFocused = ref(false)
const timer = ref(0)
let timerInterval = null

/* 对话字号：与设置页的「对话字号」联动。
   设置页只写 storage、本页在 onShow 时重新读取并应用，切完字号回来立即可见。 */
const fontSize = ref('medium')
const loadFontSize = () => {
  const v = uni.getStorageSync('fontSize')
  fontSize.value = (v === 'small' || v === 'large') ? v : 'medium'
}

/* 语音播报：由「设置页开关」决定（用户偏好，设置页实时写 storage）。
   TTS 已升级为服务端合成（utils/audio.js 内部自动回落微信插件），
   播报按钮不再依赖 WechatSI 插件是否可用——旧门槛 pluginOk 会把
   插件未授权环境下的播报按钮整个藏掉，导致「TTS 通了却没入口」。 */
const isMpWeixin = ref(false)
const voiceEnabled = ref(true)
const showAudio = computed(() => isMpWeixin.value && voiceEnabled.value)
// #ifdef MP-WEIXIN
isMpWeixin.value = true
// #endif
const loadVoiceEnabled = () => {
  const v = uni.getStorageSync('voiceBroadcast')
  voiceEnabled.value = (v === '' || v === null || v === undefined) ? true : !!v
}
/* 必须在 setup 期间同步读一次设置，不能只放在 onMounted。
   原因：下方「自动接播」watcher 带 immediate，它在 setup 期间【同步】执行；
   而首题在配置页 startInterview 时就已经写进 store.rounds 了 ——
   也就是说 immediate 回调触发时 rounds.length 已经是 1。
   若此刻 voiceEnabled 还是 ref 默认值 true，用户在设置页关闭的
   「语音播报」对首题完全无效（实测复现：关掉播报后首题照样出声）。
   onMounted 里的那次调用保留，用于「从设置页返回」时重新读取（见 onShow 同理）。 */
loadVoiceEnabled()

/* ===== 自定义导航栏几何：真实状态栏高度 + 微信胶囊避让 =====
   全局 CSS 变量 --status-bar-height 是写死的 44px 兜底值，旧版把它乘 2 导致：
   1) 「结束」按钮钻到微信胶囊按钮下面
   2) 顶栏 padding 双倍、对话区顶边算错（消息钻进顶栏底下）
   这里用 getMenuButtonBoundingClientRect 实测，异常时回退安全默认值 */
/* 几何必须在首帧就是真实值：初始化在模块级同步执行，而不是丢到 onMounted。
   否则首帧用假几何渲染、onMounted 后再跳到真几何，整页内容会跟着跳一下
   —— 就是从配置页进来时那一下「闪烁」的主要来源。 */
const measureNavMetrics = () => {
  const def = { statusBar: 44, capsuleGap: 96 }
  try {
    const win = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
    const statusBar = win.statusBarHeight || 44
    let capsuleGap = 96
    // #ifdef MP-WEIXIN
    try {
      const rect = uni.getMenuButtonBoundingClientRect()
      if (rect && rect.width > 0) capsuleGap = win.windowWidth - rect.left + 14
    } catch (e) { /* 部分环境无胶囊 API，保留兜底值 */ }
    // #endif
    return { statusBar, capsuleGap }
  } catch (e) { return def }
}
const navMetrics = ref(measureNavMetrics())
const initNavMetrics = () => { navMetrics.value = measureNavMetrics() }
const topBarStyle = computed(() => ({ paddingTop: navMetrics.value.statusBar + 'px' }))
const navBarStyle = computed(() => ({ paddingRight: navMetrics.value.capsuleGap + 'px' }))

/* 自动滚动到底部：scroll-into-view 只在值变化时触发，
   必须「清空 → 下一帧再赋值」才能在每条新消息后重新生效（旧实现是常量，只滚一次） */
const scrollToId = ref('chat-bottom')
let scrollTimer = null

/* ===== v32 滚动锚定：不要抢走用户正在读的内容 =====
 * 症状：用户在 AI 说完一段后向上翻、重读前面的题，此时
 *   · 打字机每 4 拍（128ms）一次 scrollToBottom
 *   · isLoading 翻转一次 scrollToBottom
 *   · rounds.length 变化再一次
 * 三条路径都会把用户从"正在读的第 2 轮"直接弹到列表最底部。
 * 对长对话来说这就是"正在看的内容被顶飞"，是聊天页最伤体验的一类缺陷。
 *
 * 修法（纯展示层，不碰任何业务状态）：
 *   1. 用 @scroll 的 scrollTop/scrollHeight + 实测视口高，判断"是否贴着底部"；
 *   2. 贴底 → 照常跟随（这是绝大多数时刻，行为与改动前完全一致）；
 *   3. 不贴底 → chatDetached=true，**自动滚动让位**，改由右下角「回到底部」按钮
 *      让用户自己决定什么时候回去（用户意图优先，且给出可见的出口）。
 *
 * ⚠️ 判定必须避开程序化滚动：scrollToBottom 自己也会产生 scroll 事件，
 *    若不设抑制窗口，一次自动滚动就会被误读成"用户离开底部"，
 *    然后自动跟随永久失效（比原来的抖动更糟）。故滚动的 400ms 内不判定。
 * ⚠️ 视口高用 selectorQuery 实测一次；拿不到（iCloud/低版本）时 nearBottom
 *    恒为 true → 退化为改动前的行为，绝不因为量不到就锁死滚动。 */
const chatDetached = ref(false)
let chatViewH = 0
let suppressScrollDetectUntil = 0
// 首帧视口测量的延迟定时器：卸载时必须取消，否则回调仍会跑一次 selectorQuery
let measureTimer = null

const measureChatViewport = () => {
  try {
    uni.createSelectorQuery()
      .select('.chat-area')
      .boundingClientRect((rect) => {
        if (rect && rect.height > 0) chatViewH = rect.height
      })
      .exec()
  } catch (e) { /* 量不到就退化为「始终跟随」 */ }
}

const onChatScroll = (e) => {
  const d = (e && e.detail) || {}
  // 程序化滚动窗口内不判定（见上方说明）
  if (Date.now() < suppressScrollDetectUntil) return
  const top = Number(d.scrollTop)
  const h = Number(d.scrollHeight)
  if (!Number.isFinite(top) || !Number.isFinite(h) || !chatViewH) {
    // 数据不全：保持"跟随"，不制造误判
    if (chatDetached.value) chatDetached.value = false
    return
  }
  // 距底 96rpx≈48px 以内算贴底（约一行文字，符合"我还在看最新"的直觉）
  const near = top + chatViewH >= h - 48
  const next = !near
  if (next !== chatDetached.value) chatDetached.value = next
}

const scrollToBottom = async (force = false) => {
  // 用户已上滑查看历史：自动跟随让位（force=true 用于用户自己的明确动作）
  if (chatDetached.value && !force) return
  chatDetached.value = false
  suppressScrollDetectUntil = Date.now() + 400
  scrollToId.value = ''
  await nextTick()
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => { scrollToId.value = 'chat-bottom' }, 60)
}
/* 「回到底部」：用户显式要求，强制滚回并恢复自动跟随 */
const backToBottom = () => {
  chatDetached.value = false
  scrollToBottom(true)
}

/* 页面是否已卸载（P1 修复，2026-10-11）。
   本页有若干「用户手势里发起、却在页面卸载后才 resolve」的长任务：
     · submitAnswer 的 SSE（AI 最长 60s）
     · 面试结束分支的两个串行 setTimeout（打字剩余时长 + 1.2s 停留）
   没有这个标记时，用户提交后立刻返回，几秒后会被**强行 redirectTo 到报告页** ——
   而那时用户已经在首页了。所有 await 之后与延迟回调开头都必须判它。 */
let destroyed = false
// 面试结束收尾的两个定时器（卸载时必须取消，否则在别的页面里触发跳转）
let endTimer1 = null
let endTimer2 = null
/* 三个"有新内容"的触发点（新轮次 / 新追问 / 进入思考态）统一走 scrollToBottom。
   它们只在「用户仍贴着底部」时生效 —— 见上方 chatDetached 的说明。 */
watch(() => interviewStore.rounds.length, () => { scrollToBottom() })
watch(() => {
  const last = interviewStore.rounds[interviewStore.rounds.length - 1]
  return last ? last.followUps.length : 0
}, () => { scrollToBottom() })
watch(() => interviewStore.isLoading, (v) => { if (v) scrollToBottom() })

/* ===== 打字机：AI 回复逐字揭示 =====
 * 服务端 AI 返回的是 JSON 信封（content 只是其中一个字段，还要等 feedback_type
 * 路由 + 内容安全检测），无法把生成过程直接流式推给前端（详见 aiService.processAnswer
 * 的非流式调用与 interviewService 的 checkAIOutput）。改在展示层做"假流式"：
 * 拿到完整文本后按节拍逐字渲染，观感与真流式一致，且不触碰后端与合规链路。
 *
 * 关键设计：
 * - 只对「刚生成」的文本打字（store 的 lastTyped 标记），从本地进度/服务端恢复的
 *   历史文本直接完整展示——重进页面不会把旧问题再逐字演一遍
 * - 打字进行中用户发送新回答或结束面试 → 立即 flush 全文，绝不卡着等演完
 * - 同一时刻最多一个气泡在打字：新内容进来时旧的直接跳到全文 */
const typedMap = reactive({})
let typingTimer = null
let typingKey = null
/* 当前正在逐字揭示的气泡 key（响应式）。
   typingKey 是普通变量、模板读不到；光标的 v-if 需要响应式驱动，另存一份。 */
const typingKeyReactive = ref('')
let typingScrollAcc = 0
const TYPE_INTERVAL = 32       // 每 32ms 推进一次：≈31 字/秒，接近真人语速
const TYPE_CHARS_PER_TICK = 1  // 每拍 1 字（中文）

/* ===== v30 打字节奏：分段提速，取代「整段匀速加速」=====
   旧实现（用户实锤「刚进去文字就出来一大半」）：
     const speedup = text.length > 60 ? Math.ceil(text.length / 60) : 1
     const step    = Math.max(1, speedup)
   一段 120 字的题面 → speedup = 2 → 每 32ms 刷 2 字 ≈ 62 字/秒，
   是真人语速（≈5 字/秒）的 12 倍。结果是「打字机」在视觉上完全失效：
   用户看到的是一段已经铺满的文字在快速收尾，只剩尾部一截还在动 ——
   恰好就是用户截图里描述的现象。

   为什么不能简单地把 speedup 调小：
     那样超长文本（AI 有时输出 200+ 字的结束语/追问）会演十几秒，
     用户干等，且期间无法作答。所以"长文本要收敛时长"这个需求本身是对的，
     错的是「从头就匀速全速」。

   现方案：分段提速（progressive），具体公式见 typingPlanOf()。
   要点：前 60 字一律 1 字/拍（真人语速），之后才逐步加速且**上限 3**。
   于是所有文本的开头都是真的"正在说话"，只有超长段落的尾部才加速收敛。 */

/* 本段打字的总时长与起始时刻：用于「还要多久演完」的精确估算。
   为什么必须由本页自己记账、而不能去读 store.lastTyped：
   消费 lastTyped 的 watcher 是 pre-flush 微任务，它排在 await 续体之前 ——
   等 submitAnswer 里 `await store.submitAnswer(...)` 返回时，lastTyped 早已被
   watcher 置空，读到的永远是 null（实测复现），于是「结束语还在逐字、
   遮罩却立刻盖上」的 bug 会稳定复现。改为本页自己记时间账，
   与 watcher 的消费时序彻底解耦。 */
let typingTotalMs = 0
let typingStartedAt = 0

/* 打字收尾：清定时器 + 补一次平滑滚动到底。
   必须在这里补滚：滚动动画在打字期间是关掉的（见模板 :scroll-with-animation），
   不补这一下，气泡最后一行会停在视口外一点点。 */
const stopTyping = () => {
  clearTypingTimer()
  scrollToBottom()
}

const clearTypingTimer = () => {
  if (typingTimer) { clearInterval(typingTimer); typingTimer = null }
  typingKey = null
  typingKeyReactive.value = ''
  typingTotalMs = 0
}

// 立即展示全部未完成的打字内容（发回答/结束面试/页面销毁时调用）
const flushTyping = () => {
  if (!typingTimer) return
  clearTypingTimer()
  Object.keys(typedMap).forEach((k) => { delete typedMap[k] })
}

/* 当前这段打字「还需要多久才演完」（ms）。
   由 startTyping 记账的总额减去已流逝时间得出；没有在打字时返回 0。 */
const typingRemainingMs = () => {
  if (!typingTimer || !typingTotalMs) return 0
  const elapsed = Date.now() - typingStartedAt
  return Math.max(0, typingTotalMs - elapsed)
}

// typedText(key, full)：打字进行中返回已揭示的前缀，否则返回全文
const typedText = (key, full) => {
  if (!full) return full
  return Object.prototype.hasOwnProperty.call(typedMap, key) ? typedMap[key] : full
}

// 某条气泡是否正在逐字揭示（打字光标的显隐依据）
const isTyping = (key) => typingKeyReactive.value === key

/* 首题是否正在打字：此时气泡内容正逐字揭示，本身就是最强的「内容在出现」反馈，
   再叠加 msgIn 位移+淡入会闪一下（从配置页跳进来的第一眼）。
   后续新题不在此列，照常播入场动画 */
const isFirstQuestionTyping = computed(() =>
  Object.prototype.hasOwnProperty.call(typedMap, 'r1')
)

// 预估一段文本的打字总时长（ms）。startTyping 用它记账（单一公式来源），
// typingRemainingMs 再据此减去已流逝时间得出「还要多久演完」。
//
// v30：必须与 startTyping 的**分段**推进同源计算。
// 旧版这里用"整段匀速 step"算，startTyping 也用匀速 step，两处一致；
// 改成分段后若这里仍按匀速算，估时会偏长 —— 而结束语那 1.2s 停留就是靠它
// 算出来的，偏长会让遮罩盖在半截结束语上（那正是 §0.43 P0-1 修过的 bug）。
// 所以两处都调用 typingPlanOf()，公式只有这一份。
const typingPlanOf = (text) => {
  const len = (text || '').length
  const NORMAL = 60   // 前 60 字保持真人语速
  const MAX = 3       // 之后每 60 字 +1 字/拍，上限 3

  // 逐段计算：先按 1 字/演完前 60 字，再按 speedup 演完剩余
  if (len <= NORMAL) return { step: TYPE_CHARS_PER_TICK, totalMs: len * TYPE_INTERVAL }
  const rest = len - NORMAL
  const step = Math.min(MAX, Math.ceil(len / NORMAL))
  // 首段：60 字 @1 拍/字；次段：rest 字 @step 拍/字
  const ticks = NORMAL + Math.ceil(rest / step)
  return { step, totalMs: ticks * TYPE_INTERVAL }
}

const typingDurationOf = (text) => typingPlanOf(text).totalMs

const startTyping = (key, text) => {
  if (!text) return
  // 上一条没演完又来新的：旧的直接跳到全文，避免两条同时逐字、画面混乱
  flushTyping()
  typingKey = key
  typingKeyReactive.value = key
  typedMap[key] = ''
  /* v30：分段提速 —— 前 60 字按真人语速逐字，之后才逐步加速（上限 3）。
     取代旧版"整段按 length/60 匀速加速"（120 字即 2 字/拍 ≈62 字/秒），
     那正是用户截图里「一进去就出来一大半、只剩尾巴在动」的成因。 */
  const { step } = typingPlanOf(text)
  // 记账：本段预计总时长（与 typingDurationOf 同一套公式，保证两处估算一致）
  typingTotalMs = typingDurationOf(text)
  typingStartedAt = Date.now()
  let pos = 0
  typingTimer = setInterval(() => {
    // 分段推进：位置未过 60 字时按 1 字/拍（真人语速），
    // 越过之后才用加速步长 —— 这样"开头正在说话"是真实的观感，
    // 而长文本仍在可接受时长内收敛（200 字 → 2.1s）。
    const curStep = pos < 60 ? TYPE_CHARS_PER_TICK : step
    pos = Math.min(text.length, pos + curStep)
    typedMap[key] = text.slice(0, pos)
    // 打字时气泡不断变高，每 4 拍补一次滚动，让新露出的字始终在视口内
    typingScrollAcc++
    if (typingScrollAcc % 4 === 0) scrollToBottom()
    if (pos >= text.length) {
      // 演完：从 map 移除，typedText 回落为全文（数据源单一，不维护两份文本）
      delete typedMap[key]
      // 用 stopTyping 而非 clearTypingTimer：顺带把平滑滚动补回来
      stopTyping()
    }
  }, TYPE_INTERVAL)
}

// store 每次新生成 AI 文本（追问/下一题/结束语）就启动一次打字。
// ⚠️ 首题不靠这里：它在配置页 startInterview 时就已入列，本页挂载时 seq 不再
// 变化，watcher 永远赶不上——首题由 onLoad 显式触发（见 onLoad 末尾）。
// 消费后立即清标记：下次重进页面不会把旧消息再演一遍
watch(() => interviewStore.lastTyped?.seq, (seq) => {
  if (!seq) return
  const t = interviewStore.lastTyped
  if (t && t.key && t.text) startTyping(t.key, t.text)
  interviewStore.lastTyped = null
})

/* 思考气泡与打字机的衔接：isLoading=true 时显示「思考中」，
 * AI 返回后 isLoading 变 false、新气泡入列并开始打字。
 * 思考动画与逐字效果此刻无缝交接，用户不会看到「先空一下再出字」。 */

/* 语音播报。
   历史教训：这里曾用动态 import('@/utils/audio')，uni-app mp-weixin 编译器
   把它编成 `await "../../utils/audio.js"`（await 字符串），运行时必抛错
   → 播报永远弹「暂不可用」。改回静态导入（2026-09-16 实测编译产物正常）。

   播放状态机：playingTag 标识当前播的是哪条气泡（主问题 'q{idx}' /
   追问 'q{idx}-fu{fIdx}'）；同一条上再点 = 暂停/继续；换一条 = 自动停旧播新。
   onEnded 真实回调清状态（旧 setTimeout 猜时长在流式长音频下完全不准）。
   ⚠️ 本块必须位于下方「自动接播」watcher 之前：immediate 回调在 setup 期间
   同步执行，定义放在 watcher 之后会触发 TDZ（编译产物报 "H is not a function"）。 */
const playingTag = ref('')
const audioPaused = ref(false)

/* v32：记录"这条已经播过一遍"。
 * 为什么需要它：三态此前只做出两态——空闲（灰喇叭「播报」）与播放中（黑底「暂停」）。
 * 播完之后胶片直接**回到空闲态**，与"从没点过"长得一模一样：
 * 用户听到一半被电话打断、回来想确认"刚才那道题我听完没有"时没有任何线索，
 * 只能凭记忆。现在播完留一个"已播"态（喇叭变实、文案「重播」），
 * 语义从"操作名"变成"这条的状态"，且不新增任何视觉重物 —— 只换字与图标色。
 * ⚠️ 纯展示层：只在 onEnded / playQuestion 成功路径里加一行记录，
 *    不改播放状态机的任何分支。 */
const playedTags = reactive({})
const isPlayed = (tag) => !!playedTags[tag]

// 播报按钮文案三态：空闲（播报）/ 播放中（暂停）/ 暂停（继续）
// 注：v28 起图标改由 <morph-icon> 直接按 playingTag/audioPaused 判定并播放变形帧，
// 原来的 ttsPillIcon(tag) 取值函数已随之删除（避免留下无引用的死代码）。
const ttsPillText = (tag) => {
  if (playingTag.value !== tag) return isPlayed(tag) ? '重播' : '播报'
  return audioPaused.value ? '继续' : '暂停'
}

const playQuestion = async (text, tag) => {
  // #ifdef MP-WEIXIN
  try {
    // 同一条上再点：暂停 ↔ 继续
    if (playingTag.value === tag && hasActiveAudio()) {
      if (isPaused()) { resumeAudio(); audioPaused.value = false }
      else { pauseAudio(); audioPaused.value = true }
      return
    }
    playingTag.value = tag
    audioPaused.value = false
    // playTts 内部：首段就绪即开口（首段=第一句，最短路径），后续段渐进衔接；
    // 音色取面试配置页的选择（config.tts_voice 随面试参数流转）；
    // isCancelled 让"播报期间点了别条"时能即时中止
    await playTts(text, {
      // 回退链：面试配置所选 → 本页上次所用（resumeFromServer 重建的 config 不含 tts_voice）
      voice: interviewStore.config?.tts_voice || uni.getStorageSync('lastTtsVoice') || '',
      isCancelled: () => playingTag.value !== tag,
      onEnded: () => {
        // v32：先记"已播"再清 playingTag —— 顺序不能反，
        // 否则中间那一拍 ttsPillText 会读到 isPlayed=false 而闪回「播报」
        if (playingTag.value === tag) {
          playedTags[tag] = true
          playingTag.value = ''
          audioPaused.value = false
        }
      },
      // onError 必须传：playTts 内部失败走这里，不传就等于静默吞错
      // （2026-09-17 实测：漏传导致 TTS 失败时「没声音也没提示」）
      onError: (e) => {
        console.error('[TTS] 播报失败:', e?.message || e)
        /* v31 过载降级：上游（百炼 CosyVoice）在高峰期会限流/5xx。
           旧实现直接弹 `语音播报失败：timeout of 30000ms exceeded` ——
           用户看到英文技术文案，会当成 bug 甚至以为手机坏了。
           现在识别为"使用人数较多"并给出温度化说明（同一会话只弹一次模态，
           后续降级为 toast，避免反复打断答题）。 */
        if (isOverloadError(e)) {
          // TTS 场景：题目文字已在屏幕上，提示用户"直接看文字"即可（与 ASR 的"改用键盘"不同）
          showOverloadNotice({ scene: 'tts' })
        } else {
          uni.showToast({ title: '语音播报失败：' + (e?.message || '未知错误'), icon: 'none' })
        }
        if (playingTag.value === tag) { playingTag.value = ''; audioPaused.value = false }
      }
    })
  } catch (e) {
    console.error('[TTS] 播报异常:', e)
    // 同上：过载走统一友好提示，其余保持原有文案
    if (isOverloadError(e)) showOverloadNotice()
    else uni.showToast({ title: '语音播报暂不可用', icon: 'none' })
    if (playingTag.value === tag) playingTag.value = ''
  }
  // #endif
}

/* 自动接播：题目文字出现的瞬间即开始播报（文字 → 声音无缝衔接，实时对话场景）。
   immediate: 首题在页面挂载前就已入列（startInterview 先写 store 再跳转），
   不加 immediate 首题永远赶不上 watcher —— 必须挂载即播。
   由设置页「语音播报」开关统一控制；手动点播报仍可暂停/继续。

   ⚠️ 2026-10-12 记录一次「改了又撤回」的尝试（勿重犯）：
   我在审核前自检时把这里改成了"首次播放必须用户点按钮"（userGestureDone 门槛），
   理由是微信要求"不得无用户交互自动播放音视频"。
   **该判断过度了，已按用户决定撤回**：
     · 用户是**主动点了「开始面试」**才进入本页的 —— 这本身就是明确的用户交互，
       播报是这个连续行为的自然延续，不属于"无交互自动播放"（那是针对
       "一进首页就放广告/音乐"这类被动播放）。
     · 更重要的：**进考场即听到面试官开口，是「AI 语音面试」的核心体验**，
       改成"等用户点一下"会伤掉产品最值钱的部分。
   · 项目自己的 docs/审核排查报告.md:720 只是把 TTS 自动播放标为
     "判定存在主观性的残余风险（S1）"，并非确定的驳回点。
   结论：保留自动播报。若将来审核**真的**因此被驳回，再改成手势门槛不迟
   （改法见 git 历史 bfd8d37，可直接回退参考）。 */
watch(() => interviewStore.rounds.length, (n) => {
  if (n > 0 && showAudio.value && !interviewStore.interviewEnded) {
    const last = interviewStore.rounds[n - 1]
    if (last && last.question) playQuestion(last.question, 'q' + (n - 1))
  }
}, { immediate: true })
watch(() => {
  const last = interviewStore.rounds[interviewStore.rounds.length - 1]
  return last ? last.followUps.length : 0
}, (cnt) => {
  if (cnt > 0 && showAudio.value) {
    const last = interviewStore.rounds[interviewStore.rounds.length - 1]
    const fu = last && last.followUps[cnt - 1]
    if (fu && fu.question) playQuestion(fu.question, 'q' + (interviewStore.rounds.length - 1) + '-fu' + (cnt - 1))
  }
})

/* 进度条：仍用预定义宽度类（避免 :style 动态绑定在 mp-weixin 上的编译器坑），
   但档位从 8 档扩到 20 档（每档 5%），并按「当前轮次 / 总轮次」换算。
   旧实现直接用 currentRound 当档位编号，导致选 5 轮面试时最后一题只显示 62.5%，
   选 20 轮时第 9 轮起进度条就满了。 */
const clampRound = computed(() => {
  const total = interviewStore.config?.total_rounds || 8
  const safeTotal = total > 0 ? total : 8
  const cur = Math.max(1, Math.min(interviewStore.currentRound, safeTotal))
  return Math.max(1, Math.ceil((cur / safeTotal) * 20))
})

const statusText = computed(() => {
  if (interviewStore.isLoading) return '思考中'
  if (interviewStore.interviewEnded) return '已完成'
  return '进行中'
})

/* ===== 本轮 AI 点评（v24）=====
 * 服务端每轮都返回 round_score（五维 1-10）与 round_comment（≤50 字），并已通过
 * SSE 的 complete 帧整包下发；但前端此前只消费 feedback_type/content/question_type，
 * 把 AI 每轮的判断整个丢掉了 —— 用户在整场面试里看不到任何 AI 反馈。
 * 这两个函数供模板渲染点评条使用，并在 WXML 能力受限的前提下把计算留在 JS 侧。 */
const roundAvg = (round) => {
  const s = round && round.roundScore
  if (!s || typeof s !== 'object') return ''
  // 只统计有效分（自我介绍轮五维全 0，见 prompts/firstQuestion.js，不能当成「0 分」展示）
  const vals = Object.keys(s)
    .map(k => Number(s[k]))
    .filter(v => Number.isFinite(v) && v > 0)
  if (!vals.length) return ''
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
}
const hasRoundFeedback = (round) => {
  if (!round) return false
  return !!(roundAvg(round) || round.roundComment)
}

const statusClass = computed(() => {
  if (interviewStore.isLoading) return 'status-thinking'
  if (interviewStore.interviewEnded) return 'status-done'
  return 'status-active'
})

/* ===== v32 等待文案：让"多久了"变成看得见的事实 =====
 * 原理由：SSE 首包 + AI 生成 + 内容安全检测串起来通常 3~12s，超长思考可达 20s+。
 * 旧实现全程一句「面试官思考中...」，第 12 秒和第 1 秒长得完全一样 ——
 * 用户无法判断"还在正常工作"还是"卡死了"，这是等待焦虑的直接来源，
 * 也最容易诱发"反复点发送 / 退出去重进"（后者会打断整场面试）。
 *
 * 做法：只依据**已有** isLoading 的进入时刻派生三档文案，不改任何状态赋值时机：
 *   0-6s  「面试官思考中…」      —— 正常节奏，不打扰
 *   6-14s 「正在组织下一句…」    —— 说明还在推进（此时多半在等首包）
 *   14s+  「稍等，这道题想得比较细」+ ② 一句安抚，不让用户以为坏了
 * 计时只在本气泡可见期间跑（watch isLoading），退出立刻清掉，不留定时器。
 * ⚠️ 这是纯展示派生：不参与任何请求、不改变 isLoading 的置位时机。 */
const thinkTick = ref(0)       // isLoading 已持续多少秒（0 表示刚进入）
let thinkTimer = null
const stopThinkTicker = () => {
  if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null }
}
watch(() => interviewStore.isLoading, (v) => {
  stopThinkTicker()
  thinkTick.value = 0
  if (!v) return
  thinkTimer = setInterval(() => { thinkTick.value += 1 }, 1000)
})
onUnmounted(stopThinkTicker)
const thinkingText = computed(() => {
  const t = thinkTick.value
  if (t >= 14) return '稍等，这道题想得比较细'
  if (t >= 6) return '正在组织下一句…'
  return '面试官思考中…'
})
/* 长等待才给副行（解释"没有卡住"），短等待保持一行安静 */
const thinkingHint = computed(() => (thinkTick.value >= 14 ? '网络正常时通常几秒就好' : ''))

/* 语音识别结果 → 直接填进输入框并切回文字模式。
   为什么这样最对：输入框、发送键本来就在 composer 里，识别完只要把文字放进去，
   用户看到的就是他平时打字时的那个界面 —— 可改可发，零新增 UI、零遮挡。
   （曾试过「识别结果预览面板」，2026-10-08 被否决：凭空多一层、聚焦弹键盘还会盖住底部） */
const onVoiceResult = (res) => {
  const text = (res && res.text) || ''
  if (!text.trim()) return
  inputText.value = text
  setMode('text')
}
/* 语音作答失败提示：必须透出组件传来的真实原因。
   旧实现是硬编码「语音识别不可用，请使用文字输入」——把 errMsg 整个丢掉，
   于是「没授权麦克风 / 录音读文件失败 / 网络 429 / 百炼 502 / 服务端返回空文本」
   全都长成同一句话，真机上根本无从定位（2026-10-08 排查的最大障碍）。 */
const onVoiceError = (e) => {
  uni.showToast({ title: (e && e.errMsg) || '语音识别不可用，请使用文字输入', icon: 'none', duration: 2500 })
}

/* 发送（发送键点击 / 键盘"发送"按钮，二者共用）。
 *
 * ⚠️ 曾经的 P0 数据丢失（2026-10-11 修复，勿改回）：
 * 旧写法是「无条件先清空，再发」——
 *     if (inputText.value.trim()) { submitAnswer(inputText.value); inputText.value = '' }
 * 而 submitAnswer 在 isLoading 时会**早退**（只弹一句 toast），并不消费这段文本。
 * 于是「AI 思考中，用户在输入框里写下第二条回答，再按发送」这一条完全正常的操作，
 * 结果是：toast 说「请稍候」，而刚写的字已经被清空、无法找回 —— 用户的输入被静默丢弃。
 * 而按钮 isLoading 时只是变淡、仍可点；键盘右下角的「发送」同样会触发 @confirm。
 *
 * 修法：先判断能不能提交，**提交被受理了才清空**。
 * 这样"没受理"的路径天然保留输入，用户不需要重打。 */
const sendAnswer = () => {
  const text = inputText.value
  if (!text.trim()) return
  // 与 submitAnswer 的守卫同源：AI 处理中不接受新提交，且**必须保留输入**
  if (interviewStore.isLoading) {
    uni.showToast({ title: '面试官正在思考，请稍候', icon: 'none' })
    return
  }
  // 受理成功才清空：清空与提交是同一决策，不能拆开
  inputText.value = ''
  inputFocused.value = false
  // true = 不区分焦点/触摸来源
  uni.hideKeyboard({ complete: () => {} })
  // 不 await：打字机/遮罩时序由 submitAnswer 内部处理，这里只要保证「已受理即清空」
  submitAnswer(text)
}

const submitAnswer = async (answer) => {
  if (!answer || !answer.trim()) return
  // 防连点：AI 处理中不允许重复提交（否则轮次状态机会错乱）
  if (interviewStore.isLoading) {
    uni.showToast({ title: '面试官正在思考，请稍候', icon: 'none' })
    return
  }
  // 用户已开始作答：上一条若还在逐字，立即展示全文——不能让打字机卡着新对话
  flushTyping()
  const duration = timer.value
  // 记录提交时的轮次：失败自愈后据它判断这条回答是否已被服务端记录
  const submittedRound = interviewStore.currentRound
  resetTimer()
  try {
    const result = await interviewStore.submitAnswer(answer, duration)
    /* P1 修复（2026-10-11）：await 之后页面可能已经被用户关掉了。
       场景：提交回答 → 「思考中」→ 用户点返回并确认 → 本页 onUnmounted。
       而这次 await 仍会 resolve，续体会继续往下跑：把状态写回一个已销毁的页面、
       甚至 redirectTo 到报告页 —— 表现在用户身上就是
       「我已经退到首页了，几秒后突然自己跳到报告页」，且会话被 resetInterview 清空。
       所以每个 await 之后、每个延迟回调开头都必须确认页面还在。*/
    if (destroyed) return
    // SSE 正常关闭但既无 complete 也无 error 帧（流被截断/AI 返回异常）：
    // 静默无下文会让用户不知所措——把输入还回去、恢复计时并提示重发
    if (!result && !interviewStore.interviewEnded) {
      inputText.value = answer
      uni.showToast({ title: 'AI 未返回内容，请重试', icon: 'none' })
      startTimer()   // 计时始终进行（见 watch(questionKey) 上的说明），仅显示受 timer_enabled 控制
      return
    }
    inputText.value = ''
    // 成功后清除本地进度：面试已推进到新状态，旧进度再恢复会造成轮次错乱
    try { uni.removeStorageSync('interview_progress') } catch (e) { /* 清理异常忽略 */ }
    // 流程结束（AI 给出了结束语）→ 进入报告页
    if (interviewStore.interviewEnded) {
      const id = interviewStore.currentInterview?.interview_id
      /* 结束语正在逐字：遮罩必须等演完再盖，否则收尾发言被遮罩挡住、
         且跳转前 resetInterview 会清空对话——用户只能看到半截结束语。
         ⚠️ 这里必须用本页记账的 typingRemainingMs()，不能读 interviewStore.lastTyped：
         消费 lastTyped 的 watcher 是 pre-flush 微任务，排在 await 续体之前，
         等 `await interviewStore.submitAnswer()` 返回时 lastTyped 已被置空，
         读到的永远是 null → 遮罩立刻盖上 → 结束语被吞掉（实测稳定复现）。
         只有本页自己记的「剩余打字时长」与 watcher 时序无关。 */
      const typingMs = typingRemainingMs()
      /* 打字剩余时长 + 至少 1.2s 停留：原实现立即清屏跳转，收尾发言永远看不见。
         两个定时器句柄必须保存下来：页面卸载时要能取消，否则它们会在
         用户已经退到别的页面之后才触发 → resetInterview + 强行 redirectTo 报告页。
         回调内部同样要判 destroyed（句柄取消与"已销毁"标记双保险：
         卸载与回调触发可能挤在同一拍）。 */
      endTimer1 = setTimeout(() => {
        if (destroyed) return
        isGenerating.value = true
        endTimer2 = setTimeout(() => {
          if (destroyed) return
          interviewStore.resetInterview()
          replace(`/pages/report/index?id=${id}`, NAV.reveal)
        }, 1200)
      }, typingMs)
    }
  } catch (e) {
    // 页面已卸载：此时既不该改状态，也不该弹 toast（toast 会出现在别的页面上）
    if (destroyed) return
    const msg = e?.message || ''
    /* 轮次失步自愈：SSE 在「服务端已推进轮次」与「客户端收到 complete 帧」之间断开时，
       客户端仍停在旧轮次，此后每次提交都会被服务端以「轮次不匹配」拒绝，
       用户会陷入永远提交不上的死循环（只能退出重进）。
       这里用服务端状态重建会话，把用户捞回来 */
    if (/轮次不匹配|轮次不存在|会话(进度)?异常/.test(msg)) {
      const id = interviewStore.currentInterview?.interview_id
      if (id) {
        const ok = await resumeFromServer(id)
        if (destroyed) return // resumeFromServer 也是一次网络往返，回来时页面可能已关闭
        if (ok) {
          if (interviewStore.currentRound > submittedRound) {
            // 服务端已推进：这条回答其实已被记录，别让用户白白重打一遍
            inputText.value = ''
            uni.showToast({ title: '回答已记录，进度已同步', icon: 'none' })
          } else {
            // 服务端未收到：把回答还给用户
            inputText.value = answer
            uni.showToast({ title: '进度已同步，请重新提交', icon: 'none' })
          }
          startTimer()   // 计时始终进行（见 watch(questionKey) 上的说明），仅显示受 timer_enabled 控制
          return
        }
      }
    }
    // 失败时把输入内容还给用户，并恢复计时，避免「打了一半的字」随失败一起消失
    inputText.value = answer
    uni.showToast({ title: msg || '网络错误，请重试', icon: 'none' })
    startTimer()   // 计时始终进行（见 watch(questionKey) 上的说明），仅显示受 timer_enabled 控制
  }
}

const setMode = (mode) => {
  if (interviewStore.answerMode !== mode) interviewStore.answerMode = mode
}

const startTimer = () => {
  // 必须先清掉旧的 interval：本函数每道新题（含追问）都会调用一次，
  // 旧实现直接覆盖 timerInterval 变量，旧定时器再也无人引用、永远关不掉，
  // 结果是计时越走越快 + 定时器泄漏（面试全程累积十几个 interval）。
  stopTimer()
  timer.value = 0
  timerInterval = setInterval(() => { timer.value++ }, 1000)
}
const stopTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}
const resetTimer = () => { stopTimer(); timer.value = 0 }
const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

/* 计时器接线：每道新问题（含追问）出现时重新计时。
   旧实现 startTimer 从未被调用，回答时长永远是 0 */
const questionKey = computed(() => {
  const last = interviewStore.rounds[interviewStore.rounds.length - 1]
  return interviewStore.rounds.length + '-' + (last ? last.followUps.length : 0)
})
/* ⚠️ 2026-10-12 修复「作答时长恒为 0」：
 * 计时器原先被 `timer_enabled` 门控（那是用户在配置页选的"显示答题计时"开关，
 * 默认 false）。后果：**不开这个开关的用户，所有轮次的 answer_duration_seconds 都是 0**
 * —— 实测生产库 34 个轮次里 29 个为 0。
 * 而 answer_duration_seconds 正是「练习时长」统计的唯一数据源，
 * 于是"练习时长"对这些用户永远是 0（或回落到失真的旧字段）。
 *
 * 语义澄清（本次改正的核心）：
 *   · **计时**（测量作答耗时）= 统计需要，应当**始终进行**
 *   · **显示**（题干旁的计时 chip）= 用户体验，由 timer_enabled 控制
 * 两者此前被错误地绑在一起。现在计时永远跑，只在开关打开时才展示 chip
 * （模板里 `v-if="...timer_enabled && timer > 0"` 已天然满足显示控制）。
 *
 * 代价：每题多一个 1 秒 interval（可忽略，且 stopTimer 在切题/卸载时清理）。 */
watch(questionKey, () => {
  startTimer()
})

const handleBack = () => {
  uni.showModal({
    title: '确认退出',
    // 文案随「保留面试进度」开关切换：关着时说"会保存"就是在骗人
    content: keepProgress.value
      ? '面试进度将自动保存，下次可继续'
      : '已关闭「保留面试进度」，退出后当前进度不会保存',
    success: (res) => {
      if (res.confirm) {
        saveProgress()
        // 页面栈只有本页时（如直接重进会话），navigateBack 会无处可退，改回首页
        const pages = getCurrentPages()
        if (pages.length > 1) uni.navigateBack()
        else relaunch('/pages/index/index')
      }
    }
  })
}

const isEnding = ref(false)

/* 生成报告遮罩：结束面试时展示。
   ⚠️ 跳转前不关闭——页面随 redirectTo 销毁时遮罩自动消失；
   提前关会露出被 resetInterview 清空的「准备开始」空态，产生闪烁。 */
const isGenerating = ref(false)
/* 会话恢复失败（v24）：带 id 进来但服务端重建失败，或压根没有可继续的会话。
   原来这种情况会停在兜底空态「面霸君正在准备开场白...」——一个永远在等待、
   实际什么都没发生的假加载态，用户只能靠左上角返回自救。 */
const resumeFailed = ref(false)
/* 恢复失败态的两个出口（v24）。用 redirectTo 而非 navigateTo：
   失败的面试页留在栈里没有意义，返回它只会再次看到同一屏错误。 */
const goToConfigFromFail = () => replace('/pages/interview-config/index', NAV.enter)
const goHomeFromFail = () => tab('/pages/index/index')
const reportStages = [
  [6000, '正在回顾你的作答'],
  [14000, '正在五维评分'],
  [25000, '马上就好，正在撰写报告']
]

const handleEndInterview = () => {
  // 防重复点击：生成报告较慢，连点「结束」会触发两次 finishInterview，
  // 导致重复生成报告、跳转错乱
  if (isEnding.value) return
  /* R 修复（结束面试竞态）：AI 处理中（isLoading）本轮作答尚未落库，
     此时结束会用「不含最后一答」的对话生成报告。发送/切模式/语音按钮
     都有 isLoading 守卫，唯独这里漏了 —— 补上如实告知的分叉文案：
     默认引导等待（SSE 常态几秒），坚持结束的用户明确知道后果
     （服务端配套守卫：已结束的面试只落库作答、不再推进轮次/报告）。 */
  if (interviewStore.isLoading) {
    uni.showModal({
      title: '面试官正在思考',
      content: 'AI 正在处理你的上一条回答，现在结束的话，这一轮作答不会包含在报告里。建议等回答处理完再结束（通常只需几秒）。',
      confirmText: '仍然结束',
      cancelText: '等一等',
      success: (res) => { if (res.confirm) confirmEndInterview() }
    })
    return
  }
  confirmEndInterview()
}

const confirmEndInterview = () => {
  uni.showModal({
    title: '结束面试',
    content: '确定要结束当前面试并生成报告吗？',
    success: async (res) => {
      if (res.confirm) {
        isEnding.value = true
        isGenerating.value = true
        // 结束面试：结束语可能还在逐字，立即展示全文再走收尾流程
        flushTyping()
        // 立即停止语音播报：用户确认结束时，开场白/题目的 TTS 还在响，
        // 页面跳转后声音仍在继续（onUnmounted 的 stopAudio 来不及——
        // playTts 的分段循环会在页面销毁后继续创建新实例播下一段）。
        // 在这里停掉，音频与「生成报告」遮罩同步消失
        stopAudio()
        playingTag.value = ''
        audioPaused.value = false
        try {
          const result = await interviewStore.finishInterview()
          // 后端异常时 result 可能为空，直接读 .interview_id 会抛错，
          // 用户只会看到「生成中」卡住 —— 必须先校验再跳转
          const id = result?.interview_id || interviewStore.currentInterview?.interview_id
          if (!id) throw new Error('结束面试失败，请重试')
          interviewStore.resetInterview()
          try { uni.removeStorageSync('interview_progress') } catch (e) { /* 清理异常忽略 */ }
          replace(`/pages/report/index?id=${id}`, NAV.reveal)
          // 成功路径不关遮罩：随页面销毁消失，报告页用同款遮罩接力，视觉无断裂
        } catch (e) {
          isGenerating.value = false
          uni.showToast({ title: e?.message || '结束面试失败，请重试', icon: 'none' })
        } finally {
          isEnding.value = false
        }
      }
    }
  })
}

/* 保留面试进度：设置页开关真接线。关闭后不再落盘，并清掉已存的进度，
   否则下次进来又会被恢复，开关形同虚设 */
const keepProgress = ref(true)
const loadKeepProgress = () => {
  const v = uni.getStorageSync('keepProgress')
  const keep = (v === '' || v === null || v === undefined) ? true : !!v
  keepProgress.value = keep
  if (!keep) {
    try { uni.removeStorageSync('interview_progress') } catch (e) { /* 忽略清理异常 */ }
  }
}

const saveProgress = () => {
  if (!keepProgress.value) return
  if (interviewStore.currentInterview) {
    uni.setStorageSync('interview_progress', {
      interview: interviewStore.currentInterview,
      rounds: interviewStore.rounds,
      currentRound: interviewStore.currentRound,
      config: interviewStore.config,
      // 作答模式一并落盘：否则杀进程恢复后回到默认文字模式，语音作答被悄悄切掉
      answerMode: interviewStore.answerMode,
      // 追问归属状态也一并持久化，否则恢复后回答会挂错位置
      awaitingFollowUp: interviewStore.awaitingFollowUp,
      followUpIndex: interviewStore.followUpIndex,
      interviewEnded: interviewStore.interviewEnded
    })
  }
}

/* 从服务端按 id 重建会话（AI Skill 入口 / 历史详情「继续这场面试」/ 轮次失步自愈）：
   本地无对应进度时靠这条通路恢复，否则会落在空白会话页无法继续。
   返回 true 表示重建成功，调用方（提交失败自愈）据此决定后续提示 */
const resumeFromServer = async (id) => {
  // resetInterview 会把 answerMode 打回默认 text；用户在会话中途切过语音的话，
  // 同步一次进度就被悄悄改回文字模式——这里先存后恢复
  const prevAnswerMode = interviewStore.answerMode
  try {
    // 恢复前先清掉旧 store 状态：万一中途抛错或 server 数据不完整，
    // 不会留下「currentInterview 是旧的 / rounds 是新的」这种半初始化态
    interviewStore.resetInterview()
    const detail = await getInterviewDetail(id)
    if (!detail) throw new Error('面试不存在')
    if (detail.status !== 'in_progress') {
      // 已结束的面试不进会话页，直接带去看报告
      replace(`/pages/report/index?id=${id}`, NAV.reveal)
      return false
    }
    const serverRounds = (detail.rounds || []).map((r) => ({
      roundNumber: r.round_number,
      question: r.question,
      questionType: r.question_type,
      userAnswer: r.user_answer || '',
      answerDuration: r.answer_duration_seconds || 0,
      followUps: (r.follow_ups || []).map((f) => ({ question: f.question, userAnswer: f.user_answer || '', answerDuration: 0 }))
    }))
    if (serverRounds.length === 0) throw new Error('会话数据异常，请重新开始一场面试')
    interviewStore.currentInterview = { interview_id: detail._id, first_question: serverRounds[0].question }
    interviewStore.rounds = serverRounds
    interviewStore.currentRound = serverRounds.length
    interviewStore.config = {
      position_name: detail.position_name,
      interview_type: detail.interview_type,
      difficulty: detail.difficulty,
      total_rounds: detail.total_rounds,
      timer_enabled: !!detail.timer_enabled
    }
    // 追问定位：最后一轮存在未回答的追问时，继续等追问作答；
    // 否则视为等待主问题回答（新轮次或首轮尚未作答）
    const last = serverRounds[serverRounds.length - 1]
    const lastFu = last.followUps[last.followUps.length - 1]
    if (lastFu && !lastFu.userAnswer) {
      interviewStore.awaitingFollowUp = true
      interviewStore.followUpIndex = last.followUps.length - 1
    } else {
      interviewStore.awaitingFollowUp = false
      interviewStore.followUpIndex = -1
    }
    interviewStore.interviewEnded = false
    // 恢复用户中途切过的作答模式（语音/文字）
    if (prevAnswerMode) interviewStore.answerMode = prevAnswerMode
    return true
  } catch (e) {
    uni.showToast({ title: e?.message || '恢复面试失败，请重试', icon: 'none' })
    return false
  }
}

onLoad(async (options = {}) => {
  // 必须在恢复进度之前执行：关闭「保留进度」时先清掉旧数据
  loadKeepProgress()

  // 恢复本地进度（首次进入/杀进程重进），并补齐旧数据可能缺失的字段
  const saved = uni.getStorageSync('interview_progress')
  if (saved && !interviewStore.currentInterview) {
    interviewStore.currentInterview = saved.interview
    interviewStore.rounds = (saved.rounds || []).map((r) => ({ ...r, followUps: r.followUps || [] }))
    interviewStore.currentRound = saved.currentRound || interviewStore.rounds.length
    interviewStore.config = saved.config
    interviewStore.answerMode = saved.answerMode || 'text'
    interviewStore.awaitingFollowUp = !!saved.awaitingFollowUp
    interviewStore.followUpIndex = typeof saved.followUpIndex === 'number' ? saved.followUpIndex : -1
    interviewStore.interviewEnded = !!saved.interviewEnded
  }

  // 带 id 进入（AI Skill 入口 / 历史详情 / 首页「继续」）：本地进度不属于该场时，从服务端重建会话
  const routeId = options.id || ''
  if (routeId) {
    if (interviewStore.currentInterview?.interview_id !== routeId) {
      /* v24：resumeFromServer 失败时只弹 toast 并返回 false，调用方原先不处理 ——
         此时 rounds=[]、isLoading=false，页面会渲染出兜底空态
         「准备开始 / 面霸君正在准备开场白...」，一个永远在等待、实际什么都没
         发生的假加载态；输入框还亮着，用户能对着空气作答。这里记下失败标记，
         由模板换成带出口的错误态。 */
      const ok = await resumeFromServer(routeId)
      if (!ok) resumeFailed.value = true
    } else {
      // 本地进度与目标场次一致：仍要校验服务端状态——该场可能已在别端结束，
      // 拿陈旧进度继续作答提交必报错（幽灵会话）。已结束直接带去报告页
      try {
        const detail = await getInterviewDetail(routeId)
        if (detail && detail.status !== 'in_progress') {
          try { uni.removeStorageSync('interview_progress') } catch (e) { /* 忽略 */ }
          replace(`/pages/report/index?id=${routeId}`, NAV.reveal)
          return
        }
      } catch (e) { /* 弱网校验失败：保留本地进度继续，提交失败自有报错兜底 */ }
    }
  }

  // 首题打字机：startInterview 在配置页就已把首题写入 store 并打好 lastTyped 标记，
  // 但本页 watcher 挂载时 seq 已不再变化、接不到。这里显式消费一次。
  // 只认「新建面试」来源：上面两条恢复路径（本地进度/服务端重建）覆盖的是历史文本，
  // 必须完整展示，不能逐字重演——它们不写 lastTyped，天然被这里跳过
  if (interviewStore.lastTyped?.seq) {
    const t = interviewStore.lastTyped
    if (t.key && t.text) startTyping(t.key, t.text)
    interviewStore.lastTyped = null
  }

  /* 无 id、无本地进度、也没有会话（分享链接进来 / 清缓存后重进 / 从带 id 的
     入口掉了参数）：同样不能停在「正在准备开场白...」的假加载态上，
     否则用户只能靠左上角返回自救。 */
  if (!routeId && !interviewStore.currentInterview && interviewStore.rounds.length === 0) {
    resumeFailed.value = true
  }
})

onMounted(() => {
  initNavMetrics()
  loadFontSize()
  loadVoiceEnabled()

  /* 播报按钮不再依赖 WechatSI 插件（TTS 主通路是服务端合成，插件只在
     audio.js 内部作为兜底）。语音输入仍用插件，不可用时按下会有引导提示。 */
  loadVoiceEnabled()

  // 首次进入：当前问题已在展示（onLoad 已完成本地/服务端恢复），
  // 直接开表计时，否则第一道题的回答时长永远为 0
  startTimer()   // 计时始终进行（见 watch(questionKey) 上的说明），仅显示受 timer_enabled 控制

  uni.setKeepScreenOn({ keepScreenOn: true })
  scrollToBottom()
  /* v32：量一次对话区真实高度，供"是否贴底"判定使用。
     延迟一帧 —— 首帧时 .chat-area 可能还没拿到最终高度（顶栏 padding 由
     :style 注入、实测状态栏高度后才有值），量早了会得到偏大的视口高，
     于是"贴底"永远判 false、"回到最新"一进页面就常驻。
     量不到时 chatViewH 保持 0，onChatScroll 会退化为"始终跟随"。 */
  if (measureTimer) clearTimeout(measureTimer)
  measureTimer = setTimeout(measureChatViewport, 120)
})

/* 从设置页返回时重新读取偏好：字号 + 语音播报（避免切了设置却不生效） */
onShow(() => {
  loadFontSize()
  loadVoiceEnabled()
  loadKeepProgress()
})
onHide(() => {
  // 切后台：播报暂停（回来可点「继续」接上），进度照常保存
  pauseAudio()
  saveProgress()
})
onUnmounted(() => {
  // 先置销毁标记，再清理：让所有 in-flight 的 await 续体与延迟回调立即失效
  destroyed = true
  saveProgress()
  stopTimer()
  stopAudio()
  // 页面销毁清掉打字定时器：跳报告页后 setInterval 不能留在内存里继续跑
  clearTypingTimer()
  clearTimeout(scrollTimer)
  if (measureTimer) { clearTimeout(measureTimer); measureTimer = null }
  /* 收尾定时器必须取消（P1 修复）：它们原先只挂在闭包里、无人引用，
     用户中途返回后仍会触发 → resetInterview + redirectTo 报告页。 */
  clearTimeout(endTimer1)
  clearTimeout(endTimer2)
  uni.setKeepScreenOn({ keepScreenOn: false })
})
</script>

<style lang="scss" scoped>
/* ============================================================
   「面试现场」v35 —— 纸本朱砂 · 压印版
   ============================================================
   立意：这一页是**一张正在被批注的考卷**，不是聊天窗口。

   与改版前（v14「纸面与墨」）的差别，四条：
     ① 顶栏从「进度条 + 一行小字」→ 「考试仪表条」：
        巨号等宽轮次读数 3/6 与微型等宽标签同屏，进度轨改成压印凹槽 + 刻度，
        底边一条齿孔撕线（仪表条是从考卷上撕下来的一联）。
        ★ 同时修掉一个真实缺陷：标题与「结束」按钮重叠（见 .exam-nav）。
     ② AI 提问从「黑/空气泡」→ 「面试官批注」：
        没有底色、没有气泡。等宽题号 Q1（朱砂）+ 署名 + 题型 + 一条通到右边缘的
        发丝线，正文左侧一道朱砂批注线。信息密度靠「抬头三件套 + 正文」建立，
        不再靠一块黑底撑面积。
     ③ 用户回答从「墨色实心泡」→ 「你的答题纸」：
        浅凹槽 + 压印 + 抬头虚线。理由：一屏两块深色实体会让"墨"失去专属性；
        而且长回答白字压黑底，是这一页读起来最累的地方。
     ④ AI 点评从「浅色细条」→ 「批改章」：朱砂方章压住分数，旁边一句点评。

   色彩纪律（v35 第二色轴）：
     · 朱砂 $verm 只出现在「批注线 / 题号 / 批改章 / 录音钮」四处语义位；
     · 等级色 $grade-* 只用于分数读数，不铺底；
     · 底色只有三种：$paper（页面）→ $paper-card（浮起）→ $paper-sunken（凹槽）。
   ============================================================ */

.exam-page {
  /* v30：position:fixed → 100vh 正常流。
     根因：fixed 元素的包含块是**视口**，它不跟随页面的转场动画平移 ——
     本页从右侧/底部推入时，页面容器还在动画途中，而这个 fixed 根节点已经
     「钉」在最终位置，转场期间露出的区域就看到了下层页面（首页 hero 的下边缘）。
     改成 100vh 正常流后布局效果完全等价（同样是撑满一屏的纵向 flex 三段），
     但根节点会跟着页面一起做转场动画。
     ⚠️ 保留 flex 三段：对话区 flex:1，键盘弹起时 .input-area 变高、对话区自动收缩，
        这是聊天页的正确行为。 */
  position: relative;
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: $paper;
  /* 纸张纹理：极淡的斜向条纹，只在放大时可见，作用是把纯色底"做旧"一点点。
     与首页同一条配方（用渐变而不是图片，零请求、可直接调参）。 */
  background-image: repeating-linear-gradient(
    92deg,
    rgba(23, 19, 14, 0.012) 0rpx,
    rgba(23, 19, 14, 0.012) 1rpx,
    transparent 1rpx,
    transparent 4rpx
  );
}

/* ============================================================
   一、顶栏：考试仪表条
   ============================================================ */
.exam-bar {
  position: relative;
  z-index: 10;
  flex-shrink: 0;
  background: $paper-card;
  /* paddingTop 由 :style="topBarStyle" 注入（实测状态栏高度），不要写死避免叠加 */
  box-sizing: border-box;
  /* 撕线压在底边，需要一点内边距给齿孔让位 */
  padding-bottom: 4rpx;
  /* 发丝线做下边界（不是投影 —— 普通区块永不投影） */
  box-shadow: inset 0 -1rpx 0 $rule;
}

/* ★ v35 修复：标题与「结束」重叠。
   旧结构里 .nav-side（左/右）、.nav-center（absolute 满宽居中）三者没有
   justify-content，于是「结束」紧跟在返回键后面，而标题居中在它下面 / 上面 ——
   「前端开发工程师」与「结束」必然叠在一起（截图实锤）。
   新结构是**一路正常流**：返回键定宽 → 文字块 flex:1（min-width:0 + 单行省略）
   → 结束按钮定宽靠右。标题被夹在两个定宽块之间，几何上不可能再重叠。 */
.exam-nav {
  display: flex;
  align-items: center;
  gap: 16rpx;
  height: 80rpx;
  padding: 0 $page-padding;
  /* paddingRight 由 :style="navBarStyle" 注入（实测胶囊让位），不要写死避免叠加 */
  box-sizing: border-box;
}
.back-tile {
  flex-shrink: 0;
  width: 60rpx;
  height: 60rpx;
  border-radius: $radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
  position: relative;
  /* 热区 60→88rpx（44pt）：视觉尺寸不变，纯可用性修复 */
  &::after {
    content: '';
    position: absolute;
    top: -14rpx;
    bottom: -14rpx;
    left: -14rpx;
    right: -14rpx;
  }
}
.back-icon { width: 40rpx; height: 40rpx; display: block; }

/* 文字块：flex:1 吃掉中间剩余宽度，min-width:0 让省略号真正生效
   （flex 子项的默认 min-width:auto 会让它撑破容器、导致溢出而不是省略）。 */
.nav-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.nav-eyebrow {
  display: block;
  font-family: $font-mono;
  font-size: 18rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 1.6rpx;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-title {
  display: block;
  font-size: 30rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -0.6rpx;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 「结束」：描边副按钮（不是主操作）。
   答题才是本页主行动，结束是副操作且带轻度破坏性，抢了主视觉反而误导用户。
   所以它保持小体量 + 发丝描边，只在按压时给反馈。
   圆角收到 $radius-btn（16rpx）：v35 明令禁胶囊。 */
.end-btn {
  position: relative;
  flex-shrink: 0;
  height: 56rpx;
  padding: 0 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $paper-card;
  border: 1rpx solid $rule-strong;
  border-radius: $radius-btn;
  box-sizing: border-box;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out,
              background-color $motion-fast $ease-out;
  /* 热区补到 88rpx（44pt）：本体 56rpx 不动，视觉不抢戏 */
  &::after {
    content: '';
    position: absolute;
    top: -16rpx;
    bottom: -16rpx;
    left: -18rpx;
    right: -18rpx;
  }
}
.end-btn-press {
  opacity: $press-opacity;
  transform: scale($press-scale);
  background: $paper-sunken;
}
.end-label {
  font-size: 26rpx;
  color: $ink;
  font-weight: $weight-semibold;
  letter-spacing: 0.5rpx;
  line-height: 1.2;
}

/* ---- 仪表读数行 ----
   比例张力：72rpx 的等宽巨号读数 / 18rpx 的等宽微型标签，同屏并置。
   这是印刷品与 App 最大的区别 —— 张力来自比例差，不来自字号档位多。 */
.exam-meter {
  display: flex;
  align-items: flex-end;
  gap: 20rpx;
  padding: 8rpx $page-padding 0;
  box-sizing: border-box;
}
.meter-readout {
  display: flex;
  align-items: baseline;
  gap: 2rpx;
  flex-shrink: 0;
}
.meter-cur {
  font-family: $font-mono;
  font-size: 72rpx;
  font-weight: $weight-black;
  color: $text-1;
  line-height: 0.86;
  letter-spacing: -3rpx;
  font-variant-numeric: tabular-nums;
}
.meter-sep {
  font-family: $font-mono;
  font-size: 30rpx;
  font-weight: $weight-regular;
  color: $ash;
  line-height: 1;
  margin: 0 2rpx;
}
.meter-total {
  font-family: $font-mono;
  font-size: 34rpx;
  font-weight: $weight-bold;
  color: $mauve;
  line-height: 1;
  letter-spacing: -1rpx;
  font-variant-numeric: tabular-nums;
}
/* ROUND：微型等宽全大写标签，贴在读数右侧基线处。
   ⚠️ 中文不适用 mono（等宽字体下中文会挤成一团），所以这里只放英文。 */
.meter-cap {
  font-family: $font-mono;
  font-size: 17rpx;
  font-weight: $weight-bold;
  color: $text-4;
  letter-spacing: 2rpx;
  line-height: 1;
  margin-left: 8rpx;
  padding-bottom: 3rpx;
}

.meter-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5rpx;
  padding-bottom: 4rpx;
}
/* 计时 chip：压在读数行右侧，与状态读数同一行（读数就该和读数待在一起）。
   ⚠️ 布局注意：chip 曾是 .exam-meter 的**第三个 flex 子项**，
   把 .meter-info（状态 + MODE）挤成偏左的一列，读数行因此不再右对齐 ——
   截图里「进行中 / MODE」明显往左缩了一截。
   现在 chip 与 .meter-info 同处一个右侧纵向栈（.meter-tail），
   横向只有「轮次读数 + 右侧栈」两栏，读数行天然右对齐。 */
.meter-tail {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  padding-bottom: 2rpx;
  /* ★ v35 修复：状态/计时/模式这一叠读数必须**靠右**。
     原先它紧跟在左边的轮次读数后面（截图实锤：尾部掉到了左侧）。
     margin-left:auto 把它推到 flex 行的最右端，
     左边巨号轮次 + 右边小读数形成「两端对齐」的仪表条布局。 */
  margin-left: auto;
}
.status-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.status-mark {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background-color $motion-base $ease-out;
}
/* 状态色：statusClass 返回的 status-active/-thinking/-done 与 status-mark
   挂在【同一个元素】上（见模板 `class="status-mark" :class="statusClass"`），
   所以必须用复合选择器。用后代选择器 `.status-active .status-mark`
   **永远匹配不到**，圆点会一直是没有 background 的透明方块
   （已核对编译产物 wxml/wxss 确认，勿改回）。 */
.status-mark.status-active { background: $verm; }
.status-mark.status-thinking { background: $mauve; animation: pulse 1.2s infinite $ease-smooth; }
.status-mark.status-done { background: $ash; }
.status-text {
  font-size: 22rpx;
  color: $text-2;
  font-weight: $weight-semibold;
  letter-spacing: 0.5rpx;
  line-height: 1.2;
}
/* 模式读数：微型等宽，是仪表条的第二行"副读数" */
.meter-sub {
  font-family: $font-mono;
  font-size: 17rpx;
  font-weight: $weight-bold;
  color: $text-4;
  letter-spacing: 1.4rpx;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* 计时 chip：凹槽小托座（与输入槽同一「凹」语言）。
   它是这道题的节拍器，属于"读数"，所以留在仪表条的读数行里。 */
.timer-chip {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  flex-shrink: 0;
  margin-left: 10rpx;
  padding: 4rpx 10rpx;
  border-radius: $radius-xs;
  background: $paper-sunken;
  box-shadow: $emboss-1;
}
.timer-dot {
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: $verm;
  display: inline-block;
  flex-shrink: 0;
  animation: pulse 1.2s infinite ease-in-out;
}
.timer-text {
  font-family: $font-mono;
  font-size: 22rpx;
  color: $text-1;
  font-weight: $weight-bold;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.6rpx;
  line-height: 1;
}

/* ---- 进度轨：压印凹槽 + 刻度 ----
   旧版是 6rpx 高的普通圆角进度条（看起来像加载控件）。
   v35 改成一条**压进纸面的槽**：$paper-sunken 底 + $emboss-2 内阴影，
   填充是墨色实心，上面压一道刻度（repeating-linear-gradient，零 DOM、可缩放）。
   刻度让"还剩几轮"变成一个可数的量 —— 这是压迫感的真正来源。 */
.meter-track {
  position: relative;
  /* ★ v35：10rpx → 12rpx。10rpx 在 2 倍屏下只有 5px 厚，1rpx 的刻度缝
     几乎看不见，整条读作一根黑线；加高到 12rpx 后刻度才立得住。 */
  height: 12rpx;
  margin: 12rpx $page-padding 10rpx;
  border-radius: $radius-xs;
  background: $paper-sunken;
  box-shadow: $emboss-2;
  overflow: hidden;
  box-sizing: border-box;
}
.progress-fill {
  height: 100%;
  background: $ink;
  border-radius: $radius-xs;
  /* 时长收进动效刻度，缓动换全站 $ease-out */
  transition: width $motion-slow $ease-out;
}
/* 刻度：每 26rpx 一道 2rpx 的纸色竖线，压在填充之上。
   用「纸色」而不是深色：这样它既能在墨色填充上读作刻度，又能在空槽上读作凹痕。
   ★ v35 调整：原来刻度宽 2rpx、间距 26rpx，在 340px 宽的槽里排出十几道
   2rpx 的白缝，2 倍屏下看就是一排"虚线"，把填充读成了锯齿条。
   改成 1rpx 细缝 + 34rpx 间距 —— 刻度还在，但退到背景层，填充读作连续的一段。 */
.meter-ticks {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    to right,
    rgba(249, 246, 241, 0.75) 0rpx,
    rgba(249, 246, 241, 0.75) 1rpx,
    transparent 1rpx,
    transparent 34rpx
  );
}

/* 齿孔撕线：仪表条是从考卷上撕下来的一联。
   实现用 radial-gradient + background-size 平铺，零图片、可缩放
   （与首页 .hero-perf 同一配方）。 */
.bar-perf {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1rpx;
  height: 8rpx;
  z-index: 2;
  pointer-events: none;
  background-image: radial-gradient(
    circle at 50% 0%,
    $paper 0rpx,
    $paper 3rpx,
    transparent 3rpx
  );
  background-size: 20rpx 8rpx;
  background-repeat: repeat-x;
  background-position: center top;
  opacity: 0.85;
}

/* 进度档位：20 档（每档 5%）。保留预定义宽度类而不是 :style 动态绑定 ——
   mp-weixin 上动态 style 的数值拼接有过编译坑（见 <script> 里 clampRound 的注释）。 */
.w1 { width: 5%; }
.w2 { width: 10%; }
.w3 { width: 15%; }
.w4 { width: 20%; }
.w5 { width: 25%; }
.w6 { width: 30%; }
.w7 { width: 35%; }
.w8 { width: 40%; }
.w9 { width: 45%; }
.w10 { width: 50%; }
.w11 { width: 55%; }
.w12 { width: 60%; }
.w13 { width: 65%; }
.w14 { width: 70%; }
.w15 { width: 75%; }
.w16 { width: 80%; }
.w17 { width: 85%; }
.w18 { width: 90%; }
.w19 { width: 95%; }
.w20 { width: 100%; }

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.25); opacity: 0.7; }
}

/* ============================================================
   二、对话区：纸面
   ============================================================ */
.chat-area {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  height: 0;
  box-sizing: border-box;
  padding: 20rpx $page-padding 28rpx;
  overflow: hidden;
  background: transparent;
}
.round-block { margin-bottom: 36rpx; }

/* ---- 免责声明：纸边注脚 ----
   合规标识必须真正可读（不能做成"几乎看不见"的形式合规），
   但也不该在视觉上抢走题面 —— 所以给它一条虚线的立边，读作"印在页边的脚注"。 */
.ai-disclaimer {
  display: flex;
  align-items: stretch;
  gap: 14rpx;
  padding: 4rpx 0 22rpx;
}
.disclaimer-rule {
  width: 0;
  border-left: 1rpx dashed $rule-strong;
  flex-shrink: 0;
  margin-left: 2rpx;
}
.disclaimer-text {
  flex: 1;
  min-width: 0;
  font-size: 20rpx;
  color: $text-3;
  line-height: 1.62;
  letter-spacing: 0.3rpx;
}

/* ============================================================
   三、面试官批注（AI 提问）
   ============================================================
   改版前：一块纯黑/空白大块（.q-bubble 里黑底 + 几乎无内容），
   信息密度极低，且和「你的回答」抢同一个深色语义。
   v35：不做气泡、不做底色 —— 它就是纸上的一段红笔批注。

   结构（自上而下建立信息密度）：
     抬头：等宽题号 Q1（朱砂）· 头像 · 署名 · 题型标签 · 通到右边缘的发丝线
     正文：左批注线 + 题面文字（本页字号最大的内容）
     动作：播报胶囊（描边，居正文下方）
   抬头那三件套是"密度"的来源：它把「谁在问、第几题、什么题型」一次交代完，
   而不是把所有这些都塞进一个气泡的顶部小字。 */
.q-note {
  position: relative;
  margin-bottom: 22rpx;
  animation: msgIn 0.44s cubic-bezier(0.22, 1, 0.36, 1) both;
}
/* 首题正在打字时禁用入场动画：打字机已在逐字揭示，
   叠加位移+淡入会让从配置页进来的第一眼闪一下 */
.q-note.no-anim { animation: none; }

.note-head {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 10rpx;
  padding-left: 2rpx;
}
/* 题号：朱砂等宽（与 uni.scss 的 @mixin mono-index 同源，
   但这里要稍大一号 —— 它承担"第几题"的结构作用，不只是装饰）。 */
.note-no {
  font-family: $font-mono;
  font-size: 22rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 1rpx;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
/* 署名头像：28rpx 太小认不出、56rpx 又变成"发言人头像卡"。
   34rpx 配压痕环，读作"盖章的小圆标"而不是头像。 */
.note-mascot {
  width: 34rpx;
  height: 34rpx;
  border-radius: 50%;
  flex-shrink: 0;
  background: $paper-card;
  border: 1rpx solid $rule;
}
.note-name {
  font-size: 22rpx;
  font-weight: $weight-semibold;
  color: $text-2;
  letter-spacing: 0.5rpx;
  line-height: 1.2;
  flex-shrink: 0;
}
/* 题型标签：徽章圆角 4rpx（v35：接近方形，像盖章）。
   描边而非填充 —— 这一页的填充位留给"凹槽"。 */
.note-type {
  font-size: 19rpx;
  color: $text-3;
  letter-spacing: 0.4rpx;
  line-height: 1.5;
  padding: 2rpx 10rpx;
  border: 1rpx solid $rule;
  border-radius: $radius-xs;
  flex-shrink: 0;
}
/* 追问标签：朱砂浅底 + 朱砂字，是"这一条是同一题链"的语义标记 */
.follow-tag {
  font-size: 19rpx;
  color: $verm;
  font-weight: $weight-bold;
  letter-spacing: 0.6rpx;
  line-height: 1.5;
  padding: 2rpx 10rpx;
  background: $verm-soft;
  border: 1rpx solid $verm-line;
  border-radius: $radius-xs;
  flex-shrink: 0;
}
/* 通到右边缘的发丝线：这一笔把"抬头"钉在页面结构上
   （没有它，抬头会飘在正文上方像一撮标签）。 */
.note-line {
  flex: 1;
  min-width: 16rpx;
  height: 1rpx;
  background: $rule;
  margin-left: 4rpx;
}

.note-body {
  position: relative;
  padding-left: 24rpx;
  /* 左边距与题号基线对齐：题号在 padding-left:2rpx 处，
     正文批注线在 padding-left:24rpx 处，视觉上形成"编号 | 内容"的两栏。 */
}
/* 朱砂批注线：上深下浅渐隐。
   为什么渐隐：批注是"人手写的"，笔压天然由重到轻；
   一条等亮的实线会读成"分割线"，那是表格语言，不是批注语言。 */
.note-body::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4rpx;
  bottom: 6rpx;
  width: 3rpx;
  border-radius: 3rpx;
  background: linear-gradient(180deg, $verm 0%, rgba(192, 57, 43, 0.14) 100%);
}

/* 追问：从属于上一题。
   三个手段叠加（缩进 + 批注线变浅 + 头像变小降透明），
   任何一种单独看都不够 —— 此前只有一枚 19rpx 的小标签，很容易被滚动跳过。
   文字字号**不动**：追问仍是要认真作答的内容，缩小字号会削弱可读性。 */
.q-note.is-follow {
  margin-left: 24rpx;
  margin-bottom: 18rpx;
}
.q-note.is-follow .note-mascot {
  width: 28rpx;
  height: 28rpx;
  opacity: 0.72;
}
.q-note.is-follow .note-body::before {
  background: linear-gradient(180deg, rgba(192, 57, 43, 0.34) 0%, rgba(192, 57, 43, 0.06) 100%);
}
.q-note.is-follow .note-name { color: $text-3; font-weight: $weight-medium; }

/* 结束语：不是"第几题"，而是一道收束线 */
.q-note.is-ending .note-no { color: $mauve; letter-spacing: 1.4rpx; }
.q-note.is-ending .note-body::before {
  background: linear-gradient(180deg, $ink 0%, rgba(23, 19, 14, 0.08) 100%);
}

/* 题面正文：本页字号最大的内容（30rpx），用户回答小一档（28rpx）——
   「问题大、回答小」的层级暗示：你的任务是把题答好。
   中文微开字距 + 宽行距，长题干读起来像印在纸上。 */
.q-content {
  position: relative;
  font-size: 30rpx;
  color: $text-1;
  line-height: 1.78;
  font-weight: $weight-medium;
  letter-spacing: 0.2rpx;
  padding: 2rpx 0;
  word-break: break-word;
  white-space: pre-wrap;
  display: block;
}

/* 打字光标（v32 重做）：零宽竖线跟在字尾，是「面试官正在说话」的呼吸感来源。
 *
 * ⚠️ 为什么必须是 ::after + width:0，而不是把 «▍» 拼在字尾：
 *   行内字形的「墨迹宽度」参与排版。一行恰好填满时，末尾那个光标字形会把
 *   剩余空间挤爆 → 光标自己掉到下一行 → 气泡瞬间高出一行；下一个字到了，
 *   文字重新分配行宽、光标又缩回上一行 → 气泡缩回去。
 *   逐字揭示每到一个换行点就「长一下、缩回去」，滚动条跟着跳 ——
 *   这是流式对话里最容易被用户描述为「页面在抖」的那类缺陷。
 *   零宽伪元素只用 border 画墨线，**不占任何 layout 宽度**，
 *   气泡高度于是只随文字单调增长，永不回跳。 */
.q-content.is-typing::after {
  content: '';
  display: inline-block;
  width: 0;
  height: 1em;
  vertical-align: -0.14em;
  border-right: 2rpx solid $verm;
  margin-left: 3rpx;
  opacity: 0.9;
  animation: caretBreathe 1s ease-in-out infinite;
}
@keyframes caretBreathe {
  0%, 42%   { opacity: 0.9; }
  62%, 100% { opacity: 0.12; }
}

/* 字号档（设置页联动）：三档的字距随字号反向微调 —— 小字要多一点字距才不糊，
   大字要收一点才不散（与正文 0.2rpx 同源逻辑）。 */
.q-content.fs-small,  .a-content.fs-small  { font-size: 27rpx; line-height: 1.74; letter-spacing: 0.3rpx; }
.q-content.fs-medium, .a-content.fs-medium { font-size: 30rpx; line-height: 1.78; letter-spacing: 0.2rpx; }
.q-content.fs-large,  .a-content.fs-large  { font-size: 35rpx; line-height: 1.82; letter-spacing: 0.1rpx; }

.note-actions {
  margin-top: 12rpx;
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
  padding-left: 2rpx;
}
/* 「播报」胶囊：描边小徽章（与题型标签同语言），是题干下方的一个**动作**而非装饰。
   播放中才变墨材质 —— 那时它是页面里唯一需要被看到的实体。 */
.tts-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7rpx;
  padding: 7rpx 16rpx;
  background: transparent;
  border: 1rpx solid $rule-strong;
  border-radius: $radius-xs;
  transition:
    background-color $motion-base $ease-out,
    border-color $motion-base $ease-out,
    box-shadow $motion-base $ease-out;
}
/* v32 热区：本体约 50rpx 高（26pt），明显低于 44pt 建议值。
   "播报"是本页高频且需要精准点中的小目标（用户常在通勤时点它），
   点偏一次就是"没反应"。用伪元素把热区补到 88rpx，**视觉尺寸一分不变**。 */
.tts-pill::after {
  content: '';
  position: absolute;
  top: -19rpx;
  bottom: -19rpx;
  left: -12rpx;
  right: -12rpx;
}
.tts-pill-icon { width: 24rpx; height: 24rpx; flex-shrink: 0; }
.tts-pill-text {
  font-size: 21rpx;
  font-weight: $weight-bold;
  color: $text-2;
  line-height: 1.3;
  letter-spacing: 0.6rpx;
  transition: color $motion-base $ease-out;
}
/* 播放中：墨材质（本页唯一允许"变深"的地方），视觉锚点一眼可寻 */
.tts-pill.playing {
  border-color: transparent;
  background-image: $ink-gradient;
  box-shadow: $ink-edge, 0 6rpx 16rpx rgba(23, 19, 14, 0.22);
  animation: chipPop $motion-base $ease-bounce;
}
.tts-pill.playing .tts-pill-text { color: #FFFFFF; }
/* 暂停态：描边加深，与"可继续"语义区分。
   v32：语义是「本条正在播、且被暂停了」—— 模板的 paused 判定已与本条 tag 绑定，
   .tts-pill.paused 不再会因为全局 audioPaused 命中全页所有胶囊。 */
.tts-pill.paused { border-color: $mauve; }

/* ===== 已播完（v32 第三态）=====
 * 播完不再整条回落成"从没点过"的样子 —— 那会让用户无法确认「这题我听完没有」。
 * 只改两处，都是最轻的语义变化，不新增任何色块：
 *   · 描边与文字提到"已读"档（$rule-strong / $text-2）
 *   · 文案换成「重播」
 * 刻意**不加**对勾之类的完成标记：TTS 只是辅助通道，把它做成"任务清单"
 * 会误导用户以为必须听完才算作答。 */
.tts-pill.played { border-color: $ink-soft; border-style: dashed; }
.tts-pill.played.playing { border-color: transparent; border-style: solid; }

@keyframes chipPop {
  0%   { transform: scale(0.93); }
  55%  { transform: scale(1.03); }
  100% { transform: scale(1); }
}

/* ============================================================
   四、你的答题纸（用户回答）
   ============================================================
   v35 把「墨色实心泡」换成「纸上的答题格」：
     · 浅凹槽（$paper-sunken + $emboss-1）—— 纸被按下去的一格
     · 抬头一条虚线 + 朱砂点 + mono 用时读数
     · 正文墨色、行距放宽，读长回答不累
   为什么改掉黑泡：
     ① 一屏出现两块深色实体（AI 与用户）会让"墨"失去专属性，
        而墨在本设计系统里是"唯一强调"的意思；
     ② 长回答白字压黑底是这一页最累的阅读段；
     ③ 黑泡和首页 hero 撞材质，整站黑块太多就变成"通用深色 App"。 */
.a-sheet {
  margin: 0 0 22rpx 24rpx;
  padding: 16rpx 20rpx 18rpx;
  background: $paper-sunken;
  border-radius: $radius-lg;
  box-shadow: $emboss-1;
  animation: msgIn 0.44s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding-bottom: 10rpx;
  margin-bottom: 10rpx;
  /* 虚线抬头：这一笔是"答题格"的关键 —— 它在凹槽里又切出一层，
     让"谁的回答 / 用了多久"和"回答本身"分开。 */
  border-bottom: 1rpx dashed $rule-strong;
}
.sheet-tag {
  display: flex;
  align-items: center;
  gap: 7rpx;
  min-width: 0;
}
.tag-dot {
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: $verm;
  flex-shrink: 0;
}
.tag-text {
  font-size: 20rpx;
  font-weight: $weight-bold;
  color: $text-3;
  letter-spacing: 1.4rpx;
  line-height: 1.2;
}
/* 用时：等宽读数 + tabular-nums（秒数跳动时不会左右抖）。
   ⚠️ 可读性修复：旧写法的整个短语用 $text-4(#C2B8AC) 压在 $paper-sunken(#F1ECE3)
   凹槽上，实测对比度 ≈1.5:1 —— 这不是"克制"，是**读不出来**。
   现在拆三段：中文量词 $text-3（可读），数字走 mono + $text-1（是读数，要能读清），
   「这是读数」这一点由等宽与 tabular-nums 表达，而不是靠压暗来表达次要。 */
.sheet-meta {
  display: flex;
  align-items: baseline;
  gap: 3rpx;
  flex-shrink: 0;
}
.meta-cap {
  font-size: 18rpx;
  color: $text-3;
  letter-spacing: 0.4rpx;
  line-height: 1.2;
}
.meta-num {
  font-family: $font-mono;
  font-size: 21rpx;
  font-weight: $weight-bold;
  color: $text-2;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  line-height: 1.2;
}
.a-content {
  font-size: 28rpx;
  color: $text-1;
  line-height: 1.78;
  font-weight: $weight-regular;
  letter-spacing: 0.2rpx;
  word-break: break-word;
  white-space: pre-wrap;
  display: block;
}

/* ============================================================
   五、AI 点评：批改章
   ============================================================
   改版前是一条浅灰细条 + 一个数字，克制到看不出"AI 刚给你打了分"。
   v35 做成**批改章**：朱砂方章压住分数（等级色徽章圆角 4rpx，像盖章），
   右边一句点评。它是本页唯一带"章"语义的元素。 */
.fb {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  margin: 0 0 22rpx 24rpx;
  padding: 14rpx 18rpx;
  background: $verm-soft;
  border: 1rpx solid $verm-line;
  border-radius: $radius-md;
  animation: msgIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}
/* 分数章：等宽巨号 + 量程分母。分数是"读数"，必须 mono + tabular-nums。 */
.fb-badge {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 2rpx;
  padding: 6rpx 10rpx;
  border: 1rpx solid $verm-line;
  border-radius: $radius-xs;
  background: rgba(255, 255, 255, 0.6);
}
.fb-score {
  font-family: $font-mono;
  font-size: 34rpx;
  font-weight: $weight-black;
  color: $verm;
  line-height: 1;
  letter-spacing: -1.2rpx;
  font-variant-numeric: tabular-nums;
}
.fb-max {
  font-family: $font-mono;
  font-size: 17rpx;
  font-weight: $weight-medium;
  /* 量程分母是读数的一部分（"这轮 7 分，满分 10"），不是装饰后缀，
     不可读等于让评分失去量纲。$text-3 在朱砂浅底上仍有 3.5:1。 */
  color: $text-3;
  line-height: 1;
  letter-spacing: 0;
}
.fb-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.fb-label {
  font-family: $font-mono;
  font-size: 17rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 1.6rpx;
  line-height: 1.3;
}
.fb-text {
  font-size: 24rpx;
  color: $text-2;
  line-height: 1.65;
  letter-spacing: 0.2rpx;
  word-break: break-word;
}

/* v14 入场：位移克制（14rpx）、缓动柔（cubic-bezier(0.22,1,0.36,1)），
   弹性收尾不夸张 —— 「内容稳稳落定」比「飞入」更符合纸面气质。 */
@keyframes msgIn {
  0%   { opacity: 0; transform: translateY(14rpx) scale(0.985); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* ============================================================
   六、思考中：一行小点 + 文字（去卡片）
   ============================================================
   提问侧已经全面去气泡，思考态理应跟上同一语法。
   圆点是与提问文字左对齐（躲过题号与批注线）。
   v32：改顶对齐 —— 长等待时会有第二行安抚文案，
   居中会让三点波浪随着行数变化上下浮。 */
.thinking-bubble {
  display: flex;
  align-items: flex-start;
  padding: 4rpx 0;
  margin: 0 0 28rpx 24rpx;
  width: fit-content;
  max-width: calc(100% - 24rpx);
  box-sizing: border-box;
  animation: msgIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.thinking-dots { display: flex; gap: 9rpx; margin-right: 14rpx; padding-top: 12rpx; }
.thinking-body { display: flex; flex-direction: column; min-width: 0; }
.dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: $verm;
  /* 走全局 waveDot（App.vue 定义，页面 WXSS 可直接引用，与 fadeUp/fadeIn 同一机制）。
     本页不再自带一份 dotWave —— 那会造成"同一套等待语言两种节奏"。 */
  animation: waveDot 1.4s infinite ease-in-out both;
}
/* 相位错峰：-0.4/-0.2/0 让波峰从左向右扫过，读作"一条波在走"而不是"三颗一起闪" */
.dot:nth-child(1) { animation-delay: -0.4s; }
.dot:nth-child(2) { animation-delay: -0.2s; }
.dot:nth-child(3) { animation-delay: 0s; }
.thinking-text {
  font-size: 24rpx;
  color: $text-3;
  letter-spacing: 0.8rpx;
  line-height: 1.5;
  transition: color $motion-base $ease-out;
}
/* 长等待安抚副行：比主行再轻一档，只交代"没卡住"，不解释技术原因 */
.thinking-hint {
  margin-top: 4rpx;
  font-size: 21rpx;
  color: $text-4;
  line-height: 1.4;
  letter-spacing: 0.4rpx;
}

/* ============================================================
   七、空态 / 恢复失败
   ============================================================ */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
}
.empty-mascot { width: 200rpx; height: 200rpx; margin-bottom: 32rpx; }
.empty-title { font-size: 32rpx; font-weight: $weight-heavy; color: $text-1; margin-bottom: 12rpx; letter-spacing: -0.6rpx; }
.empty-tip { font-size: 25rpx; color: $text-3; line-height: 1.6; text-align: center; }
.empty-actions {
  display: flex;
  gap: 18rpx;
  margin-top: 36rpx;
}
.empty-btn { min-width: 232rpx; }

/* ============================================================
   八、输入托盘：压印槽
   ============================================================
   v35 的底线：**禁止胶囊**。
   旧版是一个 48rpx 圆角的白色浮岛 + 三层投影（iOS 26 浮岛语言）。
   那套语言属于"通用 App"，与纸本压印冲突 —— 一颗漂浮的胶囊不可能同时
   是"被压进纸面的一条槽"。
   v35：托盘 = 纸面 + 顶部发丝线；槽 = $paper-sunken + $emboss-2；
   槽里的键是**凸起**的（白底 + 发丝描边），字段是**凹进去**的。
   「凹槽里放凸键」就是这一整块的全部设计。 */
.input-area {
  position: relative;
  z-index: 10;
  flex-shrink: 0;
  box-sizing: border-box;
  background: $paper;
  box-shadow: inset 0 1rpx 0 $rule;
  padding: 12rpx $page-padding 0;
  padding-bottom: calc(14rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

/* 槽头：微型等宽标签 + 模式提示。
   压印槽必须"有抬头"，否则它只是一块灰底 —— 抬头交代了这一格要你做什么。 */
.composer-cap {
  display: flex;
  align-items: baseline;
  gap: 10rpx;
  padding: 0 4rpx 8rpx;
}
.cap-label {
  font-family: $font-mono;
  font-size: 17rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 1.8rpx;
  line-height: 1;
  flex-shrink: 0;
}
.cap-hint {
  font-size: 19rpx;
  color: $text-4;
  letter-spacing: 0.3rpx;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 槽本体 */
.composer {
  display: flex;
  align-items: flex-end;
  gap: 10rpx;
  min-height: 92rpx;
  padding: 10rpx 10rpx 10rpx 12rpx;
  background: $paper-sunken;
  border: 1rpx solid rgba(23, 19, 14, 0.045);
  border-radius: $radius-md;
  box-sizing: border-box;
  box-shadow: $emboss-2;
  /* 聚焦时不靠描边变黑，而是整条槽"再压深一点"：内阴影加重 + 描边略深。
     这与首页压印刻度同一语言 —— 反馈是"纸变了"，不是"控件亮了"。 */
  transition: box-shadow $motion-base $ease-out, border-color $motion-base $ease-out;
}
.composer.focused {
  border-color: rgba(23, 19, 14, 0.10);
  box-shadow: $emboss-3;
}

/* 模式切换：朱砂描边的圆形钮。
   v35 用「等级色描边」给这颗键语义 —— 它管的是"声音"，
   而朱砂（$grade-a）在本系统里正是强调/当下这一档。
   圆形是刻意保留的例外（v35 允许 chip/头像/开关/圆形操作键用 999rpx）：
   它是一颗**物理按键**，不是一块 UI 卡片。 */
.mode-btn {
  width: 64rpx;
  height: 64rpx;
  margin-bottom: 4rpx;
  background: $paper-card;
  border: 1.5rpx solid $verm-line;
  border-radius: $radius-pill;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
  box-shadow: 0 1rpx 0 rgba(255, 255, 255, 0.9), $emboss-1;
  transition: background-color $motion-fast $ease-out, transform $motion-fast $ease-out,
              border-color $motion-fast $ease-out, box-shadow $motion-fast $ease-out;
}
/* v29：这里刻意**不写** :active —— 模板已挂 hover-class="hover-press"，
   两套反馈会同时生效（0.975 叠加 0.94 = 0.9165），一次按下缩两段。 */
.mode-btn.disabled {
  opacity: 0.45;
  pointer-events: none;
}
.mode-icon {
  width: 32rpx;
  height: 32rpx;
  display: block;
}

.input-wrapper {
  flex: 1;
  min-width: 0;
  padding: 0 6rpx;
  box-sizing: border-box;
}
/* 文本域：单行 18+40+18=76rpx（与发送键等高），随内容增高，超 5 行后内部滚动。
   透明底 —— 槽本身就是凹的，字段不该再凹一层（层次只有三招，用完就停）。 */
.text-input {
  display: block;
  width: 100%;
  min-height: 76rpx;
  max-height: 260rpx;
  padding: 18rpx 0;
  line-height: 40rpx;
  font-size: 29rpx;
  color: $text-1;
  font-weight: $weight-medium;
  letter-spacing: 0.3rpx;
  background: transparent;
  border: none;
  box-sizing: border-box;
}
.voice-area {
  flex: 1;
  min-width: 0;
  /* 与文字模式的文本域/发送键同高（76rpx）：切换模式时 composer 高度不变，
     左侧模式钮与右侧语音键高度一致，不会出现「一边高一边矮」 */
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
/* 自定义组件宿主节点（<voice-button>）才是 .voice-area 的真正 flex 子项，
   组件内部 .voice-btn 的 flex:1 作用不到宿主上（宿主默认 block、不伸展），
   导致语音键缩成内容宽的"孤岛"漂在槽里。让宿主撑满，.voice-btn 再填满宿主。 */
.voice-area voice-button {
  display: block;
  width: 100%;
}

/* 发送键：方形印章（v35 圆角收敛）。
   未激活 = 空描边（还不能发）→ 激活 = 墨实底白箭头。
   为什么不做成圆形：圆形已经给了「模式钮」（物理按键语义），
   发送是一个**动作的确认**，在纸本语言里它该是一枚方章。 */
.send-btn {
  width: 68rpx;
  height: 68rpx;
  margin-bottom: 4rpx;
  background: transparent;
  border: 1rpx solid $rule-strong;
  border-radius: $radius-sm;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out,
              background-color $motion-fast $ease-out, box-shadow $motion-fast $ease-out,
              border-color $motion-fast $ease-out;
}
.send-icon {
  width: 32rpx;
  height: 32rpx;
  display: block;
}
/* 激活：墨实底 + 墨边。这是输入槽里唯一的主行动，也是本页第二个深色实体
   （第一个是仪表条的进度填充）——
   深色只给"正在发生的事"，不给"已经说完的话"。 */
.send-btn.active {
  background: $ink;
  border-color: $ink;
  box-shadow: 0 2rpx 6rpx rgba(23, 19, 14, 0.20);
}
/* v29：刻意不写 .send-btn.active:active —— 模板已挂 hover-class="hover-press"。
   两者同时生效时 scale 会叠成 0.92 × 0.975 ≈ 0.897，比模式键还多缩一档。 */
.send-btn.loading {
  opacity: 0.5;
}

/* ============================================================
   九、回到底部浮标（v32）
   ============================================================
   挂在 .input-area 内、bottom:100% —— 正好贴在输入托盘正上方。
   为什么不用 position:fixed：本页根节点已改为正常流 + overflow:hidden
   （见 .exam-page 的说明），fixed 的包含块是视口、不跟随页面转场，
   会在切换页面的动画里"钉"在原地露出残影。相对 .input-area 定位既跟随转场，
   又自动避开键盘弹起（托盘整体上移，浮标跟着上移）。
   形态：白底 + 发丝描边 + 小圆角，不压住文字 —— 对话区 padding-bottom 28rpx。 */
.back-to-bottom {
  position: absolute;
  right: $page-padding;
  bottom: 100%;
  margin-bottom: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7rpx;
  height: 60rpx;
  padding: 0 20rpx;
  background: $paper-card;
  border: 1rpx solid $rule-strong;
  border-radius: $radius-sm;
  box-shadow: $shadow-pop;
  box-sizing: border-box;
  z-index: 3;
  /* 出现不位移只淡入：滚动本身已经在动，再叠一个位移动画会读作"页面又抖了一下" */
  animation: fadeIn $motion-fast $ease-out both;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
/* 热区补到 88rpx（44pt）：本体 60rpx 不动，视觉不抢戏。
   （伪元素属于本节点 → 点它等于点按钮，不会穿过到下面的内容。） */
.back-to-bottom::after {
  content: '';
  position: absolute;
  top: -14rpx;
  bottom: -14rpx;
  left: -12rpx;
  right: -12rpx;
}
.back-to-bottom-icon { width: 22rpx; height: 22rpx; display: block; flex-shrink: 0; }
.back-to-bottom-text {
  font-size: 22rpx;
  font-weight: $weight-semibold;
  color: $text-2;
  letter-spacing: 0;
  line-height: 1;
}
</style>
