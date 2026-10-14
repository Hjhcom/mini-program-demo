// pages/splash/splash.js —— 启动封面：展示 5 秒后自动跳转首页
Page({
  data: {
    countdown: 5 // 封面倒计时（秒）
  },

  // 页面显示时开始倒计时
  onShow: function () {
    this.startCountdown()
  },

  // 5 秒倒计时，结束后跳转首页
  startCountdown: function () {
    if (this.timer) clearInterval(this.timer)
    this.setData({ countdown: 5 })
    this.timer = setInterval(() => {
      const left = this.data.countdown - 1
      if (left <= 0) {
        clearInterval(this.timer)
        this.timer = null
        this.goHome()
      } else {
        this.setData({ countdown: left })
      }
    }, 1000)
  },

  // 跳过按钮：立即进入首页
  onSkip: function () {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.goHome()
  },

  // 跳转首页（tab 页必须用 switchTab）
  goHome: function () {
    wx.switchTab({ url: '/pages/index/index' })
  },

  // 页面卸载：清理定时器，防止泄漏
  onUnload: function () {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
})
