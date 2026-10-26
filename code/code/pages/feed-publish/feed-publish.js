// pages/feed-publish/feed-publish.js —— 发布图文心情
// F4：图片大小/格式校验、文字草稿本地暂存、发布成功清草稿；L1：文案走语言包。
const app = getApp()
const i18n = require('../../utils/i18n')

const DRAFT_KEY = 'feed_draft'
const MAX_PHOTO_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_CONTENT = 200

Page({
  data: {
    content: '',
    photoPath: '',   // 本地临时路径
    publishing: false,
    dark: false,
    fontScale: 'md',
    lang: i18n.zh
  },

  onShow() {
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang
    })
    wx.setNavigationBarTitle({ title: lang.feedPublish.navTitle })
    // 回填草稿（只存文字；本地临时图片路径会过期，不持久化）
    const draft = wx.getStorageSync(DRAFT_KEY)
    if (draft && draft.content && !this.data.content) {
      this.setData({ content: draft.content })
    }
  },

  // 文字草稿本地暂存
  saveDraft() {
    wx.setStorageSync(DRAFT_KEY, { content: this.data.content })
  },

  onInput(e) {
    this.setData({ content: e.detail.value })
    this.saveDraft()
  },

  // 选图：校验大小与格式
  onChoosePhoto() {
    const lang = this.data.lang.feedPublish
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f) return
        if (f.size > MAX_PHOTO_SIZE) {
          wx.showToast({ title: lang.photoTooLarge, icon: 'none' })
          return
        }
        const ext = (f.tempFilePath.split('.').pop() || '').toLowerCase()
        if (!['jpg', 'jpeg', 'png'].includes(ext)) {
          wx.showToast({ title: lang.photoBadFormat, icon: 'none' })
          return
        }
        this.setData({ photoPath: f.tempFilePath })
      }
    })
  },

  onRemovePhoto() {
    this.setData({ photoPath: '' })
  },

  onPublish() {
    const lang = this.data.lang.feedPublish
    const content = (this.data.content || '').trim()
    if (!content) {
      wx.showToast({ title: lang.contentRequired, icon: 'none' })
      return
    }
    if (content.length > MAX_CONTENT) {
      wx.showToast({ title: lang.contentLimit, icon: 'none' })
      return
    }
    if (!app.globalData.userInfo) {
      wx.showToast({ title: lang.loginFirst, icon: 'none' })
      return
    }

    this.setData({ publishing: true })
    wx.showLoading({ title: lang.publishing })

    const finish = (photoFileID) => {
      wx.cloud.callFunction({
        name: 'publishFeed',
        data: { content, photoFileID }
      }).then(res => {
        wx.hideLoading()
        this.setData({ publishing: false })
        if (res.result && res.result.code === 0) {
          wx.removeStorageSync(DRAFT_KEY)
          wx.showToast({ title: lang.published, icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || lang.publishFail, icon: 'none' })
        }
      }).catch(err => {
        wx.hideLoading()
        this.setData({ publishing: false })
        console.error('发布失败：', err)
        wx.showToast({ title: lang.publishFail, icon: 'none' })
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
          wx.showToast({ title: lang.photoUploadFail, icon: 'none' })
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
