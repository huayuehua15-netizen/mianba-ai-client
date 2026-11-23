<template>
  <view class="page">
    <!-- 导航栏 -->
    <view class="nav" :style="navBarStyle">
      <view class="nav-side nav-left" hover-class="hover-press" @click="goBack">
        <image class="nav-back-icon" :src="ICONS['arrow-left']" mode="aspectFit" />
      </view>
      <view class="nav-center">
        <text class="nav-title">编辑资料</text>
      </view>
      <view class="nav-side nav-right"></view>
    </view>

    <view class="content">
      <!-- 页头：等宽眉标 -->
      <view class="ph">
        <text class="ph-kicker">EDIT PROFILE</text>
        <text class="ph-title">编辑资料</text>
      </view>

      <!-- 头像：点击选图/拍照，压缩后转 base64 提交 -->
      <view class="avatar-section">
        <view class="avatar-wrap" hover-class="hover-press" @click="chooseAvatar">
          <view v-if="!effectiveAvatar" class="avatar-letter">{{ avatarLetter }}</view>
          <image v-else class="avatar-img" :src="effectiveAvatar" mode="aspectFill" @error="onAvatarError" />
          <view class="avatar-badge">
            <image class="avatar-badge-icon" :src="ICONS['camera-white']" mode="aspectFit" />
          </view>
        </view>
        <text class="avatar-tip">点击更换头像</text>
      </view>

      <!-- ===== 基本资料 ===== -->
      <view class="group-head">
        <text class="group-no">01</text>
        <text class="group-title">基本资料</text>
        <view class="group-line"></view>
      </view>
      <view class="card">
        <view class="field">
          <view class="field-head">
            <text class="field-label">昵称</text>
            <text class="field-count">{{ nickname.length }}/20</text>
          </view>
          <input
            v-model="nickname"
            class="field-input"
            placeholder="请输入昵称"
            maxlength="20"
            placeholder-class="field-ph"
            confirm-type="done"
            :show-confirm-bar="false"
            :adjust-position="true"
            :cursor-spacing="48"
            @confirm="handleSave"
          />
        </view>

        <view class="field field-last">
          <view class="field-head">
            <text class="field-label">个人简介</text>
            <text class="field-count">{{ bio.length }}/200</text>
          </view>
          <textarea
            v-model="bio"
            class="field-textarea"
            placeholder="技术栈、求职方向，或一句想对自己说的话"
            maxlength="200"
            auto-height
            :show-confirm-bar="false"
            :adjust-position="true"
            :cursor-spacing="32"
            placeholder-class="field-ph"
            @confirm="handleSave"
          />
          <text class="field-hint">这段文字也会作为你的个性签名，展示在「我的」页</text>
        </view>
      </view>

      <!-- ===== 求职意向 ===== -->
      <view class="group-head">
        <text class="group-no">02</text>
        <text class="group-title">求职意向</text>
        <view class="group-line"></view>
      </view>
      <view class="card card-filled">
        <view class="field">
          <view class="field-head">
            <view class="field-label-row">
              <image class="field-icon" :src="ICONS['graduation-cap']" mode="aspectFit" />
              <text class="field-label">教育阶段</text>
            </view>
          </view>
          <view class="chip-row">
            <view
              v-for="s in EDUCATION_STAGES"
              :key="s"
              class="chip"
              :class="{ active: educationStage === s }"
              hover-class="hover-press"
              @click="educationStage = s"
            >
              <image v-if="educationStage === s" class="chip-check" :src="ICONS['check-white']" mode="aspectFit" />
              <text class="chip-text">{{ s }}</text>
            </view>
          </view>
        </view>

        <view class="field field-last">
          <view class="field-head">
            <view class="field-label-row">
              <image class="field-icon" :src="ICONS['target']" mode="aspectFit" />
              <text class="field-label">目标岗位</text>
            </view>
            <text class="field-count">最多 {{ MAX_POSITIONS }} 个</text>
          </view>
          <view class="chip-row">
            <view
              v-for="p in selectedPositions"
              :key="p._id"
              class="chip chip-picked"
              :class="{ 'is-missing': p.missing }"
              hover-class="hover-press"
              @click="removePosition(p._id)"
            >
              <text class="chip-text">{{ p.name }}</text>
              <!-- v28：已改为真正的 close 图标，不再用 plus 旋转 45° 伪造 -->
              <image class="chip-remove" :src="ICONS['close-ash']" mode="aspectFit" />
            </view>
            <view
              v-if="selectedIds.length < MAX_POSITIONS"
              class="chip chip-add"
              hover-class="hover-press"
              @click="openPositionSheet"
            >
              <image class="chip-plus" :src="ICONS['plus']" mode="aspectFit" />
              <text class="chip-text">{{ selectedIds.length ? '添加' : '选择岗位' }}</text>
            </view>
          </view>
          <text v-if="!selectedIds.length" class="field-hint">选好后，创建面试时可以一键带入</text>
        </view>
      </view>

      <text class="footnote">资料仅用于个人展示与面试配置，不会对外公开</text>
      <view class="safe-bottom"></view>
    </view>

    <!-- ===== 底部主行动条 =====
         保存是本页唯一的动作，提到整宽 sticky 主键 + 完成度反馈，页面主行动才成立。
         v31 键盘避让：用 keyboardHeight 把整条抬到键盘上沿（纯 bottom 位移，不触发重绘）。 -->
    <view class="save-bar" :style="saveBarStyle">
      <view class="save-meta">
        <text class="save-meta-text" :class="{ done: completion.done === completion.total }">
          {{ completion.done === completion.total ? '资料已完善' : `已完善 ${completion.done} / ${completion.total} 项` }}
        </text>
        <view class="save-progress">
          <view class="save-progress-fill" :style="{ width: completion.pct + '%' }"></view>
        </view>
      </view>
      <view
        class="save-btn"
        :class="{ disabled: !canSave }"
        :hover-class="canSave && !saving ? 'hover-press' : 'none'"
        @click="handleSave"
      >
        <text class="save-btn-text">{{ saveBtnLabel }}</text>
      </view>
    </view>

    <!-- ===== 岗位选择弹层 ===== -->
    <!-- 遮罩常驻 + class 切换（而非 v-if），这样出入场才有连续过渡；
         @touchmove.stop 阻止滚动穿透。 -->
    <view class="mask" :class="{ show: sheetVisible }" @touchmove.stop.prevent="noop" @click="closePositionSheet"></view>
    <!-- 注意：这里**不能**加 @touchmove.stop.prevent —— catchtouchmove 会连
         内部 scroll-view 的滚动一起拦掉，岗位列表就滚不动了。穿透由 mask 拦。 -->
    <view class="sheet" :class="{ show: sheetVisible }">
      <view class="sheet-head">
        <view class="sheet-head-main">
          <text class="sheet-title">选择目标岗位</text>
          <text class="sheet-sub">已选 {{ draftIds.length }} / {{ MAX_POSITIONS }}</text>
        </view>
        <view class="sheet-close" hover-class="hover-press" @click="closePositionSheet">
          <image class="sheet-close-icon" :src="ICONS['close-ash']" mode="aspectFit" />
        </view>
      </view>

      <scroll-view class="cat-scroll" scroll-x :show-scrollbar="false">
        <view class="cat-row">
          <view
            v-for="c in categories"
            :key="c"
            class="cat-chip"
            :class="{ active: sheetCategory === c }"
            hover-class="hover-press"
            @click="sheetCategory = c"
          >{{ c }}</view>
        </view>
      </scroll-view>

      <scroll-view class="pos-scroll" scroll-y>
        <view v-if="loadingPositions" class="pos-state">正在加载岗位…</view>

        <view v-else-if="loadError" class="pos-state">
          <text class="pos-state-text">岗位加载失败</text>
          <view class="pos-retry" hover-class="hover-press" @click="loadPositions">
            <image class="pos-retry-icon" :src="ICONS['rotate-ccw']" mode="aspectFit" />
            <text class="pos-retry-text">重试</text>
          </view>
        </view>

        <view v-else-if="!sheetPositions.length" class="pos-state">该分类下暂无岗位</view>

        <view v-else class="pos-list">
          <view
            v-for="p in sheetPositions"
            :key="p._id"
            class="pos-item"
            :class="{ active: draftIds.includes(p._id) }"
            hover-class="hover-press"
            @click="toggleDraft(p._id)"
          >
            <view class="pos-item-main">
              <text class="pos-item-name">{{ p.name }}</text>
              <text v-if="p.description" class="pos-item-desc">{{ p.description }}</text>
            </view>
            <view class="pos-item-check" :class="{ on: draftIds.includes(p._id) }">
              <image
                v-if="draftIds.includes(p._id)"
                class="pos-item-check-icon"
                :src="ICONS['check-white']"
                mode="aspectFit"
              />
            </view>
          </view>
        </view>
        <view class="pos-bottom-pad"></view>
      </scroll-view>

      <view class="sheet-foot">
        <view class="sheet-btn" hover-class="hover-press" @click="confirmPositions">确定</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onBackPress, onUnload } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/modules/user'
