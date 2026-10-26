// 云函数：getBadges —— 连续打卡 + 成就徽章（F-04 / 文档 3.4）
// 作用：
//  1. 实时算出该用户的「当前连续 / 历史最长连续」打卡天数；
//  2. 判定 8 个成就徽章，把新解锁的补发到 user_badges 集合；
//  3. 返回全部徽章的状态（已得 / 未得 + 获得时间）与各项进度统计。
//
// ⚠️ 为什么不在 voiceCheckin 里发徽章：
//    文档 3.4 建议「发放逻辑放在 voiceCheckin 成功分支之后」，但徽章判定要读
//    「该用户全部打卡记录 + 任务统计」，等于每次打卡都硬塞 3 次聚合查询进主链路 ——
//    讯飞识别本身就要 1~3 秒，再叠这些查询会明显拖慢打卡；一旦某个聚合失败，
//    连打卡本身都可能被拖挂。所以徽章改为「按需懒判定」：
//      · 打卡成功后前端异步调一次（拿到 newBadges 就弹提示，不影响打卡结果）
//      · 打开徽章页时调一次（补发「用户几天没打开 App」期间应得的徽章）
//    代价是徽章可能延迟几分钟才显示，收益是打卡主链路零风险。
//
// ⚠️ 隐私约定：user_badges 里存了 openid 用于关联，但出参一律不含 openid。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 打卡口径：排除 type='text' 的心情动态；早期打卡记录没有 type 字段，一并保留。
// 徽章的成功次数、点位数、连续天数、夜猫子判定都只统计真正的打卡记录。
const nonTextType = db.command.or([db.command.exists(false), db.command.neq('text')])

const { BADGES, summarize, evaluate, toDayKey } = require('./lib/badges')

// 单用户最多分析多少条打卡记录（云函数端单次查询上限 1000）。
// 取的是「最近 1000 条」，课程项目的数据量远达不到，够用；
// 真到那一天应改成按天聚合，而不是调大这个数。
const REC_LIMIT = 1000

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  try {
    const records = await fetchRecords(OPENID)
    const counts = await fetchTaskCounts(OPENID)

    const stats = summarize(records, toDayKey(new Date()))
    stats.taskDone = counts.taskDone
    stats.taskPublished = counts.taskPublished

    const earnedIds = evaluate(stats)
    const { owned, persist } = await loadOwned(OPENID)
    const ownedIds = owned.map(b => b.badgeId)
    const newIds = earnedIds.filter(id => ownedIds.indexOf(id) === -1)

    const saved = await saveNew(OPENID, newIds, persist)

    // 已得徽章的获得时间：旧记录 + 本次刚写入的（一起返回，前端不用再查一次）
    const gotAtMap = {}
    owned.forEach(b => { gotAtMap[b.badgeId] = toMs(b.gotAt) })
    if (saved) saved.forEach(item => { gotAtMap[item.badgeId] = item.gotAt })

    const badges = BADGES.map(b => ({
      id: b.id,
      icon: b.icon,
      got: Object.prototype.hasOwnProperty.call(gotAtMap, b.id),
      gotAt: gotAtMap[b.id] || 0
    }))

    return {
      code: 0,
      streak: { current: stats.curStreak, max: stats.maxStreak },
      todayDone: stats.curStreak > 0 && hasToday(records),
      stats: {
        successTimes: stats.successTimes,
        pointCount: stats.pointCount,
        maxSimilarity: stats.maxSimilarity,
        nightOwl: stats.nightOwl,
        taskDone: stats.taskDone,
        taskPublished: stats.taskPublished
      },
      badges: badges,
      // 只有用户_badges 集合可写时才把「新解锁」报给前端，避免集合没建时反复弹同样的提示
      newBadges: saved ? newIds : [],
      persist: persist
    }
  } catch (e) {
    console.error('getBadges 失败：', e)
    return { code: -1, msg: '徽章加载失败：' + (e.errMsg || e.message) }
  }
}

// 该用户所有「打卡成功」的记录（最近 REC_LIMIT 条，足够覆盖徽章判定所需）
async function fetchRecords(openid) {
  const res = await db.collection('records')
    .where({ openid: openid, matched: true, type: nonTextType })
    .field({ pointId: true, similarity: true, createTime: true, dayKey: true })
    .orderBy('createTime', 'desc')
    .limit(REC_LIMIT)
    .get()
  return res.data || []
}

// 任务类徽章的数据源：完成别人指派的任务数 / 自己发布的任务被完成数
async function fetchTaskCounts(openid) {
  const [doneRes, pubRes] = await Promise.all([
    db.collection('tasks').where({ assigneeOpenid: openid, status: 'completed' }).count(),
    db.collection('tasks').where({ creatorOpenid: openid, status: 'completed' }).count()
  ])
  return {
    taskDone: (doneRes && doneRes.total) || 0,
    taskPublished: (pubRes && pubRes.total) || 0
  }
}

// 读已得徽章。user_badges 集合可能还没在控制台创建 —— 那不是致命错误，
// 降级为「不持久化」：本次仍能把徽章状态算出来给页面显示，只是拿不到获得时间、
// 也不会弹「新解锁」（否则每次打开都重弹一遍）。
async function loadOwned(openid) {
  try {
    const res = await db.collection('user_badges').where({ openid: openid }).limit(100).get()
    return { owned: res.data || [], persist: true }
  } catch (e) {
    console.warn('user_badges 集合不可读（需在控制台创建该集合）：', e.errMsg || e.message)
    return { owned: [], persist: false }
  }
}

// 补发新解锁的徽章。逐条 add 而不是批量，是为了单条失败（并发重复）不拖累其它徽章。
async function saveNew(openid, ids, persist) {
  if (!persist || !ids || ids.length === 0) return null
  const saved = []
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    try {
      await db.collection('user_badges').add({
        data: { openid: openid, badgeId: id, gotAt: db.serverDate() }
      })
      saved.push({ badgeId: id, gotAt: Date.now() })
    } catch (e) {
      // 常见于并发下的重复写入（有唯一索引时会命中），忽略即可
      console.warn('写入徽章失败（可忽略）：', id, e.errMsg || e.message)
    }
  }
  return saved
}

// 今天是否已成功打卡（用于页面显示「今天已打卡 / 还没打卡」）
function hasToday(records) {
  const today = toDayKey(new Date())
  return (records || []).some(r => (r.dayKey || toDayKey(r.createTime)) === today)
}

// Date / ISO 字符串 -> 毫秒时间戳（0 表示拿不到）
function toMs(v) {
  if (!v) return 0
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? 0 : d.getTime()
}
