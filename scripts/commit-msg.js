#!/usr/bin/env node
/**
 * commit-msg 钩子的实际实现：把 Conventional Commits 英文头自动改写成中文方括号【类型】。
 *
 * 只做「改写」，不做「拦截」——任何解析不出来的写法原样放过，绝不让提交被卡住。
 * 已带【…】头的提交直接跳过。
 *
 * 用法（由 .githooks/commit-msg 调用）：
 *   node scripts/commit-msg.js <COMMIT_EDITMSG>
 */
const fs = require('fs');

const MAP = {
  feat: '新增', feature: '新增', add: '新增',
  fix: '修复', bugfix: '修复', hotfix: '修复', patch: '修复',
  docs: '文档', doc: '文档',
  chore: '杂务',
  build: '构建',
  ci: '部署', deploy: '部署', release: '部署',
  perf: '优化', opt: '优化', optimize: '优化', polish: '优化',
  refactor: '重构', refact: '重构',
  style: '样式', ui: '样式',
  test: '测试', tests: '测试',
  revert: '回滚',
  change: '调整',
  wip: '进行中',
};

// 与 _msgfmt.py 的 HEAD_RE 保持一致：type(scope)!: subject
const HEAD_RE = /^([A-Za-z]+)(?:\(([^)]*)\))?(!)?\s*[::]\s*([\s\S]+)$/;

const file = process.argv[2];
if (!file || !fs.existsSync(file)) process.exit(0);

const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const lines = raw.split(/\r?\n/);

// 跳过注释行找出真正的标题行（第一个非空、非 # 的行）
const idx = lines.findIndex((l) => l.trim() !== '' && !l.startsWith('#'));
if (idx === -1) process.exit(0);

const subject = lines[idx];
if (subject.startsWith('【')) process.exit(0); // 已经是中文头

const m = HEAD_RE.exec(subject);
if (!m) process.exit(0); // 不认识的写法，原样放过

const type = MAP[m[1].toLowerCase()];
if (!type) process.exit(0);

const scope = (m[2] || '').trim();
const breaking = m[3] === '!';
const rest = m[4].trim();

// 组装新标题
const tag = breaking ? `【${type}·破坏性】` : `【${type}】`;
lines[idx] = `${tag}${rest}`;

// 有 scope 就写进正文首行，避免塞进方括号里
if (scope) {
  const body = lines.slice(idx + 1);
  const keep = [];
  let i = 0;
  while (i < body.length && body[i].trim() === '') i++; // 吃掉紧跟的空行
  keep.push('', `范围: ${scope}`, '');
  lines.splice(idx + 1, lines.length, ...keep.concat(body.slice(i)));
}

// 结尾统一保留一个换行，去掉重复空行
let out = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
out += '\n';

fs.writeFileSync(file, out, 'utf8');
process.stderr.write(`[commit-msg] ${m[1]} → ${tag}${scope ? ` (范围: ${scope})` : ''}\n`);
