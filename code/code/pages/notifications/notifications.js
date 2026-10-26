// pages/notifications/notifications.js
Page({
  data: {
    list: [],
    loading: true
  },

  onShow() {
    this.fetchList()
  },

  onPullDownRefresh() {
    this.fetchList().then(() => wx.stopPullDownRefresh())
  },

  formatTime(t) {
    if (!t) return ''
    const d = new Date(t)
    const now = new Date()
    const diff = (now - d) / 1000
    if (diff < 60) return '刚刚'
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前'
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前'
    return (d.getMonth() + 1) + '-' + d.getDate()
  },

  async fetchList() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'getNotifications' })
      if (res.result && res.result.code === 0) {
        const raw = res.result.list || []
        // 头像 fileID 转临时链接
        const fileIDs = raw.filter(n => n.avatarUrl && n.avatarUrl.startsWith('cloud://')).map(n => n.avatarUrl)
        let urlMap = {}
        if (fileIDs.length > 0) {
          try {
            const ures = await wx.cloud.getTempFileURL({ fileList: fileIDs })
            ures.fileList.forEach(f => { urlMap[f.fileID] = f.tempFileURL })
          } catch (e) {}
        }
        const list = raw.map(n => ({
          ...n,
          avatarUrl: urlMap[n.avatarUrl] || n.avatarUrl,
          timeText: this.formatTime(n.createTime)
        }))
        this.setData({ list, loading: false })
      } else {
        throw new Error((res.result && res.result.msg) || '加载失败')
      }
    } catch (e) {
      console.error('消息加载失败：', e)
      this.setData({ loading: false })
    }
  }
})
