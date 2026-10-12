// pages/records/records.js —— 我的打卡记录：列表 + 详情
const app = getApp()

Page({
  data: {
    records: [],       // 打卡记录列表
    total: 0,          // 总记录数
    successCount: 0,   // 成功次数
    loading: true,
    showDetail: false, // 是否显示详情弹窗
    detail: null,      // 当前查看的记录
    dark: false,       // 深色模式（全局设置）
    fontScale: 'md'    // 字体大小（全局设置）
  },

  onLoad: function () {
    this.loadRecords()
  },

  // 页面显示：同步全局设置（深色模式 / 字体大小）
  onShow: function () {
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale
    })
  },

  // 加载打卡记录（调 getRecords 云函数）
  loadRecords: function () {
    wx.showLoading({ title: '加载中…' })
    wx.cloud.callFunction({
      name: 'getRecords'
    }).then(res => {
      wx.hideLoading()
      if (res.result.code !== 0) throw new Error(res.result.msg || '加载失败')
      const list = res.result.records || []
      // 补充展示字段：格式化时间、相似度百分比
      const records = list.map(item => ({
        ...item,
        timeText: this.formatTime(item.createTime),
        simText: Math.round((item.similarity || 0) * 100) + '%'
      }))
      this.setData({
        records: records,
        total: res.result.total || records.length,
        successCount: records.filter(r => r.matched).length,
        loading: false
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('加载打卡记录失败：', err)
      wx.showToast({ title: '加载失败，请检查 getRecords 云函数', icon: 'none' })
    })
  },

  // 云数据库时间 → 本地时间字符串
  formatTime: function (t) {
    const d = new Date(t)
    if (isNaN(d.getTime())) return ''
    const pad = n => (n < 10 ? '0' + n : '' + n)
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  },

  // 点击列表项 → 查看详情
  onItemTap: function (e) {
    const item = this.data.records[e.currentTarget.dataset.index]
    if (item) {
      this.setData({ showDetail: true, detail: item })
    }
  },

  // 关闭详情弹窗
  closeDetail: function () {
    this.setData({ showDetail: false })
  },

  // 去首页打卡
  goHome: function () {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
