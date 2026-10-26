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
    friendLastText: '', // 对方最近打卡
    autoFriendRecordId: '' // 从他人主页带过来的好友句柄，列表就绪后自动 PK
  },

  onLoad: function (options) {
    this.setData({ autoFriendRecordId: (options && options.friendRecordId) || '' })
  },

  onShow: function () {
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang
    })
    wx.setNavigationBarTitle({ title: lang.pk.navTitle })
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
        statsText: i18n.format(lang.pk.stats, { total: f.total, success: f.success }),
        avatarText: (f.nickname || '').charAt(0) || '?'
      }))
      this.setData({ friends: friends, loading: false })
      // 从他人主页带好友句柄进来：列表就绪后自动弹出该好友对比
      if (this.data.autoFriendRecordId) {
        const idx = friends.findIndex(f => f.recordId === this.data.autoFriendRecordId)
        this.setData({ autoFriendRecordId: '' })
        if (idx >= 0) this.doPkByIndex(idx)
      }
    }).catch(err => {
      console.error('加载好友失败：', err)
      this.setData({ loading: false })
      wx.showToast({ title: this.data.lang.pk.loadFail, icon: 'none' })
    })
  },

  // 点击好友 → 拉取 PK 对比
  onFriendTap: function (e) {
    this.doPkByIndex(e.currentTarget.dataset.index)
  },

  // 按列表下标发起 PK 对比
  doPkByIndex: function (index) {
    const f = this.data.friends[index]
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
        me: { ...me, avatarText: (me.nickname || '').charAt(0) || '?' },
        friend: { ...friend, avatarText: (friend.nickname || '').charAt(0) || '?' },
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

  // F2：进入好友主页
  onProfileTap: function (e) {
    const f = this.data.friends[e.currentTarget.dataset.index]
    if (!f) return
    wx.navigateTo({ url: '/pages/user-profile/user-profile?friendRecordId=' + f.recordId })
  },

  // F2：解除好友
  onRemoveTap: function (e) {
    const f = this.data.friends[e.currentTarget.dataset.index]
    if (!f) return
    const lang = this.data.lang.pk
    wx.showModal({
      title: lang.removeTitle,
      content: lang.removeContent,
      confirmColor: '#e64340',
      confirmText: lang.remove,
      cancelText: this.data.lang.common.cancel,
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: lang.removing })
        try {
          const res = await wx.cloud.callFunction({
            name: 'friends',
            data: { action: 'remove', friendRecordId: f.recordId }
          })
          wx.hideLoading()
          if (res.result && res.result.code === 0) {
            wx.showToast({ title: lang.removed, icon: 'success' })
            this.loadFriends()
          } else {
            wx.showToast({ title: (res.result && res.result.msg) || lang.removeFail, icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          console.error('解除好友失败：', err)
          wx.showToast({ title: lang.removeFail, icon: 'none' })
        }
      }
    })
  },

  // 分享（带我的邀请码，好友点开自动绑定）
  onShareAppMessage: function () {
    const user = app.globalData.userInfo
    const invite = (user && user.inviteCode) || ''
    const title = (app.globalData.language === 'en' ? i18n.en : i18n.zh).common.sharePk
    return {
      title: title,
      path: '/pages/index/index' + (invite ? '?invite=' + invite : '')
    }
  },

  // 分享到朋友圈
  onShareTimeline: function () {
    const user = app.globalData.userInfo
    const invite = (user && user.inviteCode) || ''
    const title = (app.globalData.language === 'en' ? i18n.en : i18n.zh).common.sharePk
    return {
      title: title,
      query: invite ? 'invite=' + invite : 'from=timeline'
    }
  }
})
