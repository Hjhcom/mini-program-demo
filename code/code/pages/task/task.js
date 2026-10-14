// pages/task/task.js —— 打卡任务：我发布的 / 我接的
const app = getApp()
const i18n = require('../../utils/i18n')

// 任务状态 → 文案键 + 徽标样式（与云函数里 status 的 4 个取值一一对应）
const STATUS_KEY = {
  pending: { key: 'statusPending', cls: 'pending' },
  accepted: { key: 'statusAccepted', cls: 'accepted' },
  completed: { key: 'statusCompleted', cls: 'ok' },
  expired: { key: 'statusExpired', cls: 'fail' }
}

Page({
  data: {
    tab: 'created', // created 我发布的 / assigned 我接的
    tasks: [],      // 任务列表（已补展示字段）
    loading: true,
    loggedIn: false, // 是否已登录
    dark: false,     // 深色模式（全局设置）
    fontScale: 'md', // 字体大小（全局设置）
    lang: i18n.zh    // 当前语言文案
  },

  // 取当前语言文案（逻辑层用；wxml 用 data.lang）
  getLang: function () {
    return app.globalData.language === 'en' ? i18n.en : i18n.zh
  },

  // 每次显示都同步全局设置并刷新列表（从发布页返回时能看到新任务）
  onShow: function () {
    const lang = this.getLang()
    this.setData({
      loggedIn: !!app.globalData.userInfo,
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang
    })
    wx.setNavigationBarTitle({ title: lang.task.navTitle })
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
      if (r.code !== 0) throw new Error(r.msg || 'load fail')
      const tasks = (r.tasks || []).map(item => this.decorate(item))
      this.setData({ tasks: tasks, loading: false })
      if (done) done()
    }).catch(err => {
      console.error('加载任务列表失败：', err)
      this.setData({ loading: false })
      if (done) done()
      wx.showToast({ title: this.getLang().task.loadFail, icon: 'none' })
    })
  },

  // 给任务补上展示用字段（状态文案、时间文案、能否复制任务码）
  decorate: function (t) {
    const lang = this.getLang()
    const st = STATUS_KEY[t.status]
    return {
      ...t,
      statusText: st ? lang.task[st.key] : (t.status || lang.task.statusUnknown),
      statusCls: st ? st.cls : 'fail',
      deadlineText: this.formatTime(t.deadline),
      // 「任务码 123456 · 点击复制」——wxml 不能调函数，这里先拼好
      codeText: i18n.format(lang.task.codeHint, { code: t.inviteCode || '' }),
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
    const lang = this.getLang()
    // 待接受 → 复制任务码，方便发给好友
    if (t.canCopyCode) {
      wx.setClipboardData({
        data: t.inviteCode,
        success: () => wx.showToast({ title: lang.task.codeCopied, icon: 'success' })
      })
      return
    }
    // 其他状态 → 显示详情
    wx.showModal({
      title: t.title,
      content: lang.task.detailPoint + t.pointName +
        '\n' + lang.task.detailSpell + t.spell +
        '\n' + lang.task.detailDeadline + t.deadlineText +
        '\n' + lang.task.detailStatus + t.statusText,
      showCancel: false,
      confirmText: lang.task.gotIt
    })
  },

  // 接受任务：弹出输入框填 6 位任务码
  onAcceptTap: function () {
    const lang = this.getLang()
    if (!app.globalData.userInfo) {
      wx.showToast({ title: lang.task.loginFirst, icon: 'none' })
      return
    }
    wx.showModal({
      title: lang.task.acceptTitle,
      editable: true,
      placeholderText: lang.task.acceptPlaceholder,
      success: res => {
        if (!res.confirm) return
        const code = String(res.content || '').trim()
        if (!/^\d{6}$/.test(code)) {
          wx.showToast({ title: lang.task.codeFormatErr, icon: 'none' })
          return
        }
        this.acceptTask(code)
      }
    })
  },

  // 调 acceptTask 云函数接受任务
  acceptTask: function (code) {
    const lang = this.getLang()
    wx.showLoading({ title: lang.task.accepting })
    wx.cloud.callFunction({
      name: 'acceptTask',
      data: { inviteCode: code }
    }).then(res => {
      wx.hideLoading()
      const r = res.result || {}
      if (r.code !== 0) {
        wx.showModal({ title: lang.task.acceptFail, content: r.msg || lang.task.codeInvalid, showCancel: false })
        return
      }
      wx.showToast({ title: lang.task.acceptSuccess, icon: 'success' })
      // 直接切到「我接的」Tab，让用户马上看到新任务
      this.setData({ tab: 'assigned' })
      this.loadTasks()
    }).catch(err => {
      wx.hideLoading()
      console.error('接受任务失败：', err)
      wx.showToast({ title: lang.task.acceptFailCloud, icon: 'none' })
    })
  },

  // 发布新任务 → 跳发布页
  goCreate: function () {
    if (!app.globalData.userInfo) {
      wx.showToast({ title: this.getLang().task.loginFirst, icon: 'none' })
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