import { getPositions } from '@/api/position'
import { ensurePrivacyAuthorize } from '@/utils/privacy'
import { ICONS } from '@/utils/svg-icons'

const userStore = useUserStore()

/* 与后端 User.education_stage 的 enum 严格一致，改这里必须同步改 server/src/models/User.js */
const EDUCATION_STAGES = ['专科', '本科', '研究生', '在职']
const MAX_POSITIONS = 3

const nickname = ref(userStore.userInfo?.nickname || '')
const bio = ref(userStore.userInfo?.bio || '')
const avatarUrl = ref(userStore.userInfo?.avatar_url || '')
const educationStage = ref(userStore.userInfo?.education_stage || '本科')
/* 后端 target_positions 是 ObjectId 数组，序列化后即字符串数组 */
const selectedIds = ref(
  Array.isArray(userStore.userInfo?.target_positions) ? [...userStore.userInfo.target_positions] : []
)

const avatarError = ref(false)
/* 头像没变就不提交 —— avatar_url 是 base64 data URL，几百 KB，
   每存一次都重传是纯浪费（后端还有 750KB 上限）。 */
const avatarChanged = ref(false)
const saving = ref(false)

/* ===== v31 键盘避让 =====
 * 本页底部保存条是 fixed; bottom:0 且实高约 139px，iOS 键盘 291px /
 * Android 220px —— 键盘弹起时它整条落在键盘下方，用户既看不到
 * 「已完善 x/y」也点不到保存，只能先收键盘再点，是明显的防挫败断点。
 * 这里监听键盘高度，把保存条抬到键盘上沿。
 * 为什么用 bottom 而不是 transform：纯位移不触发布局/重绘，代价最小。
 * 为什么保留 @confirm="handleSave"：即使某些机型 onKeyboardHeightChange
 * 不回调，键盘「完成」键仍是一条可达的保存路径（昵称与简介两处都接了）。 */
