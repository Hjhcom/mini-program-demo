// 云函数：getRoutes —— 剧本任务线（F-17）
// 作用：返回线路定义（含每幕剧情）与「我的进度」，首次调用时按种子点位初始化线路。
//
// 设计要点：
//  1. 线路是**内容数据**（剧本），存 routes 集合 —— 一个权威来源，所有云函数读它。
//     云函数各自独立打包不能互相 require，配置写死到每个云函数就会漂移（check-sync 也难兜）。
//  2. 线路按顺序打卡（剧本任务线）：玩家必须从第一幕依次打到最后一幕，
//     进度存 route_progress 集合（{ openid, routeId, stepIds, currentIndex, completed }）。
//  3. 出参白名单：点位只回传展示需要的字段（name / spell / 坐标 / hasVisited / isNext）；
//     不下发 creatorOpenid 等敏感字段（沿用 getPoints 的隐私约定）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 打卡口径：排除 type='text' 的心情动态；早期打卡记录没有 type 字段，一并保留。
const nonTextType = db.command.or([db.command.exists(false), db.command.neq('text')])

// 线路种子数据（routes 集合为空时初始化）。
// ⚠️ 点位用「名称」匹配：种子点位 _id 是首次插入时才生成的，写死配置里拿不到，
//    这里运行时按名称从 points 集合查 _id 再拼 steps（点位不存在就跳过整条线路）。
// 《精工之魂》剧本 —— 世界观 / 四幕剧情 / 终章（内容即剧本，中英各一份）。
const SEED_ROUTE = {
  routeId: 'beili-trace',
  name: '北理溯源线',
  nameEn: 'BIT Origins Trail',
  desc:
    '1940 年，延安。一孔窑洞里，中国共产党的第一所理工科大学——自然科学院点亮了油灯。\n' +
    '八十六年后，北京理工大学良乡校区。你在文博中心的旧书架里，发现了一本泛黄的笔记。\n' +
    '笔记的最后一页写着：「校园里藏着四枚精工之火。找到它们，念出它们守护的咒语，就能重燃北理之魂。」',
  descEn:
    '1940, Yan\u2019an. Inside a cave dwelling, the first polytechnic university of the CPC \u2014 the Institute of Natural Sciences \u2014 lit its oil lamp.\n' +
    'Eighty-six years later, on BIT\u2019s Liangxiang campus, you find a yellowed notebook on an old shelf in the Wenbo Center.\n' +
    'Its last page reads: \u201cFour sparks of craftsmanship lie hidden across campus. Find them, speak their guardian spells, and rekindle the spirit of BIT.\u201d',
  bonus: 50,
  steps: [
    {
      pointName: '北京理工大学良乡校区文萃楼B',
      story:
        '笔记把你引向文萃楼。清晨的阳光穿过窗棂，照在还没擦净的黑板上——上面残留着昨晚自习的公式。\n' +
        '你想起开学典礼上校长说的那句话："先明理，而后精工。"\n' +
        '明理之火，就藏在每一个北理学子走进教室前、默念于心的那句话里。',
      storyEn:
        'The notebook leads you to Wencui Building. Morning sunlight passes through the window frame and falls on an unwashed blackboard with formulas from last night\u2019s study.\n' +
        'You recall the president\u2019s words at the opening ceremony: "First to understand, then to master."\n' +
        'The spark of Understanding hides in the sentence every BIT student silently recites before entering a classroom.'
    },
    {
      pointName: '北京理工大学良乡校区甘棠园7D',
      story:
        '夜幕降临，甘棠园的窗口次第亮起。路灯下，一个学长正蹲着修一台老式收音机——\n' +
        '"北理人白天听课，晚上动手。书本上的道理，得靠手上的功夫才立得住。"\n' +
        '精工之火，藏在日复一日、灯火通明的钻研里。',
      storyEn:
        'Night falls, and the windows of Gantang Garden light up one by one. Under a streetlamp, a senior student crouches, fixing an old radio \u2014\n' +
        '"BIT students listen in class by day and build by hand at night. What you read must be proven by what you make."\n' +
        'The spark of Craftsmanship hides in the nightly glow of diligence.'
    },
    {
      pointName: '北京理工大学良乡校区综教楼A',
      story:
        '综教楼走廊尽头，挂着一张泛黄的老照片：延安窑洞前的师生，身后是简陋的实验设备。\n' +
        '从延安到北京，从窑洞到实验室——"延安根、军工魂"六个字，在这所学校里从未断过。\n' +
        '军工之火，是刻在北理人骨子里的红色血脉。',
      storyEn:
        'At the end of the corridor in Zongjiao Building A hangs a yellowed photograph: teachers and students before the Yan\u2019an cave dwellings, simple lab equipment behind them.\n' +
        'From Yan\u2019an to Beijing, from cave to laboratory \u2014 "Roots in Yan\u2019an, soul in ordnance" has never faded here.\n' +
        'The spark of Heritage is the red bloodline carved into every BIT student.'
    },
    {
      pointName: '北京理工大学良乡校区文博中心',
      story:
        '你带着三枚火焰回到文博中心。展柜最深处，一枚锈迹斑斑的徽章静静躺着，\n' +
        '"德以明理，学以精工"八个字被岁月磨得发亮。\n' +
        '你终于读懂笔记的最后一句话——所谓精工之魂，就是一代代北理人，把自己的名字刻进国家最需要的地方。\n' +
        '现在，把四枚火焰合而为一，念出那枚徽章上刻着的名字——',
      storyEn:
        'You return to the Wenbo Center with three sparks. Deep in the display case lies a rusty badge,\n' +
        'its eight characters "Integrity in mind, excellence in practice" polished bright by time.\n' +
        'You finally understand the notebook\u2019s last line \u2014 the soul of craftsmanship is how generations of BIT people carve their names into where the nation needs them most.\n' +
        'Now, unite the four sparks and speak the name engraved on the badge \u2014'
    }
  ]
}

