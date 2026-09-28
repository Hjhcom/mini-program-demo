// 全局逻辑：小程序启动时执行
App({
  globalData: {
    userInfo: null // 登录后存放用户信息
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
  }
})
