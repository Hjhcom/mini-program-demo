// pages/feed-publish/feed-publish.js
const app = getApp()

Page({
  data: {
    content: '',
    photoPath: '',   // 本地临时路径
    publishing: false
  },

  onInput(e) {
    this.setData({ content: e.detail.value })
  },

  // 选图：从相册选一张
  onChoosePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (f) this.setData({ photoPath: f.tempFilePath })
      }
    })
  },

  onRemovePhoto() {
    this.setData({ photoPath: '' })
  },

  onPublish() {
    const content = (this.data.content || '').trim()
    if (!content) {
      wx.showToast({ title: '写点什么再发吧', icon: 'none' })
      return
    }
    if (!app.globalData.userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    this.setData({ publishing: true })
    wx.showLoading({ title: '发布中...' })

    const finish = (photoFileID) => {
      wx.cloud.callFunction({
        name: 'publishFeed',
        data: { content, photoFileID }
      }).then(res => {
        wx.hideLoading()
        this.setData({ publishing: false })
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '已发布', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '发布失败', icon: 'none' })
        }
      }).catch(err => {
        wx.hideLoading()
        this.setData({ publishing: false })
        console.error('发布失败：', err)
        wx.showToast({ title: '发布失败', icon: 'none' })
      })
    }

    // 有图：先传云存储
    if (this.data.photoPath) {
      const cloudPath = 'feeds/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.jpg'
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: this.data.photoPath
      }).then(up => {
        finish(up.fileID)
      }).catch(err => {
        wx.hideLoading()
        this.setData({ publishing: false })
        console.error('图片上传失败：', err)
        wx.showToast({ title: '图片上传失败', icon: 'none' })
      })
    } else {
      finish('')
    }
  }
})