const keyboardHeight = ref(0)
const saveBarStyle = computed(() =>
  keyboardHeight.value > 0 ? { bottom: keyboardHeight.value + 'px' } : {}
)

const avatarLetter = computed(() => {
  const n = nickname.value || ''
  return n ? n.trim().charAt(0).toUpperCase() : '我'
})

/* ===== v31 头像 base64 移出响应式 =====
 * 原来的做法：740KB 的 `data:image/jpeg;base64,...` 直接存进 `avatarUrl`（一个 ref），
 * 而 `avatarUrl` 被头像 <image :src> 与 `completion` 计算属性读着。
 * 后果有两个，都不是"性能可以忍"级别：
 *   ① 用户在下面改昵称/简介时，改动会触发依赖 avatarUrl 的重算，
 *      于是那张 base64 又被 setData 推一遍 —— 每次按键都可能重发几百 KB；
 *   ② base64 与普通字段混在同一棵响应式树里，devtools 与任何遍历
 *      （如 `$reset`、JSON 序列化）都会把它当普通值处理。
 *
 * 改成：**响应式里只放预览用的本地临时路径**（几十字节），
 * 真正的 base64 存进模块级普通变量 `avatarBase64Raw`（非响应式，不参与 setData）。
 * 保存时再拼接进 payload —— 那一刻才需要它，一次性使用。 */
let avatarBase64Raw = ''
/** 预览源：本地临时路径优先（选图后立刻可见），否则用已存的 base64 */
const avatarPreview = ref('')
const effectiveAvatar = computed(() => {
  if (avatarError.value) return ''
  return avatarPreview.value || avatarUrl.value || ''
})
/** 初始化：已有头像时，base64 直接进非响应式变量，预览留空走 avatarUrl */
if (avatarUrl.value && avatarUrl.value.startsWith('data:')) {
  avatarBase64Raw = avatarUrl.value
}

/* ===== 完成度：让表单「活」起来 =====
   5 项都是页面已有字段，不新增任何输入。填满时进度条到头、文案转正反馈。 */
const completion = computed(() => {
  const items = [
    // v31：读 effectiveAvatar（= 新预览 || 旧 base64）而非 avatarUrl —— 
    // 新选的图只写 avatarPreview / avatarBase64Raw，不再写 avatarUrl，
    // 若这里还读 avatarUrl，用户新选头像后完成度不会更新。
    !!effectiveAvatar.value,
    !!nickname.value.trim(),
    !!bio.value.trim(),
    !!educationStage.value,
    selectedIds.value.length > 0
  ]
  const done = items.filter(Boolean).length
  return { done, total: items.length, pct: Math.round((done / items.length) * 100) }
})

/* ===== 脏检查：进页面时的快照，决定按钮激活态 =====
   原来只看「昵称非空」，用户什么都没改也能点出一个无意义的保存请求；
   现在没改动时按钮直接灰显，主行动的反馈是明确的。 */
const snapshot = {
  nickname: nickname.value,
  bio: bio.value,
  educationStage: educationStage.value,
  ids: [...selectedIds.value].join(',')
}
const isDirty = computed(() => (
  nickname.value !== snapshot.nickname ||
  bio.value !== snapshot.bio ||
  educationStage.value !== snapshot.educationStage ||
  [...selectedIds.value].join(',') !== snapshot.ids ||
  avatarChanged.value
))
const canSave = computed(() => nickname.value.trim().length > 0 && isDirty.value && !saving.value)
const saveBtnLabel = computed(() => (saving.value ? '保存中…' : (isDirty.value ? '保存修改' : '保存')))

