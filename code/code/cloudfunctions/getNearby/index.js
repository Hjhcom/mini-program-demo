// 云函数：getNearby 附近动态
// 作用：查询最近的成功打卡记录（所有人），带用户昵称头像，按时间倒序
// 出参白名单：不回传 openid，只给前端展示需要的字段
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const PAGE_SIZE = 20

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  try {
    // 1. 查最近的成功打卡记录
    const res = await db.collection('records')
      .where({ matched: true })
      .orderBy('createTime', 'desc')
      .limit(PAGE_SIZE)
      .get()

    if (res.data.length === 0) {
      return { code: 0, list: [] }
    }

    // 2. 收集所有 openid，批量查用户昵称头像
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

    // 3. 批量查每条动态的评论数
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
      // comments 集合不存在时评论数都是0
    }

    // 4. 组装出参
    const list = res.data.map(r => {
      const u = userMap[r.openid] || { nickname: '打卡玩家', avatarUrl: '' }
      const likes = r.likes || []
      return {
        _id: r._id,
        pointName: r.pointName,
        spell: r.spell,
        createTime: r.createTime,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        likesCount: likes.length,
        isLiked: OPENID ? likes.includes(OPENID) : false,
        photoFileID: r.photoFileID || '',
        commentCount: commentMap[r._id] || 0
      }
    })

    return { code: 0, list }
  } catch (e) {
    console.error('查询附近动态失败：', e)
    return { code: -1, msg: '查询失败：' + (e.errMsg || e.message) }
  }
}
