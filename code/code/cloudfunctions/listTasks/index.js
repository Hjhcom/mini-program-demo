const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const type = event.type === 'assigned' ? 'assigned' : 'created'
  const where = type === 'created' ? { creatorOpenid: OPENID } : { assigneeOpenid: OPENID }

  const res = await db.collection('tasks')
    .where(where).orderBy('createdAt', 'desc').limit(50).get()

  // 顺手把过期的标一下（也可以放到定时触发器里做，见 3.9）
  return { code: 0, tasks: res.data }
}