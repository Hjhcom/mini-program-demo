// tools/test-badges.js —— getBadges 连续打卡与徽章判定的本地单元测试
// 用法（仓库根目录）： node tools/test-badges.js
//
// 为什么单独写这个：徽章判定要在云函数里连数据库，跑一次很笨重。
// 这里把纯计算部分（lib/badges.js）单独测掉，重点覆盖三处最容易写错的地方：
//   1. 时区 —— 云函数容器是 UTC，北京时间 00:00~08:00 属于「前一天」还是「今天」；
//   2. 「当前连续」vs「历史最长」—— 徽章必须用最长连续判定，否则断档后徽章永远发不出去；
//   3. 各徽章的阈值边界（差 1 天 / 差 0.01 相似度）。
// 云函数那边只需要验证聚合查询本身对不对。
const path = require('path')
const {
  BADGES, NIGHT_HOUR, PERFECT_SIM,
  toDayKey, shiftDay, isNextDay, hourOf, dayKeyOf,
  uniqSorted, streakInfo, summarize, evaluate
} = require(path.join(__dirname, '..', 'code', 'code', 'cloudfunctions', 'getBadges', 'lib', 'badges.js'))

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

// 构造一个 UTC 时刻（方便验证 +8 小时换算）
function utc(y, m, d, h, min) {
  return new Date(Date.UTC(y, m - 1, d, h, min || 0, 0))
}

console.log('— 基础常量 —')
eq(BADGES.length, 8, '一共 8 个徽章')
eq(BADGES.map(b => b.id), ['first', 'lark', 'marathon', 'explorer', 'perfect', 'nightOwl', 'taskMaster', 'taskPublisher'], '徽章 id 与顺序')
eq(new Set(BADGES.map(b => b.id)).size, 8, '徽章 id 不重复')
eq(BADGES.every(b => !!b.icon), true, '每个徽章都有图标')
eq(NIGHT_HOUR, 23, '夜猫子门槛：23 点')
eq(PERFECT_SIM, 0.95, '一鸣惊人门槛：相似度 0.95')

console.log('— toDayKey：UTC+8 跨日边界（最容易错的地方）—')
eq(toDayKey(utc(2026, 10, 14, 15, 0)), '2026-10-14', 'UTC 15:00 = 北京 23:00 → 仍是 10-14')
eq(toDayKey(utc(2026, 10, 14, 15, 59)), '2026-10-14', 'UTC 15:59 = 北京 23:59 → 仍是 10-14')
eq(toDayKey(utc(2026, 10, 14, 16, 0)), '2026-10-15', 'UTC 16:00 = 北京次日 00:00 → 10-15（关键）')
eq(toDayKey(utc(2026, 10, 14, 0, 0)), '2026-10-14', 'UTC 00:00 = 北京 08:00 → 10-14')
eq(toDayKey('2026-10-14T16:30:00.000Z'), '2026-10-15', 'ISO 字符串输入同样按 +8 换算')
eq(toDayKey(null), '', '空值 → 空字符串')
eq(toDayKey('乱七八糟'), '', '无法解析 → 空字符串')

console.log('— hourOf：取北京时间的小时 —')
eq(hourOf(utc(2026, 10, 14, 15, 0)), 23, 'UTC 15:00 → 北京 23 点')
eq(hourOf(utc(2026, 10, 14, 14, 59)), 22, 'UTC 14:59 → 北京 22 点')
eq(hourOf(utc(2026, 10, 14, 16, 0)), 0, 'UTC 16:00 → 北京 0 点')
eq(hourOf(null), -1, '空值 → -1')

console.log('— shiftDay / isNextDay：跨月、跨年、闰年 —')
eq(shiftDay('2026-10-14', -1), '2026-10-13', '前一天')
eq(shiftDay('2026-10-31', 1), '2026-11-01', '跨月')
eq(shiftDay('2026-12-31', 1), '2027-01-01', '跨年')
eq(shiftDay('2026-03-01', -1), '2026-02-28', '平年 3-01 前一天是 2-28')
eq(shiftDay('2024-03-01', -1), '2024-02-29', '闰年 3-01 前一天是 2-29')
eq(shiftDay('2026-01-01', -1), '2025-12-31', '跨年回退')
eq(isNextDay('2026-10-13', '2026-10-14'), true, '相邻两天 → true')
eq(isNextDay('2026-10-14', '2026-10-14'), false, '同一天 → false')
eq(isNextDay('2026-10-14', '2026-10-13'), false, '顺序反了 → false')
eq(isNextDay('2026-02-28', '2026-03-01'), true, '平年 2-28 → 3-01 相邻')
eq(isNextDay('2024-02-28', '2024-02-29'), true, '闰年 2-28 → 2-29 相邻')
eq(isNextDay('2024-02-29', '2024-03-01'), true, '闰年 2-29 → 3-01 相邻')

