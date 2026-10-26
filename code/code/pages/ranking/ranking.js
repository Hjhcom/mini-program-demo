// pages/ranking/ranking.js —— 积分排行榜：玩家榜 / 点位榜（F-03 / 文档 3.3）
// 数据来源：getRanking 云函数（积分实时聚合，服务端已剥掉 openid）
const app = getApp()
const i18n = require('../../utils/i18n')

// 名次徽标样式：前三名金银铜，其余用普通样式
const RANK_CLASS = ['', 'gold', 'silver', 'bronze']

Page({
  data: {
    tab: 'user',        // 当前 Tab：user 玩家榜 / point 点位榜
    period: 'all',       // 时间范围：week 本周 / month 本月 / all 总榜
    list: [],           // 玩家榜
    pointList: [],      // 点位榜
    me: null,           // 我的排名（未上榜 / 游客为 null）
    meSub: '',          // 我的排名副标题（JS 里拼好，wxml 不能调函数）
    limit: 50,          // 榜单上限（用于底部「仅展示前 N 名」提示）
    loadedUser: false,  // 玩家榜是否已加载过（切换 Tab 不重复请求）
    loadedPoint: false,
    loading: true,
    showDetail: false,  // 积分明细弹窗
    detail: null,
    detailRows: [],
    showRules: false,   // 积分规则弹窗
    rulesRows: [],
    dark: false,        // 深色模式（全局设置）
    fontScale: 'md',    // 字体大小（全局设置）
    lang: i18n.zh       // 当前语言文案
  },

  onLoad: function () {
    // ⚠️ 本页会在 JS 里拼文案（副标题、明细行），所以 onLoad 就要把 lang 取好，
    //    否则首次进入时用的是 i18n.zh 默认值 → 英文模式下首屏会残留中文。
    const isEn = app.globalData.language === 'en'
    this.setData({
      lang: isEn ? i18n.en : i18n.zh,
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale
    })
    this._renderedLang = app.globalData.language // 记录列表是用哪套语言渲染的
    this.load('user')
  },

  // 每次显示同步全局设置（深色模式 / 字体大小 / 语言）
  onShow: function () {
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang
    })
    wx.setNavigationBarTitle({ title: lang.ranking.navTitle })
    // 在设置页切换过语言 → 列表里拼好的文案要按新语言重算
    if (this._renderedLang && this._renderedLang !== app.globalData.language) {
      if (this.data.loadedUser) this.load('user')
      if (this.data.loadedPoint) this.load('point')
    }
  },

  // 下拉刷新：重新拉当前 Tab
  onPullDownRefresh: function () {
    this.load(this.data.tab).then(() => wx.stopPullDownRefresh())
  },

  // 切换 Tab
  onTab: function (e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.tab) return
    this.setData({ tab: tab })
    const loaded = tab === 'point' ? this.data.loadedPoint : this.data.loadedUser
    if (!loaded) this.load(tab)
  },

  // 切换时间范围：本周/本月/总榜 → 强制重新拉当前 tab
  onPeriod: function (e) {
    const period = e.currentTarget.dataset.period
    if (!period || period === this.data.period) return
    this.setData({ period: period, loadedUser: false, loadedPoint: false })
    this.load(this.data.tab)
  },

  // 拉排行榜数据（type: user / point）
  load: function (type) {
    const t = type || 'user'
    this.setData({ loading: true })
    return wx.cloud.callFunction({ name: 'getRanking', data: { type: t, period: this.data.period } })
      .then(res => {
        const r = res.result || {}
        if (r.code !== 0) throw new Error(r.msg || 'load fail')
        if (t === 'point') {
          const pointList = (r.list || []).map(i => ({
            rank: i.rank,
            rankClass: RANK_CLASS[i.rank] || '',
            pointName: i.pointName,
            times: i.times,
            userCount: i.userCount,
            subText: i18n.format(this.data.lang.ranking.pointSub, {
              times: i.times, users: i.userCount
            })
          }))
          this.setData({ pointList: pointList, loadedPoint: true, loading: false })
          this._renderedLang = app.globalData.language
        } else {
          // 规则常量由后端回传，保证明细弹窗与后端用同一套口径
          this.rules = r.points || { checkin: 10, taskDone: 20, taskPublished: 5, streakStep: 5, streakCap: 5 }
          const list = (r.list || []).map(i => this.decorate(i))
          const me = r.me ? this.decorate(r.me) : null
          this.setData({
            list: list,
            me: me,
            meSub: me ? i18n.format(this.data.lang.ranking.meSub, { rank: me.rank }) : '',
            limit: r.limit || 50,
            loadedUser: true,
            loading: false
          })
          this._renderedLang = app.globalData.language
        }
      })
      .catch(err => {
        console.error('加载排行榜失败：', err)
        this.setData({ loading: false })
        wx.showToast({ title: this.data.lang.ranking.loadFail, icon: 'none' })
      })
  },

  // 把后端返回的一条记录加工成 wxml 直接可用的字段
  decorate: function (i) {
    const lang = this.data.lang
    const nickname = i.nickname || lang.ranking.anonymous
    return {
      rank: i.rank,
      rankClass: RANK_CLASS[i.rank] || '',
      nickname: nickname,
      initial: nickname.charAt(0), // 无头像时的占位字（wxml 里不便做字符串下标）
      avatarUrl: i.avatarUrl || '',
      points: i.points,
      successTimes: i.successTimes,
      pointCount: i.pointCount,
      taskDone: i.taskDone,
      taskPublished: i.taskPublished,
      streakBonus: i.streakBonus,
      isMe: !!i.isMe,
      subText: i18n.format(lang.ranking.userSub, {
        times: i.successTimes, points: i.pointCount
      })
    }
  },

  // 点击玩家 → 积分明细
  onItemTap: function (e) {
    const item = this.data.list[e.currentTarget.dataset.index]
    if (!item) return
    this.openDetail(item)
  },

  // 点击「我的排名」卡 → 也是明细
  onMeTap: function () {
    if (this.data.me) this.openDetail(this.data.me)
  },

  // 组装积分明细（每一项都写清「几次 × 多少分」，方便评审时解释）
  openDetail: function (item) {
    const L = this.data.lang.ranking
    const P = this.rules || { checkin: 10, taskDone: 20, taskPublished: 5, streakStep: 5, streakCap: 5 }
    const rows = [
      { label: i18n.format(L.dCheckin, { n: item.successTimes, unit: P.checkin }), value: '+' + (item.successTimes * P.checkin) },
      { label: i18n.format(L.dTaskDone, { n: item.taskDone, unit: P.taskDone }), value: '+' + (item.taskDone * P.taskDone) },
      { label: i18n.format(L.dTaskPub, { n: item.taskPublished, unit: P.taskPublished }), value: '+' + (item.taskPublished * P.taskPublished) },
      { label: L.dStreak, value: '+' + item.streakBonus },
      { label: L.dTotal, value: item.points, total: true }
    ]
    this.setData({ showDetail: true, detail: item, detailRows: rows })
  },

  closeDetail: function () {
    this.setData({ showDetail: false })
  },

  // 积分规则弹窗
  onRulesTap: function () {
    const L = this.data.lang.ranking
    const P = this.rules || { checkin: 10, taskDone: 20, taskPublished: 5, streakStep: 5, streakCap: 5 }
    this.setData({
      showRules: true,
      rulesRows: [
        i18n.format(L.ruleCheckin, { n: P.checkin }),
        i18n.format(L.ruleTaskDone, { n: P.taskDone }),
        i18n.format(L.ruleTaskPub, { n: P.taskPublished }),
        i18n.format(L.ruleStreak, { step: P.streakStep, cap: P.streakCap }),
        L.ruleNote
      ]
    })
  },

  closeRules: function () {
    this.setData({ showRules: false })
  },

  // 去首页打卡
  goHome: function () {
    wx.switchTab({ url: '/pages/index/index' })
  },

  // F-10：分享时带上我的战绩（积分 + 名次）
  // 「来看看谁排第一」是站在旁观者角度，不如「我拿了 XX 分」有说服力；
  // 拿不到我的数据（未登录/加载失败）时退回通用文案。
  // 顺带把原先硬编码的中英文标题迁进语言包（与「状态→文案键」的既有约定一致）。
  onShareAppMessage: function () {
    const user = app.globalData.userInfo
    const invite = (user && user.inviteCode) || ''
    return {
      title: this.shareTitle(),
      path: '/pages/index/index' + (invite ? '?invite=' + invite : '')
    }
  },

  // 右上角「...」菜单 → 分享到朋友圈
  onShareTimeline: function () {
    const user = app.globalData.userInfo
    const invite = (user && user.inviteCode) || ''
    return {
      title: this.shareTitle(),
      query: invite ? 'invite=' + invite : 'from=timeline'
    }
  },

  // 拼分享标题：有我的积分就带战绩，没有就用通用文案
  shareTitle: function () {
    const L = this.data.lang.ranking
    const me = this.data.me
    const hasScore = !!me && typeof me.points === 'number' && typeof me.rank === 'number'
    return hasScore
      ? i18n.format(L.shareMine, { points: me.points, rank: me.rank })
      : L.shareDefault
  }
})
