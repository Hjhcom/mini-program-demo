// 云函数：getComments 获取动态的评论列表
// 传入 recordId / skip，返回该动态的评论（按时间正序）；
// 出参不回传 openid，只用 isMine 标识本人，附带评论点赞状态与计数。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const PAGE_SIZE = 20

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { recordId } = event
  if (!recordId) return { code: -1, msg: '缺少动态ID' }
  const skip = Math.max(0, Number(event.skip) || 0)

  try {
    const res = await db.collection('comments')
      .where({ recordId })
      .orderBy('createTime', 'asc')
      .skip(skip)
      .limit(PAGE_SIZE)
      .get()

    // 批量查用户昵称头像
    const openids = [...new Set(res.data.map(c => c.openid))]
    let userMap = {}
    if (openids.length > 0) {
      const userRes = await db.collection('users')
        .where({ openid: db.command.in(openids) })
        .field({ openid: true, nickname: true, avatarUrl: true })
        .get()
      userRes.data.forEach(u => {
        userMap[u.openid] = {
          nickname: u.nickname || '打卡玩家',
          avatarUrl: u.avatarUrl || ''
        }
      })
    }

    const list = res.data.map(c => {
      const u = userMap[c.openid] || { nickname: '打卡玩家', avatarUrl: '' }
      const likes = c.likes || []
      return {
        _id: c._id,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        content: c.content,
        createTime: c.createTime,
        likesCount: likes.length,
        isLiked: OPENID ? likes.includes(OPENID) : false,
        isMine: OPENID ? c.openid === OPENID : false
      }
    })

    return { code: 0, list, hasMore: res.data.length === PAGE_SIZE }
  } catch (e) {
    console.error('获取评论失败：', e)
    // 集合不存在时返回空列表，不报错
    return { code: 0, list: [], hasMore: false }
  }
}
