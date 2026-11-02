// pages/dashboard/dashboard.js —— 数据大屏（答辩投屏页）
// 数据源：getDashboardData 云函数（原生调用，零跨域零付费）
// 失败自动兜底演示数据并标注「演示数据」，答辩不翻车；30 秒自动刷新
const app = getApp()
const i18n = require('../../utils/i18n')

const demo = {
  totalCheckins: 486, todayCheckins: 37, activeUsers: 96, totalPoints: 12, litPoints: 9,
  recentCheckins: [
    { nickname: '用户 A', pointName: '文萃楼B', spell: '我爱文萃', time: Date.now() - 90 * 1000 },
    { nickname: '用户 B', pointName: '综教楼A', spell: '延安根军工魂', time: Date.now() - 5 * 60 * 1000 },
    { nickname: '用户 C', pointName: '文博中心', spell: '明德精工', time: Date.now() - 18 * 60 * 1000 },
    { nickname: '用户 D', pointName: '甘棠园7D', spell: '学以精工', time: Date.now() - 42 * 60 * 1000 },
    { nickname: '用户 E', pointName: '中心花园', spell: '听风', time: Date.now() - 1.2 * 3600 * 1000 }
  ],
  rankingTop: [
    { rank: 1, nickname: '用户 A', count: 58 }, { rank: 2, nickname: '用户 B', count: 49 },
    { rank: 3, nickname: '用户 C', count: 41 }, { rank: 4, nickname: '用户 D', count: 36 },
    { rank: 5, nickname: '用户 E', count: 30 }
  ],
  routeStats: { totalRoutes: 1, participants: 32, completed: 11, rate: 34 },
  pointHeat: [
    { name: '文萃楼B', count: 132 }, { name: '甘棠园7D', count: 104 }, { name: '综教楼A', count: 87 },
    { name: '文博中心', count: 76 }, { name: '中心花园', count: 42 }
  ]
}

const pad = n => (n < 10 ? '0' + n : '' + n)
const fmtClock = t => {
  const d = new Date(t)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

Page({
  data: {
    lang: i18n.zh,
    isDemo: false,
    todayCheckins: 0,
    totalCheckins: 0,
    activeUsers: 0,
    litPoints: 0,
    totalPoints: 0,
    recentCheckins: [],
    rankingTop: [],
    pointHeat: [],
    routeRate: 0,
    heatMax: 1,
    updatedText: '--',
    refreshLabel: ''
  },

  onLoad() {
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    this.setData({ lang, refreshLabel: lang.dashboard.refresh })
    wx.setNavigationBarTitle({ title: lang.dashboard.navTitle })
    this.load()
    this._timer = setInterval(() => this.load(), 30000)
  },

  onUnload() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  },

  onPullDownRefresh() {
    this.load(() => wx.stopPullDownRefresh())
  },

  load(done) {
    wx.cloud.callFunction({ name: 'getDashboardData' })
      .then(res => {
        const r = res.result
        if (r && r.code === 0) this.render(r, false)
        else this.render(demo, true)
      })
      .catch(err => {
        console.warn('大屏数据拉取失败，切换演示数据：', err)
        this.render(demo, true)
      })
      .then(() => done && done())
  },

  render(d, isDemo) {
    const heatMax = Math.max(1, ...d.pointHeat.map(h => h.count))
    const lang = this.data.lang
    const recent = (d.recentCheckins || []).slice(0, 5).map(it => ({
      nickname: it.nickname,
      pointName: it.pointName,
      spell: it.spell,
      timeText: this.relTime(it.time)
    }))
    const rank = (d.rankingTop || []).slice(0, 5).map((r, i) => ({
      rank: r.rank || i + 1,
      nickname: r.nickname,
      count: r.count,
      medal: r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : ''
    }))
    this.setData({
      isDemo,
      todayCheckins: d.todayCheckins || 0,
      totalCheckins: d.totalCheckins || 0,
      activeUsers: d.activeUsers || 0,
      litPoints: d.litPoints || 0,
      totalPoints: d.totalPoints || 0,
      recentCheckins: recent,
      rankingTop: rank,
      pointHeat: (d.pointHeat || []).slice(0, 5),
      routeRate: (d.routeStats && d.routeStats.rate) || 0,
      heatMax,
      updatedText: fmtClock(d.generatedAt || Date.now()) + ' ' + lang.dashboard.updated
    })
  },

  relTime(t) {
    const diff = (Date.now() - new Date(t).getTime()) / 1000
    const l = this.data.lang
    if (diff < 60) return l.dashboard.justNow
    if (diff < 3600) return Math.floor(diff / 60) + ' ' + l.dashboard.minAgo
    if (diff < 86400) return Math.floor(diff / 3600) + ' ' + l.dashboard.hourAgo
    return fmtClock(t).slice(5)
  }
})
