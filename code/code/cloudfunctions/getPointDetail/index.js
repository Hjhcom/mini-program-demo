// 点位详情：点位信息 + 最近打卡照片墙 + 打卡人数排行
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { pointId } = event
  if (!pointId) return { code: -1, msg: '缺少点位ID' }

  try {
    // 点位信息
    const pointRes = await db.collection('points').doc(pointId).get()
    if (!pointRes.data) return { code: -1, msg: '点位不存在' }
    const point = pointRes.data

    // 最近 20 条成功打卡（带照片的优先）
    const recordsRes = await db.collection('records')
      .where({ pointId, matched: true })
      .orderBy('createTime', 'desc')
      .limit(20)
      .get()

    // 按用户去重统计打卡次数
    const userCount = {}
    recordsRes.data.forEach(r => {
      const k = r.openid
      userCount[k] = (userCount[k] || 0) + 1
    })

    // 查这些用户的昵称头像
    const openids = Object.keys(userCount).slice(0, 10)
    let users = []
    if (openids.length > 0) {
      const usersRes = await db.collection('users')
        .where({ openid: db.command.in(openids) })
        .limit(20)
        .get()
      users = usersRes.data
    }
    const userMap = {}
    users.forEach(u => { userMap[u.openid] = u })

    // 组装照片墙
    const photos = recordsRes.data
      .filter(r => r.photoFileID)
      .slice(0, 12)
      .map(r => ({
        fileID: r.photoFileID,
        nickname: (userMap[r.openid] && userMap[r.openid].nickname) || '打卡玩家',
        createTime: r.createTime
      }))

    // 排行
    const rankList = Object.entries(userCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([oid, count]) => ({
        nickname: (userMap[oid] && userMap[oid].nickname) || '打卡玩家',
        avatarUrl: (userMap[oid] && userMap[oid].avatarUrl) || '',
        count
      }))

    return {
      code: 0,
      point: {
        _id: point._id,
        name: point.name,
        spell: point.spell,
        radius: point.radius
      },
      totalCheckins: recordsRes.data.length,
      photoWall: photos,
      rankList
    }
  } catch (e) {
    console.error('点位详情失败：', e)
    return { code: -1, msg: '查询失败：' + (e.errMsg || e.message) }
  }
}
