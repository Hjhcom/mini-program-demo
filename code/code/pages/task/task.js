// pages/task/task.js —— 打卡任务：我发布的 / 我接的
const app = getApp()

// 任务状态 → 展示文案与徽标样式（与云函数里 status 的 4 个取值一一对应）
const STATUS_MAP = {
  pending: { text: '待接受', cls: 'pending' },
  accepted: { text: '进行中', cls: 'accepted' },
  completed: { text: '已完成', cls: 'ok' },
  expired: { text: '已过期', cls: 'fail' }
}

Page({
  data: {
    tab: 'created', // created 我发布的 / assigned 我接的
    tasks: [],      // 任务列表（已补展示字段）
    loading: true,
    loggedIn: false, // 是否已登录
    dark: false,     // 深色模式（全局设置）
    fontScale: 'md'  // 字体大小（全局设置）
  },

  // 每次显示都同步全局设置并刷新列表（从发布页返回时能看到新任务）
  onShow: function () {
    this.setData({
      loggedIn: !!app.globalData.userInfo,
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale
    })
    this.loadTasks()
  },

  // 下拉刷新（task.json 里已开启 enablePullDownRefresh）
  onPullDownRefresh: function () {
    this.loadTasks(function () {
      wx.stopPullDownRefresh()
    })
  },

  // 切换 Tab：我发布的 / 我接的
  onTabTap: function (e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab: tab })
    this.loadTasks()
  },

  // 拉取任务列表（调 listTasks 云函数，type 按 Tab 切换）
  loadTasks: function (done) {
    const user = app.globalData.userInfo
    if (!user) {
      this.setData({ tasks: [], loading: false })
      if (done) done()
      return
    }
    this.setData({ loading: true })
    wx.cloud.callFunction({
      name: 'listTasks',
      data: { type: this.data.tab }
    }).then(res => {
      const r = res.result || {}
      if (r.code !== 0) throw new Error(r.msg || '加载失败')
      const tasks = (r.tasks || []).map(item => this.decorate(item))
      this.setData({ tasks: tasks, loading: false })
      if (done) done()
    }).catch(err => {
      console.error('加载任务列表失败：', err)
      this.setData({ loading: false })
      if (done) done()
      wx.showToast({ title: '加载失败，请检查 listTasks 云函数', icon: 'none' })
    })
  },

  // 给任务补上展示用字段（状态文案、时间文案、能否复制任务码）
  decorate: function (t) {
    const st = STATUS_MAP[t.status] || { text: t.status || '未知', cls: 'fail' }
    return {
      ...t,
      statusText: st.text,
      statusCls: st.cls,
      deadlineText: this.formatTime(t.deadline),
      // 我发布的、且还没人接受 → 点卡片可复制任务码
      canCopyCode: t.status === 'pending' && this.data.tab === 'created'
    }
  },

  // 云数据库时间 → 本地时间字符串
  formatTime: function (t) {
    const d = new Date(t)
    if (isNaN(d.getTime())) return '—'
    const pad = n => (n < 10 ? '0' + n : '' + n)
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  },

  // 点击任务卡片
  onTaskTap: function (e) {
    const t = this.data.tasks[e.currentTarget.dataset.index]
    if (!t) return
    // 待接受 → 复制任务码，方便发给好友
    if (t.canCopyCode) {
      wx.setClipboardData({
        data: t.inviteCode,
        success: () => wx.showToast({ title: '任务码已复制', icon: 'success' })
      })
      return
    }
    // 其他状态 → 显示详情
    wx.showModal({
      title: t.title,
      content: '点位：' + t.pointName +
        '\n咒语：' + t.spell +
        '\n截止：' + t.deadlineText +
        '\n状态：' + t.statusText,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 接受任务：弹出输入框填 6 位任务码
  onAcceptTap: function () {
    if (!app.globalData.userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.showModal({
      title: '输入任务码',
      editable: true,
      placeholderText: '请输入好友给你的 6 位任务码',
      success: res => {
        if (!res.confirm) return
        const code = String(res.content || '').trim()
        if (!/^\d{6}$/.test(code)) {
          wx.showToast({ title: '任务码应为 6 位数字', icon: 'none' })
          return
        }
        this.acceptTask(code)
      }
    })
  },

  // 调 acceptTask 云函数接受任务
  acceptTask: function (code) {
    wx.showLoading({ title: '接受中…' })
    wx.cloud.callFunction({
      name: 'acceptTask',
      data: { inviteCode: code }
    }).then(res => {
      wx.hideLoading()
      const r = res.result || {}
      if (r.code !== 0) {
        wx.showModal({ title: '接受失败', content: r.msg || '任务码无效', showCancel: false })
        return
      }
      wx.showToast({ title: '任务已接受', icon: 'success' })
      // 直接切到「我接的」Tab，让用户马上看到新任务
      this.setData({ tab: 'assigned' })
      this.loadTasks()
    }).catch(err => {
      wx.hideLoading()
      console.error('接受任务失败：', err)
      wx.showToast({ title: '接受失败，请检查 acceptTask 云函数', icon: 'none' })
    })
  },

  // 发布新任务 → 跳发布页
  goCreate: function () {
    if (!app.globalData.userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/task-create/task-create' })
  },

  // 去首页打卡（空状态下的引导）
  goHome: function () {
    wx.switchTab({ url: '/pages/index/index' })
  },

  // 未登录 → 跳登录页
  goLogin: function () {
    wx.navigateTo({ url: '/pages/login/login' })
  }
})