/* ===== 岗位 ===== */
const allPositions = ref([])
const categories = ref(['全部'])
const sheetCategory = ref('全部')
const loadingPositions = ref(false)
const loadError = ref(false)
const sheetVisible = ref(false)
const draftIds = ref([])

/* 分类兜底：接口失败时也至少有分类可点（与 interview-config 同一套）。
 * v31：补「设计」「职能」，与扩到 8 大类的岗位库保持一致。 */
const FALLBACK_CATEGORIES = ['全部', '技术', '产品', '设计', '运营', '市场', '职能', '专升本专业', '考研专业']

const sheetPositions = computed(() => {
  if (sheetCategory.value === '全部') return allPositions.value
  return allPositions.value.filter(p => p.category === sheetCategory.value)
})

/* 已选岗位 → 对象。岗位若已下架（不在返回列表里）仍保留，标记 missing，
   否则用户一进页面保存就会把这些岗位静默丢掉。 */
const selectedPositions = computed(() =>
  selectedIds.value.map((id) => {
    const p = allPositions.value.find(x => x._id === id)
    return p ? { _id: p._id, name: p.name } : { _id: id, name: '已下架岗位', missing: true }
  })
)

const loadPositions = async () => {
  loadingPositions.value = true
  try {
    const res = await getPositions({})
    allPositions.value = res || []
    const cats = Array.from(new Set((res || []).map(p => p.category).filter(Boolean)))
    categories.value = cats.length ? ['全部', ...cats] : FALLBACK_CATEGORIES
    loadError.value = false
  } catch (e) {
    categories.value = FALLBACK_CATEGORIES
    loadError.value = true
  } finally {
    loadingPositions.value = false
  }
}

const openPositionSheet = () => {
  draftIds.value = [...selectedIds.value]
  sheetCategory.value = '全部'
  sheetVisible.value = true
  if (!allPositions.value.length && !loadingPositions.value) loadPositions()
}

const closePositionSheet = () => { sheetVisible.value = false }

const toggleDraft = (id) => {
  const i = draftIds.value.indexOf(id)
  if (i >= 0) {
    draftIds.value.splice(i, 1)
    return
  }
  if (draftIds.value.length >= MAX_POSITIONS) {
    uni.showToast({ title: `最多选择 ${MAX_POSITIONS} 个岗位`, icon: 'none' })
    return
  }
  draftIds.value.push(id)
}

const confirmPositions = () => {
  selectedIds.value = [...draftIds.value]
  sheetVisible.value = false
}

const removePosition = (id) => {
  selectedIds.value = selectedIds.value.filter(x => x !== id)
}

const noop = () => {}

/* ===== 头像 ===== */
const onAvatarError = () => { avatarError.value = true }

const goBack = async () => {
  /* 有改动未保存时拦截：用户改了半页资料误点返回，不应该静默丢掉。
     导航栏的返回手势/返回键同样走这里（页面级 onBackPress 兜底见下）。 */
  if (isDirty.value && !saving.value) {
    const leave = await new Promise((resolve) => {
      uni.showModal({
        title: '未保存的修改',
        content: '你的资料有改动但还没保存，确定离开吗？',
        cancelText: '继续编辑',
        confirmText: '离开',
        confirmColor: '#17130E',
        success: (r) => resolve(!!r.confirm),
        fail: () => resolve(false)
      })
    })
    if (!leave) return
  }
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/profile/index' })
}

/* 系统返回（手势/物理键）也拦截，否则脏检查只挡得住页面内的返回按钮 */
onBackPress(() => (isDirty.value && !saving.value))

const chooseAvatar = async () => {
  // 注意：此处不能用动态 import —— mp-weixin 编译器会把 import() 编成
  // await "路径字符串"，运行时必抛错（2026-09-16 实锤，第 3 例同款缺陷）。
  // 改为顶部静态导入。
  const agreed = await ensurePrivacyAuthorize('avatar')
  if (!agreed) return
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const tempPath = res.tempFilePaths[0]
      // #ifdef MP-WEIXIN
      // 尝试压缩后再读 base64（后端期望 base64）；压缩失败时直接读原图。
      // 两次 readFile 都失败则把 tempPath 直接给 image 渲染（选图体验不受影响）
      uni.compressImage({
        src: tempPath,
        quality: 60,
        success: (cRes) => readAsBase64(cRes.tempFilePath),
        fail: () => readAsBase64(tempPath)
      })
      // #endif
      // #ifndef MP-WEIXIN
      avatarPreview.value = tempPath
      avatarChanged.value = true
      // #endif
    },
    fail: (err) => {
      const msg = err?.errMsg || ''
      // 用户取消是正常操作：不打印不提示，保持控制台干净
      if (msg.includes('cancel')) return
      // fail 绝不能静默：__usePrivacyCheck__ 开启且《用户隐私保护指引》未配置时，
      // 微信会直接拦截 chooseImage，只有这里能暴露原因
      console.error('chooseImage fail:', err)
      if (msg.includes('privacy') || msg.includes('privacyPermission')) {
        uni.showModal({
          title: '需要隐私授权',
          content: '小程序后台尚未配置《用户隐私保护指引》，暂时无法选择图片。请在 mp.weixin.qq.com → 设置 → 服务内容声明 中完成配置。',
          showCancel: false
        })
      } else {
        uni.showToast({ title: '无法打开相册：' + msg, icon: 'none' })
      }
    }
  })
}

