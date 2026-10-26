// pages/user-profile/user-profile.js —— 他人主页（F2）
// 从动态流点头像（recordId）或好友列表（friendRecordId）进入；
// 好友可去 PK / 解除好友，陌生人可输入邀请码加好友；身份与关系由服务端判定，前端拿不到 openid。
const app = getApp()
const i18n = require('../../utils/i18n')

Page({
  data: {
    loading: true,
    recordId: '',
    friendRecordId: '',
    relation: 'stranger', // self / friend / stranger
    nickname: '',
    avatarDisplay: '',
    total: 0,
    success: 0,
    lastText: '',
    recent: [],
    dark: false,
    fontScale: 'md',
    lang: i18n.zh
  },

  onLoad(options) {
    this.setData({
      recordId: options.recordId || '',
      friendRecordId: options.friendRecordId || ''
    })
  },

  onShow() {
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang
    })
    wx.setNavigationBarTitle({ title: lang.userProfile.navTitle })
    this.loadProfile()
  },

  formatTime(t) {
    if (!t) return ''
    const d = new Date(t)
    if (isNaN(d.getTime())) return ''
    const pad = n => (n < 10 ? '0' + n : '' + n)
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  },

  async loadProfile() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'userProfile',
        data: {
          recordId: this.data.recordId,
          friendRecordId: this.data.friendRecordId
        }
      })
      if (res.result && res.result.code === 0) {
        const p = res.result.profile || {}
        // 头像 / 最近照片换临时链接
        const fileIDs = []
        if (p.avatarUrl && p.avatarUrl.startsWith('cloud://')) fileIDs.push(p.avatarUrl)
        const recent = p.recent || []
        recent.forEach(r => {
          if (r.photoFileID && r.photoFileID.startsWith('cloud://')) fileIDs.push(r.photoFileID)
        })
        let urlMap = {}
        if (fileIDs.length > 0) {
          try {
            const ures = await wx.cloud.getTempFileURL({ fileList: fileIDs })
            ures.fileList.forEach(f => { urlMap[f.fileID] = f.tempFileURL })
          } catch (e) {}
        }
        this.setData({
          loading: false,
          relation: res.result.relation,
          friendRecordId: res.result.friendRecordId || '',
          nickname: p.nickname || '',
          avatarDisplay: urlMap[p.avatarUrl] || p.avatarUrl || '',
          total: p.total || 0,
          success: p.success || 0,
          lastText: p.lastTime ? this.formatTime(p.lastTime) : this.data.lang.userProfile.none,
          recent: recent.map(r => ({
            ...r,
            photoUrl: urlMap[r.photoFileID] || r.photoFileID || '',
            timeText: this.formatTime(r.createTime)
          }))
        })
      } else {
        throw new Error((res.result && res.result.msg) || this.data.lang.userProfile.loadFail)
      }
    } catch (e) {
      console.error('加载他人主页失败：', e)
      this.setData({ loading: false })
      wx.showToast({ title: this.data.lang.userProfile.loadFail, icon: 'none' })
    }
  },

  // 去 PK：带上好友关系句柄，PK 页自动定位该好友并弹出对比
  onGoPk() {
    const query = this.data.friendRecordId ? '?friendRecordId=' + this.data.friendRecordId : ''
    wx.navigateTo({ url: '/pages/pk/pk' + query })
  },

  // 解除好友
  onRemove() {
    const lang = this.data.lang.userProfile
    wx.showModal({
      title: lang.removeTitle,
      content: lang.removeContent,
      confirmColor: '#e64340',
      confirmText: lang.btnRemove,
      cancelText: this.data.lang.common.cancel,
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: lang.removing })
        try {
          const res = await wx.cloud.callFunction({
            name: 'friends',
            data: { action: 'remove', friendRecordId: this.data.friendRecordId }
          })
          wx.hideLoading()
          if (res.result && res.result.code === 0) {
            wx.showToast({ title: lang.removed, icon: 'success' })
            setTimeout(() => wx.navigateBack(), 600)
          } else {
            wx.showToast({ title: (res.result && res.result.msg) || lang.removeFail, icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          console.error('解除好友失败：', err)
          wx.showToast({ title: lang.removeFail, icon: 'none' })
        }
      }
    })
  },

  // 加好友：弹窗输入 6 位邀请码
  onAdd() {
    const lang = this.data.lang.userProfile
    wx.showModal({
      title: lang.addTitle,
      editable: true,
      placeholderText: lang.addPlaceholder,
      confirmText: lang.btnAdd,
      cancelText: this.data.lang.common.cancel,
      success: async (r) => {
        if (!r.confirm) return
        const inviteCode = String(r.content || '').toUpperCase().trim()
        if (!inviteCode) {
          wx.showToast({ title: lang.addPlaceholder, icon: 'none' })
          return
        }
        wx.showLoading({ title: lang.btnAdd })
        try {
          const res = await wx.cloud.callFunction({
            name: 'friends',
            data: { action: 'add', inviteCode }
          })
          wx.hideLoading()
          if (res.result && res.result.code === 0) {
            wx.showToast({ title: lang.addDone, icon: 'success' })
            this.loadProfile()
          } else if (res.result && res.result.already) {
            wx.showToast({ title: lang.alreadyFriend, icon: 'none' })
            this.loadProfile()
          } else {
            wx.showToast({ title: (res.result && res.result.msg) || lang.addFail, icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          console.error('添加好友失败：', err)
          wx.showToast({ title: lang.addFail, icon: 'none' })
        }
      }
    })
  },

  // 最近打卡照片预览
  onPhotoPreview(e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    wx.previewImage({ urls: [src], current: src })
  }
})
