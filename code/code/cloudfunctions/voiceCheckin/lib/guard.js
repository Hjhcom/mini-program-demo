// cloudfunctions/voiceCheckin/lib/guard.js —— 防作弊判定纯函数（F-20）
//
// 两道防线（都必须在讯飞识别**之前**拦下，既防刷分也省一次识别调用）：
//   1) 定位距离：必须携带定位，且与点位的直线距离 ≤ 300 米
//   2) 同日同点限一次：同一 openid 同一点位同一天只允许成功一次（任务打卡豁免）
//
// 抽成纯函数的原因：判定逻辑写在 index.js 里只能连云端真机验证，
// 边界值（299m / 300m / 301m、跨 UTC+8 零点）最容易错，必须在本地可重复测。
// 测试见 tools/test-guard.js。

const { haversineM, CHECKIN_MAX_DIST } = require('./geo')

// 北京时间（UTC+8）自然日 → 'YYYY-MM-DD'
// 云函数容器时区是 UTC，直接取本地日期会差 8 小时，必须显式 +8h
function dayKeyBJ(nowMs) {
  const t = Number(nowMs)
  const bj = new Date((isFinite(t) ? t : Date.now()) + 8 * 3600 * 1000)
  const m = bj.getUTCMonth() + 1
  const d = bj.getUTCDate()
  return bj.getUTCFullYear() + '-' +
    (m < 10 ? '0' : '') + m + '-' +
    (d < 10 ? '0' : '') + d
}

// 是否是「有效坐标数字」
// ⚠️ 不能直接用 isFinite()：isFinite(null) === true、isFinite('') === true、isFinite(' ') === true，
//    空定位会被当成 0,0（赤道几内亚附近），于是玩家收到的是「离打卡点太远」而不是「请开启定位」。
//    这里显式排掉 null / undefined / 空串 / 纯空白，其余交给 Number 转换（小程序端常传数字字符串）。
function isCoordNum(v) {
  if (v === null || v === undefined) return false
  if (typeof v === 'string' && v.trim() === '') return false
  return isFinite(Number(v))
}

// 距离校验：返回 { ok, errCode, distance }
//   lat/lng/点位任一不是有效坐标 → no_location（前端没给定位，或传了脏值）
//   距离 > limit               → too_far
//   否则                        → ok
function judgeDistance(lat, lng, pointLat, pointLng, limit) {
  const L = isFinite(limit) && limit > 0 ? limit : CHECKIN_MAX_DIST
  if (!isCoordNum(lat) || !isCoordNum(lng) || !isCoordNum(pointLat) || !isCoordNum(pointLng)) {
    return { ok: false, errCode: 'no_location', distance: null }
  }
  const d = haversineM(Number(lat), Number(lng), Number(pointLat), Number(pointLng))
  if (d > L) return { ok: false, errCode: 'too_far', distance: Math.round(d) }
  return { ok: true, errCode: '', distance: Math.round(d) }
}

// 同日限次：dupCount = 该用户当天在此点位「匹配成功」的记录数
//   任务打卡（taskId 非空）豁免 —— 避免「上午普通打过、下午接任务被误伤」
function judgeDuplicate(dupCount, taskId) {
  if (taskId) return { ok: true, errCode: '', exempt: true }
  const n = Number(dupCount)
  if (isFinite(n) && n > 0) return { ok: false, errCode: 'duplicate_today', exempt: false }
  return { ok: true, errCode: '', exempt: false }
}

module.exports = { isCoordNum, dayKeyBJ, judgeDistance, judgeDuplicate, CHECKIN_MAX_DIST }
