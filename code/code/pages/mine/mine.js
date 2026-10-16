// pages/mine/mine.js —— 我的页面：登录引导 / 用户信息 + 功能入口
const app = getApp()
const i18n = require('../../utils/i18n')

Page({
  data: {
    user: null,
    avatarDisplay: '', // 头像展示链接（云 fileID 转临时 https 链接）
    needProfile: false, // 微信/手机号用户资料不全 → 显示完善入口
    dark: false,        // 深色模式（全局设置）
    fontScale: 'md',    // 字体大小（全局设置）
    lang: i18n.zh       // 当前语言文案
  },

  // 每次显示都同步最新的登录态（登录/退出后回到本页会刷新）
  onShow() {
    const user = app.globalData.userInfo
    const isEn = app.globalData.language === 'en'
    this.setData({
      user,
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: isEn ? i18n.en : i18n.zh
    })
    wx.setNavigationBarTitle({ title: isEn ? 'Mine' : '我的' })
    // 同步底部 tabBar 文字（tabBar 已渲染，setTabBarItem 才能生效）
    app.applyTabBarLang()
    console.log('【我的页 onShow】nickname=', user ? user.nickname : null, 'avatarUrl=', user ? user.avatarUrl : null)

    // 资料不全（无头像或默认昵称）→ 显示「完善头像昵称」按钮
    let needProfile = false
    if (user && user.source !== 'guest') {
      const nick = user.nickname || ''
      needProfile = !user.avatarUrl || nick === '打卡玩家' || nick.indexOf('手机用户') === 0
    }
    this.setData({ needProfile: needProfile })

    // 微信用户：头像存的是云存储 fileID，转成临时链接用于展示
    if (user && user.avatarUrl) {
      if (user.avatarUrl.indexOf('cloud://') === 0) {
        wx.cloud.getTempFileURL({
          fileList: [user.avatarUrl]
        }).then(res => {
          const f = res.fileList && res.fileList[0]
          console.log('【头像转链】tempFileURL=', f && f.tempFileURL ? f.tempFileURL : '无（检查云存储）')
          if (f && f.tempFileURL) {
            this.setData({ avatarDisplay: f.tempFileURL })
          }
        }).catch(err => {
          console.error('头像链接转换失败：', err)
        })
      } else {
        this.setData({ avatarDisplay: user.avatarUrl })
      }
    } else {
      this.setData({ avatarDisplay: '' })
    }

    // 老用户本地缓存可能缺 inviteCode：登录云函数已支持补齐，这里刷新一次
    if (user && user.source !== 'guest' && !user.inviteCode) {
      this.refreshUser()
    }
  },

  // 刷新用户信息（补齐邀请码等新字段）
  refreshUser: function () {
    wx.cloud.callFunction({ name: 'login' }).then(res => {
      const r = res.result || {}
      if (r.code === 0 && r.user) {
        app.setUser(r.user)
        this.setData({ user: r.user })
        // 头像云 fileID → 临时链接
        if (r.user.avatarUrl) {
          if (r.user.avatarUrl.indexOf('cloud://') === 0) {
            wx.cloud.getTempFileURL({ fileList: [r.user.avatarUrl] }).then(rr => {
              const f = rr.fileList && rr.fileList[0]
              if (f && f.tempFileURL) this.setData({ avatarDisplay: f.tempFileURL })
            }).catch(() => {})
          } else {
            this.setData({ avatarDisplay: r.user.avatarUrl })
          }
        }
      }
    }).catch(err => {
      console.error('刷新用户信息失败：', err)
    })
  },

  // 未登录 → 跳转登录方式选择页
  goLogin: function () {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  // 微信用户资料不全（无头像/默认昵称）→ 直达头像昵称授权弹窗
  goProfile: function () {
    wx.navigateTo({ url: '/pages/login/login?mode=profile' })
  },

  // 功能列表项点击
  onItemTap: function (e) {
    const type = e.currentTarget.dataset.type
    const lang = this.data.lang
    // 我的打卡记录：未登录先登录，已登录跳转记录页
    if (type === 'records') {
      if (!this.data.user) {
        wx.showToast({ title: lang.mine.loginFirst, icon: 'none' })
        setTimeout(() => {
          wx.navigateTo({ url: '/pages/login/login' })
        }, 800)
        return
      }
      wx.navigateTo({ url: '/pages/records/records' })
      return
    }
    // 打卡任务：未登录先登录，已登录跳转任务页
    if (type === 'task') {
      if (!this.data.user) {
        wx.showToast({ title: lang.mine.loginFirst, icon: 'none' })
        setTimeout(() => {
          wx.navigateTo({ url: '/pages/login/login' })
        }, 800)
        return
      }
      wx.navigateTo({ url: '/pages/task/task' })
      return
    }
    // 好友 PK：未登录先登录；游客不支持
    if (type === 'pk') {
      if (!this.data.user) {
        wx.showToast({ title: lang.mine.loginFirst, icon: 'none' })
        setTimeout(() => {
          wx.navigateTo({ url: '/pages/login/login' })
        }, 800)
        return
      }
      if (this.data.user.source === 'guest') {
        wx.showToast({ title: lang.mine.guestNoPk, icon: 'none' })
        return
      }
      wx.navigateTo({ url: '/pages/pk/pk' })
      return
    }
    // 积分排行榜：不需要登录也能看（游客没有云端数据时只显示榜单本身）
    if (type === 'ranking') {
      wx.navigateTo({ url: '/pages/ranking/ranking' })
      return
    }
    // 成就徽章：徽章挂在个人打卡数据上，未登录先去登录
    if (type === 'badges') {
      if (!this.data.user) {
        wx.showToast({ title: lang.mine.loginFirst, icon: 'none' })
        setTimeout(() => {
          wx.navigateTo({ url: '/pages/login/login' })
        }, 800)
        return
      }
      wx.navigateTo({ url: '/pages/badges/badges' })
      return
    }
    // 设置：跳转设置页（深色模式 / 字体大小 / 显示语言 / 清除缓存）
    if (type === 'settings') {
      wx.navigateTo({ url: '/pages/settings/settings' })
      return
    }
    wx.showToast({
      title: i18n.format(lang.mine.building, { type: lang.mine.about }),
      icon: 'none'
    })
  },

  // 复制我的邀请码
  copyInvite: function () {
    const user = this.data.user || {}
    if (!user.inviteCode) {
      wx.showToast({ title: this.data.lang.mine.noInviteYet, icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: user.inviteCode,
      success: () => wx.showToast({ title: this.data.lang.mine.copied, icon: 'success' })
    })
  },

  // 退出登录：清除本地登录态，回到未登录引导状态
  onLogout: function () {
    const lang = this.data.lang
    wx.showModal({
      title: '提示',
      content: lang.mine.logoutConfirm,
      success: (res) => {
        if (res.confirm) {
          app.clearUser()
          this.setData({ user: null, avatarDisplay: '' })
          wx.showToast({ title: lang.mine.logoutDone, icon: 'success' })
        }
      }
    })
  },

  // 右上角「...」菜单 → 转发给朋友：带我的邀请码，好友点开自动绑定
  onShareAppMessage: function () {
    const user = this.data.user || {}
    const invite = user.inviteCode || ''
    const title = app.globalData.language === 'en'
      ? 'Voice Check-in Game - check in with me!'
      : '声控打卡游戏｜来和我一起声控打卡吧'
    return {
      title: title,
      path: '/pages/index/index' + (invite ? '?invite=' + invite : '')
    }
  },

  // 右上角「...」菜单 → 分享到朋友圈
  onShareTimeline: function () {
    const user = this.data.user || {}
    const invite = user.inviteCode || ''
    const title = app.globalData.language === 'en'
      ? 'Voice Check-in Game - check in with me!'
      : '声控打卡游戏｜来和我一起声控打卡吧'
    return {
      title: title,
      query: invite ? 'invite=' + invite : 'from=timeline'
    }
  }
})
