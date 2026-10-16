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

// F-05：地图图钉图标 —— 官方点位深蓝、玩家自建橙色（两张 PNG 与同名 wxss 色值保持一致）
const MARKER_OFFICIAL = '/images/marker/point-official.png'
const MARKER_CUSTOM = '/images/marker/point-custom.png'
// 举报原因（key 顺序必须与 index.reportReasons 文案顺序一致，见 onReportTap）
const REPORT_REASONS = ['fake', 'improper', 'duplicate', 'other']

// ===== F-07 打卡结果反馈动效 =====
// 成功打卡的基础积分。⚠️ 这是 cloudfunctions/getRanking/lib/points.js 里 POINTS.checkin 的
// 前端副本（前端拿不到云函数文件，云函数各自独立打包也不能互相 require）——
// **改积分规则时两处都要改**，否则庆祝卡片上的「+10 分」会和排行榜算出来的分对不上。
// 这里只展示「打卡」这一项的基础分；连续打卡奖励（+5×min(n,5)）是另一条规则，另计。
const CHECKIN_POINTS = 10
// 撒花碎片色板（与项目主色 + 图钉色一致）
const CONFETTI_COLORS = ['#e05a3a', '#f0b429', '#1f9d6b', '#1f4e79', '#c2509a', '#3aa8c1']
const CONFETTI_COUNT = 14

