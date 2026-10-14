// 首页逻辑：地图 + 打卡点 + 定位判定 + 录音声控打卡
const app = getApp()
const i18n = require('../../utils/i18n')

// 计算两个经纬度之间的距离（米）——球面距离公式
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000 // 地球半径（米）
  const rad = d => d * Math.PI / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(a))
}

// 录音管理器（页面加载时初始化一次）
const recorder = wx.getRecorderManager()

Page({
  data: {
    // 地图中心点（北京理工大学良乡校区）
    center: {
      longitude: 116.172181,
      latitude: 39.731737
    },
    scale: 14, // 地图缩放级别
    markers: [], // 地图图钉（由数据库数据生成）
    points: [], // 数据库里的打卡点原始数据
    selectedPoint: null, // 当前选中的打卡点
    inRange: false, // 是否已在打卡点范围内（决定是否显示录音按钮）
    recording: false, // 是否正在录音
    isLoggedIn: false, // 是否已登录（未登录不能打卡）
    pendingTask: null, // 指派给我、进行中且未过期的任务（用于底部提示条 + 打卡时带 taskId）
    taskBarDesc: '',   // 任务提示条第二行文案（带占位符，在 JS 里拼好）
    // F-02 点位打卡用户展示
    userCount: 0,        // 该点位打卡成功的人数（按 openid 去重）
    recentUsers: [],     // 最近打卡的玩家 [{ nickname, avatarUrl, initial }]
    usersTitle: '',      // 人数文案（带占位符，wxml 不能调函数所以在这里拼好）
    usersLoading: false, // 玩家数据加载中
    dark: false,       // 深色模式（全局设置）
    fontScale: 'md',   // 字体大小（全局设置）
    lang: i18n.zh,     // 当前语言文案
    tip: i18n.zh.index.tipLoading
  },

  // 页面加载：初始化登录态 + 拉取打卡点 + 初始化录音
  onLoad: function (options) {
    // 来自分享卡片：先把邀请码存起来，登录后自动绑定好友
    if (options && options.invite) {
      try {
        wx.setStorageSync('pendingInvite', options.invite)
      } catch (e) {}
    }

    this.initUser()
    this.loadPoints()

    // 录音停止：上传 + 识别
    recorder.onStop(res => {
      this.onRecordStop(res)
    })
    recorder.onError(err => {
      console.error('录音失败：', err)
      this.setData({ recording: false, tip: i18n.format(this.data.lang.index.errRecord, { msg: err.errMsg || '请检查麦克风权限' }) })
    })
  },

  // 页面显示时同步登录态与全局设置（登录/退出后回来会变化）
  onShow: function () {
    const user = app.globalData.userInfo
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    this.setData({
      isLoggedIn: !!user,
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang
    })
    // 登录后查一下有没有指派给我、还没完成的任务
    if (user) {
      this.loadPendingTask()
    } else {
      this.setData({ pendingTask: null, taskBarDesc: '' })
    }

    wx.setNavigationBarTitle({ title: lang.common.appName })
    // 同步底部 tabBar 文字（tabBar 已渲染，setTabBarItem 才能生效）
    app.applyTabBarLang()
    // 语言切换后，拼好的文案要跟着一起换（不换会残留旧语言）
    if (this.data.selectedPoint && this.data.userCount > 0) {
      this.setData({ usersTitle: i18n.format(lang.index.usersCount, { n: this.data.userCount }) })
    }
    if (this.data.pendingTask) {
      const pt = this.data.pendingTask
      this.setData({ taskBarDesc: i18n.format(lang.index.taskBarDesc, { name: pt.pointName, spell: pt.spell }) })
    }
    this.refreshTip()
    // 处理分享卡片带来的邀请码（好友绑定）
    app.bindPendingInvite()
  },

  // 按当前状态刷新提示语（语言切换后也会调用）
  refreshTip: function () {
    const lang = this.data.lang
    const d = this.data
    if (!d.isLoggedIn) {
      this.setData({ tip: lang.index.tipLoginFirst })
      return
    }
    if (d.recording && d.selectedPoint) {
      this.setData({ tip: i18n.format(lang.index.tipRecording, { spell: d.selectedPoint.spell }) })
      return
    }
    const user = app.globalData.userInfo
    this.setData({ tip: i18n.format(lang.index.tipWelcome, { name: user ? user.nickname : '' }) })
  },

  // 拉取「指派给我、进行中、未过期」的任务，用于底部提示条
  // 失败不阻塞打卡主流程，只清空提示条并在控制台记日志
  loadPendingTask: function () {
    wx.cloud.callFunction({
      name: 'listTasks',
      data: { type: 'assigned' }
    }).then(res => {
      const list = (res.result && res.result.tasks) || []
      const now = new Date()
      const valid = list.filter(t => t.status === 'accepted' && new Date(t.deadline) > now)
      // 若当前已选中某个点位，优先展示该点位上的任务
      const cur = this.data.selectedPoint
      const hit = cur ? valid.find(t => t.pointId === cur._id) : null
      const pendingTask = hit || valid[0] || null
      this.setData({
        pendingTask: pendingTask,
        taskBarDesc: pendingTask
          ? i18n.format(this.data.lang.index.taskBarDesc, { name: pendingTask.pointName, spell: pendingTask.spell })
          : ''
      })
      console.log('待完成任务：', pendingTask)
    }).catch(err => {
      console.error('加载待完成任务失败：', err)
      this.setData({ pendingTask: null, taskBarDesc: '' })
    })
  },

  // 初始化登录态：已有登录态直接用；没有则微信静默登录（云函数识别 openid）
  initUser: function () {
    const user = app.globalData.userInfo
    if (user) {
      this.setData({
        isLoggedIn: true,
        tip: i18n.format(this.data.lang.index.tipWelcome, { name: user.nickname })
      })
      console.log('已有登录态', user)
      return
    }
    this.login()
  },

  // 微信静默登录：调用云函数，拿用户信息并保存全局登录态
  login: function () {
    wx.cloud.callFunction({
      name: 'login'
    }).then(res => {
      const user = res.result.user
      user.source = 'wechat'
      app.setUser(user)
      this.setData({
        isLoggedIn: true,
        tip: i18n.format(this.data.lang.index.tipWelcome, { name: user.nickname })
      })
      console.log('登录成功', user)
    }).catch(err => {
      console.error('登录失败：', err)
      this.setData({ tip: this.data.lang.index.errLogin })
    })
  },

  // 未登录 → 跳转登录方式选择页
  goLogin: function () {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  // 从云数据库读取打卡点，生成地图图钉
  loadPoints: function () {
    wx.cloud.callFunction({
      name: 'getPoints'
    }).then(res => {
      const points = res.result.points
      // 把数据库记录转成地图 marker（id 用下标+1，补宽高）
      const markers = points.map((p, i) => ({
        id: i + 1,
        longitude: p.longitude,
        latitude: p.latitude,
        title: p.name,
        width: 32,
        height: 32
      }))
      this.setData({ points, markers })
      console.log('打卡点加载成功', points)
    }).catch(err => {
      console.error('打卡点加载失败：', err)
      this.setData({ tip: this.data.lang.index.errLoadPoints })
    })
  },

  // 点击地图上的图钉：选中打卡点，显示信息和咒语
  onMarkerTap: function (e) {
    // markerId 是下标+1，倒推回数据库数组下标
    const index = e.detail.markerId - 1
    const p = this.data.points[index]
    if (!p) return
    // 该点位若正好有指派给我的任务，提示语改说「这里有你的任务」
    const t = this.data.pendingTask
    const hasTask = !!(t && t.pointId === p._id)
    this.setData({
      selectedPoint: p,
      inRange: false,
      // F-02：先清空上一个点位的玩家数据，避免看到别人的头像
      userCount: 0,
      usersTitle: '',
      recentUsers: [],
      usersLoading: true,
      tip: hasTask
        ? i18n.format(this.data.lang.index.tipHasTask, { name: p.name, spell: t.spell })
        : i18n.format(this.data.lang.index.tipSelected, { name: p.name, spell: p.spell })
    })
    this.loadPointUsers(p._id)
  },

  // F-02：拉取该点位「打卡成功」的人数与最近打卡的玩家
  // 失败不阻塞打卡主流程，只把加载态收掉（面板显示空态文案）
  loadPointUsers: function (pointId) {
    // 快速连点不同图钉时，先发的请求可能后回来把数据盖掉 —— 用序号丢弃过期响应
    this._usersSeq = (this._usersSeq || 0) + 1
    const seq = this._usersSeq
    wx.cloud.callFunction({
      name: 'getPointUsers',
      data: { pointId: pointId }
    }).then(res => {
      if (seq !== this._usersSeq) return // 已有更新的请求，丢弃这次结果
      const r = res.result || {}
      if (r.code !== 0) throw new Error(r.msg || '加载失败')
      const lang = this.data.lang
      // 无头像时显示昵称首字（wxml 里不便做字符串下标，这里先算好）
      const users = (r.recentUsers || []).map(u => {
        const name = u.nickname || lang.index.usersFallbackName
        return { nickname: name, avatarUrl: u.avatarUrl || '', initial: name.charAt(0) }
      })
      const count = r.userCount || 0
      this.setData({
        userCount: count,
        recentUsers: users,
        usersTitle: count > 0 ? i18n.format(this.data.lang.index.usersCount, { n: count }) : '',
        usersLoading: false
      })
    }).catch(err => {
      if (seq !== this._usersSeq) return
      console.error('获取打卡用户失败：', err)
      this.setData({ usersLoading: false })
    })
  },

  // 选中点位 → 跳发布任务页（F-01 × F-02 联动）
  goCreateTask: function () {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: this.data.lang.index.loginFirst, icon: 'none' })
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' })
      }, 800)
      return
    }
    wx.navigateTo({ url: '/pages/task-create/task-create' })
  },

  // 定位打卡：获取当前位置，判断是否在打卡点围栏内（需先登录）
  checkIn: function () {
    const lang = this.data.lang
    if (!this.data.isLoggedIn) {
      // 未登录：提示并跳转登录界面
      wx.showToast({ title: lang.index.loginFirst, icon: 'none' })
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' })
      }, 800)
      return
    }
    const p = this.data.selectedPoint
    if (!p) {
      this.setData({ tip: lang.index.tipSelectPoint })
      return
    }

    wx.getLocation({
      type: 'gcj02', // 与腾讯地图坐标系一致
      success: res => {
        // 调试用：打印当前真实 GPS 坐标（校准打卡点后可删）
        console.log('📍 我的当前位置：经度', res.longitude, '纬度', res.latitude,
                    '｜打卡点坐标：经度', p.longitude, '纬度', p.latitude)
        const dist = getDistance(res.latitude, res.longitude, p.latitude, p.longitude)
        if (dist <= p.radius) {
          this.setData({
            inRange: true,
            tip: i18n.format(lang.index.tipInRange, { name: p.name, dist: Math.round(dist) })
          })
          console.log('在范围内，距离：', Math.round(dist), '米')
        } else {
          this.setData({
            inRange: false,
            tip: i18n.format(lang.index.tipTooFar, { name: p.name, dist: Math.round(dist - p.radius) })
          })
        }
      },
      fail: err => {
        console.error('定位失败：', err)
        this.setData({ tip: i18n.format(lang.index.errLocation, { msg: err.errMsg || '请检查定位权限' }) })
      }
    })
  },

  // 跳转到打卡记录页
  goRecords: function () {
    wx.navigateTo({ url: '/pages/records/records' })
  },

  // 跳转到打卡任务页（点击底部任务提示条）
  goTask: function () {
    wx.navigateTo({ url: '/pages/task/task' })
  },

  // 说咒语按钮：开始录音 / 停止录音（需先登录）
  onRecordTap: function () {
    if (!this.data.isLoggedIn) {
      // 未登录：提示并跳转登录界面
      wx.showToast({ title: this.data.lang.index.loginFirst, icon: 'none' })
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' })
      }, 800)
      return
    }
    if (this.data.recording) {
      // 正在录音 → 停止
      recorder.stop()
      return
    }
    // 开始录音：16kHz 单声道 wav（讯飞要求 8k/16k 采样率）
    recorder.start({
      duration: 10000, // 最长 10 秒
      sampleRate: 16000,
      numberOfChannels: 1,
      format: 'wav'
    })
    // 该点位若有待完成任务，提示语里的咒语用任务里的
    const t = this.data.pendingTask
    const spell = (t && t.pointId === this.data.selectedPoint._id) ? t.spell : this.data.selectedPoint.spell
    this.setData({
      recording: true,
      tip: i18n.format(this.data.lang.index.tipRecording, { spell: spell })
    })
  },

  // 录音停止：上传云存储 → 调 voiceCheckin 识别比对
  onRecordStop: function (res) {
    const lang = this.data.lang
    this.setData({ recording: false, tip: lang.index.tipRecognizing })
    const tempFilePath = res.tempFilePath
    const cloudPath = 'voice/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.wav'

    const point = this.data.selectedPoint
    const pending = this.data.pendingTask
    // 只有"任务的点位 == 当前打卡点位"时才带 taskId（任务必须到指定点位完成）
    const taskId = (pending && pending.pointId === point._id) ? pending._id : ''

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath
    }).then(up => {
      // 上传成功 → 调用语音打卡云函数（带 taskId 时按任务里的咒语判定）
      return wx.cloud.callFunction({
        name: 'voiceCheckin',
        data: {
          fileID: up.fileID,
          pointId: point._id,
          taskId: taskId
        }
      })
    }).then(res => {
      const r = res.result || {}
      // 任务校验失败（任务不存在 / 状态异常 / 不属于你 / 已超时）时先兜住 msg
      if (r.code !== 0) {
        this.setData({ tip: '⚠️ ' + (r.msg || '打卡失败，请重试') })
        return
      }
      if (r.matched) {
        this.setData({
          tip: i18n.format(lang.index.tipSuccess, {
            text: r.recognizedText,
            sim: Math.round(r.similarity * 100)
          })
        })
        console.log('打卡成功', r)
        // 任务打卡成功 → 刷新待完成任务（该任务已变成已完成）
        if (taskId) this.loadPendingTask()
        // 我刚打卡成功 → 刷新头像墙，让「我」立刻出现在名单里
        if (point && this.data.selectedPoint && this.data.selectedPoint._id === point._id) {
          this.loadPointUsers(point._id)
        }
      } else {
        this.setData({
          tip: i18n.format(lang.index.tipMismatch, { text: r.recognizedText })
        })
      }
    }).catch(err => {
      console.error('打卡失败：', err)
      this.setData({ tip: i18n.format(lang.index.errCheckin, { msg: err.errMsg || '请检查 voiceCheckin 云函数' }) })
    })
  },

  // 右上角「...」菜单 → 转发给朋友：分享首页（带我的邀请码）
  onShareAppMessage: function () {
    const user = app.globalData.userInfo
    const invite = (user && user.inviteCode) || ''
    const title = app.globalData.language === 'en'
      ? 'Voice Check-in Game - say the spell to check in!'
      : '声控打卡游戏｜到打卡点念出咒语，完成打卡！'
    return {
      title: title,
      path: '/pages/index/index' + (invite ? '?invite=' + invite : '')
    }
  },

  // 右上角「...」菜单 → 分享到朋友圈
  onShareTimeline: function () {
    const user = app.globalData.userInfo
    const invite = (user && user.inviteCode) || ''
    const title = app.globalData.language === 'en'
      ? 'Voice Check-in Game - say the spell to check in!'
      : '声控打卡游戏｜到打卡点念出咒语，完成打卡！'
    return {
      title: title,
      query: invite ? 'invite=' + invite : 'from=timeline'
    }
  }
})
