// 云函数：getNearby 动态列表
// 作用：
//  - feedType=nearby（默认）：所有人最近的成功打卡记录，按时间倒序
//  - feedType=friends：只看好友 + 自己的动态
// 出参白名单：不回传 openid，只给前端展示需要的字段；isMine 标识是否为本人动态
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const PAGE_SIZE = 20

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const feedType = event.feedType === 'friends' ? 'friends' : 'nearby'
  // F1：分页偏移量，前端上拉加载更多时传已加载条数
  const skip = Math.max(0, Number(event.skip) || 0)

  try {
    let query = db.collection('records').where({ matched: true })

    // 关注 tab：只看好友 + 自己
    if (feedType === 'friends') {
      if (!OPENID) return { code: 0, list: [], hasMore: false }
      const friendRes = await db.collection('friends')
        .where({ userOpenid: OPENID })
        .limit(200)
        .get()
      const openids = friendRes.data.map(f => f.friendOpenid)
      openids.push(OPENID) // 自己也看得到自己的动态
      query = query.where({ openid: db.command.in(openids) })
    }

    // 1. 查记录
    const res = await query
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(PAGE_SIZE)
      .get()

    if (res.data.length === 0) {
      return { code: 0, list: [], hasMore: false }
    }
    const hasMore = res.data.length === PAGE_SIZE

    // 2. 批量查用户昵称头像
    const openids = [...new Set(res.data.map(r => r.openid))]
    const userRes = await db.collection('users')
      .where({ openid: db.command.in(openids) })
      .field({ openid: true, nickname: true, avatarUrl: true })
      .get()

    const userMap = {}
    userRes.data.forEach(u => {
      userMap[u.openid] = {
        nickname: u.nickname || '打卡玩家',
        avatarUrl: u.avatarUrl || ''
      }
    })

    // 3. 批量查评论数
    const recordIds = res.data.map(r => r._id)
    let commentMap = {}
    try {
      const commentRes = await db.collection('comments')
        .where({ recordId: db.command.in(recordIds) })
        .field({ recordId: true })
        .get()
      commentRes.data.forEach(c => {
        commentMap[c.recordId] = (commentMap[c.recordId] || 0) + 1
      })
    } catch (e) {
      // comments 集合不存在时评论数都是 0
    }

    // 4. 组装出参
    const list = res.data.map(r => {
      const u = userMap[r.openid] || { nickname: '打卡玩家', avatarUrl: '' }
      const likes = r.likes || []
      const type = r.type || 'checkin'
      return {
        _id: r._id,
        type: type,
        content: r.content || '',
        pointName: r.pointName,
        spell: r.spell,
        createTime: r.createTime,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        likesCount: likes.length,
        isLiked: OPENID ? likes.includes(OPENID) : false,
        isMine: OPENID ? r.openid === OPENID : false,
        photoFileID: r.photoFileID || '',
        commentCount: commentMap[r._id] || 0
      }
    })

    return { code: 0, list, hasMore }
  } catch (e) {
    console.error('查询动态失败：', e)
    return { code: -1, msg: '查询失败：' + (e.errMsg || e.message) }
  }
}
