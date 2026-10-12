// 打卡记录页：从 records 集合读取当前用户的打卡历史
const app = getApp()

Page({
  data: {
    list: [],
    loading: true
  },

  onShow() {
    this.loadRecords()
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadRecords()
    wx.stopPullDownRefresh()
  },

  loadRecords() {
    const openid = app.globalData.userInfo && app.globalData.userInfo.openid
    if (!openid) {
      this.setData({ loading: false })
      return
    }
    wx.cloud.database().collection('records')
      .where({ openid: openid })
      .orderBy('createTime', 'desc')
      .limit(50)
      .get()
      .then(res => {
        const list = res.data.map(r => ({
          ...r,
          timeText: this.fmtTime(r.createTime)
        }))
        this.setData({ list: list, loading: false })
      })
      .catch(err => {
        console.error('记录加载失败：', err)
        this.setData({ loading: false })
      })
  },

  fmtTime(d) {
    if (!d) return ''
    const t = new Date(d)
    const p = n => (n < 10 ? '0' : '') + n
    return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate()) +
      ' ' + p(t.getHours()) + ':' + p(t.getMinutes())
  }
})
