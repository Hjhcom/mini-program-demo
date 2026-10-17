// tools/test-geo.js —— utils/geo.js 的本地单元测试（F-08/F-09 用）
// 用法（仓库根目录）： node tools/test-geo.js
//
// 为什么要测：距离算错不会报错，只会让「附近」「还差多少米」这些提示悄悄错掉，
// 而且首页打卡判定（dist <= radius）就是靠它 —— 算错等于判错。
// geo.js 是纯函数、不依赖 wx，所以能在这里全部测掉。
const path = require('path')
const G = require(path.join(__dirname, '..', 'code', 'code', 'utils', 'geo.js'))

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

// 浮点比较：距离本身有精度误差，给一个容差再判（单位：米）
function near(actual, expected, tol, title) {
  const ok = Math.abs(actual - expected) <= tol
  if (ok) {
    pass++
    console.log('  ✅ ' + title + '（' + actual.toFixed(1) + ' m）')
  } else {
    fail++
    console.log('  ❌ ' + title + '  期望 ' + expected + '±' + tol + '，实际 ' + actual)
  }
}

// ---------------------------------------------------------------- 常量
console.log('— 常量 —')
eq(G.NEAR_LIMIT, 500, 'NEAR_LIMIT 是 500 米（点位列表附近/其他的分界）')

// ---------------------------------------------------------------- getDistance
console.log('\n— getDistance（Haversine，单位米）—')
near(G.getDistance(39.9087, 116.3975, 39.9087, 116.3975), 0, 0.001, '同一个点 → 0')
// 赤道上 1 度经度 = R × π/180 ≈ 111194.93 米
near(G.getDistance(0, 0, 0, 1), 111194.93, 1, '赤道上 1 度经度 ≈ 111195 米')
near(G.getDistance(0, 0, 1, 0), 111194.93, 1, '1 度纬度 ≈ 111195 米（经度不参与）')
// 天安门 → 故宫太和殿：只差 0.0076 度纬度，约 845 米
near(G.getDistance(39.9087, 116.3975, 39.9163, 116.3972), 845, 5, '天安门 → 故宫约 845 米')
// 北京 → 上海：约 1067 公里（大跨度检验，验证没漏 R 的换算）
near(G.getDistance(39.9042, 116.4074, 31.2304, 121.4737), 1067000, 15000, '北京 → 上海约 1067 公里')
// 对称性：a→b 与 b→a 必须相等（公式写错顺序时这里会红）
eq(G.getDistance(30, 120, 31, 121) === G.getDistance(31, 121, 30, 120), true, 'a→b 与 b→a 结果相同（对称）')
// 参数顺序陷阱：把经纬度传反，距离会明显不同 —— 断言"确实不同"，防止有人误以为可以随便传
eq(Math.abs(G.getDistance(39.9, 116.4, 39.91, 116.41) - G.getDistance(116.4, 39.9, 116.41, 39.91)) > 100, true,
  '经纬度传反结果明显不同（顺序不能错）')

// ---------------------------------------------------------------- formatDistance
console.log('\n— formatDistance（数值 + 单位）—')
eq(G.formatDistance(0), { value: '0', unit: 'm' }, '0 米 → 0 m')
eq(G.formatDistance(12.4), { value: '12', unit: 'm' }, '12.4 米 → 取整 12 m')
eq(G.formatDistance(12.6), { value: '13', unit: 'm' }, '12.6 米 → 四舍五入 13 m')
eq(G.formatDistance(999), { value: '999', unit: 'm' }, '999 米 → 仍是 m（不提前进位）')
eq(G.formatDistance(1000), { value: '1.0', unit: 'km' }, '1000 米 → 1.0 km')
eq(G.formatDistance(1500), { value: '1.5', unit: 'km' }, '1500 米 → 1.5 km')
eq(G.formatDistance(9999), { value: '10.0', unit: 'km' }, '9999 米 → 10.0 km（一位小数，已知取舍）')
eq(G.formatDistance(10000), { value: '10', unit: 'km' }, '10000 米 → 10 km（≥10 取整）')
eq(G.formatDistance(123456), { value: '123', unit: 'km' }, '123456 米 → 123 km')
eq(G.formatDistance('750'), { value: '750', unit: 'm' }, '字符串数字也能算（数据库字段可能是字符串）')
eq(G.formatDistance(null), { value: '—', unit: '' }, 'null → 占位符，不带单位（Number(null)===0 的坑）')
eq(G.formatDistance(''), { value: '—', unit: '' }, '空串 → 占位符（Number("")===0 的坑）')
eq(G.formatDistance(undefined), { value: '—', unit: '' }, 'undefined → 占位符')
eq(G.formatDistance(NaN), { value: '—', unit: '' }, 'NaN → 占位符')
eq(G.formatDistance(-5), { value: '—', unit: '' }, '负数（不可能出现）→ 占位符，不显示 -5 米')

