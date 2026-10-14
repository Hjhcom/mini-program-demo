const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 生成 6 位任务码，重试直到不重复
async function genInviteCode() {
  for (let i = 0; i < 10; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const dup = await db.collection('tasks').where({ inviteCode: code }).count()
    if (dup.total === 0) return code
  }
  throw new Error('任务码生成失败，请重试')
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '未登录' }
  const { title, desc = '', pointId, deadline } = event
  if (!title || !pointId || !deadline) return { code: -1, msg: '参数不完整' }
  if (String(title).length > 30) return { code: -1, msg: '任务标题过长' }

  // 校验截止时间：必须是合法日期、在未来、且不超过 30 天
  //（前端有效期最大 3 天，30 天只是防客户端被改的一个宽松上限）
  const deadlineDate = new Date(deadline)
  if (isNaN(deadlineDate.getTime())) return { code: -1, msg: '截止时间格式不正确' }
  const now = Date.now()
  if (deadlineDate.getTime() <= now) return { code: -1, msg: '截止时间必须晚于当前时间' }
  if (deadlineDate.getTime() > now + 30 * 24 * 3600 * 1000) return { code: -1, msg: '截止时间最多 30 天' }

  // 1. 取点位信息（咒语 / 半径 / 名称）
  //    ⚠️ 必须用 where：云函数端 doc(pointId).get() 在点位不存在时会「抛异常」，
  //    不是返回 null，下面那句友好提示永远执行不到，前端只会收到函数执行失败。
  //    where 空结果返回空数组，data[0] 为 undefined，可以正常提示。
  const pRes = await db.collection('points').where({ _id: pointId }).get()
  const point = pRes.data[0]
  if (!point) return { code: -1, msg: '打卡点不存在' }

  // 2. 取创建者昵称（冗余存储）
  const uRes = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  const creatorNickname = (uRes.data[0] && uRes.data[0].nickname) || '神秘玩家'

  // 3. 写库
  const inviteCode = await genInviteCode()
  const addRes = await db.collection('tasks').add({
    data: {
      title: String(title).slice(0, 30),
      desc: String(desc).slice(0, 100),
      pointId,
      pointName: point.name,
      spell: point.spell,
      radius: point.radius || 50,
      creatorOpenid: OPENID,
      creatorNickname,
      assigneeOpenid: '',
      inviteCode,
      status: 'pending',
      deadline: deadlineDate,
      createdAt: db.serverDate()
    }
  })
  return { code: 0, taskId: addRes._id, inviteCode }
}