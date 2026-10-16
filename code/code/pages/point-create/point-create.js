// pages/point-create/point-create.js —— 用户自建打卡点（F-05 / 文档 3.5）
const app = getApp()
const i18n = require('../../utils/i18n')
const spellUtil = require('../../utils/spell')

// 可选半径（米）：给几个常用档位比让用户拖滑块更好选，也避免填出离谱的值
const RADIUS_OPTIONS = [20, 50, 100, 200]
const DEFAULT_RADIUS_INDEX = 1 // 默认 50 米（与官方种子点位一致）

Page({
  data: {
    name: '',
    spell: '',
    nameLen: 0,            // 名称字数（实时）
    spellLen: 0,           // 咒语有效字数（实时，不含标点空格）
    spellMin: spellUtil.SPELL_MIN,
    spellMax: spellUtil.SPELL_MAX,
    radiusOptions: RADIUS_OPTIONS,
    radiusIndex: DEFAULT_RADIUS_INDEX,
    location: null,        // { longitude, latitude, name, address, source }
    locSource: '',         // 位置来源文案（"地图选点" / "当前位置"）
    submitting: false,
    showSuccess: false,    // 创建成功弹窗
    createdPoint: null,    // 刚创建的点位
    remain: 0,             // 还能再建几个
    dark: false,           // 深色模式（全局设置）
    fontScale: 'md',       // 字体大小（全局设置）
    lang: i18n.zh          // 当前语言文案
  },

  // 取当前语言文案（逻辑层用；wxml 用 data.lang）
  getLang: function () {
    return app.globalData.language === 'en' ? i18n.en : i18n.zh
  },

  // ⚠️ 本页在 JS 里拼文案（字数提示、错误提示），所以 onLoad 就得取一次 lang，
  //    只放在 onShow 里会让首屏用 i18n.zh 的默认值、英文模式下残留中文。
  onLoad: function () {
    this.setData({ lang: this.getLang() })
  },

  onShow: function () {
    const lang = this.getLang()
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang
    })
    wx.setNavigationBarTitle({ title: lang.pointCreate.navTitle })
  },

  // ===== 表单输入 =====
  onNameInput: function (e) {
    const v = e.detail.value
    this.setData({ name: v, nameLen: spellUtil.charLen(v) })
  },

  onSpellInput: function (e) {
    const v = e.detail.value
    // 有效字数（不含标点空格）——和云函数的校验口径一致
    this.setData({ spell: v, spellLen: spellUtil.spellLength(v) })
  },

  onRadiusTap: function (e) {
    this.setData({ radiusIndex: e.currentTarget.dataset.index })
  },

  // ===== 选位置 =====
  // 主路径：微信地图选点（可拖动图钉、看到地点名）
  chooseOnMap: function () {
    const lang = this.getLang()
    wx.chooseLocation({
      success: (res) => {
        this.setLocation({
          longitude: res.longitude,
          latitude: res.latitude,
          name: res.name || '',
          address: res.address || '',
          source: 'map'
        })
      },
      fail: (err) => {
        const msg = String((err && err.errMsg) || '')
        // 用户自己取消不算错误，不弹提示
        if (msg.indexOf('cancel') > -1) return
        console.error('地图选点失败：', err)
        // 常见原因：没在小程序后台开通 chooseLocation 权限 / 用户拒绝了位置授权。
        // 这时直接退回「用当前位置」这条只依赖 getLocation 的路径（getLocation 本项目已在用，最稳）。
        // ⚠️ 这里刻意不用 showModal 让用户点确认：wx.showModal 的 confirmText/cancelText
        //    都限 4 个字符，中文按钮文案（如"用当前位置"）会直接超限报错。
        wx.showToast({ title: lang.pointCreate.pickFailFallback, icon: 'none', duration: 2000 })
        this.useCurrentLocation()
      }
    })
  },

  // 备用路径：直接用当前位置（只依赖 wx.getLocation，已在小程序里用着，最稳）
  useCurrentLocation: function () {
    const lang = this.getLang()
    wx.showLoading({ title: lang.pointCreate.locating })
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        wx.hideLoading()
        this.setLocation({
          longitude: res.longitude,
          latitude: res.latitude,
          name: '',
          address: '',
          source: 'gps'
        })
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('定位失败：', err)
        wx.showToast({ title: lang.pointCreate.locFail, icon: 'none' })
      }
    })
  },

  // 统一写位置（顺带算出「位置来源」的展示文案，wxml 不能调函数）
  setLocation: function (loc) {
    const lang = this.getLang()
    loc.sourceText = loc.source === 'map' ? lang.pointCreate.srcMap : lang.pointCreate.srcGps
    // 坐标为 0,0 说明没取到有效值（云函数也会拦，这里提前提示）
    if (!loc.longitude && !loc.latitude) {
      wx.showToast({ title: lang.pointCreate.noCoord, icon: 'none' })
      return
    }
    this.setData({ location: loc })
  },

  // ===== 提交 =====
  onSubmit: function () {
    if (this.data.submitting) return
    const lang = this.getLang()

    const name = this.data.name.trim()
    if (!name) {
      wx.showToast({ title: lang.pointCreate.nameRequired, icon: 'none' })
      return
    }
    const spell = this.data.spell.trim()
    if (!spell) {
      wx.showToast({ title: lang.pointCreate.spellRequired, icon: 'none' })
      return
    }
    const len = spellUtil.spellLength(spell)
    if (!spellUtil.hasMeaningfulChar(spellUtil.normalizeSpell(spell))) {
      wx.showToast({ title: lang.pointCreate.spellMeaningless, icon: 'none' })
      return
    }
    if (len < spellUtil.SPELL_MIN || len > spellUtil.SPELL_MAX) {
      wx.showToast({
        title: i18n.format(lang.pointCreate.spellLenRange, { min: spellUtil.SPELL_MIN, max: spellUtil.SPELL_MAX }),
        icon: 'none'
      })
      return
    }
    if (!this.data.location) {
      wx.showToast({ title: lang.pointCreate.locRequired, icon: 'none' })
      return
    }

    const loc = this.data.location
    this.setData({ submitting: true })
    wx.showLoading({ title: lang.pointCreate.submitting })

    wx.cloud.callFunction({
      name: 'createPoint',
      data: {
        name: name,
        spell: spell,
        radius: RADIUS_OPTIONS[this.data.radiusIndex],
        longitude: loc.longitude,
        latitude: loc.latitude
      }
    }).then(res => {
      wx.hideLoading()
      this.setData({ submitting: false })
      const r = res.result || {}
      if (r.code !== 0) {
        wx.showModal({
          title: lang.pointCreate.createFail,
          content: r.msg || lang.pointCreate.retryLater,
          showCancel: false
        })
        return
      }
      console.log('打卡点创建成功：', r.pointId, r.point)

      // 新建的点位要让首页的地图刷新出来（首页 onShow 里按这个标记决定是否重拉点位）
      app.globalData.pointsDirty = true

      this.setData({
        showSuccess: true,
        createdPoint: r.point || null,
        remain: typeof r.remain === 'number' ? r.remain : 0
      })
    }).catch(err => {
      wx.hideLoading()
      this.setData({ submitting: false })
      console.error('创建点位失败：', err)
      wx.showToast({ title: lang.pointCreate.createFailCloud, icon: 'none' })
    })
  },

  // 成功后引导：直接去给好友设个任务（把刚建好的点位带上，免去再选一次）
  goCreateTask: function () {
    const p = this.data.createdPoint
    this.setData({ showSuccess: false })
    if (!p) {
      wx.navigateBack()
      return
    }
    wx.navigateTo({ url: '/pages/task-create/task-create?pointId=' + p._id })
  },

  // 成功后关闭 → 回首页（首页会自动刷新点位）
  closeSuccess: function () {
    this.setData({ showSuccess: false })
    wx.navigateBack()
  }
})