// ⚠️ 官方点位种子（线路依赖）：与 getPoints 的 SEED_POINTS 完全一致。
// 为什么这里也要一份？因为 getPoints 只会在「points 集合为空」时插入官方种子——
// 如果云环境里已经先有了玩家自建点位（集合非空），4 个官方点位根本不会存在，
// 线路按名称匹配就永远匹配不到。所以 getRoutes 初始化线路前要**先补齐缺失的官方点**。
const OFFICIAL_CREATOR = 'admin'
const SEED_POINTS_FOR_ROUTE = [
  { name: '北京理工大学良乡校区文萃楼B', longitude: 116.174609, latitude: 39.731685, spell: '我爱文萃', radius: 50,
    hiddenSpell: '德以明理', hiddenClue: '四字，校训上半句，你在每一堂课里践行它' },
  { name: '北京理工大学良乡校区甘棠园7D', longitude: 116.173819, latitude: 39.735082, spell: '我爱甘棠', radius: 50,
    hiddenSpell: '学以精工', hiddenClue: '四字，校训下半句，北理学子的治学态度' },
  { name: '北京理工大学良乡校区综教楼A', longitude: 116.171219, latitude: 39.733311, spell: '我爱综教', radius: 50,
    hiddenSpell: '延安根军工魂', hiddenClue: '七字，北理工从延安走来的红色血脉与国防基因' },
  { name: '北京理工大学良乡校区文博中心', longitude: 116.176778, latitude: 39.733354, spell: '明德精工，创新包容', radius: 50,
    hiddenSpell: '北京理工大学', hiddenClue: '五个字，这所学校的全名' }
]

// 确保线路依赖的官方点位存在：按名称查 points，缺失的补齐（幂等）。
// 返回「名称 → 点位」索引，供拼线路 steps 用。
async function ensureOfficialPoints() {
  const pRes = await db.collection('points').limit(200).get()
  const byName = {}
  pRes.data.forEach(p => { byName[p.name] = p })

  const missing = SEED_POINTS_FOR_ROUTE.filter(s => !byName[s.name])
  if (missing.length > 0) {
    console.log('补齐官方点位：', missing.length, '个')
    for (const s of missing) {
      await db.collection('points').add({
        data: Object.assign({}, s, {
          creatorOpenid: OFFICIAL_CREATOR,
          hidden: false,
          createdAt: db.serverDate()
        })
      })
    }
    // 补齐后重查一次
    const again = await db.collection('points').limit(200).get()
    const map2 = {}
    again.data.forEach(p => { map2[p.name] = p })
    return map2
  }
  return byName
}

