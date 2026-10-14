// tools/test-points.js —— getRanking 积分规则的本地单元测试
// 用法（仓库根目录）： node tools/test-points.js
//
// 为什么单独写这个：积分榜的分数是「聚合 + 计算」出来的，云函数里跑一次要连数据库。
// 这里把纯计算部分（lib/points.js）单独测掉，覆盖最容易写错的「连续打卡奖励」边界，
// 云函数那边只需要验证聚合查询本身对不对。
const path = require('path')
const { POINTS, isNextDay, streakBonus, calcPoints } = require(
  path.join(__dirname, '..', 'code', 'code', 'cloudfunctions', 'getRanking', 'lib', 'points.js')
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

console.log('— 连续打卡奖励 streakBonus（+5 × min(n, 5)，n≥2 起算）—')
eq(POINTS.checkin, 10, '规则常量：成功打卡 10 分')
eq(POINTS.taskDone, 20, '规则常量：完成他人任务 20 分')
eq(POINTS.taskPublished, 5, '规则常量：发布被完成 5 分')
eq(streakBonus([]), 0, '没有任何打卡 → 0')
eq(streakBonus(null), 0, '入参为空 → 0')
eq(streakBonus(['2026-10-01']), 0, '只打卡 1 天 → 0（连续第 1 天不计）')
eq(streakBonus(['2026-10-01', '2026-10-02']), 10, '连续 2 天 → 5×2 = 10')
eq(streakBonus(['2026-10-01', '2026-10-02', '2026-10-03']), 25, '连续 3 天 → 10 + 5×3 = 25')
eq(streakBonus(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']), 70,
  '连续 5 天 → 10+15+20+25 = 70')
eq(streakBonus(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']), 95,
  '连续 6 天 → 95（min(n,5) 开始封顶）')
eq(streakBonus(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']), 120,
  '连续 7 天 → 120（封顶后每天只加 25）')

console.log('— 断档 / 乱序 / 跨月跨年 —')
eq(streakBonus(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06']), 20,
  '中间断档 → 两段各按 2 天算：10 + 10 = 20')
eq(streakBonus(['2026-10-02', '2026-10-01']), 10, '乱序输入仍按日期排序计算 → 10')
eq(streakBonus(['2026-09-30', '2026-10-01']), 10, '跨月连续 → 10')
eq(streakBonus(['2025-12-31', '2026-01-01']), 10, '跨年连续 → 10')
eq(streakBonus(['2026-10-01', '2026-10-01']), 0, '重复日期（防御性）→ 不当作连续 → 0')

console.log('— isNextDay 日期边界 —')
eq(isNextDay('2026-10-01', '2026-10-02'), true, '相邻两天 → true')
eq(isNextDay('2026-10-01', '2026-10-03'), false, '隔一天 → false')
eq(isNextDay('2028-02-28', '2028-02-29'), true, '闰年 2/28 → 2/29 → true')
eq(isNextDay('2028-02-29', '2028-03-01'), true, '闰年 2/29 → 3/1 → true')
eq(isNextDay('2027-02-28', '2027-03-01'), true, '平年 2/28 → 3/1（就是次日）→ true')
eq(isNextDay('2027-02-28', '2027-03-02'), false, '平年 2/28 → 3/2 → false')

console.log('— 总分 calcPoints —')
eq(calcPoints({ successTimes: 3, taskDone: 1, taskPublished: 2, streakBonus: 20 }), 80,
  '3×10 + 1×20 + 2×5 + 20 = 80')
eq(calcPoints({}), 0, '空统计 → 0')
eq(calcPoints({ successTimes: 5 }), 50, '只打卡 5 次 → 50')

console.log('')
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项')
process.exit(fail === 0 ? 0 : 1)
