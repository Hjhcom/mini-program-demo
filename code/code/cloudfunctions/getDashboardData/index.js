// 云函数：getDashboardData 全校数据大屏聚合（v2 保守写法，逐段容错，不会整抛）
// 口径：打卡 = records 中 matched:true 的 checkin 记录（失败尝试不计入）。
// 注意：微信云开发 HTTP 网关调用本函数时可能收到 event（含 path/httpMethod），忽略即可。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// UTC+8 自然日（与 voiceCheckin 口径一致）
function todayKey() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000)
  const m = bj.getUTCMonth() + 1
  const d = bj.getUTCDate()
  return bj.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d
}

// 普通计数（返回 { total }，最稳定）
async function safeCount(where) {
  try {
    const res = await db.collection('records').where(where).count()
    return res.total || 0
  } catch (e) {
    console.error('count 失败：', e)
    return 0
  }
}

// 聚合去重（group 后返回 list）
async function safeDistinct(groupField, match) {
  try {
    const res = await db.collection('records').aggregate()
      .match(match || {})
      .group({ _id: '$' + groupField })
      .end()
    return (res.list || []).length
  } catch (e) {
    console.error('distinct 失败：', e)
    return 0
  }
}

// 聚合分组排序（list 形式）
async function safeGroupSort(match, groupField, countField, limit) {
  try {
    const $ = db.command.aggregate
    const res = await db.collection('records').aggregate()
      .match(match || {})
      .group({ _id: '$' + groupField, count: $.sum(1) })
      .sort({ count: -1 })
      .limit(limit || 10)
      .end()
    return res.list || []
  } catch (e) {
    console.error('group-sort 失败：', e)
    return []
  }
}

exports.main = async (event = {}) => {
  const dayKey = todayKey()
  const baseWhere = { matched: true, type: 'checkin' }

  try {
    // 1. 核心指标（普通 count + group 去重，每段独立容错）
    const totalCheckins = await safeCount(baseWhere)
    const todayCheckins = await safeCount(Object.assign({}, baseWhere, { dayKey: dayKey }))
    const activeUsers = await safeDistinct('openid', baseWhere)
    const litPoints = await safeDistinct('pointId', baseWhere)
    let totalPoints = 0
    try {
      const p = await db.collection('points').count()
      totalPoints = p.total || 0
    } catch (e) { console.error('points count 失败：', e) }

    // 2. 最近打卡（10 条：谁在哪个点位念了什么）
    let recentCheckins = []
    try {
      const recentRes = await db.collection('records')
        .where(baseWhere)
        .orderBy('createTime', 'desc')
        .limit(10)
        .get()
      const rows = recentRes.data || []
      const rOpenids = [...new Set(rows.map(r => r.openid).filter(Boolean))]
      let userMap = {}
      if (rOpenids.length > 0) {
        try {
          const uRes = await db.collection('users')
            .where({ openid: db.command.in(rOpenids) })
            .field({ openid: true, nickname: true, avatarUrl: true })
            .get()
          ;(uRes.data || []).forEach(u => { userMap[u.openid] = u })
        } catch (e) { console.error('users 联查失败：', e) }
      }
      recentCheckins = rows.map(r => ({
        nickname: (userMap[r.openid] && userMap[r.openid].nickname) || '打卡玩家',
        pointName: r.pointName || '某点位',
        spell: r.spell || '',
        time: r.createTime
      }))
    } catch (e) { console.error('recent 失败：', e) }

    // 3. 打卡次数榜 TOP10
    const rankAgg = await safeGroupSort(baseWhere, 'openid', 'count', 10)
    const rankOpenids = rankAgg.map(g => g._id).filter(Boolean)
    let rankUserMap = {}
    if (rankOpenids.length > 0) {
      try {
        const uRes = await db.collection('users')
          .where({ openid: db.command.in(rankOpenids) })
          .field({ openid: true, nickname: true, avatarUrl: true })
          .get()
        ;(uRes.data || []).forEach(u => { rankUserMap[u.openid] = u })
      } catch (e) { console.error('rank users 联查失败：', e) }
    }
    const rankingTop = rankAgg.map((g, i) => ({
      rank: i + 1,
      nickname: (rankUserMap[g._id] && rankUserMap[g._id].nickname) || '神秘玩家',
      count: g.count || 0
    }))

    // 4. 剧本任务线完成情况（routes/route_progress 未建时按 0，不报错）
    let routeStats = { totalRoutes: 0, participants: 0, completed: 0, rate: 0 }
    try {
      const routesRes = await db.collection('routes').count()
      routeStats.totalRoutes = routesRes.total || 0
      const progRes = await db.collection('route_progress').aggregate()
        .group({ _id: '$openid' }).end()
      routeStats.participants = (progRes.list || []).length
      const doneRes = await db.collection('route_progress').aggregate()
        .match({ completed: true }).group({ _id: '$openid' }).end()
      routeStats.completed = (doneRes.list || []).length
      routeStats.rate = routeStats.participants > 0
        ? Math.round((routeStats.completed / routeStats.participants) * 100)
        : 0
    } catch (e) {
      console.error('routeStats 失败（可能集合未建，按 0 展示）：', e)
    }

    // 5. 点位热度（前 10：按成功打卡次数）
    const heatAgg = await safeGroupSort(baseWhere, 'pointName', 'count', 10)
    const pointHeat = heatAgg.map(g => ({
      name: g._id || '未知点位',
      count: g.count || 0
    }))

    return {
      code: 0,
      generatedAt: Date.now(),
      dayKey: dayKey,
      totalCheckins: totalCheckins,
      todayCheckins: todayCheckins,
      activeUsers: activeUsers,
      totalPoints: totalPoints,
      litPoints: litPoints,
      recentCheckins: recentCheckins,
      rankingTop: rankingTop,
      routeStats: routeStats,
      pointHeat: pointHeat
    }
  } catch (e) {
    console.error('大屏数据聚合失败：', e)
    return { code: -1, msg: '数据聚合失败：' + (e.errMsg || e.message) }
  }
}
