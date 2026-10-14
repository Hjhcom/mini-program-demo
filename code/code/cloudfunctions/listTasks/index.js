const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const type = event.type === 'assigned' ? 'assigned' : 'created'
  const where = type === 'created' ? { creatorOpenid: OPENID } : { assigneeOpenid: OPENID }

  const res = await db.collection('tasks')
    .where(where).orderBy('createdAt', 'desc').limit(50).get()

  const tasks = res.data

  // 顺手把「已过截止时间但状态还停在 pending/accepted」的任务标记为 expired，
  // 否则列表里会一直显示「待接受 / 进行中」，与实际不符。
  // ⚠️ 注意：这里只处理本次查出来的这 50 条（列表按需纠偏）；
  //    遗漏的记录由 voiceCheckin / acceptTask 在用到时各自兜底。
  //    更彻底的做法是加定时触发器批量清理，见 docs/下一步功能规划与操作说明.md 3.9。
  const now = Date.now()
  const overdue = tasks.filter(t =>
    (t.status === 'pending' || t.status === 'accepted') &&
    new Date(t.deadline).getTime() < now
  )
  if (overdue.length > 0) {
    await Promise.all(overdue.map(t =>
      db.collection('tasks').doc(t._id).update({ data: { status: 'expired' } })
    ))
    // 同步改掉返回值，让前端这次就能看到「已过期」徽标，不用等下次刷新
    overdue.forEach(t => { t.status = 'expired' })
  }

  return { code: 0, tasks }
}
