// 登录页：微信一键登录 → 云端建档 → 进入地图主页
const app = getApp()

Page({
  data: {
    loading: false // 登录中状态（防止重复点击）
  },

  // 点击「微信一键登录」
  onLoginTap: function () {
    if (this.data.loading) return
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'login'
    }).then(res => {
      const user = res.result.user
      app.globalData.userInfo = user
      console.log('登录成功', user)
      wx.showToast({ title: '登录成功', icon: 'success' })
      // 稍等半秒让用户看到提示，再跳转主页
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' })
      }, 500)
    }).catch(err => {
      console.error('登录失败：', err)
      this.setData({ loading: false })
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
    })
  }
})
