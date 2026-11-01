// 云函数：getDashboardData 全校数据大屏聚合
// 用途：课程答辩投屏大屏的数据源（网页端 fetch 调用，需在云开发控制台开启 HTTP 访问服务）。
// 返回：累计/今日打卡、活跃玩家、已点亮点位、最近打卡、打卡次数榜、剧本完成率、点位热度。
// 口径：打卡 = records 中 matched:true 的 checkin 记录（失败尝试不计入）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const $ = db.command.aggregate

// UTC+8 自然日（与 voiceCheckin 口径一致）
function todayKey() {
  const bjNow = new Date(Date.now() + 8 * 3600 * 1000)
  const m = bjNow.getUTCMonth() + 1
  const d = bjNow.getUTCDate()
  return bjNow.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d
}

exports.main = async () => {
  const dayKey = todayKey()
  const fail = (msg) => ({ code: -1, msg: msg })

  try {
    // 1. 核心指标
    const totalRes = await db.collection('records').aggregate()
      .match({ matched: true, type: 'checkin' }).count().end()
    const totalCheckins = totalRes.total || 0

    const todayRes = await db.collection('records').aggregate()
      .match({ matched: true, type: 'checkin', dayKey: dayKey }).count().end()
    const todayCheckins = todayRes.total || 0

    const userRes = await db.collection('records').aggregate()
      .match({ matched: true, type: 'checkin' })
      .group({ _id: '$openid' }).count().end()
    const activeUsers = userRes.total || 0

    const totalPointsRes = await db.collection('points').count()
    const totalPoints = totalPointsRes.total || 0
    const litRes = await db.collection('records').aggregate()
      .match({ matched: true, type: 'checkin' })
      .group({ _id: '$pointId' }).count().end()
    const litPoints = litRes.total || 0

    // 2. 最近打卡（10 条：谁在哪个点位念了什么）
    const recentRes = await db.collection('records')
      .where({ matched: true, type: 'checkin' })
      .orderBy('createTime', 'desc')
      .limit(10)
      .get()
    const rOpenids = [...new Set(recentRes.data.map(r => r.openid).filter(Boolean))]
    let userMap = {}
    if (rOpenids.length > 0) {
      const uRes = await db.collection('users')
        .where({ openid: db.command.in(rOpenids) })
        .field({ openid: true, nickname: true, avatarUrl: true })
        .get()
      uRes.data.forEach(u => { userMap[u.openid] = u })
    }
    const recentCheckins = recentRes.data.map(r => ({
      nickname: (userMap[r.openid] && userMap[r.openid].nickname) || '打卡玩家',
      pointName: r.pointName || '某点位',
      spell: r.spell || '',
      time: r.createTime
    }))

    // 3. 打卡次数榜 TOP10（实时按成功记录统计，口径「成功打卡次数」）
    const rankAgg = await db.collection('records').aggregate()
      .match({ matched: true, type: 'checkin' })
      .group({ _id: '$openid', count: $.sum(1) })
      .sort({ count: -1 })
      .limit(10)
      .end()
    const rankOpenids = rankAgg.list.map(g => g._id).filter(Boolean)
    let rankUserMap = {}
    if (rankOpenids.length > 0) {
      const uRes = await db.collection('users')
        .where({ openid: db.command.in(rankOpenids) })
        .field({ openid: true, nickname: true, avatarUrl: true })
        .get()
      uRes.data.forEach(u => { rankUserMap[u.openid] = u })
    }
    const rankingTop = rankAgg.list.map((g, i) => ({
      rank: i + 1,
      nickname: (rankUserMap[g._id] && rankUserMap[g._id].nickname) || '神秘玩家',
      count: g.count || 0
    }))

    // 4. 剧本任务线完成情况
    let routeStats = { totalRoutes: 0, participants: 0, completed: 0, rate: 0 }
    try {
      const routesRes = await db.collection('routes').count()
      routeStats.totalRoutes = routesRes.total || 0
      const progRes = await db.collection('route_progress').aggregate()
        .group({ _id: '$openid' }).count().end()
      routeStats.participants = progRes.total || 0
      const doneRes = await db.collection('route_progress').aggregate()
        .match({ completed: true }).group({ _id: '$openid' }).count().end()
      routeStats.completed = doneRes.total || 0
      routeStats.rate = routeStats.participants > 0
        ? Math.round((routeStats.completed / routeStats.participants) * 100)
        : 0
    } catch (e) {
      // routes / route_progress 未创建时按 0 展示（大屏不报错）
    }

    // 5. 点位热度（前 10：按成功打卡次数）
    const heatAgg = await db.collection('records').aggregate()
      .match({ matched: true, type: 'checkin' })
      .group({ _id: '$pointName', count: $.sum(1) })
      .sort({ count: -1 })
      .limit(10)
      .end()
    const pointHeat = heatAgg.list.map(g => ({
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
    return fail('数据聚合失败：' + (e.errMsg || e.message))
  }
}
