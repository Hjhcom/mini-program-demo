// 云函数：getPoints 获取所有打卡点
// 首次调用时自动写入测试打卡点（种子数据）
//
// F-05（用户自建打卡点）改造点：
//  1. **出参改白名单**：不再原样回整条文档，剥掉 creatorOpenid（团队隐私约定：
//     对外返回一律白名单字段）。前端需要的"这个点位是谁的"改成两个布尔值：
//       · isMine     —— 是不是我自己建的（首页/详情用来显示「我的点位」与隐藏举报入口）
//       · isOfficial —— 是不是官方点位（种子数据，creatorOpenid 为 'admin'）
//     判断全在服务端做，openid 本身不出网。这样前端既能区分图钉颜色，又拿不到 openid。
//  2. **过滤被隐藏的点位**：被举报达阈值后 reportPoint 会把 hidden 置 true，
//     这里直接不给（对所有人都不给，包括创建者 —— 见文档 3.5.1 的取舍说明）。
//  3. **种子写入判定不受 hidden 过滤影响**：仍然按「集合里一条都没有」才写种子，
//     否则点位全被隐藏时会被误判成空集合、把种子数据重复插一遍。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 打卡口径：排除 type='text' 的心情动态；早期打卡记录没有 type 字段，一并保留。
const nonTextType = db.command.or([db.command.exists(false), db.command.neq('text')])

// 官方点位标记：现有种子数据用的是 'admin'；没有 creatorOpenid 的老数据也按官方处理
const OFFICIAL_CREATOR = 'admin'

// 打卡点种子数据（首次空集合时写入；已写库的记录需在云开发控制台直接改）
// 坐标说明：均为 gcj02（与 wx.getLocation type=gcj02 一致）；文博中心坐标取自高德 POI，若现场偏差可到点后用首页调试打印的 GPS 校准
// F-13 隐藏咒语：hiddenSpell 是第二句可念的咒语（念对同样算打卡成功，积分双倍）；
//                hiddenClue 是给玩家的线索文案。hiddenSpell 明文**只存服务端**，
//                getPoints 出参会剥掉，玩家只能靠线索去猜。
const SEED_POINTS = [
  { name: '北京理工大学良乡校区文萃楼B', longitude: 116.174609, latitude: 39.731685, spell: '我爱文萃', radius: 50,
    hiddenSpell: '德以明理', hiddenClue: '四字，校训上半句，你在每一堂课里践行它' },
  { name: '北京理工大学良乡校区甘棠园7D', longitude: 116.173819, latitude: 39.735082, spell: '我爱甘棠', radius: 50,
    hiddenSpell: '学以精工', hiddenClue: '四字，校训下半句，北理学子的治学态度' },
  { name: '北京理工大学良乡校区综教楼A', longitude: 116.171219, latitude: 39.733311, spell: '我爱综教', radius: 50,
    hiddenSpell: '延安根军工魂', hiddenClue: '七字，北理工从延安走来的红色血脉与国防基因' },
  { name: '北京理工大学良乡校区文博中心', longitude: 116.176778, latitude: 39.733354, spell: '明德精工，创新包容', radius: 50,
    hiddenSpell: '北京理工大学', hiddenClue: '五个字，这所学校的全名' }
]

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const points = db.collection('points')

  // 1. 读取所有打卡点
  //    ⚠️ 云函数端 get() 默认每页 100 条，这里显式放宽到 200（上限 1000）。
  //    课程项目点位数远达不到；真超了应该给 getPoints 加分页，而不是继续调大这个数。
  //    不加 orderBy 是刻意的 —— 按入库顺序返回，保证首页 markers 的下标稳定
  //    （onMarkerTap 靠「下标 + 1」回推点位）。
  let res = await points.limit(200).get()

  // 2. 如果集合还是空的，先写入测试数据
  //    注意这里是拿"未过滤"的结果判断是否为空（上面的 get() 没加 where），
  //    所以即使所有点位都被举报隐藏，也不会重复插种子。
  if (res.data.length === 0) {
    for (const p of SEED_POINTS) {
      await points.add({
        data: {
          ...p,
          creatorOpenid: OFFICIAL_CREATOR,
          hidden: false,
          createdAt: db.serverDate()
        }
      })
    }
    // 重新读取
    res = await points.limit(200).get()
  }

  // 3. 过滤被隐藏的点位 + 组装白名单出参
  const list = res.data
    .filter(p => p.hidden !== true)
    .map(p => {
      const creator = p.creatorOpenid || OFFICIAL_CREATOR
      return {
        _id: p._id,
        name: p.name,
        spell: p.spell,
        longitude: p.longitude,
        latitude: p.latitude,
        radius: p.radius,
        creatorNickname: p.creatorNickname || '',
        isOfficial: creator === OFFICIAL_CREATOR,
        // 未登录（OPENID 为空）时 isMine 恒为 false，不会误判成"我的点位"
        isMine: !!OPENID && creator === OPENID,
        // F-13：隐藏咒语 —— hasHidden 给前端展示彩蛋提示，hiddenClue 是给玩家的线索
        // ⚠️ hiddenSpell 明文不回传（玩家只能靠线索去猜，回传就失去隐藏的意义）
        hasHidden: !!(p.hiddenSpell),
        hiddenClue: p.hiddenClue || ''
      }
      // ⚠️ 这里没有 creatorOpenid —— 刻意不回传，别为了图方便加回去
    })

  // 4. 点亮地图：查当前用户成功打卡过哪些点，给每个点加 hasVisited + bestStars
  //    F-13：bestStars 是该点位「我的历史最高星级」，前端面板用来展示收集进度
  let visitedIds = new Set()
  const bestStarMap = {}
  if (OPENID && list.length > 0) {
    const recordsRes = await db.collection('records')
      .where({ openid: OPENID, matched: true, type: nonTextType })
      .field({ pointId: true, stars: true })
      .get()
    recordsRes.data.forEach(r => {
      visitedIds.add(r.pointId)
      const s = Number(r.stars) || 0
      if (s > (bestStarMap[r.pointId] || 0)) bestStarMap[r.pointId] = s
    })
  }
  list.forEach(p => {
    p.hasVisited = visitedIds.has(p._id)
    p.bestStars = bestStarMap[p._id] || 0
  })

  // 5. F-13 数据迁移：官方点位若还没有 hiddenSpell（库里是旧数据），按名称从种子数据补齐并写库。
  //    ⚠️ 必须写库而不是只回传：voiceCheckin 判定隐藏咒语时是直接读库的，
  //    只在 getPoints 里临时拼一份的话，两个云函数看到的点位就不一致。
  for (const p of list) {
    // 出参对象不含 hiddenSpell 字段（剥掉了），用 hasHidden 判断即可
    if (p.isOfficial && !p.hasHidden) {
      const seed = SEED_POINTS.find(s => s.name === p.name)
      if (seed && seed.hiddenSpell) {
        try {
          await points.doc(p._id).update({
            data: { hiddenSpell: seed.hiddenSpell, hiddenClue: seed.hiddenClue }
          })
          p.hasHidden = true
          p.hiddenClue = seed.hiddenClue
          console.log('已为官方点位补齐隐藏咒语：', p.name)
        } catch (e) {
          console.error('补齐隐藏咒语失败（不影响点位展示）：', p.name, e)
        }
      }
    }
  }

  return { code: 0, points: list }
}
