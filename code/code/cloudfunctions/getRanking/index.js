// 云函数：getRanking —— 积分排行榜（F-03 / 文档 3.3.2）
// 作用：
//  - type=user （默认）：玩家积分榜 + 「我的排名」。积分按文档 3.3.1 四条规则**实时计算**，不落库。
//  - type=point：点位热度榜（每个点位成功打卡的总次数 + 独立用户数）。
//
// ⚠️ 隐私约定（报告里要专门写这一点）：聚合结果的 _id 其实就是 openid，
//    但 openid 只在函数内部用于「去重 / 排序 / 映射昵称头像」，**返回值里一律剥掉**，
//    前端只拿到 nickname / avatarUrl / 名次 / 分数。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const $ = db.command.aggregate

// 打卡口径：排除 type='text' 的心情动态；早期打卡记录没有 type 字段，一并保留。
// 排行榜的成功次数、点位数、连续天数、点位热度都只统计真正的打卡记录。
const nonTextType = db.command.or([db.command.exists(false), db.command.neq('text')])

// 纯计算部分单独放 lib/points.js —— 不依赖 wx-server-sdk，可被本地单测直接 require
const { POINTS, streakBonus, calcPoints } = require('./lib/points')

const LIMIT = 50         // 玩家榜最多返回多少人
const POINT_LIMIT = 20   // 点位榜最多返回多少个点位
const TMP_URL_BATCH = 50 // getTempFileURL 单次上限 50，分批换链接

exports.main = async (event) => {
  const type = (event && event.type) || 'user'
  const period = (event && event.period) || 'all'
  const { OPENID } = cloud.getWXContext()
  try {
    if (type === 'point') return await pointBoard(period)
    return await userBoard(OPENID, period)
  } catch (e) {
    console.error('getRanking 失败：', e)
    return { code: -1, msg: '排行榜加载失败：' + (e.errMsg || e.message) }
  }
}

function sinceOf(period) {
  const now = Date.now()
  if (period === 'week') return new Date(now - 7 * 24 * 3600 * 1000)
  if (period === 'month') return new Date(now - 30 * 24 * 3600 * 1000)
  return null
}

// ============ 玩家积分榜 ============
async function userBoard(OPENID, period) {
  const since = sinceOf(period)
  const timeMatch = since ? { createTime: db.command.gte(since) } : {}

  const recRes = await db.collection('records').aggregate()
    .match(Object.assign({ matched: true, type: nonTextType }, timeMatch))
    .group({ _id: { o: '$openid', p: '$pointId' }, times: $.sum(1) })
    .end()

  // 2) 任务相关：完成别人指派的任务 / 自己发布的任务被完成
  //    （acceptTask 已拦截「接受自己发布的任务」，所以两个集合不会重复记同一个人）
  const doneRes = await db.collection('tasks').aggregate()
    .match({ status: 'completed' })
    .group({ _id: '$assigneeOpenid', n: $.sum(1) })
    .end()
  const pubRes = await db.collection('tasks').aggregate()
    .match({ status: 'completed' })
    .group({ _id: '$creatorOpenid', n: $.sum(1) })
    .end()

  // 2.6) 剧本任务线完成数（F-17）：route_progress 里 completed=true 的条数
  let routeRes = { list: [] }
  try {
    routeRes = await db.collection('route_progress').aggregate()
      .match({ completed: true })
      .group({ _id: '$openid', n: $.sum(1) })
      .end()
  } catch (e) {
    console.error('剧本线路聚合失败（本次加成按 0 计）：', e)
  }

  // 2.5) 隐藏咒语打卡次数（F-13）：records 里 matched && isHidden 的条数
  let hiddenRes = { list: [] }
  try {
    hiddenRes = await db.collection('records').aggregate()
      .match(Object.assign({ matched: true, isHidden: true, type: nonTextType }, timeMatch))
      .group({ _id: '$openid', n: $.sum(1) })
      .end()
  } catch (e) {
    console.error('隐藏咒语聚合失败（本次加成按 0 计）：', e)
  }

  // 3) 连续打卡奖励：按 (用户, 自然日) 去重，日期用 UTC+8 口径
  //    用 $dateToString + timezone 一次性拿到 dayKey，避免把整段记录拉到内存里算。
  //    这一步失败不影响榜单（奖励按 0 计并打日志），避免整页挂掉。
  const dayMap = {}
  try {
    const dayRes = await db.collection('records').aggregate()
      .match(Object.assign({ matched: true, type: nonTextType }, timeMatch))
      .group({
        _id: {
          o: '$openid',
          d: $.dateToString({
            date: '$createTime',      // ⚠️ records 的时间字段是 createTime（不是 createdAt）
            timezone: 'Asia/Shanghai',
            format: '%Y-%m-%d'
          })
        }
      })
      .end()
    ;(dayRes.list || []).forEach(r => {
      const o = r._id && r._id.o
      const d = r._id && r._id.d
      if (!o || !d) return
      if (!dayMap[o]) dayMap[o] = []
      dayMap[o].push(d)
    })
  } catch (e) {
    console.error('连续打卡聚合失败（本次奖励按 0 计）：', e)
  }

  // 4) 合并成「每个用户一份统计」
  const stat = {}
  const ensure = id => {
    if (!stat[id]) {
      stat[id] = { successTimes: 0, pointCount: 0, hiddenTimes: 0, taskDone: 0, taskPublished: 0, routeDone: 0, streakBonus: 0 }
    }
    return stat[id]
  }
  ;(recRes.list || []).forEach(r => {
    const o = r._id && r._id.o
    if (!o) return
    const s = ensure(o)
    s.successTimes += (r.times || 0) // 同一用户同一点位打了 n 次就累加 n
    s.pointCount += 1                // 组数 = 去重后的点位数
  })
  ;(hiddenRes.list || []).forEach(r => { if (r._id) ensure(r._id).hiddenTimes = r.n || 0 })
  ;(routeRes.list || []).forEach(r => { if (r._id) ensure(r._id).routeDone = r.n || 0 })
  ;(doneRes.list || []).forEach(r => { if (r._id) ensure(r._id).taskDone = r.n || 0 })
  ;(pubRes.list || []).forEach(r => { if (r._id) ensure(r._id).taskPublished = r.n || 0 })
  Object.keys(stat).forEach(o => { stat[o].streakBonus = streakBonus(dayMap[o]) })

  // 5) 算总分 + 排序（同分依次比成功次数、打卡点位数）
  const entries = Object.keys(stat).map(o => {
    const s = stat[o]
    return { openid: o, points: calcPoints(s), s }
  })
  entries.sort((a, b) =>
    b.points - a.points ||
    b.s.successTimes - a.s.successTimes ||
    b.s.pointCount - a.s.pointCount
  )

  // 6) 取前 LIMIT 名；同时定位「我」的名次（可能不在前 50，也要能看到自己）
  const top = entries.slice(0, LIMIT)
  const meIdx = entries.findIndex(e => e.openid === OPENID)
  const meEntry = meIdx >= 0 ? entries[meIdx] : null

  const ids = top.map(e => e.openid)
  if (meEntry) ids.push(meEntry.openid)
  const userMap = await fetchUsers(ids)

  const decorate = (e, rank) => {
    const u = userMap[e.openid] || {}
    return {
      rank: rank,
      nickname: u.nickname || '神秘玩家',
      avatarUrl: u.avatarUrl || '', // 空串 → 前端显示昵称首字占位
      points: e.points,
      successTimes: e.s.successTimes,
      pointCount: e.s.pointCount,
      hiddenTimes: e.s.hiddenTimes,
      routeDone: e.s.routeDone,
      taskDone: e.s.taskDone,
      taskPublished: e.s.taskPublished,
      streakBonus: e.s.streakBonus,
      isMe: e.openid === OPENID
    }
  }

  return {
    code: 0,
    type: 'user',
    list: top.map((e, i) => decorate(e, i + 1)),
    me: meEntry ? decorate(meEntry, meIdx + 1) : null,
    limit: LIMIT,
    points: POINTS // 把规则常量回传，前端弹窗展示明细时与后端保持同一套口径
  }
}

