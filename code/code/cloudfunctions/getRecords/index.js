// 云函数：getRecords 查询打卡记录
// 作用：按当前用户 openid 查询 records 集合，按时间倒序，支持分页
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  const page = Number(event.page) || 1
  const pageSize = 20 // 每页条数

  try {
    // 1. 查询当前用户的记录（时间倒序）
    const res = await db.collection('records')
      .where({ openid: OPENID })
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    // 2. 总条数
    const countRes = await db.collection('records')
      .where({ openid: OPENID })
      .count()

    return {
      code: 0,
      records: res.data,
      total: countRes.total,
      page: page,
      pageSize: pageSize
    }
  } catch (e) {
    console.error('查询打卡记录失败：', e)
    return { code: -1, msg: '查询打卡记录失败：' + (e.errMsg || e.message) }
  }
}
