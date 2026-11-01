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
  const replyTo = String(event.replyTo || '').trim()  // F-21：回复目标评论 _id（可选）

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
        replyTo: replyTo || '',   // F-21：回复目标评论 _id
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
      // 推送订阅消息
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: record.openid,
          templateId: 'rkifRfeYEoXnC6dV4ay-meqVpu2VbSTsNZfk8iUfqbk',
          page: 'pages/notifications/notifications',
          data: {
            thing1: { value: `${nickname} 评论了你的动态` },
            thing2: { value: text.slice(0, 20) }
          }
        })
      } catch (e) {}
    }

    // F-21 回复通知：回复了某条评论 → 通知被回复者（自己除外；若被回复者正是动态主人，
    // 上面已收到「评论了你的动态」，这里不再重复发）
    if (replyTo) {
      try {
        const tRes = await db.collection('comments').where({ _id: replyTo }).get()
        const target = tRes.data[0]
        if (target && target.openid && target.openid !== OPENID && target.openid !== record.openid) {
          await db.collection('notifications').add({
            data: {
              toOpenid: target.openid,
              fromOpenid: OPENID,
              type: 'reply',
              recordId: recordId,
              commentId: replyTo,
              text: text,
              read: false,
              createTime: db.serverDate()
            }
          })
          try {
            await cloud.openapi.subscribeMessage.send({
              touser: target.openid,
              templateId: 'rkifRfeYEoXnC6dV4ay-meqVpu2VbSTsNZfk8iUfqbk',
              page: 'pages/notifications/notifications',
              data: {
                thing1: { value: `${nickname} 回复了你的评论` },
                thing2: { value: text.slice(0, 20) }
              }
            })
          } catch (e) {}
        }
      } catch (e) {
        console.error('写回复通知失败：', e)
      }
    }

    return { code: 0 }
  } catch (e) {
    console.error('发表评论失败：', e)
    return { code: -1, msg: '发表失败：' + (e.errMsg || e.message) }
  }
}
