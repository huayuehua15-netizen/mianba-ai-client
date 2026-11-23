# 已停用组件（勿在页面中引用）

这些组件在生产代码中**零引用**（已用 grep 全量校验），保留在此仅为追溯，不参与打包。
移出 `components/` 的原因：uni-app easycom 会自动扫描 `components/组件名/组件名.vue`，
放在该目录下即使未被引用也可能进入产物、增大主包体积（小程序主包上限 2MB）。

| 组件 | 停用原因 |
| --- | --- |
| `answer-bubble` | 已被 `pages/interview/index.vue` 内联的 `.a-content` 取代；原实现使用 `linear-gradient(#5B8FF9,#7B61FF)` 蓝紫渐变，与 v22 单色体系冲突 |
| `question-bubble` | 同上，已被内联 `.q-content` 取代；含蓝紫渐变与 `#5B8FF9` |
| `menu-icon` | 设置页已改用 `utils/svg-icons.js` 的 `ICONS`；原实现硬编码 `#8B7BBF` 灰紫 |

如需恢复，请先把配色改为 `uni.scss` 的 `$ink / $text-3 / $border-glass`，再移回 `components/`。
