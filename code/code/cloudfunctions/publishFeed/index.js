// 云函数：publishFeed 发布图文心情
// 作用：在 records 集合新增一条 type='text' 的动态（非打卡）
// 入参：content（文字，必填）、photoFileID（云存储 fileID，可选）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录' }

  const content = String(event.content || '').trim()
  if (!content) return { code: -1, msg: '写点什么再发吧' }
  if (content.length > 200) return { code: -1, msg: '最多 200 字' }

  const photoFileID = String(event.photoFileID || '')

  try {
    const addRes = await db.collection('records').add({
      data: {
        openid: OPENID,
        type: 'text',          // 区分打卡记录（checkin）与纯文字动态
        matched: true,         // 让它进动态流
        content: content,
        photoFileID: photoFileID,
        pointName: '',
        spell: '',
        likes: [],
        createTime: db.serverDate()
      }
    })
    return { code: 0, recordId: addRes._id }
  } catch (e) {
    console.error('发布失败：', e)
    return { code: -1, msg: '发布失败：' + (e.errMsg || e.message) }
  }
}
