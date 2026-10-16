// 云函数：friends 好友 PK
// 作用：
//  - action=list：返回我的好友列表（含每个好友的打卡统计）
//  - action=pk  ：传入 friendRecordId，返回我和对方的打卡数据对比
//  - action=add ：传入 inviteCode，通过邀请码添加好友（写入双向好友关系）
// 依赖集合：friends（好友关系）、users（用户）、records（打卡记录）
//
// ⚠️ 出参一律不返回 openid（团队约定：云函数对外只给白名单字段）
//   对外的好友标识统一用「好友关系记录的 _id」，下文称 recordId：
//    - 客户端无权读 friends 集合，拿到 recordId 也关联不到任何用户信息；
//    - pk 时用 recordId + userOpenid 一起查，天然带归属校验 —— 只能 PK 自己的好友，
//      拿别人的 id 也查不出东西，比传 openid 更难被越权探测；
//    - 若返回 openid，就会留下「前端传 openid → 服务端认身份」的误用空间。
//      本项目所有云函数的身份一律取自 cloud.getWXContext()，绝不信前端传来的身份。
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

  // ⚠️ 这里不能返回 openid：本函数的结果会直接进 list / pk 的出参
  return {
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
        // recordId（好友关系记录的 _id）是前端唯一能拿到的好友句柄，pk 时原样传回来
        if (s) friends.push(Object.assign({ recordId: f._id }, s))
      }
      return { code: 0, friends: friends }
    }

    // ===== PK 对比 =====
    if (action === 'pk') {
      // 前端只传好友关系记录的 _id（list 出参里的 recordId），不传 openid
      const friendRecordId = String(event.friendRecordId || '')
      if (!friendRecordId) return { code: -1, msg: '缺少好友信息' }

      // 取关系记录 + 校验归属：where 里带 userOpenid，不是我的好友关系就查不出来
      // ⚠️ 别用 doc(friendRecordId).get()：记录不存在时会抛异常，走不到下面的兜底
      const rel = await db.collection('friends')
        .where({ _id: friendRecordId, userOpenid: OPENID })
        .limit(1)
        .get()
      if (rel.data.length === 0) return { code: -1, msg: '你们还不是好友' }
      const friendOpenid = rel.data[0].friendOpenid

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
        return { code: 0, already: true, friend: { recordId: exist.data[0]._id, nickname: friend.nickname } }
      }

      // 插入双向好友关系（各一条），并留下「我 → 对方」那条的 _id 作为对外句柄
      const mine = await db.collection('friends').add({
        data: { userOpenid: OPENID, friendOpenid: friend.openid, createdAt: db.serverDate() }
      })
      await db.collection('friends').add({
        data: { userOpenid: friend.openid, friendOpenid: OPENID, createdAt: db.serverDate() }
      })

      return { code: 0, already: false, friend: { recordId: mine._id, nickname: friend.nickname } }
    }

    return { code: -1, msg: '未知操作' }
  } catch (e) {
    console.error('friends 云函数失败：', e)
    return { code: -1, msg: '操作失败：' + (e.errMsg || e.message) }
  }
}
