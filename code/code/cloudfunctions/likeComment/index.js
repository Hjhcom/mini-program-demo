// 云函数：likeComment 点赞/取消点赞评论
// 传入 commentId，切换该评论 likes 数组；评论点赞不发通知，避免通知过载。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录' }

  const { commentId } = event
  if (!commentId) return { code: -1, msg: '缺少评论ID' }

  try {
    const res = await db.collection('comments').doc(commentId).get()
    if (!res.data) return { code: -1, msg: '评论不存在' }

    const comment = res.data
    const likes = comment.likes || []
    const liked = likes.includes(OPENID)

    if (liked) {
      await db.collection('comments').doc(commentId).update({
        data: { likes: _.pull(OPENID) }
      })
      return { code: 0, liked: false, likesCount: likes.length - 1 }
    } else {
      await db.collection('comments').doc(commentId).update({
        data: { likes: _.push(OPENID) }
      })
      return { code: 0, liked: true, likesCount: likes.length + 1 }
    }
  } catch (e) {
    console.error('评论点赞失败：', e)
    return { code: -1, msg: '操作失败：' + (e.errMsg || e.message) }
  }
}
