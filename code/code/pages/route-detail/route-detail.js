// pages/route-detail/route-detail.js —— 剧本任务线
const app = getApp()
const i18n = require('../../utils/i18n')

Page({
  data: {
    loading: true,
    route: null,
    progress: null,
    acts: [],
    lang: {}
  },

  onLoad() {
    this.setData({ lang: app.globalData.language === 'en' ? i18n.en : i18n.zh })
  },

  onShow() {
    this.fetchRoute()
  },

  async fetchRoute() {
    this.setData({ loading: true })
    try {
      // 线路定义 + 我的进度
      const routeRes = await wx.cloud.callFunction({ name: 'getRoutes' })
      const list = (routeRes.result && routeRes.result.code === 0 && routeRes.result.list) || []
      if (list.length === 0) {
        this.setData({ loading: false, route: null })
        return
      }
      const route = list[0]
      const isEn = app.globalData.language === 'en'

      // 点位详情（名称/咒语）由 getPoints 提供，按 pointId 关联
      let pointMap = {}
      try {
        const pRes = await wx.cloud.callFunction({ name: 'getPoints' })
        const points = (pRes.result && pRes.result.points) || []
        pointMap = {}
        points.forEach(p => { pointMap[p._id] = p })
      } catch (e) {
        console.error('点位加载失败：', e)
      }

      // 组装每幕：地点名 + 剧情 + 咒语 + 状态（done / current / locked）
      const progress = route.progress
      const acts = (route.steps || []).map((s, i) => {
        const p = pointMap[s.pointId] || {}
        let status
        if (progress && progress.completed) {
          status = 'done'
        } else if (progress && i < progress.currentIndex) {
          status = 'done'
        } else if ((progress ? i === progress.currentIndex : i === 0)) {
          status = 'current'
        } else {
          status = 'locked'
        }
        return {
          pointId: s.pointId,
          pointName: p.name || s.pointName || '',
          spell: p.spell || '',
          story: isEn ? (s.storyEn || s.story) : s.story,
          status: status
        }
      })

      this.setData({
        route: {
          name: isEn ? route.nameEn : route.name,
          desc: isEn ? route.descEn : route.desc,
          bonus: route.bonus,
          total: route.total
        },
        progress: progress || { currentIndex: 0, completed: false },
        acts,
        loading: false
      })
    } catch (e) {
      console.error('线路加载失败：', e)
      this.setData({ loading: false, route: null })
    }
  },

  // 去当前步骤点位打卡：回首页并选中该点位（首页是 tabBar 页，用 globalData 传 id）
  onGoCheckin: function (e) {
    const pointId = e.currentTarget.dataset.point
    if (!pointId) return
    app.globalData.pendingPointId = pointId
    wx.switchTab({ url: '/pages/index/index' })
  }
})
