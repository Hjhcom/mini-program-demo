// 云函数：likeFeed 点赞/取消点赞动态
// 传入 recordId，切换点赞状态
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
    // 查这条记录
    const res = await db.collection('records').doc(recordId).get()
    if (!res.data) return { code: -1, msg: '动态不存在' }

    const record = res.data
    const likes = record.likes || []

    // 判断当前用户有没有点赞过
    const liked = likes.includes(OPENID)

    if (liked) {
      // 取消点赞
      await db.collection('records').doc(recordId).update({
        data: { likes: _.pull(OPENID) }
      })
      return { code: 0, liked: false, likesCount: likes.length - 1 }
    } else {
      // 点赞
      await db.collection('records').doc(recordId).update({
        data: { likes: _.push(OPENID) }
      })
      return { code: 0, liked: true, likesCount: likes.length + 1 }
    }
  } catch (e) {
    console.error('点赞失败：', e)
    return { code: -1, msg: '操作失败：' + (e.errMsg || e.message) }
  }
}
