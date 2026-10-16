// pages/pk/pk.js —— 好友打卡PK：好友列表 + 对比详情
const app = getApp()
const i18n = require('../../utils/i18n')

Page({
  data: {
    friends: [],
    loading: true,
    dark: false,
    fontScale: 'md',
    lang: i18n.zh,    // 当前语言文案
    showPk: false,    // 是否显示 PK 弹窗
    me: null,         // 我的统计
    friend: null,     // 对方统计
    pkResult: '',     // 胜负文案
    meLastText: '',   // 我的最近打卡
    friendLastText: '' // 对方最近打卡
  },

  onShow: function () {
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang
    })
    wx.setNavigationBarTitle({ title: isEn ? 'Friend PK' : '好友打卡PK' })
    // 语言切换后刷新好友统计文案
    this.refreshFriendTexts()
    this.loadFriends()
  },

  // 按当前语言生成好友统计文案
  refreshFriendTexts: function () {
    const lang = this.data.lang
    const friends = this.data.friends.map(f => ({
      ...f,
      statsText: i18n.format(lang.pk.stats, { total: f.total, success: f.success })
    }))
    if (friends.length) this.setData({ friends: friends })
  },

  // 拉取好友列表
  loadFriends: function () {
    this.setData({ loading: true })
    wx.cloud.callFunction({
      name: 'friends',
      data: { action: 'list' }
    }).then(res => {
      const r = res.result || {}
      if (r.code !== 0) throw new Error(r.msg || '加载失败')
      const lang = this.data.lang
      const friends = (r.friends || []).map(f => ({
        ...f,
        statsText: i18n.format(lang.pk.stats, { total: f.total, success: f.success })
      }))
      this.setData({ friends: friends, loading: false })
    }).catch(err => {
      console.error('加载好友失败：', err)
      this.setData({ loading: false })
      wx.showToast({ title: this.data.lang.pk.loadFail, icon: 'none' })
    })
  },

  // 点击好友 → 拉取 PK 对比
  onFriendTap: function (e) {
    const f = this.data.friends[e.currentTarget.dataset.index]
    if (!f) return
    const lang = this.data.lang
    wx.showLoading({ title: lang.pk.loading })
    wx.cloud.callFunction({
      name: 'friends',
      // 传好友关系记录的 _id（recordId），不传 openid：云函数出参从不给 openid
      data: { action: 'pk', friendRecordId: f.recordId }
    }).then(res => {
      wx.hideLoading()
      const r = res.result || {}
      if (r.code !== 0) throw new Error(r.msg || 'PK失败')
      const me = r.me
      const friend = r.friend
      // 胜负判定：总打卡数优先，平局看成功次数
      let pkResult = lang.pk.tie
      if (me.total > friend.total) {
        pkResult = i18n.format(lang.pk.win, { n: me.total - friend.total })
      } else if (me.total < friend.total) {
        pkResult = i18n.format(lang.pk.lose, { n: friend.total - me.total })
      } else if (me.success > friend.success) {
        pkResult = lang.pk.tieBetter
      } else if (me.success < friend.success) {
        pkResult = lang.pk.tieWorse
      }
      this.setData({
        showPk: true,
        me: me,
        friend: friend,
        pkResult: pkResult,
        meLastText: this.formatTime(me.lastTime, lang),
        friendLastText: this.formatTime(friend.lastTime, lang)
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('PK失败：', err)
      wx.showToast({ title: err.errMsg || err.message || lang.pk.pkFail, icon: 'none' })
    })
  },

  // 云数据库时间 → 日期字符串（无记录显示"暂无"）
  formatTime: function (t, lang) {
    if (!t) return lang.pk.none
    const d = new Date(t)
    if (isNaN(d.getTime())) return lang.pk.none
    const pad = n => (n < 10 ? '0' + n : '' + n)
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  },

  // 关闭 PK 弹窗
  closePk: function () {
    this.setData({ showPk: false })
  },

  // 分享（带我的邀请码，好友点开自动绑定）
  onShareAppMessage: function () {
    const user = app.globalData.userInfo
    const invite = (user && user.inviteCode) || ''
    const title = app.globalData.language === 'en'
      ? 'Voice Check-in Game - check in and PK with me!'
      : '声控打卡游戏｜来和我一起声控打卡PK吧'
    return {
      title: title,
      path: '/pages/index/index' + (invite ? '?invite=' + invite : '')
    }
  },

  // 分享到朋友圈
  onShareTimeline: function () {
    const user = app.globalData.userInfo
    const invite = (user && user.inviteCode) || ''
    const title = app.globalData.language === 'en'
      ? 'Voice Check-in Game - check in and PK with me!'
      : '声控打卡游戏｜来和我一起声控打卡PK吧'
    return {
      title: title,
      query: invite ? 'invite=' + invite : 'from=timeline'
    }
  }
})
