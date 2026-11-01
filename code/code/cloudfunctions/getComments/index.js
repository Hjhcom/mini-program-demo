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

    // F-21 回复目标：把被回复评论的作者 openid 也纳入用户查询（可能不在本页评论者里）
    const replyIds = [...new Set(res.data.map(c => c.replyTo).filter(Boolean))]
    let replyNickMap = {}
    let replyOwnerOpenids = []
    if (replyIds.length > 0) {
      const rRes = await db.collection('comments')
        .where({ _id: db.command.in(replyIds) })
        .field({ _id: true, openid: true })
        .get()
      rRes.data.forEach(c => { replyOwnerOpenids.push(c.openid) })
      replyOwnerOpenids = [...new Set(replyOwnerOpenids.filter(Boolean))]
      // 先按回复目标 id 建 openid 索引，昵称在 userMap 查出后回填
      rRes.data.forEach(c => { replyNickMap[c._id] = c.openid })
    }

    // 批量查用户昵称头像
    const openids = [...new Set([...res.data.map(c => c.openid), ...replyOwnerOpenids])]
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
      // F-21：回复目标昵称（replyTo 为空则无）
      let replyToNickname = ''
      if (c.replyTo && replyNickMap[c.replyTo]) {
        const ru = userMap[replyNickMap[c.replyTo]]
        replyToNickname = (ru && ru.nickname) || '打卡玩家'
      }
      return {
        _id: c._id,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        content: c.content,
        replyTo: c.replyTo || '',
        replyToNickname: replyToNickname,
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
