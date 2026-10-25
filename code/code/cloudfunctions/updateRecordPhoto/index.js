// 云函数：updateRecordPhoto 更新打卡记录的照片
// 传入 recordId 和 photoFileID，更新到对应记录
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录' }

  const { recordId, photoFileID } = event
  if (!recordId || !photoFileID) return { code: -1, msg: '参数不全' }

  try {
    // 确认这条记录是当前用户的
    const res = await db.collection('records').doc(recordId).get()
    if (!res.data || res.data.openid !== OPENID) {
      return { code: -1, msg: '无权修改这条记录' }
    }

    await db.collection('records').doc(recordId).update({
      data: { photoFileID: photoFileID }
    })

    return { code: 0 }
  } catch (e) {
    console.error('更新照片失败：', e)
    return { code: -1, msg: '更新失败：' + (e.errMsg || e.message) }
  }
}
