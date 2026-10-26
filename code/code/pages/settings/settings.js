// pages/settings/settings.js —— 设置页：通用（深色模式 / 字体大小 / 显示语言 / 清除缓存）
const app = getApp()
const i18n = require('../../utils/i18n')

Page({
  data: {
    dark: false,     // 深色模式开关
    fontScale: 'md', // 字体大小：md 标准 / lg 大 / xl 特大
    language: 'zh',  // 显示语言：zh 中文 / en 英文
    lang: i18n.zh,   // 当前语言文案
    cacheSize: '0KB' // 本地缓存大小
  },

  // 每次显示同步最新设置（设置即时生效）
  onShow: function () {
    this.applyLang()
    this.getCacheSize()
  },

  // 应用当前语言并同步全局设置
  applyLang: function () {
    const isEn = app.globalData.language === 'en'
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      language: app.globalData.language,
      lang: isEn ? i18n.en : i18n.zh
    })
    wx.setNavigationBarTitle({ title: this.data.lang.settings.navTitle })
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

  // 个人资料：跳转资料完善/编辑页
  onGoProfile: function () {
    wx.navigateTo({ url: '/pages/profile/profile' })
  },

  // 选择显示语言：立即全局生效并持久化
  onLanguageSelect: function (e) {
    const v = e.currentTarget.dataset.lang
    app.setLanguage(v)
    this.applyLang()
  },

  // 清除缓存：删除本地缓存（保留登录态与设置）
  onClearCache: function () {
    const lang = this.data.lang
    wx.showModal({
      title: lang.settings.cacheTitle,
      content: lang.settings.cacheConfirm,
      success: (res) => {
        if (!res.confirm) return
        try {
          const info = wx.getStorageInfoSync()
          const keys = info.keys || []
          const keep = ['userInfo', 'darkMode', 'fontScale', 'language']
          keys.forEach(k => {
            if (keep.indexOf(k) === -1) wx.removeStorageSync(k)
          })
        } catch (e) {
          console.error('清除缓存失败：', e)
        }
        this.getCacheSize()
        wx.showToast({ title: lang.settings.cacheDone, icon: 'success' })
      }
    })
  }
})
