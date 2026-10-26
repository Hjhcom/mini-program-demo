// 云函数：getNotifications 我的消息通知
// 作用：返回收到的点赞/评论/好友通知，按时间倒序。
// N1：默认只拉取与统计未读数，不自动标已读；前端进入消息页浏览后，
//     带 markRead=true 再调一次才把未读置为已读，保证 tabBar 角标能反映真实未读。
// N3：动作文案由前端按语言拼装，这里只返回 type / text / recordId，不在服务端写死中文。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const PAGE_SIZE = 30

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录' }
  const markRead = !!(event && event.markRead)

  try {
    // 1. 拉我的通知（最近一页）
    const res = await db.collection('notifications')
      .where({ toOpenid: OPENID })
      .orderBy('createTime', 'desc')
      .limit(PAGE_SIZE)
      .get()

    const list = res.data

    // 2. 未读数独立统计（不受分页条数限制，tabBar 角标口径准确）
    const unreadRes = await db.collection('notifications')
      .where({ toOpenid: OPENID, read: false })
      .count()
    const unread = unreadRes.total

    // 3. 批量查通知来源用户
    let out = []
    if (list.length > 0) {
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

      out = list.map(n => {
        const u = userMap[n.fromOpenid] || { nickname: '有人', avatarUrl: '' }
        return {
          _id: n._id,
          type: n.type,
          text: n.text || '',
          recordId: n.recordId || '',
          friendRecordId: n.friendRecordId || '',
          nickname: u.nickname,
          avatarUrl: u.avatarUrl,
          read: !!n.read,
          createTime: n.createTime
        }
      })
    }

    // 4. 仅在前端明确要求时才标记已读（进入消息页浏览后）
    if (markRead && unread > 0) {
      await db.collection('notifications')
        .where({ toOpenid: OPENID, read: false })
        .update({ data: { read: true } })
    }

    return { code: 0, list: out, unread: unread }
  } catch (e) {
    console.error('拉取通知失败：', e)
    // notifications 集合尚未在云开发控制台创建时属于「空通知」正常空态：
    // 首次部署 / 新环境下不应弹错误提示，静默按空列表返回；其余真实数据库错误才上抛。
    const errMsg = e.errMsg || e.message || ''
    const notExist = e.errCode === -502005 ||
      /not exists/i.test(errMsg) || /DATABASE_COLLECTION_NOT_EXIST/.test(errMsg)
    if (notExist) {
      return { code: 0, list: [], unread: 0 }
    }
    return { code: -1, msg: '加载失败：' + errMsg }
  }
}