/* 把图片文件读成 data:image/jpeg;base64,... 存入**非响应式**的 avatarBase64Raw，
 * 同时用本地路径做预览。读失败时直接退到原路径（image 组件可直接渲染本地路径）。 */
const readAsBase64 = (filePath) => {
  uni.getFileSystemManager().readFile({
    filePath,
    encoding: 'base64',
    success: (fsRes) => {
      /* 阈值必须与后端**严格一致**（P1 修复，2026-10-08）：
         后端 userController.updateProfile 的判定是 `avatar.length > 750000` 直接 400
         （且随后 slice(0, 500000) 兜底截断）。而这里原来卡的是 1024*1024 = 1048576 字符，
         比后端宽 30 万字符 —— 于是 75 万~104 万之间的图会「本地通过、保存时才 400」，
         注释里承诺的「避免到保存时才报错让用户白选一次」根本没兑现。
         改为与后端同一个阈值（750000，含 `data:image/jpeg;base64,` 前缀），
         留一点余量取 740000，确保本地判过的图后端一定收得下。 */
      if (fsRes.data.length > 740000) {
        uni.showToast({ title: '图片过大，请换一张或裁剪后再试', icon: 'none' })
        return
      }
      avatarBase64Raw = `data:image/jpeg;base64,${fsRes.data}`
      // 预览改用本地临时路径（filePath 即压缩后/原图路径，几十字节），
      // 不把 740KB base64 推进 setData —— 用户随后改昵称时也不会重发它
      avatarPreview.value = filePath || ''
      avatarError.value = false
      avatarChanged.value = true
    },
    fail: () => {
      /* 读文件失败时绝不能把本地临时路径当 avatar_url（P1 修复，2026-10-08）：
         `wxfile://tmp_xxx` / `http://tmp/xxx` 这类路径只有本机当前会话能访问，
         提交给后端会被 magic bytes 校验拒掉（400：格式与内容不符），
         而且用户直到点保存才会看到失败 —— 选图动作白做一次。
         正确做法：提示失败 + 不标记 changed，让用户重选（宁可明确失败，不要假装成功）。 */
      uni.showToast({ title: '读取图片失败，请重新选择', icon: 'none' })
      avatarChanged.value = false
    }
  })
}

/* ===== 保存 ===== */
/* 页面销毁标记（v31）：saveProfile 是一次网络往返，且成功后有 600ms 延迟返回。
   用户完全可能在保存进行中点左上角返回 —— 那时续体仍会执行：
   弹 toast、setTimeout 再 navigateBack 一次，把用户从**他已经到达的页面**再退一层。
   所有 await 之后与延迟回调开头都要判它。 */
let destroyed = false
let backTimer = null

const handleSave = async () => {
  if (saving.value) return
  if (!canSave.value) {
    uni.showToast({ title: '昵称不能为空', icon: 'none' })
    return
  }
  saving.value = true
  try {
    // 字段名与后端 updateProfile 的白名单严格对应，多传的会被忽略
    const payload = {
      nickname: nickname.value.trim(),
      bio: bio.value.trim(),
      education_stage: educationStage.value,
      target_positions: [...selectedIds.value]
    }
    // base64 现在存于非响应式变量（见 avatarBase64Raw 的说明），保存时才取用
    if (avatarChanged.value && avatarBase64Raw) payload.avatar_url = avatarBase64Raw

    await userStore.saveProfile(payload)
    // 页面已关闭：数据已存好，不必再改状态 / 弹 toast / 触发返回
    if (destroyed) return
    // 保存成功后把新状态重为基线：按钮回到「保存」灰显态，用户清楚知道没有待提交的改动了
    snapshot.nickname = nickname.value
    snapshot.bio = bio.value
    snapshot.educationStage = educationStage.value
    snapshot.ids = [...selectedIds.value].join(',')
    avatarChanged.value = false
    // 保存成功后 store 里已是新的 base64，把本地预览切回走 avatarUrl，
    // 避免继续持有那个已失效的临时文件路径
    avatarUrl.value = avatarBase64Raw
    avatarPreview.value = ''
    uni.showToast({ title: '已保存', icon: 'success' })
    backTimer = setTimeout(() => { if (!destroyed) uni.navigateBack() }, 600)
  } catch (e) {
    if (!destroyed) uni.showToast({ title: e?.message || '保存失败', icon: 'none' })
  } finally {
    if (!destroyed) saving.value = false
  }
}