console.log('— uniqSorted —')
eq(uniqSorted(['2026-10-03', '2026-10-01', '2026-10-03', '', null]), ['2026-10-01', '2026-10-03'], '去重 + 升序，空值剔除')
eq(uniqSorted([]), [], '空数组')
eq(uniqSorted(null), [], 'null 入参')

console.log('— streakInfo：当前连续 vs 历史最长 —')
const T = '2026-10-14' // 固定「今天」，避免测试依赖真实时间
const todayKey = toDayKey(new Date()) // 真实的今天（仅用于验证「不传 today」这条分支）
eq(streakInfo([], T), { current: 0, max: 0 }, '没有任何打卡 → 0/0')
eq(streakInfo(['2026-10-14'], T), { current: 1, max: 1 }, '只有今天 → 当前 1 / 最长 1')
eq(streakInfo(['2026-10-12', '2026-10-13', '2026-10-14'], T), { current: 3, max: 3 }, '连着 3 天含今天')
eq(streakInfo(['2026-10-11', '2026-10-12', '2026-10-13'], T), { current: 3, max: 3 },
  '最后一天是「昨天」→ 连续还没断，当前仍算 3')
eq(streakInfo(['2026-10-10', '2026-10-11', '2026-10-12'], T), { current: 0, max: 3 },
  '最后一天是「前天」→ 已断档，当前归 0（最长仍 3）')
