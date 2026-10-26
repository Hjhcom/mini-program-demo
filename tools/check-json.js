// 严格 UTF-8 解析全部页面 json，报告非法 JSON 与原始标题
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..', 'code', 'code')
const pagesDir = path.join(ROOT, 'pages')

function walk(dir) {
  let out = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) out = out.concat(walk(full))
    else if (full.endsWith('.json')) out.push(full)
  }
  return out
}

let bad = 0
const lines = []
for (const f of walk(pagesDir)) {
  const rel = path.relative(ROOT, f)
  const raw = fs.readFileSync(f, 'utf8')
  try {
    const obj = JSON.parse(raw)
    lines.push(`OK   ${rel}  title=${obj.navigationBarTitleText || '(无)'}`)
  } catch (e) {
    bad++
    lines.push(`FAIL ${rel}  -> ${e.message}`)
    // 输出原始字节片段辅助定位
    lines.push('   raw: ' + JSON.stringify(raw.slice(0, 200)))
  }
}
// 顶层 app.json / sitemap.json
for (const top of ['app.json', 'sitemap.json']) {
  const f = path.join(ROOT, top)
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'))
    lines.push(`OK   ${top}`)
  } catch (e) {
    bad++
    lines.push(`FAIL ${top} -> ${e.message}`)
  }
}
lines.unshift(`非法 JSON 数量 = ${bad}`)
console.log(lines.join('\n'))
