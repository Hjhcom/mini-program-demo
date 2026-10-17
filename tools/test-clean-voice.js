// tools/test-clean-voice.js —— cleanVoice/lib/clean.js 的本地单元测试（F-11 用）
// 用法（仓库根目录）： node tools/test-clean-voice.js
//
// 为什么要测：这个函数的唯一动作是**删用户数据**。判早了 = 误删录音，判晚了 = 文件堆积，
// 而且线上跑失败不会有人察觉（定时任务，没有用户在看）。所以边界必须在这里钉死：
//   · 时间字段缺失/脏数据 → 一律不删（宁可留一条脏记录，也不误删）
//   · 恰好卡在「7 天整」→ 不删（完整保留 7 天）
//   · fileID 为空 → 没有可删目标，跳过（不能拿 undefined 去 deleteFile）
// clean.js 是纯函数、不 require wx-server-sdk，所以能在这里全部测掉。
const path = require('path')
const C = require(path.join(__dirname, '..', 'code', 'code', 'cloudfunctions', 'cleanVoice', 'lib', 'clean.js'))

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

// 固定一个「现在」，所有用例都相对它算，避免用真实时间导致结果漂移
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0) // 2026-10-17 12:00:00 UTC
const DAY = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------- 常量
console.log('— 常量 —')
eq(C.RETENTION_DAYS, 7, '保留期是 7 天（文档 3.9.5）')
eq(C.DAY_MS, 86400000, 'DAY_MS = 86400000')
eq(C.DELETE_BATCH, 50, 'deleteFile 每批 50 个（SDK 上限）')

// ---------------------------------------------------------------- toMs
console.log('— toMs：各种时间入参 —')
eq(C.toMs(new Date(NOW)), NOW, 'Date 对象 → 毫秒')
eq(C.toMs(NOW), NOW, '毫秒数字原样返回')
eq(C.toMs('2026-10-17T12:00:00.000Z'), NOW, 'ISO 字符串可解析')
eq(typeof C.toMs('2026-10-17 12:00:00'), 'number', '带空格的时间字符串可解析（返回数字）')
eq(C.toMs({ $date: NOW }), NOW, '控制台导出的 { $date } 形态')

// ⚠️ 这一组是重点：0 与空值必须当「无效」，不能当 1970 年
console.log('— toMs：脏值一律返回 null（防「缺失字段 = 1970 年 = 立即删」）—')
eq(C.toMs(null), null, 'null → null')
eq(C.toMs(undefined), null, 'undefined → null')
eq(C.toMs(''), null, "空串 → null（Number('') === 0 的坑）")
eq(C.toMs(0), null, '0 → null（缺失字段被当成 0 时不能算 1970 年）')
eq(C.toMs(-1), null, '负数 → null')
eq(C.toMs(NaN), null, 'NaN → null')
eq(C.toMs(Infinity), null, 'Infinity → null')
eq(C.toMs('不是时间'), null, '无法解析的字符串 → null')
eq(C.toMs('   '), null, '纯空格 → null（不是 0）')
eq(C.toMs(true), null, '布尔 → null')
eq(C.toMs({}), null, '空对象 → null')
eq(C.toMs({ $date: 0 }), null, '{ $date: 0 } → null（同样不能当 1970）')

// ---------------------------------------------------------------- cutoffOf
console.log('— cutoffOf：分界线 —')
eq(C.cutoffOf(NOW).getTime(), NOW - 7 * DAY, '默认减 7 天')
eq(C.cutoffOf(NOW, 3).getTime(), NOW - 3 * DAY, '可指定天数')
eq(C.cutoffOf(NOW, 0).getTime(), NOW, '0 天 = 现在（全部已过期）')
eq(C.cutoffOf(NOW, 7.5).getTime(), NOW - 7.5 * DAY, '支持小数天')
eq(C.cutoffOf(NOW, null).getTime(), NOW - 7 * DAY, 'days=null → 回落 7 天')
eq(C.cutoffOf(NOW, NaN).getTime(), NOW - 7 * DAY, 'days=NaN → 回落 7 天')
eq(C.cutoffOf(NOW, -1).getTime(), NOW - 7 * DAY, 'days 负数 → 回落 7 天（不能往前推）')
eq(C.cutoffOf(NOW, 'abc').getTime(), NOW - 7 * DAY, 'days 非数字 → 回落 7 天')
eq(C.cutoffOf(null), null, 'now 无效 → null')
eq(C.cutoffOf(0), null, 'now=0 也无效 → null')

