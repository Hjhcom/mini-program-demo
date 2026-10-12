// pages/mine/mine.js —— 我的页面：登录引导 / 用户信息 + 功能入口
const app = getApp()

Page({
  data: {
    user: null,
    avatarDisplay: '', // 头像展示链接（云 fileID 转临时 https 链接）
    needProfile: false // 微信/手机号用户资料不全 → 显示完善入口
  },

  // 每次显示都同步最新的登录态（登录/退出后回到本页会刷新）
  onShow() {
    const user = app.globalData.userInfo
    this.setData({ user })
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
    // 我的打卡记录：未登录先登录，已登录跳转记录页
    if (type === '打卡记录') {
      if (!this.data.user) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        setTimeout(() => {
          wx.navigateTo({ url: '/pages/login/login' })
        }, 800)
        return
      }
      wx.navigateTo({ url: '/pages/records/records' })
      return
    }
    wx.showToast({
      title: '「' + type + '」功能建设中，敬请期待',
      icon: 'none'
    })
  },

  // 退出登录：清除本地登录态，回到未登录引导状态
  onLogout: function () {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.clearUser()
          this.setData({ user: null, avatarDisplay: '' })
          wx.showToast({ title: '已退出登录', icon: 'success' })
        }
      }
    })
  }
})
