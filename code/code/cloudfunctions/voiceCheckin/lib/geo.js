// cloudfunctions/voiceCheckin/lib/geo.js —— 地理距离纯函数（F-20 防作弊 / F-23 抽取）
//
// 为什么单独拆文件：云函数 index.js 顶部 require 了 wx-server-sdk，本地跑不起来；
// 把 haversine 抽到本文件后不依赖任何东西，可以被 tools/test-guard.js 直接单测。
// ⚠️ 云函数各自独立打包，只能 require 自己目录内的文件。

const EARTH_R = 6371000 // 地球平均半径（米）

// 两经纬度直线距离（米），haversine 公式；输入为 gcj02 经纬度（与小程序 map 坐标系一致）
function haversineM(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * EARTH_R * Math.asin(Math.sqrt(a))
}

// 打卡距离阈值：官方点位 / 玩家点位统一 300 米兜底（gcj02 与地图一致，误差 ±30m 量级）
const CHECKIN_MAX_DIST = 300

module.exports = { EARTH_R, haversineM, CHECKIN_MAX_DIST }