/* 自定义导航栏几何 */
const navMetrics = ref({ statusBar: 44, capsuleGap: 96 })
const initNavMetrics = () => {
  try {
    const win = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
    const statusBar = win.statusBarHeight || 44
    let capsuleGap = 96
    // #ifdef MP-WEIXIN
    try {
      const rect = uni.getMenuButtonBoundingClientRect()
      if (rect && rect.width > 0) capsuleGap = win.windowWidth - rect.left + 14
    } catch (e) {}
    // #endif
    navMetrics.value = { statusBar, capsuleGap }
  } catch (e) {}
}
const navBarStyle = computed(() => ({
  paddingTop: navMetrics.value.statusBar + 'px',
  paddingRight: navMetrics.value.capsuleGap + 'px'
}))

onMounted(() => {
  // 进页面就把岗位拉好，点「选择岗位」时不用等
  loadPositions()

  /* v31 键盘高度监听：把底部保存条抬到键盘上沿。
     必须 onMounted 注册、onUnload 注销 —— 组件内直接调 wx.onKeyboardHeightChange
     在页面销毁后仍会回调，会把已离开的页面的 bottom 一直改。 */
  // #ifdef MP-WEIXIN
  if (typeof wx.onKeyboardHeightChange === 'function') {
    wx.onKeyboardHeightChange((res) => {
      keyboardHeight.value = res && res.height ? res.height : 0
    })
  }
  // #endif
})

/* v30：几何初始化提到模块级 —— 必须**首帧就是真值**。
   原先放在上面的 onMounted 里，导致首帧用兜底 44/96 渲染、挂载后才跳成真值，
   整页"跳一下"，并在转场时留下错位残影（首页那个 bug 的同族问题）。
   面试页的注释早写明这条规则，这里与它对齐。 */
initNavMetrics()

/* v31：注销键盘监听，避免页面销毁后回调继续改 bottom。
   同时置销毁标记并取消「保存成功 600ms 后返回」的定时器：
   否则用户手动返回后，那个定时器还会再退一层（把用户从他已经到达的页面退走）。 */
onUnload(() => {
  destroyed = true
  clearTimeout(backTimer)
  // #ifdef MP-WEIXIN
  if (typeof wx.offKeyboardHeightChange === 'function') wx.offKeyboardHeightChange()
  // #endif
})
</script>

<style lang="scss" scoped>
/* ============================================================================
 * 编辑资料 · 纸本朱砂（v34）
 * ============================================================================
 * 本页的立意：**一张登记表**。
 *   · 分组标题 = 朱砂序号 + 大标题 + 延伸发丝线（全站统一模式）
 *   · 输入项收敛到凹槽底无描边，靠发丝线分隔
 *   · 计数（0/20）走等宽
 * ========================================================================== */
.page {
  min-height: 100vh;
  background: $paper;
  /* v35 纸张纹理（与首页同配方）：极淡斜向条纹，把纯色底"做旧"一点 */
  background-image: repeating-linear-gradient(
    92deg,
    rgba(23, 19, 14, 0.014) 0rpx,
    rgba(23, 19, 14, 0.014) 1rpx,
    transparent 1rpx,
    transparent 4rpx
  );
  box-sizing: border-box;
}

