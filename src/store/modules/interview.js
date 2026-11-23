import { defineStore } from 'pinia'
import { createInterview, submitAnswer, completeInterview } from '@/api/interview'

/* 打字机效果的「新内容」标记。
 * 页面靠它区分「AI 刚生成的文本」与「从本地进度/服务端恢复的历史文本」：
 * 只有前者需要逐字揭示，恢复的历史进度应直接完整展示。
 * 字段：key 定位到具体气泡（页面里的 reactive map 键），text 为完整文本。 */
let typedSeq = 0

export const useInterviewStore = defineStore('interview', {
  state: () => ({
    currentInterview: null,    // 当前面试会话
    currentRound: 0,           // 当前轮次（1-based）
    rounds: [],                // 轮次列表
    isLoading: false,          // AI处理中
    // WechatSI 语音插件恢复授权前，语音识别不可用，默认走文字模式
    answerMode: 'text',        // 回答方式 voice/text
    config: null,              // 面试配置
    awaitingFollowUp: false,   // 当前问题是否为追问（决定用户回答归属）
    followUpIndex: -1,         // 当前追问在 followUps 中的下标
    interviewEnded: false,     // AI 已给出结束语，面试结束
    lastTyped: null            // 刚生成的 AI 文本（{ key, text, seq }），页面据此启动打字机
  }),

  actions: {
    // 创建面试
    async startInterview(config) {
      this.config = config
      const res = await createInterview(config)
      this.currentInterview = res
      this.currentRound = 1
      this.awaitingFollowUp = false
      this.followUpIndex = -1
      this.interviewEnded = false
      this.rounds = [{
        roundNumber: 1,
        question: res.first_question,
        questionType: '自我介绍',
        userAnswer: '',
        answerDuration: 0,
        followUps: []
      }]
      this.lastTyped = { key: 'r1', text: res.first_question, seq: ++typedSeq }
      return res
    },

    // 提交回答（SSE 流式，解析反馈类型驱动状态机）
    async submitAnswer(answer, answerDuration) {
      if (this.isLoading) throw new Error('上一条回答还在处理中，请稍候')
      if (!this.currentInterview?.interview_id) throw new Error('面试会话已失效，请重新开始')
      this.isLoading = true

      // 将回答挂到正确的位置（主问题 or 追问）
      const currentRoundObj = this.rounds[this.currentRound - 1]
      if (!currentRoundObj) {
        this.isLoading = false
        throw new Error('会话进度异常，请退出后从历史记录继续')
      }
      if (this.awaitingFollowUp && this.followUpIndex >= 0) {
        const fu = currentRoundObj.followUps[this.followUpIndex]
        if (fu) {
          fu.userAnswer = answer
          fu.answerDuration = answerDuration
        }
      } else {
        currentRoundObj.userAnswer = answer
        currentRoundObj.answerDuration = answerDuration
      }

      let buffer = ''
      let completeResult = null
      let errorMsg = null

      // 解析 SSE：事件以 \n\n 分隔，行格式为 event: xxx / data: {...}
      const parseSSE = (text) => {
        buffer += text
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || '' // 保留未完成的片段
        for (const part of parts) {
          if (!part.trim()) continue
          let eventName = 'message'
          let dataStr = ''
          part.split('\n').forEach((line) => {
            if (line.startsWith('event:')) eventName = line.slice(6).trim()
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim()
          })
          if (!dataStr) continue
          let parsed
          // 单帧解析失败只跳过该帧（continue），不能 return 中断后续帧，
          // 否则一个坏帧会吞掉后面的 complete 事件，面试静默卡住
          try { parsed = JSON.parse(dataStr) } catch (e) { continue }
          if (eventName === 'complete') {
            completeResult = parsed
          } else if (eventName === 'error') {
            errorMsg = parsed.message || 'AI 服务异常，请稍后重试'
          } else if (parsed && parsed.type) {
            // message 类型的 data 片段：{ type, content, round_number }
            if (!completeResult) completeResult = parsed
          }
        }
      }

      try {
        // 追问回答：明确告诉后端是 follow_up 答案，后端据此写 follow_ups[].user_answer，不覆盖主问题答案
        const payload = {
          round_number: this.currentRound,
          answer,
          answer_mode: this.answerMode,
          answer_duration: answerDuration,
          answer_role: this.awaitingFollowUp && this.followUpIndex >= 0 ? 'follow_up' : 'main',
          follow_up_index: this.awaitingFollowUp && this.followUpIndex >= 0 ? this.followUpIndex : -1
        }
        await submitAnswer(
          this.currentInterview.interview_id,
          payload,
          parseSSE
        )

        if (errorMsg) throw new Error(errorMsg)
        if (completeResult) this.applyAIResult(completeResult)
        this.isLoading = false
        return completeResult
      } catch (err) {
        this.isLoading = false
        throw err
      }
    },

    // 根据 AI 返回的 feedback_type 更新状态机
    applyAIResult(result) {
      const type = result.feedback_type || result.type
      const content = result.content
      const round = this.rounds[this.currentRound - 1]
      if (!round) return
      // 内容为空直接丢弃（服务端兜底流程会保证有 content，这里只防脏数据渲染出空气泡）
      if (!content || typeof content !== 'string') return

      /* 本轮 AI 评分与点评（v24 新增）。
       * 服务端 processAnswer 的返回值一直带着这两个字段（interviewService.js 的
       * `return aiResult`，经 SSE 的 event: complete 整包下发），但此前前端只消费了
       * feedback_type / content / question_type，把 AI 每轮的判断整个丢掉了 ——
       * 用户在整场面试里看不到任何 AI 反馈，直到最后报告才一次性揭晓。
       * 这恰是「与AI共生」最该被看见的一刻：AI 刚听完你的回答，正在给出评价。
       *
       * 挂载目标必须与 submitAnswer 里「回答挂在哪儿」用【同一组条件】：
       *   awaitingFollowUp && followUpIndex >= 0 → 该追问；否则 → 本轮主回答。
       * ⚠️ 不能改用 round.followUps.length 判断：下面的 push 还没执行，此刻它可能非空
       * （已有历史追问），会导致点评错挂到上一个追问、并互相覆盖（已用脚本复现）。
       * 自我介绍轮 round_score 五维全 0 且 comment 为空（见 prompts/firstQuestion.js），
       * 页面按 avg>0 判断是否渲染，避免出现误导性的「0 分」。 */
      const score = result.round_score && typeof result.round_score === 'object' ? result.round_score : null
      const comment = typeof result.round_comment === 'string' ? result.round_comment.trim() : ''
      if (score || comment) {
        const isFuAnswer = this.awaitingFollowUp && this.followUpIndex >= 0
        const target = isFuAnswer ? round.followUps?.[this.followUpIndex] : round
        if (target) {
          if (score) target.roundScore = score
          if (comment) target.roundComment = comment
        }
      }

      if (type === 'follow_up') {
        // 追问：追加到当前轮的追问列表，用户继续作答同一轮
        // （不再依赖 should_follow_up：服务端已做追问上限钳制，漏返回该字段曾导致无人接盘、面试静默卡死）
        if (!round.followUps) round.followUps = []
        round.followUps.push({ question: content, userAnswer: '', answerDuration: 0 })
        this.followUpIndex = round.followUps.length - 1
        this.awaitingFollowUp = true
        this.lastTyped = { key: `r${this.currentRound}-fu${this.followUpIndex + 1}`, text: content, seq: ++typedSeq }
      } else if (type === 'next_question') {
        // 下一题：开启新一轮
        this.awaitingFollowUp = false
        this.followUpIndex = -1
        const next = this.currentRound + 1
        this.rounds.push({
          roundNumber: next,
          question: content,
          questionType: result.question_type || '专业知识',
          userAnswer: '',
          answerDuration: 0,
          followUps: []
        })
        this.currentRound = next
        this.lastTyped = { key: `r${next}`, text: content, seq: ++typedSeq }
      } else if (type === 'ending') {
        // 结束：AI 给出结束语，后端异步生成报告
        this.awaitingFollowUp = false
        this.followUpIndex = -1
        this.interviewEnded = true
        // 结束语落到当前轮的收尾气泡：此前 content 被直接丢弃，
        // 用户答完最后一题看不到任何收尾就被「生成报告中」遮罩带走
        if (content) round.endingRemark = content
        this.lastTyped = { key: `r${this.currentRound}-end`, text: content, seq: ++typedSeq }
      } else {
        // 兜底：未知类型按下一题处理，保证面试流程不中断
        this.applyAIResult({ ...result, feedback_type: 'next_question' })
      }
    },

    // 结束面试（用户主动结束）
    async finishInterview() {
      if (!this.currentInterview?.interview_id) throw new Error('没有进行中的面试')
      const res = await completeInterview(this.currentInterview.interview_id)
      return res
    },

    // 重置面试状态
    resetInterview() {
      this.currentInterview = null
      this.currentRound = 0
      this.rounds = []
      this.isLoading = false
      this.answerMode = 'text'
      this.config = null
      this.awaitingFollowUp = false
        this.followUpIndex = -1
        this.interviewEnded = false
        this.lastTyped = null
      }
  }
})
