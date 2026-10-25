// 云函数：getComments 获取动态的评论列表
// 传入 recordId，返回该动态的所有评论，按时间正序
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { recordId } = event
  if (!recordId) return { code: -1, msg: '缺少动态ID' }

  try {
    const res = await db.collection('comments')
      .where({ recordId })
      .orderBy('createTime', 'asc')
      .limit(50)
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
      return {
        _id: c._id,
        nickname: u.nickname,
        avatarUrl: u.avatarUrl,
        content: c.content,
        createTime: c.createTime
      }
    })

    return { code: 0, list }
  } catch (e) {
    console.error('获取评论失败：', e)
    // 集合不存在时返回空列表，不报错
    return { code: 0, list: [] }
  }
}
