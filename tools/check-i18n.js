// tools/check-i18n.js —— i18n 语言包自检（zh / en 键名与条数一致性）
// 用法（仓库根目录）： node tools/check-i18n.js
//
// 为什么要有这个：i18n.js 里 zh / en 是两份手写的对象，加新功能时很容易
// 「只在一侧加了键」或「键名拼错」，运行时表现为某处文案变成 undefined（页面直接空白），
// 而且只有切到那种语言才会发现。提交前跑一遍能立刻定位。
//
// 检查四件事：
//   1. zh / en 的扁平键集合是否完全一致（缺哪一侧、多哪一侧）
//   2. 每个分区的条数（方便和记忆/文档里的「语言包当前 N 条」对账）
//   3. 有没有「值是空字符串」的键（等于没翻译）
//   4. wxml 里引用的 lang.xxx.yyy 是不是都真的存在
//      —— 这一条最实用：wxml 写错一个键名不会报错，运行时那处文案直接空白，
//         只有翻到那个页面、那种语言才看得见。
const path = require('path')
const fs = require('fs')

const i18n = require(path.join(__dirname, '..', 'code', 'code', 'utils', 'i18n.js'))

// 把嵌套对象摊平成 'a.b.c' 形式的键；数组按叶子处理（不做逐项展开）
function flat(obj, prefix, out) {
  out = out || []
  Object.keys(obj).forEach(k => {
    const v = obj[k]
    const key = prefix ? prefix + '.' + k : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out)
    else out.push(key)
  })
  return out
}

const zhKeys = flat(i18n.zh, '').sort()
const enKeys = flat(i18n.en, '').sort()
const onlyZh = zhKeys.filter(k => enKeys.indexOf(k) < 0)
const onlyEn = enKeys.filter(k => zhKeys.indexOf(k) < 0)

let problems = 0

console.log('=== 条数 ===')
console.log('  zh = ' + zhKeys.length + ' 条，en = ' + enKeys.length + ' 条')
if (zhKeys.length !== enKeys.length) {
  problems++
  console.log('  ❌ 两侧条数不一致')
} else {
  console.log('  ✅ 两侧条数一致')
}

console.log('=== 键名 ===')
if (onlyZh.length) {
  problems++
  console.log('  ❌ 只在 zh 里有的键（en 缺）：')
  onlyZh.forEach(k => console.log('     - ' + k))
} else {
  console.log('  ✅ zh 的键 en 都有')
}
if (onlyEn.length) {
  problems++
  console.log('  ❌ 只在 en 里有的键（zh 缺）：')
  onlyEn.forEach(k => console.log('     - ' + k))
} else {
  console.log('  ✅ en 的键 zh 都有')
}

console.log('=== 分区条数 ===')
const sections = {}
Object.keys(i18n.zh).forEach(s => {
  sections[s] = [Object.keys(i18n.zh[s] || {}).length, Object.keys(i18n.en[s] || {}).length]
})
Object.keys(sections).sort().forEach(s => {
  const a = sections[s][0]
  const b = sections[s][1]
  console.log('  ' + (a === b ? '✅' : '❌') + ' ' + s + '：zh ' + a + ' / en ' + b)
  if (a !== b) problems++
})

console.log('=== 空文案 ===')
const empty = zhKeys.filter(k => {
  const get = (pkg) => k.split('.').reduce((o, seg) => (o ? o[seg] : undefined), pkg)
  const z = get(i18n.zh)
  const e = get(i18n.en)
  return z === '' || e === ''
})
if (empty.length) {
  problems++
  console.log('  ❌ 值为空字符串的键：')
  empty.forEach(k => console.log('     - ' + k))
} else {
  console.log('  ✅ 没有空文案')
}

// ---------------------------------------------------------------------------
// 4. wxml 里引用的键是否存在
//    wxml 只能写 {{lang.a.b}}，拼错不会报错、只会渲染成空白，所以静态扫一遍。
//    只扫 'lang.<分区>.<键>' 这个两段形式（单段 / 动态方括号的写法不在此列）。
// ---------------------------------------------------------------------------
console.log('=== wxml 引用的键 ===')
const ROOT = path.join(__dirname, '..', 'code', 'code')