// ---------------------------------------------------------------- isExpired
console.log('— isExpired：边界 —')
eq(C.isExpired(NOW - 7 * DAY, NOW), false, '恰好 7 天整 → 不算过期（边界保留）')
eq(C.isExpired(NOW - 7 * DAY - 1, NOW), true, '7 天零 1 毫秒 → 过期')
eq(C.isExpired(NOW - 8 * DAY, NOW), true, '8 天前 → 过期')
eq(C.isExpired(NOW - 1 * DAY, NOW), false, '1 天前 → 不过期')
eq(C.isExpired(NOW + DAY, NOW), false, '未来时间 → 不过期（时钟偏差别误删）')
eq(C.isExpired(null, NOW), false, 'createTime 为 null → 不删')
eq(C.isExpired(undefined, NOW), false, 'createTime 缺失 → 不删')
eq(C.isExpired('', NOW), false, 'createTime 空串 → 不删')
eq(C.isExpired(0, NOW), false, 'createTime 为 0 → 不删（不是 1970 年）')
eq(C.isExpired('乱码时间', NOW), false, 'createTime 无法解析 → 不删')
eq(C.isExpired(new Date(NOW - 8 * DAY), NOW), true, 'Date 对象同样适用')
eq(C.isExpired(NOW - 4 * DAY, NOW, 3), true, '自定义保留 3 天时，4 天前 → 过期')

// ---------------------------------------------------------------- pickExpired
console.log('— pickExpired：混合批次 —')
const records = [
  { _id: 'a', fileID: 'cloud://x/a.wav', createTime: new Date(NOW - 10 * DAY) }, // 过期
  { _id: 'b', fileID: 'cloud://x/b.wav', createTime: new Date(NOW - 2 * DAY) }, // 未过期
  { _id: 'c', createTime: new Date(NOW - 10 * DAY) }, // 老记录没有 fileID
  { _id: 'd', fileID: '', createTime: new Date(NOW - 10 * DAY) }, // 已清理过
  { _id: 'e', fileID: 'cloud://x/e.wav' }, // 没有 createTime
  { _id: 'f', fileID: 'cloud://x/f.wav', createTime: '不是时间' }, // 脏时间
  { _id: 'g', fileID: '  cloud://x/g.wav  ', createTime: NOW - 9 * DAY }, // 数字 + 带空格
  { _id: 'h', fileID: 'cloud://x/h.wav', createTime: new Date(NOW - 7 * DAY) }, // 恰好边界
  null, // 脏数据
  { _id: 'i', fileID: 123, createTime: new Date(NOW - 9 * DAY) } // fileID 不是字符串
]
const picked = C.pickExpired(records, NOW)
eq(picked.expired.map(x => x._id), ['a', 'g'], '只挑出「有 fileID + 时间可解析 + 确实过期」的')
eq(picked.expired[1].fileID, 'cloud://x/g.wav', 'fileID 首尾空格被去掉')
eq(picked.expired[0].createTime, NOW - 10 * DAY, '出参带毫秒时间戳，便于日志排查')
eq(picked.skipped, { noFile: 3, badTime: 3, notExpired: 2 }, '跳过原因分别计数（无文件3 / 时间脏3 / 未过期2）')

eq(C.pickExpired(null, NOW).expired, [], '入参不是数组 → 空结果不报错')
eq(C.pickExpired(undefined, NOW).expired, [], '入参 undefined → 空结果不报错')
eq(C.pickExpired([], NOW).expired, [], '空数组 → 空结果')
eq(C.pickExpired(records, null).expired, [], 'now 无效 → 一条都不删（安全兜底）')

// ---------------------------------------------------------------- chunk
console.log('— chunk：分批 —')
eq(C.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], '5 个切成 2 个一批')
eq(C.chunk([], 50), [], '空数组 → 空')
eq(C.chunk([1, 2, 3], 50), [[1, 2, 3]], '不足一批 → 一批')
eq(C.chunk([1, 2, 3], 3), [[1, 2, 3]], '刚好整除')
eq(C.chunk([1, 2, 3], 0), [[1, 2, 3]], 'size=0 时整段返回（不无限循环）')
eq(C.chunk([1, 2, 3], -1), [[1, 2, 3]], 'size 负数同样整段返回')
eq(C.chunk([1, 2, 3], null), [[1, 2, 3]], 'size=null 整段返回')
eq(C.chunk(null, 2), [], '入参 null → 空')
eq(
  C.chunk(new Array(120).fill(0), C.DELETE_BATCH).map(x => x.length),
  [50, 50, 20],
  '120 个按 deleteFile 上限切成 50/50/20'
)

// ---------------------------------------------------------------- 汇总
console.log('')
if (fail === 0) {
  console.log('全部通过 ✅  共 ' + (pass + fail) + ' 条（通过 ' + pass + ' / 失败 ' + fail + '）')
} else {
  console.log('有失败 ❌  通过 ' + pass + ' / 失败 ' + fail)
  process.exitCode = 1
}
