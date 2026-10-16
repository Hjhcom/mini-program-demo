// pages/task-create/task-create.js —— 发布打卡任务
const app = getApp()
const i18n = require('../../utils/i18n')

// 有效期选项（用"几小时内有效"替代日期+时间双选择器，简单可靠）
// label 随语言变化，运行时从 i18n 取
const DURATIONS = [
  { key: 'dur1', hours: 1 },
  { key: 'dur6', hours: 6 },
  { key: 'dur24', hours: 24 },
  { key: 'dur72', hours: 72 }
]

Page({
  data: {
    title: '',            // 任务标题
    desc: '',             // 任务描述
    points: [],           // 可选打卡点（getPoints）
    pointIndex: -1,       // 选中的下标
    selectedPoint: null,  // 选中的打卡点
    durations: [],        // 有效期选项文案（按语言填充）
    durationIndex: 2,     // 默认 24 小时
    submitting: false,
    showCode: false,      // 发布成功后显示任务码弹窗
    inviteCode: '',
    dark: false,          // 深色模式（全局设置）
    fontScale: 'md',      // 字体大小（全局设置）
    lang: i18n.zh         // 当前语言文案
  },

  // 取当前语言文案（逻辑层用；wxml 用 data.lang）
  getLang: function () {
    return app.globalData.language === 'en' ? i18n.en : i18n.zh
  },

  onLoad: function (options) {
    // F-05：从「创建打卡点」成功后跳过来时带 pointId，加载完点位自动帮用户选上
    this._presetPointId = (options && options.pointId) || ''
    this.loadPoints()
  },

  onShow: function () {
    const lang = this.getLang()
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang,
      durations: DURATIONS.map(d => lang.taskCreate[d.key])
    })
    wx.setNavigationBarTitle({ title: lang.taskCreate.navTitle })
  },

  // 拉取打卡点列表，供用户选择
  loadPoints: function () {
    wx.cloud.callFunction({
      name: 'getPoints'
    }).then(res => {
      const points = (res.result && res.result.points) || []
      this.setData({ points: points })
      console.log('可选打卡点：', points.length, '个')

      // F-05：带 pointId 进来时自动选中对应点位（找不到就保持未选状态，让用户自己选）
      const presetId = this._presetPointId
      if (presetId) {
        this._presetPointId = ''
        const idx = points.findIndex(p => p._id === presetId)
        if (idx > -1) {
          this.setData({ pointIndex: idx, selectedPoint: points[idx] })
        }
      }
    }).catch(err => {
      console.error('加载打卡点失败：', err)
      wx.showToast({ title: this.getLang().taskCreate.pointsFail, icon: 'none' })
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
    const lang = this.getLang()

    const title = this.data.title.trim()
    if (!title) {
      wx.showToast({ title: lang.taskCreate.titleRequired, icon: 'none' })
      return
    }
    const point = this.data.selectedPoint
    if (!point) {
      wx.showToast({ title: lang.taskCreate.pointRequired, icon: 'none' })
      return
    }

    // 截止时间 = 当前时间 + 有效期小时数，转成 ISO 字符串给云函数
    const hours = DURATIONS[this.data.durationIndex].hours
    const deadline = new Date(Date.now() + hours * 3600 * 1000).toISOString()

    this.setData({ submitting: true })
    wx.showLoading({ title: lang.taskCreate.publishing })
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
        wx.showModal({ title: lang.taskCreate.publishFail, content: r.msg || lang.taskCreate.retryLater, showCancel: false })
        return
      }
      console.log('任务发布成功，任务码：', r.inviteCode)
      this.setData({ showCode: true, inviteCode: r.inviteCode })
    }).catch(err => {
      wx.hideLoading()
      this.setData({ submitting: false })
      console.error('发布任务失败：', err)
      wx.showToast({ title: lang.taskCreate.publishFailCloud, icon: 'none' })
    })
  },

  // 复制任务码
  copyCode: function () {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: this.getLang().taskCreate.codeCopied, icon: 'success' })
    })
  },

  // 关闭任务码弹窗 → 回任务列表
  closeCode: function () {
    this.setData({ showCode: false })
    wx.navigateBack()
  }
})
