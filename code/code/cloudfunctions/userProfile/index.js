// 云函数：userProfile 他人主页
// 入参二选一：recordId（动态记录 _id，从动态流点头像进入）、friendRecordId（好友关系句柄，从好友列表进入）。
// 服务端解析目标用户 openid；出参不回传 openid，只给白名单资料、打卡统计、最近动态与关系状态。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 打卡口径：排除 type='text' 的心情动态；早期记录无 type 字段一并保留。
const nonTextType = db.command.or([db.command.exists(false), db.command.neq('text')])

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录' }

  const recordId = String(event.recordId || '')
  const friendRecordId = String(event.friendRecordId || '')
  if (!recordId && !friendRecordId) return { code: -1, msg: '缺少用户信息' }

  try {
    let targetOpenid = ''
    let relation = 'stranger'
    let myFriendRecordId = ''

    // 从好友关系句柄进入：归属校验后取对方 openid
    if (friendRecordId) {
      const rel = await db.collection('friends')
        .where({ _id: friendRecordId, userOpenid: OPENID })
        .limit(1)
        .get()
      if (rel.data.length === 0) return { code: -1, msg: '对方不存在' }
      targetOpenid = rel.data[0].friendOpenid
      myFriendRecordId = rel.data[0]._id
      relation = 'friend'
    } else {
      // 从动态记录进入：服务端解析作者，前端始终拿不到 openid
      const rec = await db.collection('records').doc(recordId).get()
      if (!rec.data) return { code: -1, msg: '动态不存在' }
      targetOpenid = rec.data.openid
      if (targetOpenid !== OPENID) {
        const rel = await db.collection('friends')
          .where({ userOpenid: OPENID, friendOpenid: targetOpenid })
          .limit(1)
          .get()
        if (rel.data.length > 0) {
          relation = 'friend'
          myFriendRecordId = rel.data[0]._id
        }
      }
    }

    if (targetOpenid === OPENID) relation = 'self'

    // 用户资料
    const userRes = await db.collection('users').where({ openid: targetOpenid }).limit(1).get()
    const user = userRes.data[0]
    if (!user) return { code: -1, msg: '对方账号不存在' }

    // 打卡统计（排除纯文字动态）
    const countRes = await db.collection('records')
      .where({ openid: targetOpenid, type: nonTextType }).count()
    const successRes = await db.collection('records')
      .where({ openid: targetOpenid, matched: true, type: nonTextType }).count()
    const lastRes = await db.collection('records')
      .where({ openid: targetOpenid, type: nonTextType })
      .orderBy('createTime', 'desc')
      .limit(1)
      .get()

    // 最近 5 条打卡动态
    const recentRes = await db.collection('records')
      .where({ openid: targetOpenid, matched: true, type: nonTextType })
      .orderBy('createTime', 'desc')
      .limit(5)
      .get()
    const recent = recentRes.data.map(r => ({
      _id: r._id,
      pointName: r.pointName || '',
      spell: r.spell || '',
      createTime: r.createTime,
      photoFileID: r.photoFileID || ''
    }))

    return {
      code: 0,
      relation,
      friendRecordId: myFriendRecordId,
      profile: {
        nickname: user.nickname || '打卡玩家',
        avatarUrl: user.avatarUrl || '',
        total: countRes.total,
        success: successRes.total,
        lastTime: lastRes.data.length ? lastRes.data[0].createTime : null,
        recent
      }
    }
  } catch (e) {
    console.error('查询他人主页失败：', e)
    return { code: -1, msg: '查询失败：' + (e.errMsg || e.message) }
  }
}
