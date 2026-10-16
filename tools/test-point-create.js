// tools/test-point-create.js —— createPoint 校验规则的本地单元测试
// 用法（仓库根目录）： node tools/test-point-create.js
//
// 为什么要单独写这个：createPoint 的云函数要连数据库才能跑，但真正容易写错的是
// 「校验规则」——长度边界、全角标点怎么算、坐标范围、人均上限判定。
// 这部分被抽到 lib/validate.js（不 require wx-server-sdk），所以能在这里全测掉。
// （同 F-03 的 lib/points.js、F-04 的 lib/badges.js）
const path = require('path')
const V = require(
  path.join(__dirname, '..', 'code', 'code', 'cloudfunctions', 'createPoint', 'lib', 'validate.js')
)

let pass = 0
let fail = 0

function eq(actual, expected, title) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log('  ✅ ' + title)
  } else {
    fail++
    console.log('  ❌ ' + title + '  期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
  }
}

// 只关心 ok，成功用例把 data 丢掉
function ok(input, owned, title) {
  const r = V.validatePoint(input, owned || 0)
  eq(r.ok, true, title + '（msg=' + JSON.stringify(r.msg) + '）')
}

function bad(input, owned, title) {
  const r = V.validatePoint(input, owned || 0)
  eq(r.ok, false, title + '（msg=' + JSON.stringify(r.msg) + '）')
}

const GOOD = { name: '老榕树', spell: '老榕树下', radius: 50, longitude: 116.174609, latitude: 39.731685 }

console.log('— 常量 —')
eq(V.LIMITS.NAME_MAX, 20, '名称上限 20')
eq(V.LIMITS.SPELL_MIN, 2, '咒语下限 2')
eq(V.LIMITS.SPELL_MAX, 8, '咒语上限 8')
eq(V.LIMITS.RADIUS_MIN, 20, '半径下限 20 米')
eq(V.LIMITS.RADIUS_MAX, 200, '半径上限 200 米')
eq(V.LIMITS.MAX_POINTS_PER_USER, 10, '人均上限 10 个点位')

console.log('')
console.log('— normalizeSpell：全角转半角 + 去空白与标点 —')
eq(V.normalizeSpell(' 我 爱 文 萃 '), '我爱文萃', '空格被去掉')
eq(V.normalizeSpell('ＡＢＣ'), 'abc', '全角字母 → 小写半角')
eq(V.normalizeSpell('明德精工，创新包容'), '明德精工创新包容', '中文逗号被去掉')
eq(V.normalizeSpell('Hi, 你好!'), 'hi你好', '英文标点与空格被去掉')
eq(V.normalizeSpell('（括号）'), '括号', '全角括号被去掉')
eq(V.normalizeSpell(null), '', 'null → 空串')
eq(V.normalizeSpell(undefined), '', 'undefined → 空串')

console.log('')
console.log('— charLen：按码点数（emoji 算 1）—')
eq(V.charLen('abc'), 3, '英文 3 个')
eq(V.charLen('我爱文萃'), 4, '中文 4 个')
eq(V.charLen('😀'), 1, 'emoji 算 1 个（不是 2）')
eq(V.charLen(''), 0, '空串 0 个')

console.log('')
console.log('— validateName —')
eq(V.validateName('老榕树').value, '老榕树', '正常名称通过')
eq(V.validateName('  带空格的名字  ').value, '带空格的名字', '首尾空白被 trim')
eq(V.validateName('').ok, false, '空串不通过')
eq(V.validateName('   ').ok, false, '纯空白不通过')
eq(V.validateName(undefined).ok, false, 'undefined 不通过')
eq(V.validateName('一'.repeat(20)).ok, true, '正好 20 字通过')
eq(V.validateName('二'.repeat(21)).ok, false, '21 字超限')
eq(V.validateName('😀'.repeat(20)).ok, true, '20 个 emoji 通过（按码点数）')
eq(V.validateName('😀'.repeat(21)).ok, false, '21 个 emoji 超限')

console.log('')
console.log('— validateSpell：长度按「有效长度」算 —')
eq(V.validateSpell('老榕树下').ok, true, '4 字通过')
eq(V.validateSpell('打卡').ok, true, '正好 2 字通过')
eq(V.validateSpell('打').ok, false, '1 字太短')
eq(V.validateSpell('').ok, false, '空串不通过')
eq(V.validateSpell('一二三四五六七八').ok, true, '8 字通过')
eq(V.validateSpell('一二三四五六七八九').ok, false, '9 字超限')
eq(V.validateSpell('明德精工，创新包容').ok, true, '带逗号共 9 个字符但有效长度 8 → 通过')
eq(V.validateSpell('明德精工，创新包容，').effectiveLength, 8, '有效长度报告为 8')
eq(V.validateSpell('明德精工，创新包容啊').ok, false, '有效长度 9 → 超限')
eq(V.validateSpell(' 我 爱 文 萃 ').value, '我 爱 文 萃', '原文照存（保留空格，只 trim 首尾）')
eq(V.validateSpell(' 我 爱 文 萃 ').effectiveLength, 4, '内部空格不计入有效长度')
eq(V.validateSpell('!@#').ok, false, '纯标点（含未被过滤的 @#）→ 拒绝：没有有意义字符')
eq(V.validateSpell('！！').ok, false, '纯全角标点 → 拒绝')
eq(V.validateSpell('，。').ok, false, '纯中文标点 → 拒绝')
eq(V.validateSpell('@#ab').ok, true, '符号 + 字母 → 通过')
eq(V.validateSpell('@a').ok, true, '@a 有效长度 2 → 通过（@ 不在过滤表里，但含字母）')

