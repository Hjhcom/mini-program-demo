// 全局逻辑：小程序启动时执行
App({
  globalData: {
    userInfo: null // 当前登录用户（含 source 字段：wechat / phone / guest）
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
    // 恢复上次的登录态（本地缓存）
    this.restoreUser()
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
  }
})
