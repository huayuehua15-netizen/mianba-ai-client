<template>
  <!-- 成就解锁仪式的宿主：把队列接到全局 medal store，谁挂载它谁就能播仪式。
       挂载点 = 用户真实会停留、且可能达成成就的页面（我的页 / 首页 / 报告页）。
       为什么不放 App.vue：小程序端 App.vue 的 template 不参与页面渲染，
       社区要靠 @uni-ku/root 这类构建插件才能做全局组件，为一个弹窗不值得引构建插件。 -->
  <view v-if="queue.length && visible" class="ceremony-host">
    <medal-unlock ref="ceremonyRef" :queue="queue" @finish="onFinish" />
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useMedalStore } from '@/store/modules/medal'
import MedalUnlock from '@/components/medal-unlock/medal-unlock.vue'

const props = defineProps({
  /* 本页是否正在前台。**必须由页面传进来**，不能在组件里用 onShow/onHide 自己判断：
     查过 uni-app 运行时（uni-mp-weixin/dist/uni.mp.esm.js）——
       · 页面：PAGE_INIT_HOOKS 经 initHooks 注册成 methods.onShow → 会分发 'onShow'
       · 组件：pageLifetimes.show() 分发的是 'onPageShow'
     两者键名不同，所以组件里的 onShow **永远不触发**（项目此前也踩过同类坑：
     onBackPress 写在子组件里不生效）。这里改成显式传参，行为确定、可读。 */
  visible: { type: Boolean, default: true }
})

const medalStore = useMedalStore()
const ceremonyRef = ref(null)
const queue = computed(() => medalStore.queue)

/* 这个宿主会被挂在多个页面上，而 tabBar 页（首页/我的）切页后**依然挂载在内存里**，
   报告页也在页面栈里 —— 若无条件响应队列，会出现「后台页把仪式悄悄播完」：
   用户切回去只看到一帧定格画面，等于没看到；更糟的是后台宿主先播完会调 finish()
   把队列清掉，把正在看的那个页的仪式掐断。
   所以只有 visible（本页在前台）的宿主才播；队列留在 store 里，
   等用户回到某个可见页由那个页的宿主接着播。 */
let started = false

/* ⚠️ 必须由宿主主动驱动 play(0)：medal-unlock 的 active 初值是 false、
   遮罩默认 visibility:hidden —— 只渲染不调用，用户会看到一个完全空白的仪式。
   （旧实现在 pages/profile 里是显式 play 的，抽成宿主后这一步不能丢。）

   两条触发路径都必要：
     ① watch(queue)：队列在本页已前台时到达（绝大多数情况）；
     ② watch(visible)：队列在本页处于后台时到达，用户切回本页那一刻补播。
   started 防重：一次仪式只起一次；播完/清空后复位，下一批勋章还能再播。 */
const startIfReady = async () => {
  if (started || !props.visible || queue.value.length === 0) return
  // 等一拍：v-if 内的子组件要先渲染完，ref 才能拿到实例
  await nextTick()
  if (started || !props.visible || !ceremonyRef.value) return
  started = true
  ceremonyRef.value.play(0)
}

watch(queue, (v) => {
  if (v.length === 0) { started = false; return }
  startIfReady()
}, { immediate: true })

watch(() => props.visible, (v) => { if (v) startIfReady() })

const onFinish = () => medalStore.finish()

/* 转发子组件的状态与操作给页面：
   仪式里按系统返回键应当推进/关闭仪式而不是退出页面，而 onBackPress 是
   页面级生命周期（写在子组件里不生效），所以页面需要能问"仪式在不在播"。
   暴露 isActive() 方法而不是 active 这个 ref：defineExpose 对 ref 的自动解包
   语义隐晦（页面侧拿到的可能是布尔也可能仍是 ref），用方法最稳。 */
const isActive = () => !!(ceremonyRef.value && ceremonyRef.value.active)
const onTap = () => { if (ceremonyRef.value) ceremonyRef.value.onTap() }

defineExpose({ isActive, onTap })
</script>

<style scoped>
/* 宿主本身不占位、不吃触摸：仪式组件内部是 position:fixed + z-index:200 的全屏遮罩，
   自己负责遮罩与"点击推进下一枚"。这里只提供「有队列 + 本页可见」的开关。 */
.ceremony-host {
  position: relative;
  z-index: 200;
}
</style>
