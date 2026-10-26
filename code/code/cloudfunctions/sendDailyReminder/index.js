// 每日打卡提醒：给"昨天打卡但今天还没打"的用户发订阅消息
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TEMPLATE_ID = 'rkifRfeYEoXnC6dV4ay-meqVpu2VbSTsNZfk8iUfqbk'

// UTC+8 日期工具
function dayKeyOf(d) {
  const dt = new Date(d.getTime() + 8 * 3600 * 1000)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

exports.main = async () => {
  const now = new Date()
  const today = dayKeyOf(now)
  const yesterday = dayKeyOf(new Date(now.getTime() - 24 * 3600 * 1000))

  // 1) 昨天有打卡的用户
  const yesterdayRes = await db.collection('records')
    .where({ dayKey: yesterday, matched: true })
    .field({ openid: true })
    .get()
  const yesterdayUsers = new Set(yesterdayRes.data.map(r => r.openid))

  // 2) 今天已经打卡的用户
  const todayRes = await db.collection('records')
    .where({ dayKey: today, matched: true })
    .field({ openid: true })
    .get()
  const todayUsers = new Set(todayRes.data.map(r => r.openid))

  // 3) 需要提醒的 = 昨天打过 且 今天还没打
  const needRemind = [...yesterdayUsers].filter(openid => !todayUsers.has(openid))

  let sent = 0, failed = 0
  for (const openid of needRemind) {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: openid,
        templateId: TEMPLATE_ID,
        page: 'pages/index/index',
        data: {
          thing1: { value: '你昨天打卡了，今天别断档' },
          time2: { value: today + ' 09:00' },
          thing3: { value: '连续打卡奖励等你拿' }
        }
      })
      sent++
    } catch (e) {
      // 用户没订阅 / 配额用完 / 拒绝，静默跳过
      failed++
    }
  }

  return { today, yesterday, needRemind: needRemind.length, sent, failed }
}
