// 扫描 pages / utils 下 js 的 require 相对路径，核对目标文件是否存在
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..', 'code', 'code')

function walk(dir, ext) {
  let out = []
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) out = out.concat(walk(full, ext))
    else if (full.endsWith(ext)) out.push(full)
  }
  return out
}

const files = walk(path.join(ROOT, 'pages'), '.js').concat(walk(path.join(ROOT, 'utils'), '.js'))
const reqRe = /require\(\s*'([^']+)'\s*\)/g
let bad = 0
const lines = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  let m
  reqRe.lastIndex = 0
  while ((m = reqRe.exec(src))) {
    const mod = m[1]
    if (!mod.startsWith('.')) continue // 内置 wx 等跳过
    const base = path.resolve(path.dirname(f), mod)
    const candidates = [base, base + '.js', path.join(base, 'index.js')]
    const ok = candidates.some(c => fs.existsSync(c))
    if (!ok) {
      bad++
      lines.push(`MISSING ${path.relative(ROOT, f)} -> ${mod}`)
    }
  }
}
lines.unshift(`缺失模块引用 = ${bad}`)
console.log(lines.join('\n'))
