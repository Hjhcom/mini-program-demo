// 云函数：likeFeed 点赞/取消点赞动态
// 传入 recordId，切换点赞状态；点赞别人时给对方写一条通知
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录' }

  const { recordId } = event
  if (!recordId) return { code: -1, msg: '缺少动态ID' }

  try {
    const res = await db.collection('records').doc(recordId).get()
    if (!res.data) return { code: -1, msg: '动态不存在' }

    const record = res.data
    const likes = record.likes || []
    const liked = likes.includes(OPENID)

    if (liked) {
      await db.collection('records').doc(recordId).update({
        data: { likes: _.pull(OPENID) }
      })
      // 取消点赞：清理自己发给对方的那条未读点赞通知（已读通知不删，保留历史痕迹）
      if (record.openid && record.openid !== OPENID) {
        try {
          await db.collection('notifications').where({
            toOpenid: record.openid,
            fromOpenid: OPENID,
            type: 'like',
            recordId: recordId,
            read: false
          }).remove()
        } catch (e) {
          console.error('清理点赞通知失败：', e)
        }
      }
      return { code: 0, liked: false, likesCount: likes.length - 1 }
    } else {
      await db.collection('records').doc(recordId).update({
        data: { likes: _.push(OPENID) }
      })
      // 给动态主人写点赞通知（不能是自己给自己点赞）；同一动态同一人只留一条未读通知，避免重复点赞刷屏
      if (record.openid && record.openid !== OPENID) {
        try {
          const exist = await db.collection('notifications').where({
            toOpenid: record.openid,
            fromOpenid: OPENID,
            type: 'like',
            recordId: recordId,
            read: false
          }).count()
          if (!exist.total) {
            await db.collection('notifications').add({
              data: {
                toOpenid: record.openid,
                fromOpenid: OPENID,
                type: 'like',
                recordId: recordId,
                read: false,
                createTime: db.serverDate()
              }
            })
          }
        } catch (e) {
          console.error('写点赞通知失败：', e)
        }
        // 推送订阅消息（对方订阅过才能发，失败静默）
        try {
          await cloud.openapi.subscribeMessage.send({
            touser: record.openid,
            templateId: 'rkifRfeYEoXnC6dV4ay-meqVpu2VbSTsNZfk8iUfqbk',
            page: 'pages/notifications/notifications',
            data: {
              thing1: { value: '有人赞了你的打卡动态' },
              thing2: { value: '打开小程序查看' }
            }
          })
        } catch (e) {
          // 用户没订阅/配额用完，忽略
        }
      }
      return { code: 0, liked: true, likesCount: likes.length + 1 }
    }
  } catch (e) {
    console.error('点赞失败：', e)
    return { code: -1, msg: '操作失败：' + (e.errMsg || e.message) }
  }
}
