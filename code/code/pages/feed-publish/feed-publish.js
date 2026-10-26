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

    // 先过文字内容安全
    wx.cloud.callFunction({
      name: 'moderation',
      data: { type: 'text', text: content }
    }).then(r => {
      if (r.result && r.result.code !== 0) {
        wx.hideLoading()
        this.setData({ publishing: false })
        wx.showToast({ title: r.result.msg || '内容违规', icon: 'none' })
        return
      }
      // 文字通过，继续处理图片
      if (this.data.photoPath) {
        const cloudPath = 'feeds/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.jpg'
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: this.data.photoPath
        }).then(up => {
          // 图片内容安全检测
          return wx.cloud.callFunction({
            name: 'moderation',
            data: { type: 'image', fileID: up.fileID }
          }).then(mr => {
            if (mr.result && mr.result.code !== 0) {
              wx.hideLoading()
              this.setData({ publishing: false })
              wx.showToast({ title: mr.result.msg || '图片违规', icon: 'none' })
              return
            }
            finish(up.fileID)
          })
        }).catch(err => {
          wx.hideLoading()
          this.setData({ publishing: false })
          console.error('图片上传失败：', err)
          wx.showToast({ title: '图片上传失败', icon: 'none' })
        })
      } else {
        finish('')
      }
    }).catch(() => {
      // 检测服务异常，放行
      if (this.data.photoPath) {
        const cloudPath = 'feeds/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.jpg'
        wx.cloud.uploadFile({ cloudPath, filePath: this.data.photoPath }).then(up => finish(up.fileID))
      } else {
        finish('')
      }
    })
  }
})
