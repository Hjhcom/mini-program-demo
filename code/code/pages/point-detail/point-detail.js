// pages/point-detail/point-detail.js
const app = getApp()

Page({
  data: {
    pointId: '',
    loading: true,
    point: null,
    totalCheckins: 0,
    photoWall: [],
    rankList: []
  },

  onLoad(options) {
    this.setData({ pointId: options.pointId || '' })
    this.loadDetail()
  },

  async loadDetail() {
    if (!this.data.pointId) return
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getPointDetail',
        data: { pointId: this.data.pointId }
      })
      if (res.result && res.result.code === 0) {
        const d = res.result
        // 照片换临时 URL
        const fileIDs = d.photoWall.map(p => p.fileID).filter(f => f && f.startsWith('cloud://'))
        const avatarIDs = d.rankList.map(r => r.avatarUrl).filter(f => f && f.startsWith('cloud://'))
        const allIDs = [...fileIDs, ...avatarIDs]
        let urlMap = {}
        if (allIDs.length > 0) {
          try {
            const ures = await wx.cloud.getTempFileURL({ fileList: allIDs })
            ures.fileList.forEach(f => { urlMap[f.fileID] = f.tempFileURL })
          } catch (e) {}
        }
        this.setData({
          loading: false,
          point: d.point,
          totalCheckins: d.totalCheckins,
          photoWall: d.photoWall.map(p => ({ ...p, url: urlMap[p.fileID] || p.fileID })),
          rankList: d.rankList.map(r => ({ ...r, avatarUrl: urlMap[r.avatarUrl] || r.avatarUrl }))
        })
        wx.setNavigationBarTitle({ title: d.point ? d.point.name : '点位详情' })
      } else {
        throw new Error((res.result && res.result.msg) || '加载失败')
      }
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onPhotoPreview(e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    const urls = this.data.photoWall.map(p => p.url).filter(Boolean)
    wx.previewImage({ urls, current: src })
  }
})
