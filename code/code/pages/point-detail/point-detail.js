// pages/point-detail/point-detail.js
const app = getApp()
const i18n = require('../../utils/i18n')

Page({
  data: {
    pointId: '',
    loading: true,
    point: null,
    totalCheckins: 0,
    photoWall: [],
    rankList: [],
    spellText: '',
    totalText: '',
    dark: false,
    lang: i18n.zh
  },

  onLoad(options) {
    const isEn = app.globalData.language === 'en'
    this.setData({ pointId: options.pointId || '', lang: isEn ? i18n.en : i18n.zh, dark: app.globalData.darkMode })
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
        const lang = this.data.lang.pointDetail
        this.setData({
          loading: false,
          point: d.point,
          totalCheckins: d.totalCheckins,
          spellText: d.point && d.point.spell ? i18n.format(lang.spellFormat, { spell: d.point.spell }) : '',
          totalText: i18n.format(lang.totalFormat, { n: d.totalCheckins }),
          photoWall: d.photoWall.map(p => ({ ...p, url: urlMap[p.fileID] || p.fileID })),
          rankList: d.rankList.map(r => ({
            ...r,
            avatarUrl: urlMap[r.avatarUrl] || r.avatarUrl,
            countText: i18n.format(lang.rankCount, { n: r.count })
          }))
        })
        wx.setNavigationBarTitle({ title: d.point ? d.point.name : lang.navTitle })
      } else {
        throw new Error((res.result && res.result.msg) || this.data.lang.pointDetail.loadFail)
      }
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
      wx.showToast({ title: this.data.lang.pointDetail.loadFail, icon: 'none' })
    }
  },

  onPhotoPreview(e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    const urls = this.data.photoWall.map(p => p.url).filter(Boolean)
    wx.previewImage({ urls, current: src })
  }
})
