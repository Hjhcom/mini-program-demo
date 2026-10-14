// 云函数：friends 好友 PK
// 作用：
//  - action=list：返回我的好友列表（含每个好友的打卡统计）
//  - action=pk  ：传入 friendOpenid，返回我和对方的打卡数据对比
//  - action=add ：传入 inviteCode，通过邀请码添加好友（写入双向好友关系）
// 依赖集合：friends（好友关系）、users（用户）、records（打卡记录）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 取某用户的打卡统计：总次数 / 成功次数 / 最近打卡时间
async function getUserStats(openid) {
  const userRes = await db.collection('users').where({ openid }).limit(1).get()
  const user = userRes.data[0]
  if (!user) return null

  const countRes = await db.collection('records').where({ openid }).count()
  const successRes = await db.collection('records').where({ openid, matched: true }).count()
  const lastRes = await db.collection('records')
    .where({ openid })
    .orderBy('createTime', 'desc')
    .limit(1)
    .get()

  return {
    openid: openid,
    nickname: user.nickname || '打卡玩家',
    avatarUrl: user.avatarUrl || '',
    inviteCode: user.inviteCode || '',
    total: countRes.total,
    success: successRes.total,
    lastTime: lastRes.data.length ? lastRes.data[0].createTime : null
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const action = event.action

  try {
    // ===== 好友列表 =====
    if (action === 'list') {
      const res = await db.collection('friends')
        .where({ userOpenid: OPENID })
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get()

      const friends = []
      for (const f of res.data) {
        const s = await getUserStats(f.friendOpenid)
        if (s) friends.push(s)
      }
      return { code: 0, friends: friends }
    }

    // ===== PK 对比 =====
    if (action === 'pk') {
      const friendOpenid = String(event.friendOpenid || '')
      if (!friendOpenid) return { code: -1, msg: '缺少好友信息' }

      // 校验好友关系
      const rel = await db.collection('friends')
        .where({ userOpenid: OPENID, friendOpenid: friendOpenid })
        .limit(1)
        .get()
      if (rel.data.length === 0) return { code: -1, msg: '你们还不是好友' }

      const me = await getUserStats(OPENID)
      const friend = await getUserStats(friendOpenid)
      if (!me) return { code: -1, msg: '请先登录' }
      if (!friend) return { code: -1, msg: '对方账号不存在' }

      return { code: 0, me: me, friend: friend }
    }

    // ===== 通过邀请码添加好友 =====
    if (action === 'add') {
      const inviteCode = String(event.inviteCode || '').toUpperCase().trim()
      if (!/^[A-Z0-9]{6}$/.test(inviteCode)) {
        return { code: -1, msg: '邀请码格式不正确' }
      }

      // 找邀请码对应的用户
      const target = await db.collection('users').where({ inviteCode }).limit(1).get()
      if (target.data.length === 0) return { code: -1, msg: '邀请码不存在，请核对' }
      const friend = target.data[0]
      if (friend.openid === OPENID) return { code: -1, msg: '不能添加自己为好友' }

      // 已是好友则直接返回
      const exist = await db.collection('friends')
        .where({ userOpenid: OPENID, friendOpenid: friend.openid })
        .limit(1)
        .get()
      if (exist.data.length > 0) {
        return { code: 0, already: true, friend: { openid: friend.openid, nickname: friend.nickname } }
      }

      // 插入双向好友关系
      await db.collection('friends').add({
        data: { userOpenid: OPENID, friendOpenid: friend.openid, createdAt: db.serverDate() }
      })
      await db.collection('friends').add({
        data: { userOpenid: friend.openid, friendOpenid: OPENID, createdAt: db.serverDate() }
      })

      return { code: 0, already: false, friend: { openid: friend.openid, nickname: friend.nickname } }
    }

    return { code: -1, msg: '未知操作' }
  } catch (e) {
    console.error('friends 云函数失败：', e)
    return { code: -1, msg: '操作失败：' + (e.errMsg || e.message) }
  }
}