console.log('')
console.log('— hasMeaningfulChar —')
eq(V.hasMeaningfulChar('我爱文萃'), true, '汉字 → true')
eq(V.hasMeaningfulChar('abc'), true, '字母 → true')
eq(V.hasMeaningfulChar('123'), true, '数字 → true')
eq(V.hasMeaningfulChar('@#!'), false, '纯符号 → false')
eq(V.hasMeaningfulChar(''), false, '空串 → false')
eq(V.hasMeaningfulChar(null), false, 'null → false')

console.log('')
console.log('— validateRadius —')
eq(V.validateRadius(50).value, 50, '50 米通过')
eq(V.validateRadius(20).ok, true, '下限 20 通过')
eq(V.validateRadius(200).ok, true, '上限 200 通过')
eq(V.validateRadius(19).ok, false, '19 低于下限')
eq(V.validateRadius(201).ok, false, '201 超上限')
eq(V.validateRadius('50').value, 50, '数字字符串转数字')
eq(V.validateRadius('五十').ok, false, '非数字不通过')
eq(V.validateRadius(NaN).ok, false, 'NaN 不通过')
eq(V.validateRadius(50.4).value, 50, '小数四舍五入')

console.log('')
console.log('— validateCoords —')
eq(V.validateCoords(116.174609, 39.731685).ok, true, '正常坐标通过')
eq(V.validateCoords(180, 90).ok, true, '边界 (180, 90) 通过')
eq(V.validateCoords(-180, -90).ok, true, '边界 (-180, -90) 通过')
eq(V.validateCoords(181, 39).ok, false, '经度 181 越界')
eq(V.validateCoords(116, 91).ok, false, '纬度 91 越界')
eq(V.validateCoords(0, 0).ok, false, '(0,0) 判定为无效坐标（取位置失败的典型值）')
eq(V.validateCoords('116.17', '39.73').ok, true, '数字字符串通过')
eq(V.validateCoords('abc', 39).ok, false, '非数字不通过')
eq(V.validateCoords(null, null).ok, false, 'null 不通过')

console.log('')
console.log('— validatePoint：汇总与人均上限 —')
ok(GOOD, 0, '正常入参通过')
ok(GOOD, 9, '已有 9 个点位仍可创建（第 10 个）')
bad(GOOD, 10, '已有 10 个点位 → 拒绝')
bad(GOOD, 99, '已有 99 个点位 → 拒绝')
eq(V.validatePoint(GOOD, 10).msg.indexOf('10') > -1, true, '上限提示里带上限数字 10')
bad({ spell: '老榕树下', radius: 50, longitude: 116, latitude: 39 }, 0, '缺名称 → 拒绝')
bad({ name: '老榕树', radius: 50, longitude: 116, latitude: 39 }, 0, '缺咒语 → 拒绝')
bad({ name: '老榕树', spell: '老榕树下', longitude: 116, latitude: 39 }, 0, '缺半径 → 拒绝')
bad({ name: '老榕树', spell: '老榕树下', radius: 50 }, 0, '缺坐标 → 拒绝')
bad(null, 0, 'event 为 null → 拒绝')
bad(undefined, 0, 'event 为 undefined → 拒绝')
eq(V.validatePoint(GOOD, 0).data.name, '老榕树', '成功时回传规范化后的数据')
eq(V.validatePoint({ ...GOOD, name: '  老榕树  ' }, 0).data.name, '老榕树', '成功时名称已 trim')
eq(V.validatePoint({ ...GOOD, radius: '100' }, 0).data.radius, 100, '成功时半径已转数字')
eq(V.validatePoint(GOOD, '3').ok, true, 'ownedCount 传数字字符串 "3" 也能判')
eq(V.validatePoint(GOOD, undefined).ok, true, 'ownedCount 缺失时按 0 处理')
eq(V.validatePoint(GOOD, 'abc').ok, true, 'ownedCount 非法（NaN）时按 0 处理，不因脏数据误拦用户')
eq(V.validatePoint(GOOD, 10).data, undefined, '被拦截时不返回 data')

console.log('')
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