/* ===== 导航栏 ===== */
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
}
.nav-side {
  display: flex;
  align-items: center;
  height: $nav-side-h; /* v35：84→88rpx（$nav-side-h），对齐全站返回键热区标准 */
  padding: 0 $nav-back-gap;
  flex-shrink: 0;
}
.nav-left { padding-left: $page-padding; }
.nav-right { width: $nav-hold-w; }
.nav-back-icon { width: 38rpx; height: 38rpx; }
.nav-center {
  position: absolute;
  left: 0; right: 0; top: 0; bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.nav-title {
  font-size: 33rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -0.4rpx;
}

.content {
  padding: 0 $page-padding;
}

/* ===== 页头 ===== */
.ph { padding: 12rpx 0 28rpx; }
.ph-kicker {
  display: block;
  font-family: $font-mono;
  font-size: 19rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 2.6rpx;
  margin-bottom: 12rpx;
}
.ph-title {
  display: block;
  font-family: $font-display;
  font-size: 48rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -1.4rpx;
  line-height: 1.12;
}

/* ===== 头像 ===== */
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12rpx 0 40rpx;
}
.avatar-wrap {
  position: relative;
  width: 152rpx;
  height: 152rpx;
  border-radius: 50%;
  /* v35：外圈改成「压痕环」（与首页 .avatar-wrap 同配方）——
     凹槽底 + inset 阴影，让头像像贴上去的圆形标签，而不是一圈淡描边 */
  background: $paper-sunken;
  box-shadow: $emboss-2;
  padding: 5rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
.avatar-letter {
  font-size: 56rpx;
  font-weight: $weight-heavy;
  color: $text-3;
}
.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}
/* 相机角标：朱砂（"可以改"的动作提示） */
.avatar-badge {
  position: absolute;
  right: -4rpx;
  bottom: -4rpx;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: $verm;
  border: 3rpx solid $paper;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-badge-icon { width: 26rpx; height: 26rpx; }
.avatar-tip {
  font-size: 22rpx;
  color: $text-3;
  margin-top: 18rpx;
  font-weight: $weight-medium;
}

/* ===== 分组标题（朱砂序号 + 大标题 + 延伸发丝线）===== */
.group-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 24rpx 0 18rpx;
}
.group-no {
  font-family: $font-mono;
  font-size: 22rpx;
  font-weight: $weight-bold;
  color: $verm;
  letter-spacing: 1rpx;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.group-title {
  font-size: 32rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -0.5rpx;
  flex-shrink: 0;
}
.group-line {
  flex: 1;
  height: 1rpx;
  background: $rule;
  margin-left: 4rpx;
}

/* ===== 卡片 ===== */
.card {
  background: $paper-card;
  border: 1rpx solid $rule;
  border-radius: $radius-lg;
  padding: 0 26rpx;
  margin-bottom: $sp-4;
}
.card-filled { background: $paper-card; }

.field { padding: 26rpx 0; border-bottom: 1rpx solid $rule; }
.field-last { border-bottom: none; }
.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 14rpx;
}
.field-label-row { display: flex; align-items: center; gap: 10rpx; }
.field-icon { width: 28rpx; height: 28rpx; }
.field-label {
  font-size: 26rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  letter-spacing: -0.2rpx;
}
/* 计数：等宽读数 */
.field-count {
  font-family: $font-mono;
  font-size: 20rpx;
  color: $text-4;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
/* 输入：凹槽底 + 压印（v35：只有底色没有 inset，"凹"是假的；
   补上 $emboss-2 纸才真的被压下去） */
.field-input {
  height: 92rpx;
  padding: 0 22rpx;
  border-radius: $radius-md;
  background: $paper-sunken;
  box-shadow: $emboss-2;
  font-size: 29rpx;
  color: $text-1;
  box-sizing: border-box;
}
.field-textarea {
  width: 100%;
  min-height: 140rpx;
  padding: 20rpx 22rpx;
  border-radius: $radius-md;
  background: $paper-sunken;
  box-shadow: $emboss-2;
  font-size: 28rpx;
  line-height: 1.7;
  color: $text-1;
  box-sizing: border-box;
}
.field-ph { color: $text-4; }
.field-hint {
  display: block;
  font-size: 21rpx;
  color: $text-3;
  margin-top: 12rpx;
  line-height: 1.55;
}

/* ===== 选择芯片（纸本：方圆角，选中=墨底白字）===== */
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  height: 68rpx;
  padding: 0 24rpx;
  border-radius: $radius-md;
  background: $paper-sunken;
  border: 1rpx solid transparent;
  transition: background-color $motion-fast $ease-out, border-color $motion-fast $ease-out;
}
.chip-text {
  font-size: 25rpx;
  font-weight: $weight-medium;
  color: $text-2;
}
.chip.active {
  background: $ink;
  border-color: $ink;
}
.chip.active .chip-text {
  color: #FFFFFF;
  font-weight: $weight-bold;
}
.chip-check { width: 22rpx; height: 22rpx; }
.chip-remove { width: 20rpx; height: 20rpx; }
.chip-plus { width: 22rpx; height: 22rpx; }
/* 已选岗位：白底 + 发丝描边 */
.chip-picked {
  background: $paper-card;
  border-color: $rule-strong;
}
/* 岗位已下架：朱砂描边提示 */
.chip-picked.is-missing {
  border-color: $verm-line;
  background: $verm-soft;
}
.chip-picked.is-missing .chip-text { color: $verm; }
/* 添加按钮：虚线描边（"空位"语言） */
.chip-add {
  background: transparent;
  border: 1rpx dashed $rule-strong;
}

.footnote {
  display: block;
  text-align: center;
  font-size: 21rpx;
  color: $text-4;
  padding: 8rpx 0 28rpx;
  line-height: 1.6;
}
.safe-bottom { height: calc(200rpx + env(safe-area-inset-bottom)); }

