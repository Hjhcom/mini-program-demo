// 全局逻辑：小程序启动时执行
const i18n = require('./utils/i18n')

App({
  globalData: {
    userInfo: null,   // 当前登录用户（含 source 字段：wechat / phone / guest）
    darkMode: false,  // 深色模式
    fontScale: 'md',  // 字体大小：md 标准 / lg 大 / xl 特大
    language: 'zh',   // 显示语言：zh 中文 / en English
    // F-05：自建打卡点成功后置 true，首页 onShow 看到它就重拉一次点位。
    // 用这个标记而不是"每次 onShow 都重拉"，是为了避免每次切 Tab 都打一次 getPoints。
    pointsDirty: false,
    // F-09：点位列表页选中某个点位后把 _id 放这里再返回。
    // 首页是 tabBar 页、没法带 query 跳回来，只能靠 globalData 传这一棒；
    // 首页 applyPendingPoint() 消费后立刻清空，避免下次进首页又选中一次。
    pendingPointId: '',
    // N2：通知点击带来的待高亮动态 recordId，动态流 onShow 消费后清空。
    pendingHighlightRecordId: ''
  },

  onLaunch: function () {
    // 初始化云开发（必须在小程序启动时做一次）
    if (!wx.cloud) {
      console.error('当前微信版本过低，无法使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-d2gled32od1bdcb02',
        traceUser: true
      })
    }
    // 恢复上次的登录态与设置（本地缓存）
    this.restoreUser()
    this.restoreSettings()
  },
  // 从本地缓存恢复登录态
  restoreUser: function () {
    try {
      const user = wx.getStorageSync('userInfo')
      if (user) this.globalData.userInfo = user
    } catch (e) {
      console.error('恢复登录态失败：', e)
    }
  },

  // 保存登录态（内存 + 本地缓存）
  setUser: function (user) {
    this.globalData.userInfo = user
    try {
      wx.setStorageSync('userInfo', user)
    } catch (e) {
      console.error('保存登录态失败：', e)
    }
  },

  // 清除登录态（退出登录）
  clearUser: function () {
    this.globalData.userInfo = null
    try {
      wx.removeStorageSync('userInfo')
    } catch (e) {
      console.error('清除登录态失败：', e)
    }
  },

  // 恢复深色模式 / 字体大小 / 语言设置
  restoreSettings: function () {
    try {
      const dark = wx.getStorageSync('darkMode')
      if (typeof dark === 'boolean') this.globalData.darkMode = dark
      const fs = wx.getStorageSync('fontScale')
      if (['md', 'lg', 'xl'].indexOf(fs) > -1) this.globalData.fontScale = fs
      const lang = wx.getStorageSync('language')
      if (lang === 'zh' || lang === 'en') this.globalData.language = lang
    } catch (e) {
      console.error('恢复设置失败：', e)
    }
  },

  // 设置深色模式（全局生效）
  setDarkMode: function (v) {
    this.globalData.darkMode = v
    try {
      wx.setStorageSync('darkMode', v)
    } catch (e) {
      console.error('保存深色模式失败：', e)
    }
  },

  // 设置字体大小（全局生效）
  setFontScale: function (v) {
    this.globalData.fontScale = v
    try {
      wx.setStorageSync('fontScale', v)
    } catch (e) {
      console.error('保存字体大小失败：', e)
    }
  },

  // 设置显示语言（全局生效：zh 中文 / en 英文）
  setLanguage: function (v) {
    if (v !== 'zh' && v !== 'en') return
    this.globalData.language = v
    try {
      wx.setStorageSync('language', v)
    } catch (e) {
      console.error('保存语言设置失败：', e)
    }
    // 同步底部 tabBar 文字
    this.applyTabBarLang()
  },

  // 同步底部 tabBar 文字到当前语言（官方 tabBar 文字是静态配置，需用 setTabBarItem 动态设置）
  applyTabBarLang: function () {
    if (!wx.setTabBarItem) return
    const isEn = this.globalData.language === 'en'
    wx.setTabBarItem({ index: 0, text: isEn ? 'Home' : '首页' })
    wx.setTabBarItem({ index: 1, text: isEn ? 'Feed' : '动态' })
    wx.setTabBarItem({ index: 2, text: isEn ? 'Messages' : '消息' })
    wx.setTabBarItem({ index: 3, text: isEn ? 'Mine' : '我的' })
  },

  // N1：刷新「消息」tab 未读角标。不带 markRead，只统计未读数，不改变已读状态。
  refreshNotificationBadge: function () {
    if (!wx.cloud || !wx.setTabBarBadge) return
    wx.cloud.callFunction({ name: 'getNotifications', data: { markRead: false } })
      .then(res => {
        const r = res.result || {}
        if (r.code !== 0) return
        const unread = r.unread || 0
        if (unread > 0) {
          wx.setTabBarBadge({ index: 2, text: String(unread) })
        } else {
          wx.removeTabBarBadge({ index: 2 })
        }
      })
      .catch(err => console.error('刷新通知角标失败：', err))
  },

  // 处理分享卡片带来的邀请码：登录后自动与邀请人互为好友
  bindPendingInvite: function () {
    let invite = ''
    try {
      invite = wx.getStorageSync('pendingInvite') || ''
    } catch (e) {}
    if (!invite) return
    try {
      wx.removeStorageSync('pendingInvite')
    } catch (e) {}
    const user = this.globalData.userInfo
    // 未登录 / 游客 / 自己的邀请码 → 不处理
    if (!user || user.source === 'guest' || user.inviteCode === invite) return

    wx.cloud.callFunction({
      name: 'friends',
      data: { action: 'add', inviteCode: invite }
    }).then(res => {
      const r = res.result || {}
      if (r.code === 0) {
        const lang = this.globalData.language === 'en' ? i18n.en : i18n.zh
        const title = r.already
          ? lang.common.friendAlready
          : i18n.format(lang.common.friendAdded, { name: (r.friend && r.friend.nickname) || '' })
        wx.showToast({ title: title, icon: 'none' })
      } else if (r.msg) {
        wx.showToast({ title: r.msg, icon: 'none' })
      }
    }).catch(err => {
      console.error('绑定邀请失败：', err)
    })
  }
})
