// 云函数：createPoint —— 用户自建打卡点（F-05 / 文档 3.5）
//
// 入参：{ name, spell, radius, longitude, latitude }
// 出参：成功 { code:0, pointId, point:{...} }；失败 { code:-1, msg }
//
// 设计要点：
//  1. 校验规则全部走 lib/validate.js（纯函数，可本地单测）；
//  2. 限流：同一用户最多 MAX_POINTS_PER_USER 个点位，且不允许同名重复创建；
//  3. 出参剥掉 creatorOpenid（团队隐私约定：对外只回白名单字段）；
//  4. 自建点位写入 hidden:false，被举报达阈值后由 reportPoint 置 true，
//     getPoints 会把 hidden 的点位过滤掉。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const { LIMITS, validatePoint } = require('./lib/validate')

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '未登录' }

  // 1. 该用户已建点位数（用于上限判定）
  const mineRes = await db.collection('points').where({ creatorOpenid: OPENID }).count()

  // 2. 校验 + 规范化（名称/咒语/半径/坐标/上限，一次返回第一个错误）
  const v = validatePoint(event, mineRes.total)
  if (!v.ok) return { code: -1, msg: v.msg }
  const p = v.data

  // 3. 同名查重：同一用户不允许建同名点位。
  //    主要是兜住「提交按钮连点 / 网络重试」导致的重复建点 —— 客户端已有 submitting 锁，
  //    但锁只在单次会话内有效，这里做服务端兜底。
  const dupRes = await db.collection('points')
    .where({ creatorOpenid: OPENID, name: p.name })
    .count()
  if (dupRes.total > 0) return { code: -1, msg: '你已经创建过同名的打卡点了' }

  // 4. 创建者昵称（冗余存一份，列表/详情展示时不用再关联查 users）
  const uRes = await db.collection('users').where({ openid: OPENID }).limit(1).get()
  const creatorNickname = (uRes.data[0] && uRes.data[0].nickname) || '神秘玩家'

  // 5. 写库
  const addRes = await db.collection('points').add({
    data: {
      name: p.name,
      spell: p.spell,
      longitude: p.longitude, // 数字类型（字符串会让距离计算与图钉渲染出问题）
      latitude: p.latitude,
      radius: p.radius,
      creatorOpenid: OPENID,
      creatorNickname: String(creatorNickname).slice(0, 20),
      hidden: false,
      createdAt: db.serverDate()
    }
  })

  return {
    code: 0,
    pointId: addRes._id,
    // 只回白名单字段，不回 creatorOpenid
    point: {
      _id: addRes._id,
      name: p.name,
      spell: p.spell,
      radius: p.radius,
      longitude: p.longitude,
      latitude: p.latitude,
      creatorNickname: String(creatorNickname).slice(0, 20),
      isMine: true,
      isOfficial: false
    },
    // 方便前端直接提示「还能再建几个」
    remain: Math.max(0, LIMITS.MAX_POINTS_PER_USER - mineRes.total - 1)
  }
}
