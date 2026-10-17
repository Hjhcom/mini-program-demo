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

  // F-10：从分享卡片进来时，路径里带 inviteCode（好友把任务分享给你）
  // 这里只把码存起来，真正处理放到 onShow —— onLoad 时登录态可能还没准备好
  onLoad: function (options) {
    const code = options && options.inviteCode
    if (code && /^\d{6}$/.test(String(code))) {
      this._pendingCode = String(code)
    }
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
    // F-10：分享卡片带进来的任务码，等登录态确定之后才处理（未登录先留着）
    this.consumePendingCode()
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

  // ===== F-10 分享与邀请 =====

  // 处理分享链接带进来的任务码
  // 未登录 → 只提示一次（这时弹确认框也接不了），登录后回到本页 onShow 会再走一遍
  // 已登录 → 弹确认框，确认就调 acceptTask
  consumePendingCode: function () {
    const code = this._pendingCode
    if (!code) return
    const lang = this.getLang()
    if (!app.globalData.userInfo) {
      if (!this._inviteHinted) {
        this._inviteHinted = true
        wx.showToast({ title: lang.task.inviteLoginFirst, icon: 'none' })
      }
      return
    }
    // 处理过就清掉，否则每次 onShow（比如从别的页面返回）都会再弹一次
    this._pendingCode = ''
    wx.showModal({
      title: lang.task.inviteTitle,
      content: i18n.format(lang.task.inviteContent, { code: code }),
      success: res => {
        if (!res.confirm) return
        this.acceptTask(code)
      }
    })
  },

  // 空方法：只用来 catchtap 挡住冒泡（分享按钮位于可点击的任务卡片里）
  noop: function () {},

  // 转发
  //  · 点任务卡片上的「分享给好友」按钮（from === 'button'）→ 分享这一条任务，路径带任务码
  //  · 右上角「...」菜单 → 分享首页并带我的邀请码（比分享一个空任务页更有拉新价值）
  onShareAppMessage: function (res) {
    const lang = this.getLang()
    const ds = (res && res.target && res.target.dataset) || {}
    if (res && res.from === 'button' && ds.code) {
      return {
        title: i18n.format(lang.task.shareTitle, { name: ds.title || '' }),
        path: '/pages/task/task?inviteCode=' + ds.code
      }
    }
    const user = app.globalData.userInfo
    const invite = (user && user.inviteCode) || ''
    return {
      title: lang.task.shareDefault,
      path: '/pages/index/index' + (invite ? '?invite=' + invite : '')
    }
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
