// 云函数 getBadges 的纯计算部分（F-04 连续打卡与成就徽章 / 文档 3.4）
// ⚠️ 这里刻意不 require wx-server-sdk：本文件是「纯函数」，可以被本地 Node 直接单测
//    （见仓库根 tools/test-badges.js），云环境下由 index.js require('./lib/badges') 引入。
//
// 两个容易写错的地方，都在这里一次性解决：
//   1. 时区：云函数容器时区是 UTC，直接 new Date().getDate() 会差 8 小时。
//      所有「哪一天」的判断都走 toDayKey（固定按 UTC+8）与 dayKey 字符串比较，不碰本地时区。
//   2. 「当前连续」还是「历史最长」：徽章是懒判定的 —— 用户连续 7 天后可能过几天才打开
//      徽章页，那时当前连续早就断了。所以徽章一律用 **历史最长连续（maxStreak）** 判定，
//      否则「马拉松选手」这类徽章会永远发不出去。当前连续（curStreak）只用于页面展示。

// 「夜猫子」的时间门槛：UTC+8 的 23 点
const NIGHT_HOUR = 23
// 「一鸣惊人」的相似度门槛
const PERFECT_SIM = 0.95

// 8 个成就徽章（名称与条件文案在多语言包里，这里只放语言无关的 id 与图标）
const BADGES = [
  { id: 'first', icon: '🌱' },          // 初次打卡：首次 matched
  { id: 'lark', icon: '🐦' },           // 百灵鸟：连续 3 天
  { id: 'marathon', icon: '🏃' },       // 马拉松选手：连续 7 天
  { id: 'explorer', icon: '🧭' },       // 探险家：5 个不同点位
  { id: 'perfect', icon: '💯' },        // 一鸣惊人：单次相似度 >= 0.95
  { id: 'nightOwl', icon: '🦉' },       // 夜猫子：23:00 之后成功打卡
  { id: 'taskMaster', icon: '🤝' },     // 任务达人：完成 5 个他人指派的任务
  { id: 'taskPublisher', icon: '📣' }   // 任务发布者：发布的任务被完成 3 次
]

// 判定规则：stat -> 是否达标。阈值集中在这里，改规则只动这一处。
const RULES = [
  { id: 'first', test: s => s.successTimes >= 1 },
  { id: 'lark', test: s => s.maxStreak >= 3 },
  { id: 'marathon', test: s => s.maxStreak >= 7 },
  { id: 'explorer', test: s => s.pointCount >= 5 },
  { id: 'perfect', test: s => s.maxSimilarity >= PERFECT_SIM },
  { id: 'nightOwl', test: s => s.nightOwl === true },
  { id: 'taskMaster', test: s => (s.taskDone || 0) >= 5 },
  { id: 'taskPublisher', test: s => (s.taskPublished || 0) >= 3 }
]

// ---------- 时间工具（全部按 UTC+8 口径）----------

// Date -> 'YYYY-MM-DD'（北京时间）
function toDayKey(date) {
  const d = toDate(date)
  if (!d) return ''
  const bj = new Date(d.getTime() + 8 * 3600 * 1000)
  const y = bj.getUTCFullYear()
  const m = bj.getUTCMonth() + 1
  const day = bj.getUTCDate()
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day
}

// 'YYYY-MM-DD' + n 天 -> 'YYYY-MM-DD'
function shiftDay(day, delta) {
  const t = dayToUTC(day) + delta * 86400000
  const d = new Date(t)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  const dd = d.getUTCDate()
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd
}

// 'YYYY-MM-DD' -> UTC 毫秒（只用于比较日期差，避开本地时区）
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

// Date -> 北京时间的小时（0~23）
function hourOf(date) {
  const d = toDate(date)
  if (!d) return -1
  return new Date(d.getTime() + 8 * 3600 * 1000).getUTCHours()
}

// 兼容 Date / 时间戳 / ISO 字符串（控制台手工造的数据常是字符串）
function toDate(v) {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// ---------- 统计 ----------

// 取记录所属的自然日：优先用写入时存好的 dayKey（新数据都有），
// 老数据没有这个字段，就从 createTime 按 UTC+8 现算（这就是要兼容历史数据的原因）。
function dayKeyOf(record) {
  if (record && record.dayKey) return String(record.dayKey)
  return toDayKey(record && record.createTime)
}

// 连续打卡信息
// dayList：自然日列表（可重复、可乱序，内部去重排序）
// today ：'YYYY-MM-DD'，默认取当前北京时间（单测时可注入，避免依赖真实时间）
// 返回 { current, max }：
//   max     = 历史最长连续天数（徽章判定用这个）
//   current = 当前连续天数 —— 仅当最后一天是「今天」或「昨天」时才算数（昨天打卡了今天还没打，
//             连续还没断）；如果最后一天更早，说明已经断档，当前连续为 0。
function streakInfo(dayList, today) {
  const days = uniqSorted(dayList)
  if (days.length === 0) return { current: 0, max: 0 }

  let max = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = isNextDay(days[i - 1], days[i]) ? run + 1 : 1
    if (run > max) max = run
  }

  const last = days[days.length - 1]
  const t = today || toDayKey(new Date())
  const current = (last === t || isNextDay(last, t)) ? run : 0
  return { current: current, max: max }
}

// 去重 + 升序（'YYYY-MM-DD' 的字典序恰好等于时间序，所以直接 sort 即可）
function uniqSorted(dayList) {
  const seen = {}
  const out = []
  ;(dayList || []).forEach(d => {
    if (!d || seen[d]) return
    seen[d] = 1
    out.push(d)
  })
  return out.sort()
}

// 把「该用户所有成功打卡记录」汇总成判定所需的统计量
// records: [{ pointId, similarity, createTime, dayKey }]，应只传 matched === true 的记录
function summarize(records, today) {
  const recs = records || []
  const pointSet = {}
  const days = []
  let maxSimilarity = 0
  let nightOwl = false

  recs.forEach(r => {
    const d = dayKeyOf(r)
    if (d) days.push(d)
    if (r && r.pointId) pointSet[r.pointId] = 1
    const sim = Number(r && r.similarity) || 0
    if (sim > maxSimilarity) maxSimilarity = sim
    const h = hourOf(r && r.createTime)
    if (h >= NIGHT_HOUR) nightOwl = true
  })

  const st = streakInfo(days, today)
  return {
    successTimes: recs.length,
    pointCount: Object.keys(pointSet).length,
    maxSimilarity: maxSimilarity,
    nightOwl: nightOwl,
    curStreak: st.current,
    maxStreak: st.max
  }
}

// 判定「应该拥有」哪些徽章（返回 id 数组，顺序与 BADGES 一致）
// stat: summarize() 的结果 + { taskDone, taskPublished }
function evaluate(stat) {
  const s = stat || {}
  return RULES
    .filter(rule => {
      try {
        return !!rule.test(s)
      } catch (e) {
        return false // 单条规则出错不影响其它徽章
      }
    })
    .map(rule => rule.id)
}

// 徽章 id -> 元数据
function badgeMeta(id) {
  for (let i = 0; i < BADGES.length; i++) {
    if (BADGES[i].id === id) return BADGES[i]
  }
  return null
}

module.exports = {
  BADGES,
  RULES,
  NIGHT_HOUR,
  PERFECT_SIM,
  toDayKey,
  shiftDay,
  dayToUTC,
  isNextDay,
  hourOf,
  dayKeyOf,
  uniqSorted,
  streakInfo,
  summarize,
  evaluate,
  badgeMeta
}