// ---------------------------------------------------------------- hasCoords
console.log('\n— hasCoords（能不能算距离）—')
eq(G.hasCoords(null), false, 'null → false')
eq(G.hasCoords(undefined), false, 'undefined → false')
eq(G.hasCoords({}), false, '空对象 → false')
eq(G.hasCoords({ latitude: null, longitude: 116.4 }), false, '纬度 null → false')
eq(G.hasCoords({ latitude: 39.9 }), false, '缺经度 → false')
eq(G.hasCoords({ latitude: 39.9, longitude: 116.4 }), true, '完整数字 → true')
eq(G.hasCoords({ latitude: '39.9', longitude: '116.4' }), true, '字符串数字 → true')
eq(G.hasCoords({ latitude: NaN, longitude: 116.4 }), false, 'NaN 纬度 → false')
// 关键回归：Number(null) === 0，如果只用 isFinite 会把这个位置当成赤道 (0,0)
eq(G.hasCoords({ latitude: null, longitude: null }), false, '经纬度都是 null 时不当成 (0,0)（Number(null)===0 的坑）')

// ---------------------------------------------------------------- attachDistance
console.log('\n— attachDistance（补距离并排序）—')
const RAW = [
  { _id: 'far', name: '远的', latitude: 39.95, longitude: 116.40 },
  { _id: 'near', name: '近的', latitude: 39.9087, longitude: 116.3975 },
  { _id: 'mid', name: '中间的', latitude: 39.93, longitude: 116.40 }
]
const HERE = { latitude: 39.9087, longitude: 116.3975 }

const noLoc = G.attachDistance(RAW, null)
eq(noLoc.map(p => p.distance), [null, null, null], '没有定位 → distance 全是 null')
eq(noLoc.map(p => p._id), ['far', 'near', 'mid'], '没有定位 → 顺序保持原样（不乱排）')

const withLoc = G.attachDistance(RAW, HERE)
eq(withLoc.map(p => p._id), ['near', 'mid', 'far'], '有定位 → 按距离升序（近的在前）')
eq(withLoc[0].distance, 0, '自己所在的那个点距离为 0')
eq(withLoc[1].distance > withLoc[0].distance, true, '第 2 个比第 1 个远')
eq(withLoc[2].distance > withLoc[1].distance, true, '第 3 个比第 2 个远')

// 不能改入参（否则首页的 points 会被悄悄塞进 distance 字段）
eq(RAW.some(p => 'distance' in p), false, '不改动入参数组里的对象（返回的是副本）')
eq(RAW.length, 3, '入参数组长度不变')
eq(G.attachDistance([], HERE), [], '空数组 → 空数组')
eq(G.attachDistance(null, HERE), [], 'null → 空数组（不抛异常）')

// ---------------------------------------------------------------- groupByDistance
console.log('\n— groupByDistance（附近 / 其他）—')
const g = G.groupByDistance([
  { _id: 'a', distance: 0 },
  { _id: 'b', distance: 499.9 },
  { _id: 'c', distance: 500 },
  { _id: 'd', distance: 500.1 },
  { _id: 'e', distance: 3000 },
  { _id: 'f', distance: null }
])
eq(g.near.map(p => p._id), ['a', 'b', 'c'], '≤500 米算附近（500 本身算）')
eq(g.others.map(p => p._id), ['d', 'e', 'f'], '>500 米与 distance 为 null 都归到其他')
eq(G.groupByDistance([]), { near: [], others: [] }, '空数组 → 两组都空')
eq(G.groupByDistance(null), { near: [], others: [] }, 'null → 两组都空（不抛异常）')

// 无定位时：全部落 other，不能把「算不出距离」当成「很近」
const allNull = G.groupByDistance(G.attachDistance(RAW, null))
eq(allNull.near.length, 0, '无定位 → 附近为空（算不出距离≠离得近）')
eq(allNull.others.length, 3, '无定位 → 全部归到其他')

// ---------------------------------------------------------------- 汇总
console.log('\n' + (fail === 0 ? '全部通过 ✅' : '有 ' + fail + ' 条失败 ❌') +
  '  共 ' + (pass + fail) + ' 条（通过 ' + pass + ' / 失败 ' + fail + '）')
process.exit(fail === 0 ? 0 : 1)
