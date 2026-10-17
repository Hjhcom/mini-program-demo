// utils/geo.js —— 地理计算公共模块（F-09 抽出）
//
// ⚠️ 原先 getDistance 写在 pages/index/index.js 里，属于「页面私有」。
//    F-09 点位列表页也要按距离排序，如果直接复制一份，就会出现两份实现、
//    以后改了其中一份另一边静默不一致。所以抽到这里，全项目只有这一份。
//    （云函数端不需要算距离 —— 范围判定在打卡时由前端做，所以只有这一个副本。）
//
// 单测：node tools/test-geo.js

// Haversine 公式：两个经纬度之间的球面距离（米）
// 参数顺序要注意：先纬度后经度（与 wx.getLocation 返回的字段顺序一致）
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000 // 地球半径（米）
  const rad = d => d * Math.PI / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(a))
}

// 「附近」的判定半径（米）：点位列表按它把点位切成「附近 / 其他」两段
const NEAR_LIMIT = 500

// 距离 → 展示用的数值与单位
// 单位文案（米/公里、m/km）放在语言包里，这里只回 'm' / 'km'，避免和 i18n 耦合
// 规则：< 1 km 用米取整；1~10 km 保留一位小数；≥ 10 km 取整
function formatDistance(m) {
  // ⚠️ 必须先判空：Number(null) === 0、Number('') === 0，只靠 isFinite 会把「没距离」
  //    显示成「0 米」——正是 hasCoords 里防的同一个坑（单测逮到过）。
  if (m == null || m === '') return { value: '—', unit: '' }
  const n = Number(m)
  if (!isFinite(n) || n < 0) return { value: '—', unit: '' }
  if (n < 1000) return { value: String(Math.round(n)), unit: 'm' }
  const km = n / 1000
  return { value: km < 10 ? km.toFixed(1) : String(Math.round(km)), unit: 'km' }
}

// 判断一个「位置对象」能不能用来算距离
// ⚠️ 不能只写 isFinite(Number(loc.latitude)) —— Number(null) === 0 且 isFinite(0) 为 true，
//    会把「没有定位」当成赤道上的 (0,0)。必须先判 null/undefined。
function hasCoords(loc) {
  if (!loc || loc.latitude == null || loc.longitude == null) return false
  return isFinite(Number(loc.latitude)) && isFinite(Number(loc.longitude))
}

// 给每个点位补上 distance 字段并按距离升序排序（返回新数组，不改入参）
// loc 无效（用户没给定位权限）时：distance 统一为 null，保持原有顺序
function attachDistance(points, loc) {
  const list = (points || []).map(p => {
    const item = Object.assign({}, p)
    item.distance = hasCoords(loc)
      ? getDistance(Number(loc.latitude), Number(loc.longitude), Number(p.latitude), Number(p.longitude))
      : null
    return item
  })
  if (!hasCoords(loc)) return list
  // distance 都是有效数字，直接相减即可（Array.sort 是稳定排序）
  return list.sort((a, b) => a.distance - b.distance)
}

// 按「附近 / 其他」分组
// distance 为 null（无定位）时全部归到 others —— 否则所有点位都会显示成「附近」，
// 那是错的：算不出距离不等于离得近。
function groupByDistance(points) {
  const near = []
  const others = []
  ;(points || []).forEach(p => {
    if (typeof p.distance === 'number' && p.distance <= NEAR_LIMIT) near.push(p)
    else others.push(p)
  })
  return { near: near, others: others }
}

module.exports = {
  getDistance: getDistance,
  NEAR_LIMIT: NEAR_LIMIT,
  formatDistance: formatDistance,
  hasCoords: hasCoords,
  attachDistance: attachDistance,
  groupByDistance: groupByDistance
}
