// 云函数：getNotifications 我的消息通知
// 作用：返回收到的点赞/评论/好友通知，按时间倒序；拉取后自动标记已读
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const PAGE_SIZE = 30

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录' }

  try {
    // 1. 拉我的通知
    const res = await db.collection('notifications')
      .where({ toOpenid: OPENID })
      .orderBy('createTime', 'desc')
      .limit(PAGE_SIZE)
      .get()

    const list = res.data
    if (list.length === 0) return { code: 0, list: [], unread: 0 }

    // 2. 批量查通知来源用户
    const fromOpenids = [...new Set(list.map(n => n.fromOpenid).filter(Boolean))]
    let userMap = {}
    if (fromOpenids.length > 0) {
      const userRes = await db.collection('users')
        .where({ openid: db.command.in(fromOpenids) })
        .field({ openid: true, nickname: true, avatarUrl: true })
        .get()
      userRes.data.forEach(u => {
        userMap[u.openid] = {
          nickname: u.nickname || '打卡玩家',
          avatarUrl: u.avatarUrl || ''
        }
      })
    }

    // 3. 统计未读数 + 组装出参
    let unread = 0
    const out = list.map(n => {
      if (!n.read) unread++
      const u = userMap[n.fromOpenid] || { nickname: '有人', avatarUrl: '' }
      let action = ''
      if (n.type === 'like') action = '赞了你的动态'
      else if (n.type === 'comment') action = '评论：' + (n.text || '')
      else if (n.type === 'friend') action = '通过邀请码加了你为好友'
      return {
        _id: n._id,
        type: n.type,
        action: action,
        recordId: n.recordId || '',
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        read: !!n.read,
        createTime: n.createTime
      }
    })

    // 4. 拉取后全部标记已读
    await db.collection('notifications')
      .where({ toOpenid: OPENID, read: false })
      .update({ data: { read: true } })

    return { code: 0, list: out, unread: unread }
  } catch (e) {
    console.error('拉取通知失败：', e)
    return { code: -1, msg: '加载失败：' + (e.errMsg || e.message) }
  }
}
