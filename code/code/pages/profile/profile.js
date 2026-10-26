// pages/profile/profile.js —— 个人资料（查看态 / 编辑态）
const app = getApp()
const i18n = require('../../utils/i18n')

const GENDER_OPTIONS_ZH = ['男', '女', '保密']
const GENDER_OPTIONS_EN = ['Male', 'Female', 'Secret']
const GENDER_VALUES = ['male', 'female', 'secret']

Page({
  data: {
    user: null,
    avatarText: '?',       // 无头像时展示的昵称首字（wxml 不支持字符串索引，在 JS 层算好）
    editing: false,        // false=查看态，true=编辑态
    nickname: '',
    avatarPreview: '',
    avatarChanged: false,
    gender: '',
    genderDisplay: '',
    genderOptions: GENDER_OPTIONS_ZH,
    region: [],
    regionDisplay: '',
    saving: false,
    dark: false,
    fontScale: 'md',
    lang: i18n.zh
  },

  onLoad: function () {
    this.syncUser()
  },

  onShow: function () {
    this.syncUser()
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang,
      genderOptions: isEn ? GENDER_OPTIONS_EN : GENDER_OPTIONS_ZH
    })
    this.setGenderDisplay()
    wx.setNavigationBarTitle({ title: lang.profile.navTitle })
  },

  setGenderDisplay: function () {
    const idx = GENDER_VALUES.indexOf(this.data.gender)
    this.setData({ genderDisplay: idx >= 0 ? this.data.genderOptions[idx] : '' })
  },

  // 从 app.globalData 读当前用户，预填展示态字段
  syncUser: function () {
    const user = app.globalData.userInfo
    this.setData({ user: user, avatarText: (user && user.nickname) ? user.nickname.charAt(0) : '?' })
    if (!user || user.source === 'guest') return

    const nick = user.nickname || ''
    const isDefault = !nick || nick === '打卡玩家' || nick.indexOf('手机用户') === 0
    this.setData({ nickname: isDefault ? '' : nick })

    this.setData({ gender: user.gender || '' })
    this.setGenderDisplay()

    const region = Array.isArray(user.region) ? user.region : []
    this.setData({
      region: region,
      regionDisplay: region.length === 3 ? region.join(' ') : ''
    })

    if (user.avatarUrl) {
      if (user.avatarUrl.indexOf('cloud://') === 0) {
        wx.cloud.getTempFileURL({ fileList: [user.avatarUrl] }).then(res => {
          const f = res.fileList && res.fileList[0]
          if (f && f.tempFileURL) this.setData({ avatarPreview: f.tempFileURL })
        }).catch(() => {})
      } else {
        this.setData({ avatarPreview: user.avatarUrl })
      }
    } else {
      this.setData({ avatarPreview: '' })
    }
  },

  // 进入编辑态：标记头像未改，用户可改
  startEdit: function () {
    this.setData({ editing: true, avatarChanged: false })
  },

  // 取消编辑：丢弃改动，回到查看态，并从最新用户数据重新拉一次
  cancelEdit: function () {
    this.setData({ editing: false, avatarChanged: false })
    this.syncUser()
  },

  // 点头像：弹菜单从相册选或拍照（高清原图）
  onAvatarEditTap: function () {
    wx.showActionSheet({
      itemList: ['从相册选高清图', '拍照'],
      success: (res) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: res.tapIndex === 0 ? ['album'] : ['camera'],
          sizeType: ['original'],
          success: (r) => {
            const file = r.tempFiles && r.tempFiles[0]
            if (file) {
              this.setData({
                avatarPreview: file.tempFilePath,
                avatarChanged: true
              })
            }
          }
        })
      }
    })
  },

  onChooseAvatar: function (e) {
    this.setData({
      avatarPreview: e.detail.avatarUrl,
      avatarChanged: true
    })
  },

  onNicknameInput: function (e) {
    const nick = e.detail.value || ''
    this.setData({ nickname: nick, avatarText: nick.charAt(0) || '?' })
  },

  onGenderChange: function (e) {
    const idx = parseInt(e.detail.value, 10)
    if (isNaN(idx) || idx < 0 || idx >= GENDER_VALUES.length) return
    this.setData({
      gender: GENDER_VALUES[idx],
      genderDisplay: this.data.genderOptions[idx]
    })
  },

  onRegionChange: function (e) {
    const region = e.detail.value || []
    this.setData({
      region: region,
      regionDisplay: region.length === 3 ? region.join(' ') : ''
    })
  },

  goLogin: function () {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onSave: function () {
    const lang = this.data.lang
    const user = this.data.user
    if (!user) return

    const nick = (this.data.nickname || '').trim()
    if (!nick) {
      wx.showToast({ title: lang.profile.nickErr, icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: lang.profile.saving })

    const finish = (avatarFileID) => {
      wx.cloud.callFunction({
        name: 'login',
        data: {
          profile: {
            nickname: nick,
            avatarUrl: avatarFileID,
            gender: this.data.gender,
            region: this.data.region
          }
        }
      }).then(res => {
        wx.hideLoading()
        this.setData({ saving: false })
        if (res.result.code !== 0) throw new Error(res.result.msg || 'save fail')
        const saved = res.result.user
        saved.source = user.source
        app.setUser(saved)
        wx.showToast({ title: lang.profile.saveDone, icon: 'success' })
        // 回到查看态
        this.setData({ editing: false, avatarChanged: false })
        this.syncUser()
        setTimeout(() => wx.navigateBack(), 600)
      }).catch(err => {
        wx.hideLoading()
        this.setData({ saving: false })
        console.error('保存资料失败：', err)
        wx.showToast({ title: lang.profile.saveFail, icon: 'none' })
      })
    }

    if (this.data.avatarChanged && this.data.avatarPreview) {
      const cloudPath = 'avatars/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.png'
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: this.data.avatarPreview
      }).then(up => {
        // 头像内容安全检测
        return wx.cloud.callFunction({
          name: 'moderation',
          data: { type: 'image', fileID: up.fileID }
        }).then(mr => {
          if (mr.result && mr.result.code !== 0) {
            wx.hideLoading()
            this.setData({ saving: false })
            wx.showToast({ title: mr.result.msg || '头像违规', icon: 'none' })
            return
          }
          finish(up.fileID)
        })
      }).catch(err => {
        wx.hideLoading()
        this.setData({ saving: false })
        console.error('头像上传失败：', err)
        wx.showToast({ title: lang.profile.avatarFail, icon: 'none' })
      })
    } else {
      finish(user.avatarUrl || '')
    }
  }
})
