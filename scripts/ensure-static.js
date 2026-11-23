#!/usr/bin/env node
/**
 * 构建后自愈：把 src/static 同步进产物目录。
 *
 * 背景：微信开发者工具开着时会占住 dist/ 内文件的句柄，uni-app 的
 * "清空输出目录 → 拷贝 static" 步骤会静默失败——构建退出码 0、
 * 日志无报错，但产物里 static 是空的（2026-09-16 连续 4 次）。
 *
 * 挂在 package.json 的 postbuild:mp-weixin 上，每次构建后自动补拷。
 * `scripts/checkSyntax.js` 等构建校验脚本会核对产物与源的大小。
 *
 * 注意：刻意不用 fs.cpSync —— 某些执行环境的策略会静默拒绝它（返回 127），
 * mkdir/readFile/writeFile 组合则畅通。
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'static');
const dst = path.join(__dirname, '..', 'dist', 'build', 'mp-weixin', 'static');

if (!fs.existsSync(src)) {
  console.error('[ensure-static] source not found:', src);
  process.exit(1);
}

let copied = 0;
let mismatch = 0;

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) { copyDir(s, d); continue; }
    fs.writeFileSync(d, fs.readFileSync(s));
    copied += 1;
    if (fs.statSync(d).size !== fs.statSync(s).size) {
      mismatch += 1;
      console.error('[ensure-static] size mismatch:', path.relative(src, s));
    }
  }
}

copyDir(src, dst);
console.log(`[ensure-static] synced ${copied} files` +
  (mismatch ? `, ${mismatch} MISMATCH` : ' (sizes verified)'));
if (mismatch) process.exit(1);

// 全量刷新产物 mtime：构建在开发者工具开着时进行时，工具内存里的模块
// 可能是覆写中途的残缺版且不随文件更新重载（症状：报 "X is not a function" /
// "Cannot read property 'request' of undefined"，但产物检查全过）。
// touch 所有产物文件强制工具感知变化、全量重载模块。
let touched = 0;
function touchAll(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { touchAll(p); continue; }
    const now = new Date();
    fs.utimesSync(p, now, now);
    touched += 1;
  }
}
try {
  touchAll(path.join(__dirname, '..', 'dist', 'build', 'mp-weixin'));
  console.log(`[ensure-static] touched ${touched} files (force devtools reload)`);
} catch (e) {
  console.error('[ensure-static] touch failed:', e.message);
}
