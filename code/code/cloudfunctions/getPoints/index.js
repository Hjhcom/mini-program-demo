// 云函数：getPoints 获取所有打卡点
// 首次调用时自动写入测试打卡点（种子数据）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 打卡点种子数据（首次空集合时写入；已写库的记录需在云开发控制台直接改）
// 坐标说明：均为 gcj02（与 wx.getLocation type=gcj02 一致）；文博中心坐标取自高德 POI，若现场偏差可到点后用首页调试打印的 GPS 校准
const SEED_POINTS = [
  { name: '北京理工大学良乡校区文萃楼B', longitude: 116.174609, latitude: 39.731685, spell: '我爱文萃', radius: 50 },
  { name: '北京理工大学良乡校区甘棠园7D', longitude: 116.173819, latitude: 39.735082, spell: '我爱甘棠', radius: 50 },
  { name: '北京理工大学良乡校区综教楼A', longitude: 116.171219, latitude: 39.733311, spell: '我爱综教', radius: 50 },
  { name: '北京理工大学良乡校区文博中心', longitude: 116.176778, latitude: 39.733354, spell: '明德精工，创新包容', radius: 50 }
]

exports.main = async (event, context) => {
  const points = db.collection('points')

  // 1. 读取所有打卡点
  let res = await points.get()

  // 2. 如果集合还是空的，先写入测试数据
  if (res.data.length === 0) {
    for (const p of SEED_POINTS) {
      await points.add({
        data: {
          ...p,
          creatorOpenid: 'admin',
          createdAt: db.serverDate()
        }
      })
    }
    // 重新读取
    res = await points.get()
  }

  return { code: 0, points: res.data }
}
