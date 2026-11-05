// tools/test-guard.js —— 防作弊判定（voiceCheckin/lib/guard.js + geo.js）的本地单元测试
// 用法（仓库根目录）： node tools/test-guard.js
//
// 为什么必须测：防作弊是「错就伤人」的模块 ——
//   · 阈值算宽了：站在寝室也能打卡，刷分游戏失去意义
//   · 阈值算严了 / dayKey 差 8 小时：真实玩家的打卡被判「今天已打过」，投诉无门
//   · 这两个错误都**不会抛异常**，只会在线上悄悄发生，所以边界值必须在本地钉死。
const path = require('path')
const G = require(path.join(__dirname, '..', 'code', 'code', 'cloudfunctions', 'voiceCheckin', 'lib', 'guard.js'))
const GEO = require(path.join(__dirname, '..', 'code', 'code', 'cloudfunctions', 'voiceCheckin', 'lib', 'geo.js'))

let pass = 0
let fail = 0

function eq(actual, expected, title) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log('  ✅ ' + title)
  } else {
    fail++
    console.log('  ❌ ' + title + '  期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
  }
}

function near(actual, expected, tol, title) {
  const ok = Math.abs(actual - expected) <= tol
  if (ok) {
    pass++
    console.log('  ✅ ' + title + '（' + actual.toFixed(1) + ' m）')
  } else {
    fail++
    console.log('  ❌ ' + title + '  期望 ' + expected + '±' + tol + '，实际 ' + actual.toFixed(1))
  }
}

// 纬度 1 度 ≈ 111194.9 m（R=6371000 → 2πR/360），MB 方向上 1 米对应的纬度差
const DEG_PER_M = 1 / 111194.93
const BASE_LAT = 39.9 // 北理工良乡一带纬度
const BASE_LNG = 116.18

console.log('\n【1】haversineM 距离计算')
eq(Math.round(GEO.haversineM(BASE_LAT, BASE_LNG, BASE_LAT, BASE_LNG)), 0, '同一点距离 = 0')
near(GEO.haversineM(BASE_LAT, BASE_LNG, BASE_LAT + 0.001, BASE_LNG), 111.19, 1.5, '纬度差 0.001° ≈ 111 m')
near(GEO.haversineM(BASE_LAT, BASE_LNG, BASE_LAT, BASE_LNG + 0.001), 85.35, 1.5, '经度差 0.001°（北纬39.9）≈ 85 m（经向收缩）')
near(GEO.haversineM(39.9, 116.4, 31.23, 121.47), 1067000, 5000, '北京→上海 ≈ 1067 km（跨城距离量级正确）')
near(GEO.haversineM(0, 0, 0, 1), 111195, 200, '赤道经度差 1° ≈ 111.2 km')
// 对称性：反着算应该得到同一个数
eq(GEO.haversineM(BASE_LAT, BASE_LNG, 40.0, 116.3), GEO.haversineM(40.0, 116.3, BASE_LAT, BASE_LNG), 'a→b 与 b→a 距离一致（对称）')

console.log('\n【2】judgeDistance 300 米阈值边界')
const okM = G.judgeDistance(BASE_LAT + 299.9 * DEG_PER_M, BASE_LNG, BASE_LAT, BASE_LNG)
eq([okM.ok, okM.errCode], [true, ''], '299.9 米 → 允许打卡（边界内侧必须放行）')
eq(okM.distance, 300, '299.9 米四舍五入后对外报 300（不吓玩家）')
const farM = G.judgeDistance(BASE_LAT + 300.1 * DEG_PER_M, BASE_LNG, BASE_LAT, BASE_LNG)
eq([farM.ok, farM.errCode], [false, 'too_far'], '300.1 米 → 拒绝（too_far）')
const far = G.judgeDistance(BASE_LAT + 1000 * DEG_PER_M, BASE_LNG, BASE_LAT, BASE_LNG)
eq([far.ok, far.distance], [false, 1000], '1000 米 → 拒绝，distance 报 1000')

console.log('\n【3】judgeDistance 缺定位 / 脏值')
eq(G.judgeDistance(NaN, BASE_LNG, BASE_LAT, BASE_LNG).errCode, 'no_location', 'lat 是 NaN（前端没给定位）→ no_location')
eq(G.judgeDistance(BASE_LAT, undefined, BASE_LAT, BASE_LNG).errCode, 'no_location', 'lng 缺失 → no_location')
eq(G.judgeDistance(null, null, BASE_LAT, BASE_LNG).errCode, 'no_location', '两者都是 null → no_location')
eq(G.judgeDistance(BASE_LAT, BASE_LNG, NaN, NaN).errCode, 'no_location', '点位坐标是脏数据 → no_location（不能静默放行）')
eq(G.judgeDistance(NaN, BASE_LNG, BASE_LAT, BASE_LNG).distance, null, 'no_location 时不返回距离')

