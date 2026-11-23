/**
 * 前端源码语法校验（不依赖 npm install）
 * 对 client/src 下所有 .js 直接 node --check；
 * 对 .vue 提取 <script> 内容后 node --check。
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')

// 使用当前进程的 node 可执行文件，避免硬编码绝对路径导致其他环境不可用
const NODE = process.execPath
const base = path.resolve(__dirname, '..', 'src')
const tmp = path.join(os.tmpdir(), 'mianba_vue_check')
fs.mkdirSync(tmp, { recursive: true })

let checked = 0
let failed = 0
const errors = []

const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.js')) {
      try { execSync(`"${NODE}" --check "${p}"`, { stdio: 'pipe' }); checked++ }
      catch (err) { failed++; errors.push(`${p}\n${err.stderr?.toString() || err.message}`) }
    } else if (e.name.endsWith('.vue')) {
      const src = fs.readFileSync(p, 'utf8')
      const m = src.match(/<script[^>]*>([\s\S]*?)<\/script>/)
      if (!m) continue
      const tf = path.join(tmp, e.name + '.js')
      fs.writeFileSync(tf, m[1])
      try { execSync(`"${NODE}" --check "${tf}"`, { stdio: 'pipe' }); checked++ }
      catch (err) { failed++; errors.push(`${p}\n${err.stderr?.toString() || err.message}`) }
    }
  }
}

walk(base)
console.log(`\n前端语法校验：通过 ${checked} 个文件，失败 ${failed} 个`)
if (failed) { errors.forEach(e => console.log('\n✗ ' + e)); process.exit(1) }
console.log('FRONTEND SYNTAX: PASS')
process.exit(0)
