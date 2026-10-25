// 云函数：addComment 发表评论
// 传入 recordId 和 content，添加一条评论
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录' }

  const { recordId, content } = event
  if (!recordId || !content) return { code: -1, msg: '参数不全' }

  const text = String(content).trim()
  if (!text) return { code: -1, msg: '评论不能为空' }
  if (text.length > 100) return { code: -1, msg: '评论不能超过100字' }

  try {
    // 确认这条动态存在
    const recordRes = await db.collection('records').doc(recordId).get()
    if (!recordRes.data) return { code: -1, msg: '动态不存在' }

    // 获取当前用户昵称
    const userRes = await db.collection('users').where({ openid: OPENID }).get()
    const nickname = userRes.data[0] ? userRes.data[0].nickname : '打卡玩家'
    const avatarUrl = userRes.data[0] ? (userRes.data[0].avatarUrl || '') : ''

    await db.collection('comments').add({
      data: {
        recordId,
        openid: OPENID,
        nickname,
        avatarUrl,
        content: text,
        createTime: db.serverDate()
      }
    })

    return { code: 0 }
  } catch (e) {
    console.error('发表评论失败：', e)
    return { code: -1, msg: '发表失败：' + (e.errMsg || e.message) }
  }
}
