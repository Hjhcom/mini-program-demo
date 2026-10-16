// pages/badges/badges.js —— 成就徽章（F-04）
// 数据全部来自云函数 getBadges：连续打卡天数 + 8 个徽章的解锁状态与进度。
// ⚠️ 本页在 JS 里拼文案（徽章名称、条件、进度），所以 onLoad 就要先把 lang 取好，
//    否则首屏会用 i18n.zh 的默认值渲染，英文模式下残留中文。
const app = getApp()
const i18n = require('../../utils/i18n')

// 每个徽章的「进度」怎么从统计量算出来：文案模板 + 当前值 / 目标值
// 只用于「未解锁」的徽章 —— 让用户看到还差多少，比单纯灰掉更有动力。
const PROGRESS = {
  first: s => ({ tpl: 'pgTimes', n: Math.min(s.successTimes || 0, 1), total: 1 }),
  lark: s => ({ tpl: 'pgDays', n: Math.min(s.maxStreak || 0, 3), total: 3 }),
  marathon: s => ({ tpl: 'pgDays', n: Math.min(s.maxStreak || 0, 7), total: 7 }),
  explorer: s => ({ tpl: 'pgPoints', n: Math.min(s.pointCount || 0, 5), total: 5 }),
  perfect: s => ({ tpl: 'pgSim', n: Math.round(Math.min(s.maxSimilarity || 0, 0.95) * 100), total: 95 }),
  nightOwl: s => ({ tpl: 'pgTimes', n: s.nightOwl ? 1 : 0, total: 1 }),
  taskMaster: s => ({ tpl: 'pgTasks', n: Math.min(s.taskDone || 0, 5), total: 5 }),
  taskPublisher: s => ({ tpl: 'pgTasks', n: Math.min(s.taskPublished || 0, 3), total: 3 })
}

Page({
  data: {
    loggedIn: false,
    loading: true,
    streak: { current: 0, max: 0 }, // 当前连续 / 历史最长（天）
    todayDone: false,               // 今天是否已成功打卡
    badges: [],                     // [{ id, icon, name, cond, got, gotAtText, progress }]
    gotCount: 0,
    total: 0,
    gotTitleText: '',               // 「已解锁 3/8 枚徽章」
    showEmpty: false,               // 一条成功记录都没有 → 显示去打卡引导
    persist: true,                  // false = user_badges 集合没建，徽章没能存下来
    detail: null,                   // 弹窗里的徽章
    dark: false,
    fontScale: 'md',
    lang: i18n.zh
  },

  // 只取语言与全局设置：请求交给 onShow，避免 onLoad + onShow 连发两次
  onLoad: function () {
    this.syncGlobalSettings()
  },

  // 每次显示都刷新：从首页打完卡回来，streak 与新徽章要立刻反映出来
  onShow: function () {
    const lang = this.syncGlobalSettings()
    wx.setNavigationBarTitle({ title: lang.badges.navTitle })
    this.load()
  },

  // 同步深色模式 / 字体大小 / 语言，返回当前语言包
  syncGlobalSettings: function () {
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    this.setData({
      loggedIn: !!app.globalData.userInfo,
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang
    })
    return lang
  },

  load: function () {
    if (!app.globalData.userInfo) {
      this.setData({ loading: false, badges: [], gotCount: 0, total: 0, showEmpty: false })
      return
    }
    this.setData({ loading: true })
    wx.cloud.callFunction({
      name: 'getBadges'
    }).then(res => {
      const r = res.result || {}
      if (r.code !== 0) throw new Error(r.msg || 'load failed')
      this.render(r)
    }).catch(err => {
      console.error('徽章加载失败：', err)
      this.setData({ loading: false })
      wx.showToast({ title: this.data.lang.badges.loadFail, icon: 'none' })
    })
  },

  // 把云函数返回的原始徽章 + 统计量渲染成可展示的列表
  render: function (r) {
    const lang = this.data.lang.badges
    const stats = r.stats || {}
    const list = (r.badges || []).map(b => {
      let progress = ''
      if (!b.got && PROGRESS[b.id]) {
        const p = PROGRESS[b.id](stats)
        progress = i18n.format(lang[p.tpl], { n: p.n, total: p.total })
      }
      return {
        id: b.id,
        icon: b.icon,
        name: lang[b.id] || b.id,
        cond: lang[b.id + 'Cond'] || '',
        got: !!b.got,
        gotAtText: b.got && b.gotAt ? this.formatDate(b.gotAt, false) : '',
        gotAtFull: b.got && b.gotAt ? this.formatDate(b.gotAt, true) : '',
        progress: progress
      }
    })
    const gotCount = list.filter(x => x.got).length
    this.setData({
      loading: false,
      streak: r.streak || { current: 0, max: 0 },
      todayDone: !!r.todayDone,
      badges: list,
      gotCount: gotCount,
      total: list.length,
      gotTitleText: i18n.format(lang.gotTitle, { n: gotCount, total: list.length }),
      showEmpty: (stats.successTimes || 0) === 0,
      persist: r.persist !== false
    })
  },

  // 时间戳 → 'MM-DD'（卡片） 或 'YYYY-MM-DD HH:mm'（弹窗）
  formatDate: function (ms, full) {
    const d = new Date(ms)
    const p = n => (n < 10 ? '0' : '') + n
    const md = p(d.getMonth() + 1) + '-' + p(d.getDate())
    if (!full) return md
    return d.getFullYear() + '-' + md + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
  },

  onBadgeTap: function (e) {
    const item = this.data.badges[e.currentTarget.dataset.index]
    if (item) this.setData({ detail: item })
  },

  closeDetail: function () {
    this.setData({ detail: null })
  },

  goLogin: function () {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  goHome: function () {
    wx.switchTab({ url: '/pages/index/index' })
  },

  onPullDownRefresh: function () {
    this.load()
    wx.stopPullDownRefresh()
  }
})