// 生成一批撒花碎片（纯随机、纯函数，不依赖 this 与 wx）
// left/delay/dur 都随机，是为了每次庆祝的落点都不一样，看起来像"撒"出来的而不是循环播放。
function buildConfetti() {
  const list = []
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    list.push({
      id: i,
      left: Math.round(Math.random() * 92) + 2,                    // 2% ~ 94%
      delay: Math.round(Math.random() * 600) / 1000,               // 0 ~ 0.6s
      dur: Math.round(1200 + Math.random() * 700) / 1000,          // 1.2 ~ 1.9s
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      w: 12 + Math.round(Math.random() * 10),                      // 碎片宽（rpx）
      h: 20 + Math.round(Math.random() * 12),                      // 碎片高（rpx）
      round: Math.random() < 0.35                                  // 约 1/3 是圆点
    })
  }
  return list
}

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
    // F-05 自建点位
    canReport: false,    // 当前选中点位是否可举报（别人建的玩家点位才可举报）
    reportReasons: [],   // 举报原因文案（按语言填充，顺序与 REPORT_REASONS 对应）
    // F-07 打卡结果反馈动效
    celebrate: false,    // 是否显示成功庆祝层（整屏撒花 + 居中结果卡）
    confetti: [],        // 撒花碎片（每次庆祝重新随机生成）
    celebrateTitle: '',  // 结果卡标题
    celebratePoints: '', // 结果卡积分（"+10 分"，在 JS 里拼好）
    celebrateSub: '',    // 结果卡副标题（"你说的是…相似度…"，在 JS 里拼好）
    feedback: null,      // 失败提示条 { title, sub }；null = 不显示
    shake: false,        // 录音按钮是否抖动（失败时置 true，动画结束清掉）
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
      lang: lang,
      // F-05：举报原因文案按语言刷新（顺序固定，与 REPORT_REASONS 一一对应）
      reportReasons: REPORT_REASONS.map(k => lang.index['report_' + k])
    })
    // 登录后查一下有没有指派给我、还没完成的任务
    if (user) {
      this.loadPendingTask()
    } else {
      this.setData({ pendingTask: null, taskBarDesc: '' })
    }

    // F-05：自建点位成功、或点位被举报隐藏后回到首页 → 重拉一次点位。
    // 用 pointsDirty 标记而不是每次都重拉，避免每切一次 Tab 都打一次 getPoints。
    if (app.globalData.pointsDirty) {
      app.globalData.pointsDirty = false
      this.loadPoints()
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

  // 页面卸载：清掉 F-07 动效的三个定时器（页面都销毁了还去 setData 会报错刷屏）
  onUnload: function () {
    clearTimeout(this._celebrateTimer)
    clearTimeout(this._feedbackTimer)
    clearTimeout(this._shakeTimer)
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
      const points = (res.result && res.result.points) || []
      // 把数据库记录转成地图 marker（id 用下标+1，补宽高）
      // F-05：官方点位与玩家自建点位用不同颜色的图钉；callout 让点图钉时弹出点位名
      const markers = points.map((p, i) => ({
        id: i + 1,
        longitude: p.longitude,
        latitude: p.latitude,
        title: p.name,
        width: 32,
        height: 32,
        iconPath: p.isOfficial ? MARKER_OFFICIAL : MARKER_CUSTOM,
        callout: {
          content: p.name,
          color: '#ffffff',
          fontSize: 12,
          borderRadius: 6,
          borderWidth: 0,
          bgColor: p.isOfficial ? '#1f4e79' : '#e8842c',
          padding: 6,
          display: 'BYCLICK',
          textAlign: 'center'
        }
      }))
      this.setData({ points, markers })
      console.log('打卡点加载成功', points.length, '个')

      // 点位被重拉过（新建点位 / 举报隐藏）后，之前选中的点位可能已经不在列表里了：
      // 还在就换成最新数据，不在就清空选中，避免面板继续显示一个图上已经消失的点位。
      const cur = this.data.selectedPoint
      if (cur) {
        const fresh = points.filter(p => p._id === cur._id)[0]
        if (fresh) {
          this.setData({
            selectedPoint: fresh,
            canReport: !fresh.isMine && !fresh.isOfficial
          })
        } else {
          this.setData({
            selectedPoint: null,
            inRange: false,
            canReport: false,
            userCount: 0,
            usersTitle: '',
            recentUsers: []
          })
          this.refreshTip()
        }
      }
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
      // F-05：只有"别人建的玩家点位"才给举报入口（自己建的可自己删/改，官方点位由管理员维护）
      canReport: !p.isMine && !p.isOfficial,
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

  // 未登录统一处理：提示 + 稍后跳登录页。返回 true 表示「已被拦下，调用方应直接 return」。
  // （原先这段在 checkIn / onRecordTap / goCreateTask 里各抄了一遍，F-05 又要用第 4 次，抽出来）
  requireLogin: function () {
    if (this.data.isLoggedIn) return false
    wx.showToast({ title: this.data.lang.index.loginFirst, icon: 'none' })
    setTimeout(() => {
      wx.navigateTo({ url: '/pages/login/login' })
    }, 800)
    return true
  },

  // 选中点位 → 跳发布任务页（F-01 × F-02 联动）
  goCreateTask: function () {
    if (this.requireLogin()) return
    wx.navigateTo({ url: '/pages/task-create/task-create' })
  },

  // F-05：跳「创建打卡点」页
  goCreatePoint: function () {
    if (this.requireLogin()) return
    wx.navigateTo({ url: '/pages/point-create/point-create' })
  },

  // F-05：举报当前选中的玩家自建点位（内容安全）。
  // 只对「别人建的玩家点位」开放 —— 自己建的没必要举报，官方点位由管理员维护。
  onReportTap: function () {
    if (this.requireLogin()) return
    const p = this.data.selectedPoint
    if (!p || !this.data.canReport) return
    const lang = this.data.lang
    wx.showActionSheet({
      // reportReasons 在 onShow 里按语言拼好，顺序与 REPORT_REASONS 一一对应
      itemList: this.data.reportReasons,
      success: (res) => {
        const reason = REPORT_REASONS[res.tapIndex]
        if (reason) this.submitReport(p, reason)
      },
      fail: () => {} // 用户取消，不处理
    })
  },

  // 提交举报
  submitReport: function (point, reason) {
    const lang = this.data.lang
    wx.showLoading({ title: lang.index.reporting })
    wx.cloud.callFunction({
      name: 'reportPoint',
      data: { pointId: point._id, reason: reason }
    }).then(res => {
      wx.hideLoading()
      const r = res.result || {}
      if (r.code !== 0) {
        wx.showToast({ title: r.msg || lang.index.reportFail, icon: 'none' })
        return
      }
      // already = 之前已经举报过（唯一索引挡下的重复举报）
      wx.showToast({
        title: r.already ? lang.index.reportAlready : lang.index.reportDone,
        icon: r.already ? 'none' : 'success'
      })
      // 举报数达到阈值 → 后端已把点位隐藏，图上少一个点，重拉一次点位
      if (r.hidden) {
        this.setData({
          selectedPoint: null,
          inRange: false,
          canReport: false,
          userCount: 0,
          usersTitle: '',
          recentUsers: []
        })
        app.globalData.pointsDirty = true
        this.loadPoints()
        this.refreshTip()
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('举报失败：', err)
      wx.showToast({ title: lang.index.reportFail, icon: 'none' })
    })
  },

  // 定位打卡：获取当前位置，判断是否在打卡点围栏内（需先登录）
  checkIn: function () {
    const lang = this.data.lang
    if (this.requireLogin()) return
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

  // 跳转到积分排行榜（F-03，不需要登录也能看榜单）
  goRanking: function () {
    wx.navigateTo({ url: '/pages/ranking/ranking' })
  },

  // 跳转到打卡任务页（点击底部任务提示条）
  goTask: function () {
    wx.navigateTo({ url: '/pages/task/task' })
  },

  // ===== F-07 打卡结果反馈动效 =====

  // 震动反馈（失败重一点、成功轻一点）。
  // 包 try/catch + 空 fail：低版本客户端、部分 iOS 机型不支持 vibrateShort / type 参数，
  // 直接忽略即可 —— 震动只是锦上添花，绝不能因为它报错打断打卡主流程。
  vibrate: function (type) {
    if (!wx.vibrateShort) return
    try {
      wx.vibrateShort({ type: type || 'medium', fail: () => {} })
    } catch (e) {}
  },

  // 打卡成功：整屏撒花 + 居中结果卡（徽章放大弹入）
  showCelebrate: function (recognizedText, similarity) {
    const lang = this.data.lang
    this.setData({
      celebrate: true,
      confetti: buildConfetti(),
      celebrateTitle: lang.index.celebrateTitle,
      celebratePoints: i18n.format(lang.index.celebratePoints, { n: CHECKIN_POINTS }),
      celebrateSub: i18n.format(lang.index.celebrateSub, {
        text: recognizedText || '',
        sim: Math.round((similarity || 0) * 100)
      })
    })
    this.vibrate('medium')
    // 自动收起。庆祝层是 pointer-events:none 的，不会挡住按钮操作，收起只是让它别一直挂在屏幕上。
    clearTimeout(this._celebrateTimer)
    this._celebrateTimer = setTimeout(() => {
      this.setData({ celebrate: false })
    }, 2200)
  },

  // 打卡失败：录音按钮抖动 + 顶部提示条 + 震动
  // title/sub 由调用方给（念错 / 任务校验失败 / 网络异常 三种文案不同）
  showFailFeedback: function (title, sub) {
    this.setData({
      feedback: { title: title, sub: sub || '' },
      shake: true
    })
    this.vibrate('heavy')
    // 抖动动画 0.5s 一次，600ms 后清类，这样下次失败还能重新触发（类不摘掉动画只播一次）
    clearTimeout(this._shakeTimer)
    this._shakeTimer = setTimeout(() => {
      this.setData({ shake: false })
    }, 600)
    clearTimeout(this._feedbackTimer)
    this._feedbackTimer = setTimeout(() => {
      this.setData({ feedback: null })
    }, 2600)
  },

  // 说咒语按钮：开始录音 / 停止录音（需先登录）
  onRecordTap: function () {
    if (this.requireLogin()) return
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
        const msg = r.msg || lang.index.failTitleGeneric
        this.setData({ tip: '⚠️ ' + msg })
        // F-07：这类失败也走一次反馈动效（原则：只要"这次打卡没成"，用户就该被明确告知）
        this.showFailFeedback(lang.index.failTitleGeneric, r.msg || '')
        return
      }
      if (r.matched) {
        this.setData({
          tip: i18n.format(lang.index.tipSuccess, {
            text: r.recognizedText,
            sim: Math.round(r.similarity * 100)
          })
        })
        // F-07：整屏撒花 + 居中结果卡（+10 分）
        this.showCelebrate(r.recognizedText, r.similarity)
        console.log('打卡成功', r)
        // 任务打卡成功 → 刷新待完成任务（该任务已变成已完成）
        if (taskId) this.loadPendingTask()
        // 顺便查一下有没有新解锁的成就徽章（F-04）；失败静默，不影响打卡结果
        this.checkNewBadges()
        // 我刚打卡成功 → 刷新头像墙，让「我」立刻出现在名单里
        if (point && this.data.selectedPoint && this.data.selectedPoint._id === point._id) {
          this.loadPointUsers(point._id)
        }
      } else {
        // F-07：按钮抖动 + 上方提示条。
        // 「没听清」（识别结果为空）与「念错了」给两套文案 —— 前者要用户靠近麦克风重念，
        // 后者要用户看清楚咒语，混成一句用户不知道该改什么。
        // 云函数在识别为空时返回 noSpeech:true（文档 3.13）；`!heard` 是兼容旧云函数的兜底。
        const heard = String(r.recognizedText == null ? '' : r.recognizedText).trim()
        if (r.noSpeech || !heard) {
          this.setData({ tip: lang.index.tipNoSpeech })
          this.showFailFeedback(lang.index.failTitleNoHear, lang.index.failNoHear)
        } else {
          this.setData({ tip: i18n.format(lang.index.tipMismatch, { text: heard }) })
          this.showFailFeedback(lang.index.failTitle, i18n.format(lang.index.failSub, { text: heard }))
        }
      }
    }).catch(err => {
      console.error('打卡失败：', err)
      const msg = i18n.format(lang.index.errCheckin, { msg: err.errMsg || '请检查 voiceCheckin 云函数' })
      this.setData({ tip: msg })
      this.showFailFeedback(lang.index.failTitleGeneric, msg)
    })
  },

  // F-04：打卡成功后查一次有没有新解锁的成就徽章，有就弹窗告知
  // ⚠️ 徽章判定放在独立云函数里（不在 voiceCheckin 里同步做），就是为了不拖慢打卡主流程 ——
  //    这里也是「异步、失败静默」：徽章查不到最多不提示，绝不能因此让一次成功的打卡显示成失败。
  checkNewBadges: function () {
    wx.cloud.callFunction({
      name: 'getBadges'
    }).then(res => {
      const r = res.result || {}
      const ids = r.newBadges || []
      if (r.code !== 0 || ids.length === 0) return
      const lang = this.data.lang.badges
      // 徽章名称要从语言包里取，多个之间用顿号（英文用逗号）
      const sep = app.globalData.language === 'en' ? ', ' : '、'
      const names = ids.map(id => lang[id] || id).join(sep)
      wx.showModal({
        title: lang.newTitle,
        content: i18n.format(lang.newContent, { names: names }),
        showCancel: false,
        confirmText: lang.gotIt
      })
    }).catch(err => {
      console.error('查询新徽章失败（不影响本次打卡）：', err)
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