eq(streakInfo(['2026-10-14', '2026-10-13', '2026-10-12'], T), { current: 3, max: 3 }, '乱序输入仍正确')
eq(streakInfo(['2026-10-13', '2026-10-13', '2026-10-14'], T), { current: 2, max: 2 }, '同一天重复只算一天')
eq(streakInfo(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-13', '2026-10-14'], T),
  { current: 2, max: 3 }, '两段连续 → 当前 2、最长 3（当前 < 最长）')
eq(streakInfo(['2026-09-29', '2026-09-30', '2026-10-01'], T), { current: 0, max: 3 }, '跨月连续的 3 天')
eq(streakInfo(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01'), { current: 3, max: 3 }, '跨年连续的 3 天')
eq(streakInfo([todayKey], null), { current: 1, max: 1 }, '不传 today 时按当前北京时间判定')

console.log('— summarize：从打卡记录汇总统计量 —')
eq(summarize([], T).successTimes, 0, '无记录 → successTimes 0')
eq(summarize([], T).curStreak, 0, '无记录 → 连续 0')
eq(summarize(null, T).pointCount, 0, 'null 入参不报错')

const sameDay = summarize([
  { pointId: 'A', similarity: 0.8, createTime: utc(2026, 10, 14, 2, 0) },
  { pointId: 'A', similarity: 0.9, createTime: utc(2026, 10, 14, 3, 0) }
], T)
eq(sameDay.successTimes, 2, '同一天打 2 次 → 记录数 2')
eq(sameDay.pointCount, 1, '同一点位打 2 次 → 点位数 1')
eq(sameDay.maxStreak, 1, '同一天 → 连续 1 天')
eq(sameDay.maxSimilarity, 0.9, '取最大相似度')

const multiPoint = summarize([
  { pointId: 'A', similarity: 0.5, createTime: utc(2026, 10, 13, 2, 0) },
  { pointId: 'B', similarity: 0.6, createTime: utc(2026, 10, 14, 2, 0) }
], T)
eq(multiPoint.pointCount, 2, '两个不同点位 → 2')
eq(multiPoint.maxStreak, 2, '连续两天 → 2')

eq(summarize([{ pointId: 'A', similarity: 0.9, createTime: utc(2026, 10, 14, 15, 30) }], T).nightOwl, true,
  '北京 23:30 打卡 → 夜猫子达标')
eq(summarize([{ pointId: 'A', similarity: 0.9, createTime: utc(2026, 10, 14, 14, 59) }], T).nightOwl, false,
  '北京 22:59 打卡 → 夜猫子未达标')
eq(summarize([{ pointId: 'A', similarity: 0.9, createTime: utc(2026, 10, 14, 16, 30) }], T).nightOwl, false,
  '北京次日 00:30 → 不算夜猫子（门槛是 23:00 之后、当天之内）')

eq(dayKeyOf({ dayKey: '2026-01-01', createTime: utc(2026, 10, 14, 2, 0) }), '2026-01-01',
  '有 dayKey 时优先用 dayKey')
eq(dayKeyOf({ createTime: utc(2026, 10, 14, 2, 0) }), '2026-10-14', '没有 dayKey 时从 createTime 换算（兼容历史数据）')
eq(summarize([{ pointId: 'A', similarity: 0.9, dayKey: '2026-10-14', createTime: utc(2026, 10, 14, 2, 0) }], T).maxStreak,
  1, '带 dayKey 的记录正常计入连续')

console.log('— evaluate：8 个徽章的阈值边界 —')
const base = { successTimes: 0, pointCount: 0, maxSimilarity: 0, nightOwl: false, curStreak: 0, maxStreak: 0, taskDone: 0, taskPublished: 0 }
const withStat = patch => Object.assign({}, base, patch)

eq(evaluate(base), [], '全 0 → 一个徽章都没有')
eq(evaluate(withStat({ successTimes: 1 })), ['first'], '打卡 1 次 → 初次打卡')
eq(evaluate(withStat({ successTimes: 0 })), [], '没有成功记录 → 不含初次打卡')

eq(evaluate(withStat({ successTimes: 3, maxStreak: 2 })), ['first'], '连续 2 天 → 还不到百灵鸟')
eq(evaluate(withStat({ successTimes: 3, maxStreak: 3 })), ['first', 'lark'], '连续 3 天 → 百灵鸟')
eq(evaluate(withStat({ successTimes: 7, maxStreak: 6 })), ['first', 'lark'], '连续 6 天 → 还不到马拉松')
eq(evaluate(withStat({ successTimes: 7, maxStreak: 7 })), ['first', 'lark', 'marathon'], '连续 7 天 → 马拉松选手')

eq(evaluate(withStat({ successTimes: 5, pointCount: 4 })), ['first'], '4 个点位 → 还不到探险家')
eq(evaluate(withStat({ successTimes: 5, pointCount: 5 })), ['first', 'explorer'], '5 个点位 → 探险家')

eq(evaluate(withStat({ successTimes: 1, maxSimilarity: 0.94 })), ['first'], '相似度 0.94 → 还不到一鸣惊人')
eq(evaluate(withStat({ successTimes: 1, maxSimilarity: 0.95 })), ['first', 'perfect'], '相似度 0.95 → 一鸣惊人（含边界）')
eq(evaluate(withStat({ successTimes: 1, maxSimilarity: 1 })), ['first', 'perfect'], '相似度 1.0 → 一鸣惊人')

eq(evaluate(withStat({ successTimes: 1, nightOwl: true })), ['first', 'nightOwl'], '23 点后打卡 → 夜猫子')

eq(evaluate(withStat({ successTimes: 5, taskDone: 4 })), ['first'], '完成 4 个任务 → 还不到任务达人')
eq(evaluate(withStat({ successTimes: 5, taskDone: 5 })), ['first', 'taskMaster'], '完成 5 个任务 → 任务达人')
eq(evaluate(withStat({ successTimes: 5, taskPublished: 2 })), ['first'], '发布被完成 2 次 → 还不到任务发布者')
eq(evaluate(withStat({ successTimes: 5, taskPublished: 3 })), ['first', 'taskPublisher'], '发布被完成 3 次 → 任务发布者')
eq(evaluate(null), [], 'null 入参不报错')
eq(evaluate({}), [], '空对象不报错')

console.log('— 关键回归：徽章必须按「历史最长连续」判定，不能用「当前连续」—')
eq(evaluate(withStat({ successTimes: 10, maxStreak: 7, curStreak: 0 })), ['first', 'lark', 'marathon'],
  '当前连续已断（0）但历史最长 7 天 → 马拉松选手仍然成立')
eq(streakInfo(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'], T),
  { current: 0, max: 7 }, '7 天连续发生在很久以前 → 当前 0 / 最长 7')

console.log('— 全满：8 个徽章都在，且顺序与 BADGES 一致 —')
const full = evaluate(withStat({
  successTimes: 20, pointCount: 6, maxSimilarity: 0.98,
  nightOwl: true, curStreak: 8, maxStreak: 8, taskDone: 6, taskPublished: 4
}))
eq(full.length, 8, '8 个全解锁')
eq(full, BADGES.map(b => b.id), '返回顺序与 BADGES 顺序一致')

console.log()
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
