// 首页逻辑：地图 + 打卡点 + 定位判定 + 录音声控打卡
const app = getApp()

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
    dark: false,       // 深色模式（全局设置）
    fontScale: 'md',   // 字体大小（全局设置）
    tip: '地图加载中...'
  },

  // 页面加载：初始化登录态 + 拉取打卡点 + 初始化录音
  onLoad: function () {
    this.initUser()
    this.loadPoints()

    // 录音停止：上传 + 识别
    recorder.onStop(res => {
      this.onRecordStop(res)
    })
    recorder.onError(err => {
      console.error('录音失败：', err)
      this.setData({ recording: false, tip: '录音失败：' + (err.errMsg || '请检查麦克风权限') })
    })
  },

  // 页面显示时同步登录态与全局设置（登录/退出后回来会变化）
  onShow: function () {
    const user = app.globalData.userInfo
    this.setData({
      isLoggedIn: !!user,
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale
    })
    if (user) {
      this.setData({ tip: '你好，' + user.nickname + '！点图钉选打卡点，然后点「定位打卡」' })
      // 查一下有没有指派给我、还没完成的任务
      this.loadPendingTask()
    } else {
      this.setData({ pendingTask: null, tip: '请先登录，登录后才能打卡' })
    }
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
      this.setData({ pendingTask: pendingTask })
      console.log('待完成任务：', pendingTask)
    }).catch(err => {
      console.error('加载待完成任务失败：', err)
      this.setData({ pendingTask: null })
    })
  },

  // 初始化登录态：已有登录态直接用；没有则微信静默登录（云函数识别 openid）
  initUser: function () {
    const user = app.globalData.userInfo
    if (user) {
      this.setData({
        isLoggedIn: true,
        tip: '你好，' + user.nickname + '！点图钉选打卡点，然后点「定位打卡」'
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
        tip: '你好，' + user.nickname + '！点图钉选打卡点，然后点「定位打卡」'
      })
      console.log('登录成功', user)
    }).catch(err => {
      console.error('登录失败：', err)
      this.setData({ tip: '登录失败，请检查云函数' })
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
      this.setData({ tip: '打卡点加载失败，请检查 getPoints 云函数' })
    })
  },

  // 点击地图上的图钉：选中打卡点，显示信息和咒语
  onMarkerTap: function (e) {
    // markerId 是下标+1，倒推回数据库数组下标
    const index = e.detail.markerId - 1
    const p = this.data.points[index]
    if (!p) return
    // 该点位若正好有指派给我的任务，提示条里改说"这里有你的任务"
    const t = this.data.pendingTask
    const hasTask = !!(t && t.pointId === p._id)
    this.setData({
      selectedPoint: p,
      inRange: false,
      tip: hasTask
        ? '已选「' + p.name + '」　📌 这里有你的任务，念咒语「' + t.spell + '」即可完成'
        : '已选「' + p.name + '」　咒语：' + p.spell + '　点「定位打卡」检测距离'
    })
  },

  // 定位打卡：获取当前位置，判断是否在打卡点围栏内（需先登录）
  checkIn: function () {
    if (!this.data.isLoggedIn) {
      // 未登录：提示并跳转登录界面
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/login' })
      }, 800)
      return
    }
    const p = this.data.selectedPoint
    if (!p) {
      this.setData({ tip: '先点击地图上的图钉，选中一个打卡点' })
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
            tip: '✅ 已在「' + p.name + '」范围内（' + Math.round(dist) + '米）！点击「说咒语」开始录音'
          })
          console.log('在范围内，距离：', Math.round(dist), '米')
        } else {
          this.setData({
            inRange: false,
            tip: '距「' + p.name + '」还差 ' + Math.round(dist - p.radius) + ' 米，先走过去再打卡~'
          })
        }
      },
      fail: err => {
        console.error('定位失败：', err)
        this.setData({ tip: '定位失败：' + (err.errMsg || '请检查定位权限') })
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
      wx.showToast({ title: '请先登录', icon: 'none' })
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
    this.setData({ recording: true, tip: '🎤 录音中…请说出咒语「' + spell + '」，再点一次停止' })
  },

  // 录音停止：上传云存储 → 调 voiceCheckin 识别比对
  onRecordStop: function (res) {
    this.setData({ recording: false, tip: '识别中…' })
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
          tip: '🎉 打卡成功！你说的是「' + r.recognizedText + '」，相似度 ' + Math.round(r.similarity * 100) + '%'
        })
        console.log('打卡成功', r)
        // 任务打卡成功 → 刷新待完成任务（该任务已变成已完成）
        if (taskId) this.loadPendingTask()
      } else {
        this.setData({
          tip: '❌ 咒语没对上（听到：「' + r.recognizedText + '」），再试一次'
        })
      }
    }).catch(err => {
      console.error('打卡失败：', err)
      this.setData({ tip: '打卡失败：' + (err.errMsg || '请检查 voiceCheckin 云函数') })
    })
  }
})
