// tools/check-i18n.js —— i18n 语言包自检（zh / en 键名与条数一致性）
// 用法（仓库根目录）： node tools/check-i18n.js
//
// 为什么要有这个：i18n.js 里 zh / en 是两份手写的对象，加新功能时很容易
// 「只在一侧加了键」或「键名拼错」，运行时表现为某处文案变成 undefined（页面直接空白），
// 而且只有切到那种语言才会发现。提交前跑一遍能立刻定位。
//
// 检查三件事：
//   1. zh / en 的扁平键集合是否完全一致（缺哪一侧、多哪一侧）
//   2. 每个分区的条数（方便和记忆/文档里的「语言包当前 N 条」对账）
//   3. 有没有「值是空字符串」的键（等于没翻译）
const path = require('path')

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

console.log('')
if (problems === 0) {
  console.log('全部通过 ✅  zh/en 键名与条数完全一致')
  process.exit(0)
} else {
  console.log('发现 ' + problems + ' 类问题 ❌')
  process.exit(1)
}
