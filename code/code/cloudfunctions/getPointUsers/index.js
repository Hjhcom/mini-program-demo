// 云函数：getPointUsers —— 点位打卡用户信息展示（F-02 / 文档 3.2.2）
// 作用：给定打卡点 _id，返回该点位「打卡成功」的人数，以及最近打卡玩家的昵称 + 头像
//
// ⚠️ 隐私约定（报告里要专门写这一点）：查询全部在服务端完成，**返回值里不含 openid**。
//    openid 只在函数内部用于去重与排序，出参一律剥掉。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const $ = db.command.aggregate

const MAX_USERS = 5    // 头像墙最多展示几人
const SCAN_LIMIT = 20  // 先取最近 20 条成功记录再去重（同一用户连着打 3 次也能凑够 5 个不同的人）

exports.main = async (event) => {
  const pointId = event && event.pointId
  if (!pointId) return { code: -1, msg: '缺少 pointId' }

  // ===== 1. 该点位打卡成功的人数（按 openid 去重）=====
  // 原写法 group({ _id:'$pointId', userCount: $.addToSet('$openid') }) 会把所有 openid
  // 塞进一个数组返回，人多了会顶到聚合内存上限。改成「按 openid 分组 → count」，
  // 只回传一个数字，与人数规模无关（语义等价：都是按 openid 去重后计数）。
  const cntRes = await db.collection('records').aggregate()
    .match({ pointId, matched: true })
    .group({ _id: '$openid' })
    .count('n')
    .end()
  const userCount = (cntRes.list[0] && cntRes.list[0].n) || 0

  // ===== 2. 取最近的成功打卡记录 =====
  // 原写法 limit(5) 之后再去重：若同一用户连续打了 3 次成功卡，头像墙就凑不满 5 个不同的人。
  // 改成先取 20 条再去重取 5 人。
  // ⚠️ records 的时间字段叫 createTime（不是 createdAt），orderBy 依赖它，别改。
  const recRes = await db.collection('records')
    .where({ pointId, matched: true })
    .orderBy('createTime', 'desc')
    .limit(SCAN_LIMIT)
    .get()

  // ===== 3. 按 openid 去重，同一用户只出现一次，取最近 MAX_USERS 人 =====
  const openids = []
  for (const r of recRes.data) {
    if (!r.openid) continue
    if (openids.indexOf(r.openid) === -1) openids.push(r.openid)
    if (openids.length >= MAX_USERS) break
  }

  // ===== 4. 查昵称 / 头像（openid 仅服务端用于排序，出参会剥掉）=====
  const userMap = {}
  if (openids.length > 0) {
    const uRes = await db.collection('users')
      .where({ openid: db.command.in(openids) })
      .field({ openid: true, nickname: true, avatarUrl: true })
      .get()
    uRes.data.forEach(u => { userMap[u.openid] = u })
  }
  // ⚠️ where(in) 的返回顺序不保证与 openids 一致，这里按 openids 重排，
  //    保证头像墙是「最近打卡的排在前面」。
  const picked = openids.map(id => userMap[id]).filter(Boolean)

  // ===== 5. 头像 fileID → https 临时链接 =====
  // users.avatarUrl 存的是云存储 fileID（cloud://…），<image> 不能直接用。
  // 在服务端批量换成临时链接，前端拿到就是能直接渲染的 https（文档 3.2.2 的方案 A）。
  const fileIDs = picked.map(u => u.avatarUrl).filter(u => u && u.indexOf('cloud://') === 0)
  const urlMap = {}
  if (fileIDs.length > 0) {
    try {
      const tmp = await cloud.getTempFileURL({ fileList: fileIDs })
      ;(tmp.fileList || []).forEach(f => {
        if (f.status === 0 && f.tempFileURL) urlMap[f.fileID] = f.tempFileURL
      })
    } catch (e) {
      // 换链接失败不影响主流程：前端会退回「昵称首字」占位头像
      console.error('getTempFileURL 失败：', e)
    }
  }

  return {
    code: 0,
    userCount: userCount,
    recentUsers: picked.map(u => ({
      nickname: u.nickname || '打卡玩家',
      avatarUrl: urlMap[u.avatarUrl] || '' // 空字符串 → 前端显示昵称首字占位
    }))
  }
}
