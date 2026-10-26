// 云函数：deleteComment 删除本人评论
// 安全：身份取自 getWXContext()，只能删自己的评论；返回 recordId 供前端本地刷新评论数。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录' }

  const commentId = String(event.commentId || '')
  if (!commentId) return { code: -1, msg: '缺少评论ID' }

  try {
    const res = await db.collection('comments')
      .where({ _id: commentId, openid: OPENID })
      .limit(1)
      .get()
    if (res.data.length === 0) {
      return { code: -1, msg: '评论不存在或无权删除' }
    }
    const comment = res.data[0]

    await db.collection('comments').doc(commentId).remove()

    return { code: 0, recordId: comment.recordId || '' }
  } catch (e) {
    console.error('删除评论失败：', e)
    return { code: -1, msg: '删除失败：' + (e.errMsg || e.message) }
  }
}
