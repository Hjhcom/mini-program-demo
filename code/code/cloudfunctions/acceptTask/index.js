const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const code = String(event.inviteCode || '').trim()
  if (!code) return { code: -1, msg: '请输入任务码' }

  const res = await db.collection('tasks')
    .where({ inviteCode: code, status: 'pending' }).limit(1).get()
  if (res.data.length === 0) return { code: -1, msg: '任务码无效或任务已被接受' }
  const task = res.data[0]

  if (task.creatorOpenid === OPENID) return { code: -1, msg: '不能接受自己发布的任务' }
  if (new Date(task.deadline) < new Date()) {
    await db.collection('tasks').doc(task._id).update({ data: { status: 'expired' } })
    return { code: -1, msg: '任务已过截止时间' }
  }

  await db.collection('tasks').doc(task._id).update({
    data: { assigneeOpenid: OPENID, status: 'accepted', acceptedAt: db.serverDate() }
  })

  // ⚠️ 只回传白名单字段：绝不能把整个 task 丢给前端，
  //    里面带 creatorOpenid / assigneeOpenid，违背「不下发 openid」的约定。
  return {
    code: 0,
    task: {
      _id: task._id,
      title: task.title,
      desc: task.desc || '',
      pointId: task.pointId,
      pointName: task.pointName,
      spell: task.spell,
      radius: task.radius,
      deadline: task.deadline,
      status: 'accepted',
      inviteCode: task.inviteCode,
      creatorNickname: task.creatorNickname || ''
    }
  }
}