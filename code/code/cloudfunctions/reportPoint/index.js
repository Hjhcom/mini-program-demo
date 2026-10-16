// 云函数：reportPoint —— 自建点位的举报与自动隐藏（F-05 的内容安全部分）
//
// 入参：{ pointId, reason, detail }
// 出参：{ code:0, reported:true, already?:true, reportCount, hidden:boolean }
//       失败 { code:-1, msg }
//
// 设计说明（报告里"内容安全"一节可直接引用）：
//  1. 用户自建内容必须可举报 —— 否则出现虚假地点/不当名称时没有任何纠正途径；
//  2. 用**独立集合 reports** 而不是把举报人塞进 points 文档的数组：
//     · 独立集合能给 pointId + reporterOpenid 建**唯一索引**，天然防重复举报（并发也安全）；
//     · 保留举报原因与时间，便于事后人工复核，也便于统计"谁在滥用举报"；
//     · 内嵌数组做不到唯一约束，而且要读改写整个文档，并发下会丢举报。
//  3. 阈值：**按「不同举报人」去重**达到 HIDE_THRESHOLD 即自动隐藏。
//     同一个人反复举报只算 1 票 —— 这是防刷的关键，而不是按举报次数算。
//  4. 生产环境应该"自动隐藏 + 人工复核"，这里因为课程项目没有后台管理界面，
//     先做自动隐藏；文档 3.5.1 里写明了这个取舍。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 达到该数量的**不同举报人**后，点位自动隐藏（不再出现在地图上）
const HIDE_THRESHOLD = 3
// 举报原因白名单（前端传 key，非法值一律归到"其他"，避免被注入任意文本）
const REASONS = ['fake', 'improper', 'duplicate', 'other']
const REASON_LABELS = {
  fake: '虚假地点',
  improper: '名称或咒语不当',
  duplicate: '重复点位',
  other: '其他'
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '未登录' }

  const pointId = String((event && event.pointId) || '')
  if (!pointId) return { code: -1, msg: '参数不完整' }
  const reason = REASONS.indexOf(event.reason) > -1 ? event.reason : 'other'
  const detail = String(event.detail || '').trim().slice(0, 100)

  // 1. 点位必须存在
  const pRes = await db.collection('points').where({ _id: pointId }).get()
  const point = pRes.data[0]
  if (!point) return { code: -1, msg: '打卡点不存在' }

  // 2. 不能举报自己建的点位（自建点位 creatorOpenid 是自己的 openid）
  if (point.creatorOpenid === OPENID) {
    return { code: -1, msg: '不能举报自己创建的打卡点' }
  }

  // 3. 写举报记录
  //    reports 上有 pointId + reporterOpenid 唯一索引 → 重复举报会写入失败，
  //    这里捕获后当成「已举报过」返回，不向前端报错。
  try {
    await db.collection('reports').add({
      data: {
        pointId,
        pointName: point.name,
        reason,
        reasonLabel: REASON_LABELS[reason],
        detail,
        reporterOpenid: OPENID,
        handled: false,           // 留给将来的人工复核流程
        createdAt: db.serverDate()
      }
    })
  } catch (e) {
    const msg = String((e && (e.errMsg || e.message)) || '')
    // 集合不存在 → 给一句能直接照做的提示，而不是把原始报错丢给用户
    if (msg.indexOf('collection not exists') > -1 || msg.indexOf('not exist') > -1) {
      console.warn('reports 集合不存在，需在控制台创建：', msg)
      return { code: -1, msg: '举报功能尚未就绪（需在控制台创建 reports 集合）' }
    }
    console.warn('举报写入失败（多为重复举报命中唯一索引）：', msg)
    return { code: 0, reported: false, already: true, msg: '你已经举报过这个点位了' }
  }

  // 4. 统计「不同举报人」数量
  //    ⚠️ 用 group + count 只回传一个数字，不要用 $.addToSet('$reporterOpenid')
  //    （会把所有 openid 堆进数组返回，与 F-02/F-03 踩过的坑同一个）。
  let reportCount = 1
  try {
    const agg = await db.collection('reports').aggregate()
      .match({ pointId })
      .group({ _id: '$reporterOpenid' })
      .count('n')
      .end()
    reportCount = (agg.list[0] && agg.list[0].n) || 1
  } catch (e) {
    console.error('统计举报人数失败（不影响举报本身）：', e)
  }

  // 5. 达到阈值 → 隐藏点位
  let hidden = !!point.hidden
  if (!hidden && reportCount >= HIDE_THRESHOLD) {
    try {
      await db.collection('points').doc(pointId).update({
        data: { hidden: true, hiddenAt: db.serverDate(), hiddenReason: 'reports' }
      })
      hidden = true
    } catch (e) {
      console.error('隐藏点位失败：', e)
    }
  }

  return { code: 0, reported: true, reportCount, hidden, threshold: HIDE_THRESHOLD }
}