function walkWxml(dir, out) {
  out = out || []
  if (!fs.existsSync(dir)) return out
  fs.readdirSync(dir).forEach(name => {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walkWxml(full, out)
    else if (/\.wxml$/.test(name)) out.push(full)
  })
  return out
}

const KEY_RE = /\blang\.([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z_][a-zA-Z0-9_]*)/g
const missing = []
const wxmls = walkWxml(path.join(ROOT, 'pages'))
wxmls.forEach(file => {
  const src = fs.readFileSync(file, 'utf8')
  Array.from(src.matchAll(KEY_RE)).forEach(m => {
    const sec = m[1]
    const key = m[2]
    if (!i18n.zh[sec] || !(key in i18n.zh[sec])) {
      missing.push(path.relative(ROOT, file) + '  →  lang.' + sec + '.' + key)
    }
  })
})
if (missing.length) {
  problems++
  console.log('  ❌ 以下引用在语言包里不存在（页面会显示空白）：')
  missing.forEach(x => console.log('     - ' + x))
} else {
  console.log('  ✅ ' + wxmls.length + ' 个 wxml 里引用的键都存在')
}

// ---------------------------------------------------------------------------
// 5. 页面可见文案里的硬编码中文（L1）
//    只抓「会直接显示给用户」的中文字面量；注释、console 日志、服务端 msg 透传、
//    三元 isEn 双语分支、协议正文与品牌封面在白名单内，不算漏网。
// ---------------------------------------------------------------------------
console.log('=== 页面可见硬编码中文 ===')

// 白名单：协议正文按约定保持中文；启动封面是品牌宣传页，本轮不纳入双语。
const WHITELIST = ['agreement.js', 'agreement.wxml', 'splash.js', 'splash.wxml']

function walkFiles(dir, ext, out) {
  out = out || []
  if (!fs.existsSync(dir)) return out
  fs.readdirSync(dir).forEach(name => {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walkFiles(full, ext, out)
    else if (name.endsWith(ext)) out.push(full)
  })
  return out
}

const hardcoded = []

