// pages/task-create/task-create.js —— 发布打卡任务
const app = getApp()

// 有效期选项（用"几小时内有效"替代日期+时间双选择器，简单可靠）
const DURATIONS = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '24 小时', hours: 24 },
  { label: '3 天', hours: 72 }
]

Page({
  data: {
    title: '',            // 任务标题
    desc: '',             // 任务描述
    points: [],           // 可选打卡点（getPoints）
    pointIndex: -1,       // 选中的下标
    selectedPoint: null,  // 选中的打卡点
    durations: DURATIONS.map(d => d.label),
    durationIndex: 2,     // 默认 24 小时
    submitting: false,
    showCode: false,      // 发布成功后显示任务码弹窗
    inviteCode: '',
    dark: false,          // 深色模式（全局设置）
    fontScale: 'md'       // 字体大小（全局设置）
  },

  onLoad: function () {
    this.loadPoints()
  },

  onShow: function () {
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale
    })
  },

  // 拉取打卡点列表，供用户选择
  loadPoints: function () {
    wx.cloud.callFunction({
      name: 'getPoints'
    }).then(res => {
      const points = (res.result && res.result.points) || []
      this.setData({ points: points })
      console.log('可选打卡点：', points.length, '个')
    }).catch(err => {
      console.error('加载打卡点失败：', err)
      wx.showToast({ title: '打卡点加载失败，请检查 getPoints 云函数', icon: 'none' })
    })
  },

  onTitleInput: function (e) {
    this.setData({ title: e.detail.value })
  },

  onDescInput: function (e) {
    this.setData({ desc: e.detail.value })
  },

  // 选择打卡点
  onPointTap: function (e) {
    const i = e.currentTarget.dataset.index
    this.setData({
      pointIndex: i,
      selectedPoint: this.data.points[i]
    })
  },

  // 选择有效期
  onDurationTap: function (e) {
    this.setData({ durationIndex: e.currentTarget.dataset.index })
  },

  // 提交：调 createTask
  onSubmit: function () {
    if (this.data.submitting) return

    const title = this.data.title.trim()
    if (!title) {
      wx.showToast({ title: '请填写任务标题', icon: 'none' })
      return
    }
    const point = this.data.selectedPoint
    if (!point) {
      wx.showToast({ title: '请选择一个打卡点', icon: 'none' })
      return
    }

    // 截止时间 = 当前时间 + 有效期小时数，转成 ISO 字符串给云函数
    const hours = DURATIONS[this.data.durationIndex].hours
    const deadline = new Date(Date.now() + hours * 3600 * 1000).toISOString()

    this.setData({ submitting: true })
    wx.showLoading({ title: '发布中…' })
    wx.cloud.callFunction({
      name: 'createTask',
      data: {
        title: title,
        desc: this.data.desc.trim(),
        pointId: point._id,
        deadline: deadline
      }
    }).then(res => {
      wx.hideLoading()
      this.setData({ submitting: false })
      const r = res.result || {}
      if (r.code !== 0) {
        wx.showModal({ title: '发布失败', content: r.msg || '请稍后重试', showCancel: false })
        return
      }
      console.log('任务发布成功，任务码：', r.inviteCode)
      this.setData({ showCode: true, inviteCode: r.inviteCode })
    }).catch(err => {
      wx.hideLoading()
      this.setData({ submitting: false })
      console.error('发布任务失败：', err)
      wx.showToast({ title: '发布失败，请检查 createTask 云函数', icon: 'none' })
    })
  },

  // 复制任务码
  copyCode: function () {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: '任务码已复制', icon: 'success' })
    })
  },

  // 关闭任务码弹窗 → 回任务列表
  closeCode: function () {
    this.setData({ showCode: false })
    wx.navigateBack()
  }
})
