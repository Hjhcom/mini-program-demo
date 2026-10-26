// 云函数：addComment 发表评论
// 传入 recordId 和 content，添加一条评论；评论别人时给对方写通知
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
    const recordRes = await db.collection('records').doc(recordId).get()
    if (!recordRes.data) return { code: -1, msg: '动态不存在' }
    const record = recordRes.data

    const userRes = await db.collection('users').where({ openid: OPENID }).get()
    const me = userRes.data[0] || {}
    const nickname = me.nickname || '打卡玩家'

    await db.collection('comments').add({
      data: {
        recordId,
        openid: OPENID,
        nickname,
        avatarUrl: me.avatarUrl || '',
        content: text,
        createTime: db.serverDate()
      }
    })

    // 给动态主人写评论通知（不能是自己给自己评论）
    if (record.openid && record.openid !== OPENID) {
      try {
        await db.collection('notifications').add({
          data: {
            toOpenid: record.openid,
            fromOpenid: OPENID,
            type: 'comment',
            recordId: recordId,
            text: text,
            read: false,
            createTime: db.serverDate()
          }
        })
      } catch (e) {
        console.error('写评论通知失败：', e)
      }
    }

    return { code: 0 }
  } catch (e) {
    console.error('发表评论失败：', e)
    return { code: -1, msg: '发表失败：' + (e.errMsg || e.message) }
  }
}
