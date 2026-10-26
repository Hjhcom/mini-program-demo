// 云函数：getRecords 查询打卡记录
// 作用：按当前用户 openid 查询 records 集合，按时间倒序，支持分页
//  - event.page：第几页（从 1 开始，默认 1），每页 PAGE_SIZE 条
//  - 出参：records（白名单字段）、total（全量条数）、successTotal（成功次数，全量）、
//          hasMore（还有没有下一页）、page / pageSize
//
// ⚠️ 两处特意设计，改动前先看：
//  1. 出参走 pickRecord() 白名单，**不回传 openid**（团队约定：云函数对外只给白名单字段）。
//     身份一律取自 cloud.getWXContext()，前端不需要、也不该拿到 openid。
//  2. successTotal 由服务端全量统计，**不是**前端数当前页 —— 分页后如果前端用
//     records.filter(matched).length，翻页时「打卡成功」的数字会一路变大。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const PAGE_SIZE = 20 // 每页条数（前端 pages/records 只负责翻页，不重复定义）

// 打卡口径：排除 type='text' 的心情动态；早期打卡记录没有 type 字段，一并保留。
// 「我的记录」只展示真正的打卡尝试（含念错的失败记录），不混入附近动态流里的心情动态。
const nonTextType = db.command.or([db.command.exists(false), db.command.neq('text')])

// 出参白名单：只回详情弹窗与列表真正要用的字段
function pickRecord(r) {
  return {
    _id: r._id,
    type: r.type || 'checkin',
    pointId: r.pointId,
    pointName: r.pointName,
    spell: r.spell,
    recognizedText: r.recognizedText,
    similarity: r.similarity,
    matched: r.matched === true, // 归一成布尔，老记录缺字段时按未匹配处理
    taskId: r.taskId || '',
    dayKey: r.dayKey || '',
    photoFileID: r.photoFileID || '',
    createTime: r.createTime
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '请先登录' }

  const page = Math.max(1, Number(event.page) || 1)

  try {
    // 1. 当前页记录（时间倒序）—— 走 IDX-02（records: openid + createTime 降序）
    const res = await db.collection('records')
      .where({ openid: OPENID, type: nonTextType })
      .orderBy('createTime', 'desc')
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get()

    // 2. 总条数：既给统计栏用，也用来判断还有没有下一页
    const countRes = await db.collection('records')
      .where({ openid: OPENID, type: nonTextType })
      .count()
    const total = countRes.total

    // 3. 成功次数：服务端按全量统计（前端按已加载页去数会随翻页漂移）
    const okRes = await db.collection('records')
      .where({ openid: OPENID, matched: true, type: nonTextType })
      .count()

    return {
      code: 0,
      records: res.data.map(pickRecord),
      total: total,
      successTotal: okRes.total,
      hasMore: page * PAGE_SIZE < total,
      page: page,
      pageSize: PAGE_SIZE
    }
  } catch (e) {
    console.error('查询打卡记录失败：', e)
    return { code: -1, msg: '查询打卡记录失败：' + (e.errMsg || e.message) }
  }
}
