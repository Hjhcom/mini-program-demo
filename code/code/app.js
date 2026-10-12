// 全局逻辑：小程序启动时执行
App({
  globalData: {
    userInfo: null,   // 当前登录用户（含 source 字段：wechat / phone / guest）
    darkMode: false,  // 深色模式
    fontScale: 'md'   // 字体大小：md 标准 / lg 大 / xl 特大
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

  // 恢复深色模式 / 字体大小设置
  restoreSettings: function () {
    try {
      const dark = wx.getStorageSync('darkMode')
      if (typeof dark === 'boolean') this.globalData.darkMode = dark
      const fs = wx.getStorageSync('fontScale')
      if (['md', 'lg', 'xl'].indexOf(fs) > -1) this.globalData.fontScale = fs
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
  }
})
