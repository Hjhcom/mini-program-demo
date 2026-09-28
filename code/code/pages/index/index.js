// 首页逻辑：地图 + 打卡点展示
const app = getApp()

Page({
  data: {
    // 地图中心点（测试用北京天安门一带，可改成你们学校/城市）
    center: {
      longitude: 116.397,
      latitude: 39.908
    },
    scale: 14, // 地图缩放级别
    // 测试打卡点（正式数据后面会存到云数据库）
    markers: [
      {
        id: 1,
        longitude: 116.397,
        latitude: 39.908,
        title: '天安门',
        width: 32,
        height: 32
      },
      {
        id: 2,
        longitude: 116.391,
        latitude: 39.916,
        title: '故宫',
        width: 32,
        height: 32
      },
      {
        id: 3,
        longitude: 116.410,
        latitude: 39.914,
        title: '王府井',
        width: 32,
        height: 32
      }
    ],
    tip: '地图加载中...'
  },

  // 页面加载：检查登录态，未登录则先跳登录页
  onLoad: function () {
    const userInfo = wx.getStorageSync('userInfo') || app.globalData.userInfo
    if (!userInfo) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    this.login()
  },

  // 登录：调用云函数，拿用户信息
  login: function () {
    wx.cloud.callFunction({
      name: 'login'
    }).then(res => {
      const user = res.result.user
      app.globalData.userInfo = user
      wx.setStorageSync('userInfo', user) // 缓存登录态
      this.setData({
        tip: '你好，' + user.nickname + '！点击图钉查看打卡点'
      })
      console.log('登录成功', user)
    }).catch(err => {
      console.error('登录失败：', err)
      this.setData({ tip: '登录失败，请检查云函数' })
    })
  },

  // 点击地图上的图钉：显示打卡点信息
  onMarkerTap: function (e) {
    const id = e.detail.markerId
    const marker = this.data.markers.find(m => m.id === id)
    if (marker) {
      this.setData({
        tip: '打卡点「' + marker.title + '」　咒语：芝麻开门'
      })
    }
  }
})
