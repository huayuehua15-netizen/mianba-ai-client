<template>
  <text class="typing-text">{{ displayed }}<text class="cursor" v-if="isTyping">|</text></text>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  speed: { type: Number, default: 50 }
})

const displayed = ref('')
const isTyping = ref(false)
let timer = null

const PUNCTUATION = '，。？！、；：,.?!;:'

const start = () => {
  if (timer) clearTimeout(timer)
  displayed.value = ''
  isTyping.value = true
  const full = props.text || ''
  let i = 0
  const step = () => {
    i++
    displayed.value = full.slice(0, i)
    if (i >= full.length) {
      timer = null
      isTyping.value = false
      return
    }
    const ch = full[i - 1]
    const delay = PUNCTUATION.includes(ch) ? props.speed + 120 : props.speed
    timer = setTimeout(step, delay)
  }
  timer = setTimeout(step, props.speed)
}

onMounted(start)
watch(() => props.text, start)
onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<style lang="scss" scoped>
.typing-text {
  font-size: 28rpx;
  color: $text-1;
  line-height: 1.7;

  .cursor {
    color: $accent;
    font-weight: $weight-bold;
    animation: blink 1s step-end infinite;
  }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>