// 确保 routes 集合里有线路：为空时先补齐官方点位、再按点位名称拼 steps 写库（幂等）。
async function ensureRoutes() {
  const res = await db.collection('routes').limit(20).get()
  if (res.data.length > 0) return res.data

  // 补齐线路依赖的官方点位（可能 points 集合非空但官方点缺失 → getPoints 不会插种子）
  const byName = await ensureOfficialPoints()

  // 拼 steps：经过补齐后点位一定在库里，直接取 _id
  const steps = []
  for (const s of SEED_ROUTE.steps) {
    const p = byName[s.pointName]
    if (!p) return [] // 理论到不了这（刚补齐过），防御性兜底：等下次调用
    steps.push({ pointId: p._id, story: s.story, storyEn: s.storyEn })
  }

  await db.collection('routes').add({
    data: {
      routeId: SEED_ROUTE.routeId,
      name: SEED_ROUTE.name,
      nameEn: SEED_ROUTE.nameEn,
      desc: SEED_ROUTE.desc,
      descEn: SEED_ROUTE.descEn,
      bonus: SEED_ROUTE.bonus,
      steps: steps,
      enabled: true,
      createdAt: db.serverDate()
    }
  })

  const again = await db.collection('routes').limit(20).get()
  return again.data
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  try {
    const routes = await ensureRoutes()
    const enabled = routes.filter(r => r.enabled !== false)
    if (enabled.length === 0) return { code: 0, list: [] }

    // 查我的打卡记录（算每个点位 hasVisited）
    let visitedIds = new Set()
    if (OPENID) {
      const recRes = await db.collection('records')
        .where({ openid: OPENID, matched: true, type: nonTextType })
        .field({ pointId: true })
        .get()
      visitedIds = new Set(recRes.data.map(r => r.pointId))
    }

    // 查我的进度（按 routeId 索引）
    const progressMap = {}
    if (OPENID) {
      const progRes = await db.collection('route_progress')
        .where({ openid: OPENID })
        .limit(20)
        .get()
      progRes.data.forEach(p => { progressMap[p.routeId] = p })
    }

    // 组装出参：线路 + 每幕点位详情 + 我的进度
    const list = enabled.map(r => {
      const steps = (r.steps || []).map(s => {
        const visited = visitedIds.has(s.pointId)
        return {
          pointId: s.pointId,
          story: s.story,
          storyEn: s.storyEn,
          visited: visited,
          // isNext 由前端根据 progress.currentIndex 算，这里只给 visited
        }
      })
      const prog = progressMap[r.routeId] || null
      return {
        routeId: r.routeId,
        name: r.name,
        nameEn: r.nameEn,
        desc: r.desc,
        descEn: r.descEn,
        bonus: r.bonus,
        total: steps.length,
        steps: steps,
        progress: prog
          ? {
              currentIndex: prog.currentIndex || 0,
              completed: !!prog.completed,
              completedAt: prog.completedAt || null
            }
          : null
      }
    })

    return { code: 0, list: list }
  } catch (e) {
    console.error('getRoutes 失败：', e)
    const errMsg = e.errMsg || e.message || ''
    // 集合不存在（-502005）是最常见的首次运行错误：routes / route_progress 是 F-17 新增集合，
    // 云开发不会自动建，必须控制台手动创建。给用户明确操作指引，而不是一串 SDK 报错。
    if (errMsg.indexOf('-502005') >= 0 || errMsg.indexOf('collection not exists') >= 0) {
      return { code: -1, msg: '数据库缺少集合：请在云开发控制台 → 数据库 → 新建集合 routes 与 route_progress，然后重新加载' }
    }
    return { code: -1, msg: '线路加载失败：' + errMsg }
  }
}
