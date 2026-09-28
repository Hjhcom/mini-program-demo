// 登录页：微信一键登录 + 手机号授权登录
const app = getApp()

Page({
  data: {
    loading: false
  },

  onLoad: function () {
    // 本地已有登录态（缓存过用户信息），直接进首页
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      wx.redirectTo({ url: '/pages/index/index' })
    }
  },

  // 微信一键登录：调用云函数 login，微信自动识别身份（openid），无需弹窗授权
  onWechatLogin: function () {
    if (this.data.loading) return
    this.setData({ loading: true })
    wx.showLoading({ title: '登录中...', mask: true })

    wx.cloud.callFunction({ name: 'login' })
      .then(res => {
        const user = res.result.user
        app.globalData.userInfo = user
        wx.setStorageSync('userInfo', user) // 缓存登录态
        wx.hideLoading()
        wx.redirectTo({ url: '/pages/index/index' })
      })
      .catch(err => {
        console.error('登录失败：', err)
        wx.hideLoading()
        this.setData({ loading: false })
        wx.showToast({ title: '登录失败，请重试', icon: 'none' })
      })
  },

  // 手机号授权登录：点击按钮后微信弹出手机号授权框，拿到 code 交给云函数解密
  onGetPhone: function (e) {
    const code = e.detail.code
    if (!code) {
      // 用户点了拒绝，或基础库版本过低
      wx.showToast({ title: '未授权手机号', icon: 'none' })
      return
    }
    if (this.data.loading) return
    this.setData({ loading: true })
    wx.showLoading({ title: '登录中...', mask: true })

    wx.cloud.callFunction({
      name: 'login',
      data: { phoneCode: code }
    })
      .then(res => {
        const user = res.result.user
        app.globalData.userInfo = user
        wx.setStorageSync('userInfo', user)
        wx.hideLoading()
        wx.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/index/index' })
        }, 600)
      })
      .catch(err => {
        console.error('手机号登录失败：', err)
        wx.hideLoading()
        this.setData({ loading: false })
        wx.showToast({ title: '手机号获取失败，请检查小程序认证状态', icon: 'none' })
      })
  }
})
