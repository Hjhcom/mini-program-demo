// 云函数 getRanking 的纯计算部分（F-03 积分规则 / 文档 3.3.1）
// ⚠️ 这里刻意不 require wx-server-sdk：本文件是「纯函数」，可以被本地 Node 直接单测
//    （见仓库根 tools/test-points.js），云环境下由 index.js require('./lib/points') 引入。
//
// 积分规则：
//   1. 成功打卡一次                        +10
//   2. 完成别人指派的任务                  +20
//   3. 自己发布的任务被完成                +5
//   4. 连续打卡第 n 天（n≥2）              +5 × min(n, 5)
//
// 设计要点：**积分不落库**，每次请求实时算出来 —— 避免「累加字段」写错一次就永久失真
// （现有 users.totalCheckins 恒为 0 就是前车之鉴）。

const POINTS = {
  checkin: 10,      // 成功打卡一次
  hiddenBonus: 10,  // F-13：隐藏咒语打卡额外 +10（合计 20，双倍）
  taskDone: 20,     // 完成别人指派的任务
  taskPublished: 5, // 发布的任务被完成
  routeBonus: 50,   // F-17：完成一条剧本任务线
  streakStep: 5,    // 连续打卡奖励步长
  streakCap: 5      // 连续打卡奖励封顶倍数（min(n, 5)）
}

// 'YYYY-MM-DD' 解析成 UTC 毫秒（只用于比较日期差，避开本地时区干扰）
function dayToUTC(day) {
  return Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10))
  )
}

// cur 是否正好是 prev 的第二天
function isNextDay(prev, cur) {
  return dayToUTC(cur) - dayToUTC(prev) === 86400000
}

// 连续打卡奖励
// dayList：该用户「成功打卡」的自然日列表（形如 ['2026-10-13', ...]），
//          由云函数按 (openid, dayKey) 聚合得到，因此已天然去重（这里再防御性处理重复）。
// 语义：从左到右按天扫描，维护当前连续天数 streak；
//       streak ≥ 2 的那天起，每天都按 5 × min(streak, 5) 计奖励；
//       断档则 streak 归 1（新一段的第一天不计奖励）。
function streakBonus(dayList) {
  if (!dayList || dayList.length === 0) return 0
  const days = dayList.slice().sort() // 'YYYY-MM-DD' 的字典序恰好等于时间序
  let bonus = 0
  let streak = 0
  for (let i = 0; i < days.length; i++) {
    if (i === 0 || !isNextDay(days[i - 1], days[i])) {
      streak = 1
    } else {
      streak += 1
    }
    if (streak >= 2) {
      bonus += POINTS.streakStep * Math.min(streak, POINTS.streakCap)
    }
  }
  return bonus
}

// 总分 = 打卡 + 隐藏咒语加成 + 完成任务 + 发布被完成 + 剧本线路 + 连续打卡奖励
// stat: { successTimes, hiddenTimes, taskDone, taskPublished, routeDone, streakBonus }
function calcPoints(stat) {
  const s = stat || {}
  return (s.successTimes || 0) * POINTS.checkin +
    (s.hiddenTimes || 0) * POINTS.hiddenBonus +
    (s.taskDone || 0) * POINTS.taskDone +
    (s.taskPublished || 0) * POINTS.taskPublished +
    (s.routeDone || 0) * POINTS.routeBonus +
    (s.streakBonus || 0)
}

module.exports = { POINTS, isNextDay, streakBonus, calcPoints }
