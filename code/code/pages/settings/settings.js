// pages/settings/settings.js —— 设置页：通用（深色模式 / 字体大小 / 清除缓存）
const app = getApp()

Page({
  data: {
    dark: false,     // 深色模式开关
    fontScale: 'md', // 字体大小：md 标准 / lg 大 / xl 特大
    cacheSize: '0KB' // 本地缓存大小
  },

  // 每次显示同步最新设置（设置即时生效）
  onShow: function () {
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale
    })
    this.getCacheSize()
  },

  // 读取本地缓存大小
  getCacheSize: function () {
    try {
      const info = wx.getStorageInfoSync()
      this.setData({ cacheSize: (info.currentSize / 1024).toFixed(1) + 'KB' })
    } catch (e) {
      this.setData({ cacheSize: '0KB' })
    }
  },

  // 深色模式开关：立即全局生效并持久化
  onDarkChange: function (e) {
    const v = e.detail.value
    app.setDarkMode(v)
    this.setData({ dark: v })
  },

  // 选择字体大小：立即全局生效并持久化
  onFontSelect: function (e) {
    const v = e.currentTarget.dataset.font
    app.setFontScale(v)
    this.setData({ fontScale: v })
  },

  // 清除缓存：删除本地缓存（保留登录态与设置）
  onClearCache: function () {
    wx.showModal({
      title: '清除缓存',
      content: '将清除本地缓存数据（登录状态与设置会保留），确定吗？',
      success: (res) => {
        if (!res.confirm) return
        try {
          const info = wx.getStorageInfoSync()
          const keys = info.keys || []
          const keep = ['userInfo', 'darkMode', 'fontScale']
          keys.forEach(k => {
            if (keep.indexOf(k) === -1) wx.removeStorageSync(k)
          })
        } catch (e) {
          console.error('清除缓存失败：', e)
        }
        this.getCacheSize()
        wx.showToast({ title: '缓存已清除', icon: 'success' })
      }
    })
  }
})