/* ===== 底部行动条 ===== */
.save-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 18rpx $page-padding calc(18rpx + env(safe-area-inset-bottom));
  background: $paper;
  border-top: 1rpx solid $rule;
  box-sizing: border-box;
}
.save-meta { flex: 1; min-width: 0; }
.save-meta-text {
  display: block;
  font-family: $font-mono;
  font-size: 20rpx;
  color: $text-3;
  margin-bottom: 10rpx;
  font-variant-numeric: tabular-nums;
}
.save-meta-text.done { color: $verm; font-weight: $weight-bold; }
.save-progress {
  height: 5rpx;
  border-radius: 3rpx;
  background: $paper-sunken;
  overflow: hidden;
}
.save-progress-fill {
  height: 100%;
  border-radius: 3rpx;
  background: linear-gradient(90deg, $verm-deep, $verm);
  transition: width $motion-base $ease-out;
}
.save-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  padding: 0 48rpx;
  border-radius: $radius-btn;
  background: $ink;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out, background-color $motion-fast $ease-out;
}
.save-btn.disabled { background: $bg-fill-strong; }
.save-btn-text {
  font-size: 28rpx;
  font-weight: $weight-bold;
  color: #FFFFFF;
}
.save-btn.disabled .save-btn-text { color: $text-3; }

/* ===== 岗位选择弹层 ===== */
.mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(23, 19, 14, 0.55);
  z-index: 100;
  opacity: 0;
  visibility: hidden;
  transition: opacity $motion-base $ease-out, visibility $motion-base $ease-out;
}
.mask.show { opacity: 1; visibility: visible; }
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 101;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: $paper;
  border-radius: $radius-2xl $radius-2xl 0 0;
  box-shadow: $shadow-sheet;
  transform: translateY(100%);
  transition: transform $motion-slow $ease-out;
  padding-bottom: env(safe-area-inset-bottom);
}
.sheet.show { transform: translateY(0); }

.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  padding: 32rpx $page-padding 20rpx;
}
.sheet-head-main { flex: 1; min-width: 0; }
.sheet-title {
  display: block;
  font-size: 34rpx;
  font-weight: $weight-heavy;
  color: $text-1;
  letter-spacing: -0.6rpx;
}
.sheet-sub {
  display: block;
  font-family: $font-mono;
  font-size: 20rpx;
  color: $text-3;
  margin-top: 8rpx;
  font-variant-numeric: tabular-nums;
}
.sheet-close {
  width: 64rpx;
  height: 64rpx;
  border-radius: $radius-sm;
  background: $paper-sunken;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity $motion-fast $ease-out;
}
.sheet-close-icon { width: 26rpx; height: 26rpx; }

.cat-scroll {
  white-space: nowrap;
  padding: 0 $page-padding;
  flex-shrink: 0;
}
.cat-row { display: inline-flex; gap: 10rpx; padding-bottom: 16rpx; }
.cat-chip {
  display: inline-flex;
  align-items: center;
  height: 60rpx;
  padding: 0 24rpx;
  border-radius: $radius-pill;
  background: $paper-sunken;
  font-size: 24rpx;
  font-weight: $weight-medium;
  color: $text-2;
  transition: background-color $motion-fast $ease-out;
}
.cat-chip.active {
  background: $ink;
  color: #FFFFFF;
  font-weight: $weight-bold;
}

.pos-scroll { flex: 1; min-height: 0; }
.pos-list { padding: 0 $page-padding; }
.pos-item {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid $rule;
  transition: opacity $motion-fast $ease-out;
}
.pos-item-main { flex: 1; min-width: 0; }
.pos-item-name {
  display: block;
  font-size: 28rpx;
  font-weight: $weight-semibold;
  color: $text-1;
  letter-spacing: -0.2rpx;
}
.pos-item.active .pos-item-name { color: $verm; }
.pos-item-desc {
  display: block;
  font-size: 22rpx;
  color: $text-3;
  margin-top: 6rpx;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 勾选位：未选=虚线空位，已选=墨底实心（空/实 对照） */
.pos-item-check {
  width: 44rpx;
  height: 44rpx;
  border-radius: $radius-xs;
  border: 2rpx dashed $rule-strong;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color $motion-fast $ease-out, border-color $motion-fast $ease-out;
}
.pos-item-check.on {
  background: $ink;
  border: 2rpx solid $ink;
}
.pos-item-check-icon { width: 24rpx; height: 24rpx; }

.pos-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18rpx;
  padding: 80rpx 0;
  font-size: 24rpx;
  color: $text-3;
}
.pos-state-text { font-size: 24rpx; color: $text-3; }
.pos-retry {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 28rpx;
  border-radius: $radius-btn;
  background: $paper-sunken;
  transition: opacity $motion-fast $ease-out;
}
.pos-retry-icon { width: 24rpx; height: 24rpx; }
.pos-retry-text { font-size: 24rpx; color: $text-2; font-weight: $weight-medium; }
.pos-bottom-pad { height: 20rpx; }

.sheet-foot {
  padding: 18rpx $page-padding 20rpx;
  border-top: 1rpx solid $rule;
  flex-shrink: 0;
}
.sheet-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 92rpx;
  border-radius: $radius-btn;
  background: $ink;
  font-size: 29rpx;
  font-weight: $weight-bold;
  color: #FFFFFF;
  transition: opacity $motion-fast $ease-out, transform $motion-fast $ease-out;
}
</style>