// ============ 点位热度榜 ============
async function pointBoard(period) {
  const since = sinceOf(period)
  const timeMatch = since ? { createTime: db.command.gte(since) } : {}
  const res = await db.collection('records').aggregate()
    .match(Object.assign({ matched: true, type: nonTextType }, timeMatch))
    .group({
      _id: { p: '$pointId', o: '$openid' },
      times: $.sum(1),
      pointName: $.first('$pointName')
    })
    .group({
      _id: '$_id.p',
      pointName: $.first('$pointName'),
      times: $.sum('$times'),
      userCount: $.sum(1)
    })
    .sort({ times: -1, userCount: -1 })
    .limit(POINT_LIMIT)
    .end()

  const list = (res.list || []).map((i, idx) => ({
    rank: idx + 1,
    pointId: i._id,
    pointName: i.pointName || '打卡点',
    times: i.times,
    userCount: i.userCount
  }))
  return { code: 0, type: 'point', list: list }
}

// ============ 工具：批量取昵称头像（并把 fileID 换成可渲染的 https 链接）============
async function fetchUsers(openids) {
  const uniq = []
  openids.forEach(id => { if (id && uniq.indexOf(id) === -1) uniq.push(id) })
  const map = {}
  if (uniq.length === 0) return map

  const uRes = await db.collection('users')
    .where({ openid: db.command.in(uniq) })
    .field({ openid: true, nickname: true, avatarUrl: true }) // openid 仅服务端映射用，出参剥掉
    .get()

  // users.avatarUrl 存的是云存储 fileID（cloud://…），<image> 不能直接渲染 → 换临时链接
  const fileIDs = uRes.data
    .map(u => u.avatarUrl)
    .filter(u => u && u.indexOf('cloud://') === 0)
  const urlMap = {}
  for (let i = 0; i < fileIDs.length; i += TMP_URL_BATCH) {
    try {
      const tmp = await cloud.getTempFileURL({ fileList: fileIDs.slice(i, i + TMP_URL_BATCH) })
      ;(tmp.fileList || []).forEach(f => {
        if (f.status === 0 && f.tempFileURL) urlMap[f.fileID] = f.tempFileURL
      })
    } catch (e) {
      // 换链接失败不影响榜单：前端退回「昵称首字」占位头像
      console.error('getTempFileURL 失败：', e)
    }
  }

  uRes.data.forEach(u => {
    map[u.openid] = { nickname: u.nickname || '', avatarUrl: urlMap[u.avatarUrl] || '' }
  })
  return map
}
