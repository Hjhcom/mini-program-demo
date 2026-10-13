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

  // 1. 取点位信息（咒语 / 半径 / 名称）
  const pRes = await db.collection('points').doc(pointId).get()
  const point = pRes.data
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
      deadline: new Date(deadline),
      createdAt: db.serverDate()
    }
  })
  return { code: 0, taskId: addRes._id, inviteCode }
}