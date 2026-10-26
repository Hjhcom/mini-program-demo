// 热力图：返回最近 N 周每天的打卡次数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function dayKeyOf(d) {
  const dt = new Date(d.getTime() + 8 * 3600 * 1000)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录' }

  const weeks = event.weeks || 12
  const now = new Date()
  const since = new Date(now.getTime() - weeks * 7 * 24 * 3600 * 1000)

  // 拉这段时间内所有成功打卡记录
  const res = await db.collection('records')
    .where({
      openid: OPENID,
      matched: true,
      createTime: db.command.gte(since)
    })
    .field({ dayKey: true, createTime: true })
    .limit(1000)
    .get()

  // 按 dayKey 分组计数
  const countMap = {}
  res.data.forEach(r => {
    const k = r.dayKey || dayKeyOf(r.createTime)
    countMap[k] = (countMap[k] || 0) + 1
  })

  // 生成完整的日历网格（从周一开始，每周一列）
  const today = new Date(now.getTime() + 8 * 3600 * 1000)
  const dayOfWeek = today.getUTCDay() // 0=日 1=一 ... 6=六
  // 找到本周周一
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const thisMonday = new Date(today)
  thisMonday.setUTCDate(today.getUTCDate() + mondayOffset)

  const days = []
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = new Date(thisMonday)
    weekStart.setUTCDate(thisMonday.getUTCDate() - w * 7)
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart)
      day.setUTCDate(weekStart.getUTCDate() + d)
      const k = dayKeyOf(day)
      days.push({
        date: k,
        count: countMap[k] || 0,
        future: day.getTime() > today.getTime()
      })
    }
  }

  return { code: 0, days, weeks }
}
