// 云函数：getPoints 获取所有打卡点
// 首次调用时自动写入测试打卡点（种子数据）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 测试打卡点（后续可在云开发控制台/后台管理里添加更多）
const SEED_POINTS = [
  { name: '天安门', longitude: 116.397, latitude: 39.908, spell: '芝麻开门', radius: 50 },
  { name: '故宫', longitude: 116.391, latitude: 39.916, spell: '宝塔镇河妖', radius: 50 },
  { name: '王府井', longitude: 116.410, latitude: 39.914, spell: '我爱打卡', radius: 50 }
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
