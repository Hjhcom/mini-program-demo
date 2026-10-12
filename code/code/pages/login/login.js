// pages/login/login.js —— 登录方式选择：微信一键登录（头像昵称授权） / 手机号验证码登录 / 游客登录
const app = getApp()

Page({
  data: {
    agreed: false,      // 是否已勾选同意《用户协议》《隐私政策》
    showProfile: false,  // 是否显示头像昵称授权弹窗
    avatarUrl: '',      // 已选择的头像（本地临时路径）
    nickname: '',       // 已输入的昵称
    showSms: false,     // 是否显示手机号验证码登录弹窗
    phone: '',          // 手机号
    code: '',           // 验证码
    countdown: 0,       // 重发倒计时（秒）
    canSend: true       // 是否可点击获取验证码
  },

  // 页面加载：从「我的」页带 mode=profile 进入时，直接弹出头像昵称授权弹窗（完善资料）
  onLoad: function (options) {
    if (options && options.mode === 'profile') {
      const user = app.globalData.userInfo || {}
      this.pendingUser = user
      this.setData({
        showProfile: true,
        avatarUrl: '',
        nickname: user.nickname && user.nickname !== '打卡玩家' ? user.nickname : ''
      })
    }
  },

  // 页面卸载：清理倒计时定时器
  onUnload: function () {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  // 勾选 / 取消勾选协议
  toggleAgree: function () {
    this.setData({ agreed: !this.data.agreed })
  },

  // 点击协议链接（catchtap 阻止冒泡，避免误触勾选）
  onAgreementTap: function (e) {
    const type = e.currentTarget.dataset.type
    wx.showToast({ title: '《' + type + '》内容即将上线', icon: 'none' })
  },

  // 登录方式共同的协议校验：未勾选则拦截
  checkAgreed: function () {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意《用户协议》和《隐私政策》', icon: 'none' })
      return false
    }
    return true
  },

  // ========== 微信一键登录 ==========
  // 静默获取 openid → 资料不完整时弹「头像昵称授权」弹窗
  loginWithWechat: function () {
    if (!this.checkAgreed()) return
    wx.showLoading({ title: '微信登录中…' })
    wx.cloud.callFunction({
      name: 'login'
    }).then(res => {
      wx.hideLoading()
      if (res.result.code !== 0) throw new Error(res.result.msg || '登录失败')
      const user = res.result.user
      // 老用户资料完整 → 直接登录；新用户/没头像昵称 → 弹窗授权
      if (user.avatarUrl && user.nickname && user.nickname !== '打卡玩家') {
        user.source = 'wechat'
        app.setUser(user)
        this.onLoginSuccess('微信登录成功')
      } else {
        this.pendingUser = user
        this.setData({ showProfile: true, avatarUrl: '', nickname: '' })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('微信登录失败：', err)
      wx.showToast({ title: '微信登录失败，请重试', icon: 'none' })
    })
  },

  // 选择微信头像（chooseAvatar 授权弹窗）
  onChooseAvatar: function (e) {
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },

  // 昵称输入（失焦/确认时同步）
  onNicknameChange: function (e) {
    this.setData({ nickname: e.detail.value })
  },

  // 暂不完善 → 关闭弹窗，放弃本次微信登录
  onCancelProfile: function () {
    this.setData({ showProfile: false })
    wx.showToast({ title: '已取消，可继续使用其他登录方式', icon: 'none' })
  },

  // 确认完善：上传头像 + 更新昵称 → 完成微信登录
  onConfirmProfile: function () {
    const nick = (this.data.nickname || '').trim()
    if (!nick) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中…' })

    // 头像：有选择则先上传到云存储，拿 fileID
    const finish = (avatarFileID) => {
      wx.cloud.callFunction({
        name: 'login',
        data: { profile: { nickname: nick, avatarUrl: avatarFileID || '' } }
      }).then(res => {
        wx.hideLoading()
        if (res.result.code !== 0) throw new Error(res.result.msg || '保存失败')
        const user = res.result.user
        user.source = 'wechat'
        console.log('【资料保存成功】nickname=', user.nickname, 'avatarUrl=', user.avatarUrl)
        app.setUser(user)
        this.onLoginSuccess('微信登录成功')
      }).catch(err => {
        wx.hideLoading()
        console.error('保存资料失败：', err)
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      })
    }

    if (this.data.avatarUrl) {
      const cloudPath = 'avatars/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.png'
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: this.data.avatarUrl
      }).then(up => {
        finish(up.fileID)
      }).catch(err => {
        wx.hideLoading()
        console.error('头像上传失败：', err)
        wx.showToast({ title: '头像上传失败，请重试', icon: 'none' })
      })
    } else {
      finish('')
    }
  },

  // ========== 手机号验证码登录 ==========
  // 打开手机号登录弹窗
  openSmsLogin: function () {
    if (!this.checkAgreed()) return
    this.setData({ showSms: true, phone: '', code: '' })
  },

  // 关闭手机号登录弹窗
  closeSmsLogin: function () {
    this.setData({ showSms: false })
  },

  // 手机号输入
  onPhoneInput: function (e) {
    this.setData({ phone: e.detail.value })
  },

  // 验证码输入
  onCodeInput: function (e) {
    this.setData({ code: e.detail.value })
  },

  // 获取验证码：调 sendCode 云函数
  onSendCode: function () {
    const phone = (this.data.phone || '').trim()
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的11位手机号', icon: 'none' })
      return
    }
    wx.showLoading({ title: '发送中…' })
    wx.cloud.callFunction({
      name: 'sendCode',
      data: { phone: phone }
    }).then(res => {
      wx.hideLoading()
      if (res.result.code !== 0) {
        wx.showToast({ title: res.result.msg || '发送失败', icon: 'none' })
        return
      }
      // 演示模式：未接真实短信通道，验证码直接展示
      if (res.result.devCode) {
        wx.showToast({ title: '测试验证码：' + res.result.devCode, icon: 'none', duration: 3000 })
        console.log('【验证码】' + phone + ' -> ' + res.result.devCode)
      }
      this.startCountdown()
    }).catch(err => {
      wx.hideLoading()
      console.error('验证码发送失败：', err)
      wx.showToast({ title: '发送失败，请检查 sendCode 云函数', icon: 'none' })
    })
  },

  // 验证码发送后 60 秒倒计时
  startCountdown: function () {
    if (this.timer) clearInterval(this.timer)
    this.setData({ canSend: false, countdown: 60 })
    this.timer = setInterval(() => {
      const left = this.data.countdown - 1
      if (left <= 0) {
        clearInterval(this.timer)
        this.timer = null
        this.setData({ canSend: true, countdown: 0 })
      } else {
        this.setData({ countdown: left })
      }
    }, 1000)
  },

  // 提交手机号 + 验证码登录
  onSmsLogin: function () {
    if (!this.checkAgreed()) return
    const phone = (this.data.phone || '').trim()
    const code = (this.data.code || '').trim()
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的11位手机号', icon: 'none' })
      return
    }
    if (!/^\d{6}$/.test(code)) {
      wx.showToast({ title: '请输入6位验证码', icon: 'none' })
      return
    }
    wx.showLoading({ title: '登录中…' })
    wx.cloud.callFunction({
      name: 'login',
      data: { phone: phone, code: code }
    }).then(res => {
      wx.hideLoading()
      if (res.result.code !== 0) throw new Error(res.result.msg || '登录失败')
      const user = res.result.user
      user.source = 'phone'
      app.setUser(user)
      this.closeSmsLogin()
      this.onLoginSuccess('手机号登录成功')
    }).catch(err => {
      wx.hideLoading()
      console.error('手机号登录失败：', err)
      wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' })
    })
  },

  // ========== 游客登录 ==========
  // 本地生成游客身份，不依赖微信账号
  loginAsGuest: function () {
    if (!this.checkAgreed()) return
    const nick = '游客' + Math.floor(1000 + Math.random() * 9000)
    const user = {
      nickname: nick,
      avatarUrl: '',
      source: 'guest',
      totalCheckins: 0,
      isGuest: true
    }
    app.setUser(user)
    this.onLoginSuccess('已以游客身份登录')
  },

  // 登录成功：提示后返回上一页（「我的」）
  onLoginSuccess: function (msg) {
    wx.showToast({ title: msg, icon: 'success' })
    setTimeout(() => {
      wx.navigateBack({
        fail: () => wx.switchTab({ url: '/pages/mine/mine' })
      })
    }, 800)
  }
})