console.log('\n【4】judgeDistance 自定义阈值')
eq(G.judgeDistance(BASE_LAT + 50 * DEG_PER_M, BASE_LNG, BASE_LAT, BASE_LNG, 40).ok, false, '传 40 米阈值：50 米处拒绝')
eq(G.judgeDistance(BASE_LAT + 50 * DEG_PER_M, BASE_LNG, BASE_LAT, BASE_LNG, 60).ok, true, '传 60 米阈值：50 米处允许')
eq(G.judgeDistance(BASE_LAT + 350 * DEG_PER_M, BASE_LNG, BASE_LAT, BASE_LNG, 400).ok, true, '传 400 米阈值：350 米处允许')
eq(G.judgeDistance(BASE_LAT, BASE_LNG, BASE_LAT, BASE_LNG, 0).ok, true, '阈值传 0（非法）→ 回落到默认 300')

console.log('\n【5】dayKeyBJ：UTC+8 自然日（最容易错 8 小时的地方）')
// UTC 2026-11-04 16:30 → 北京时间 2026-11-05 00:30（跨日！用 UTC 取日期会得到 11-04，错）
eq(G.dayKeyBJ(Date.UTC(2026, 10, 4, 16, 30)), '2026-11-05', 'UTC 16:30 → 北京次日 00:30（必须归到 11-05）')
// UTC 2026-11-04 15:59 → 北京 2026-11-04 23:59（还没跨日）
eq(G.dayKeyBJ(Date.UTC(2026, 10, 4, 15, 59)), '2026-11-04', 'UTC 15:59 → 北京 23:59（仍是 11-04）')
// UTC 2026-11-04 16:00 整 → 北京 11-05 00:00 整
eq(G.dayKeyBJ(Date.UTC(2026, 10, 4, 16, 0)), '2026-11-05', 'UTC 16:00 整 → 北京零点，归到 11-05')
eq(G.dayKeyBJ(Date.UTC(2026, 0, 1, 0, 0)), '2026-01-01', '跨年边界：UTC 年初 → 北京 08:00，仍是 01-01')
eq(G.dayKeyBJ(Date.UTC(2026, 11, 31, 16, 30)), '2027-01-01', '跨年边界：UTC 12-31 16:30 → 北京 2027-01-01')
eq(G.dayKeyBJ(Date.UTC(2026, 10, 5, 3, 0)), '2026-11-05', '月份/日期补零：单数字月日必须补成两位')
// 非法入参兜底成「今天」，不能返回 NaN 串
eq(/^\d{4}-\d{2}-\d{2}$/.test(G.dayKeyBJ(NaN)), true, '传 NaN → 回落到当前时间，格式仍合法')

console.log('\n【6】judgeDuplicate 同日限次 + 任务豁免')
eq(G.judgeDuplicate(0, '').ok, true, '当天没打过 → 允许')
eq([G.judgeDuplicate(1, '').ok, G.judgeDuplicate(1, '').errCode], [false, 'duplicate_today'], '当天已打过 1 次 → duplicate_today')
eq(G.judgeDuplicate(3, '').ok, false, '当天已打过 3 次 → 仍然拒绝')
eq(G.judgeDuplicate(5, 'task_abc').exempt, true, '任务打卡（taskId 非空）→ 豁免，允许再打一次')
eq(G.judgeDuplicate(5, '').exempt, false, '普通打卡没有豁免标记')
eq(G.judgeDuplicate('1', '').ok, false, 'dupCount 传字符串 "1" → 仍判为重复（防脏值放行）')

console.log('\n【7】阈值常量与前端一致')
eq(G.CHECKIN_MAX_DIST, 300, 'CHECKIN_MAX_DIST = 300 米（与前端 inRange 兜底一致）')
eq(GEO.CHECKIN_MAX_DIST, 300, 'geo.js 导出的阈值同样为 300')

console.log('\n--------------------------------')
if (fail === 0) {
  console.log('全部通过 ✅  共 ' + (pass + fail) + ' 条（通过 ' + pass + ' / 失败 ' + fail + '）')
  process.exit(0)
} else {
  console.log('❌ 失败 ' + fail + ' 条（通过 ' + pass + '）')
  process.exit(1)
}