// 5.1 JS：可见 API 提示里的中文字面量
const jsFiles = walkFiles(path.join(ROOT, 'pages'), '.js')
const JS_HARDCODE_RE = /(title|content|confirmText|cancelText|placeholderText):\s*'([^']*[\u4e00-\u9fa5][^']*)'/g
jsFiles.forEach(file => {
  const rel = path.relative(ROOT, file)
  if (WHITELIST.indexOf(path.basename(file)) >= 0) return
  let src = fs.readFileSync(file, 'utf8')
  // 去掉块注释、行注释、console 语句，避免把日志/注释算成可见文案
  src = src.replace(/\/\*[\s\S]*?\*\//g, '')
  src.split('\n').forEach(line => {
    if (/^\s*\/\//.test(line) || /console\.(log|warn|error|info)/.test(line)) return
    // 三元 isEn 双语分支是合法双语，跳过
    if (line.indexOf('?') >= 0 && /isEn|language/.test(line)) return
    Array.from(line.matchAll(JS_HARDCODE_RE)).forEach(m => {
      hardcoded.push(rel + '  →  ' + m[1] + ': ' + m[2])
    })
  })
})

// 5.2 WXML：去掉注释与 {{}} 表达式后，残留的连续中文（≥2 字，单字图标占位不算）
const wxmlFiles = walkFiles(path.join(ROOT, 'pages'), '.wxml')
const CN_TEXT_RE = /[^\s<>{}\/]*[\u4e00-\u9fa5]{2,}[^\s<>{}\/]*[^\s<>{}\/]/g
wxmlFiles.forEach(file => {
  const rel = path.relative(ROOT, file)
  if (WHITELIST.indexOf(path.basename(file)) >= 0) return
  let src = fs.readFileSync(file, 'utf8')
  // 先抓表达式 {{...}} 内字符串兜底（如 item.x || '打卡点'），这类中文也不能硬编码
  Array.from(src.matchAll(/\{\{[\s\S]*?\}\}/g)).forEach(exp => {
    Array.from(exp[0].matchAll(/'([^']*[\u4e00-\u9fa5][^']*)'|"([^"]*[\u4e00-\u9fa5][^"]*)"/g)).forEach(m => {
      const text = (m[1] || m[2] || '').trim()
      if (text) hardcoded.push(rel + '  →  表达式兜底文案：' + text)
    })
  })
  src = src.replace(/<!--[\s\S]*?-->/g, '')
  src = src.replace(/\{\{[\s\S]*?\}\}/g, '')
  Array.from(src.matchAll(CN_TEXT_RE)).forEach(m => {
    const text = m[0].trim()
    if (text && /[\u4e00-\u9fa5]{2,}/.test(text)) {
      hardcoded.push(rel + '  →  可见文本：' + text)
    }
  })
})

if (hardcoded.length) {
  problems++
  console.log('  ❌ 以下可见文案仍为硬编码中文（应迁入语言包）：')
  hardcoded.forEach(x => console.log('     - ' + x))
} else {
  console.log('  ✅ 页面可见文案均已走语言包（协议正文与品牌封面除外）')
}

// ---------------------------------------------------------------------------
// 6. JS 内语言键引用是否存在（防止取错分区/键名，运行时变成 undefined）
//    两种别名：整包 const lang = this.data.lang（走 lang.sec.key 两段式）；
//    单分区 const lang = this.data.lang.nearby（走 lang.key 单段式，按该分区核对）。
//    文件里只要出现整包别名，单段引用就无法静态定位分区，保守跳过、只校验两段式。
// ---------------------------------------------------------------------------
console.log('=== JS 语言键引用 ===')
const jsRefFiles = walkFiles(path.join(ROOT, 'pages'), '.js')
const jsMissing = []
const TWO_RE = /\blang\.([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z_][a-zA-Z0-9_]*)/g
const ONE_RE = /\blang\.([a-zA-Z_][a-zA-Z0-9_]*)(?![.\w])/g
jsRefFiles.forEach(file => {
  const rel = path.relative(ROOT, file)
  let src = fs.readFileSync(file, 'utf8')
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  // 两段式引用直接核对分区与键
  Array.from(src.matchAll(TWO_RE)).forEach(m => {
    const sec = m[1], key = m[2]
    if (!i18n.zh[sec] || !(key in i18n.zh[sec])) {
      jsMissing.push(rel + '  →  lang.' + sec + '.' + key)
    }
  })

  // 单分区别名分区；存在整包别名时跳过单段校验
  const fullCount = (src.match(/this\.data\.lang\b(?!\.)/g) || []).length
  if (fullCount === 0) {
    const singleSecs = Array.from(new Set(
      Array.from(src.matchAll(/this\.data\.lang\.([a-zA-Z][a-zA-Z0-9]*)/g)).map(m => m[1])
    ))
    if (singleSecs.length > 0) {
      // 先剔除 this.data.lang.* 前缀（含赋值行），再剔除两段式，剩下的才是单段键访问
      const cleaned = src
        .replace(/this\.data\.lang(\.[a-zA-Z0-9_]+)*/g, ' ')
        .replace(TWO_RE, ' ')
      Array.from(cleaned.matchAll(ONE_RE)).forEach(m => {
        const key = m[1]
        const ok = singleSecs.some(sec => i18n.zh[sec] && key in i18n.zh[sec])
        if (!ok) {
          jsMissing.push(rel + '  →  lang.' + key + '（不在分区 ' + singleSecs.join('/') + ' 内）')
        }
      })
    }
  }
})
if (jsMissing.length) {
  problems++
  console.log('  ❌ 以下 JS 语言键在语言包里不存在（运行时会变 undefined）：')
  jsMissing.forEach(x => console.log('     - ' + x))
} else {
  console.log('  ✅ ' + jsRefFiles.length + ' 个 JS 内语言键引用都存在')
}

console.log('')
if (problems === 0) {
  console.log('全部通过 ✅  zh/en 键名与条数完全一致')
  process.exit(0)
} else {
  console.log('发现 ' + problems + ' 类问题 ❌')
  process.exit(1)
}
