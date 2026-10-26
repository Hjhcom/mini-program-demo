// 云函数：deleteRecord 删除自己的打卡动态
// 作用：删除当前 openid 下指定的打卡记录，并清理关联评论
// 安全：身份取自 getWXContext()，只能删自己的记录
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const recordId = String(event.recordId || '')

  if (!OPENID) return { code: -1, msg: '请先登录' }
  if (!recordId) return { code: -1, msg: '缺少动态 id' }

  try {
    // 1. 查记录并校验归属
    const res = await db.collection('records')
      .where({ _id: recordId, openid: OPENID })
      .limit(1)
      .get()
    if (res.data.length === 0) {
      return { code: -1, msg: '动态不存在或无权删除' }
    }

    // 2. 删除主记录
    await db.collection('records').doc(recordId).remove()

    // 3. 清理关联评论（best effort，失败不阻塞主流程）
    try {
      await db.collection('comments').where({ recordId }).remove()
    } catch (e) {
      console.error('清理评论失败：', e)
    }

    return { code: 0 }
  } catch (e) {
    console.error('删除动态失败：', e)
    return { code: -1, msg: '删除失败：' + (e.errMsg || e.message) }
  }
}
