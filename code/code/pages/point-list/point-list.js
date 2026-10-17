// pages/point-list/point-list.js —— 打卡点列表（F-09）
//
// 做三件事：① 定位 → ② 算距离并分组（附近 500 米内 / 其他）→ ③ 点条目回首页选中该点位。
// 距离计算与分组用 utils/geo.js（纯函数、有单测 tools/test-geo.js），页面里只负责取数和展示。
//
// ⚠️ 定位失败不阻塞列表：用户不给定位权限时照样能看全部点位，只是不显示距离、不做分组
//    —— 「看得到点位」是核心功能，「看到距离」是增强，不能因为后者失败就让前者不可用。
const app = getApp()
const i18n = require('../../utils/i18n')
const geo = require('../../utils/geo.js')

Page({
  data: {
    loading: true,
    locating: true,     // 是否正在取经纬度
    hasLocation: false, // 有没有拿到当前位置（拿不到就不显示距离、不分组）
    sections: [],       // [{ key: 'near'|'others', title, items }]
    total: 0,           // 点位总数
    totalText: '',      // 「共 N 个点位」（wxml 不能调函数，先拼好）
    dark: false,        // 深色模式（全局设置）
    fontScale: 'md',    // 字体大小（全局设置）
    lang: i18n.zh
  },

  // 取当前语言文案（逻辑层用；wxml 用 data.lang）
  getLang: function () {
    return app.globalData.language === 'en' ? i18n.en : i18n.zh
  },

  // 本页要在 JS 里拼「距离 123 米」这类文案，所以 onLoad 就得取 lang，
  // 只在 onShow 里取会让首屏用 i18n.zh 的默认值、英文模式下残留中文。
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
    wx.setNavigationBarTitle({ title: lang.pointList.navTitle })
    // 每次进来都重定位 + 重拉：用户可能刚在首页新建了点位，也可能换了位置
    this.reload()
  },

  onPullDownRefresh: function () {
    this.reload(function () {
      wx.stopPullDownRefresh()
    })
  },

  // 定位 → 拉点位（定位失败也继续拉）
  reload: function (done) {
    this.setData({ loading: true, locating: true })
    this.getLocation(loc => {
      this.loadPoints(loc, done)
    })
  },

  // 取当前位置。失败不阻塞：cb(null) 照样往下走
  getLocation: function (cb) {
    wx.getLocation({
      type: 'gcj02',
      success: res => {
        this.setData({ hasLocation: true, locating: false })
        cb({ latitude: res.latitude, longitude: res.longitude })
      },
      fail: err => {
        console.warn('定位失败，列表不显示距离：', err)
        this.setData({ hasLocation: false, locating: false })
        cb(null)
      }
    })
  },

  // 拉点位 → 补距离 → 分组
  loadPoints: function (loc, done) {
    wx.cloud.callFunction({
      name: 'getPoints'
    }).then(res => {
      const r = res.result || {}
      if (r.code !== 0) throw new Error(r.msg || 'load fail')
      const L = this.getLang().pointList
      const decorated = geo.attachDistance(r.points || [], loc).map(p => this.decorate(p))
      const groups = geo.groupByDistance(decorated)
      // 分组只保留有内容的那一段（没有附近的点位时就不显示「附近」标题）
      const sections = []
      if (groups.near.length > 0) sections.push({ key: 'near', title: L.nearby, items: groups.near })
      if (groups.others.length > 0) sections.push({ key: 'others', title: L.others, items: groups.others })
      this.setData({
        sections: sections,
        total: decorated.length,
        // wxml 不能调函数，带占位符的文案在这里拼好
        totalText: i18n.format(L.total, { n: decorated.length }),
        loading: false
      })
      if (done) done()
    }).catch(err => {
      console.error('加载点位失败：', err)
      this.setData({
        sections: [],
        total: 0,
        totalText: i18n.format(this.getLang().pointList.total, { n: 0 }),
        loading: false
      })
      if (done) done()
      wx.showToast({ title: this.getLang().pointList.loadFail, icon: 'none' })
    })
  },

  // 补展示字段：距离文案、类型标签
  // 距离单位走语言包（米 / 公里、m / km），geo.formatDistance 只返回 'm'|'km' 不掺文案
  decorate: function (p) {
    const L = this.getLang().pointList
    const d = geo.formatDistance(p.distance)
    const unit = d.unit === 'm' ? L.unitM : (d.unit === 'km' ? L.unitKm : '')
    return Object.assign({}, p, {
      distText: unit ? d.value + ' ' + unit : d.value,
      typeText: p.isOfficial ? L.typeOfficial : (p.isMine ? L.typeMine : L.typePlayer),
      typeCls: p.isOfficial ? 'official' : (p.isMine ? 'mine' : 'player')
    })
  },

  // 点某个点位 → 回首页并选中它
  // 首页是 tabBar 页，没法带 query 跳回去，所以用 globalData 传一个 pendingPointId，
  // 首页 onShow / loadPoints 里会把它消化掉（见 pages/index/index.js 的 applyPendingPoint）
  onPointTap: function (e) {
    const p = this.pick(e)
    if (!p) return
    app.globalData.pendingPointId = p._id
    wx.navigateBack({
      // 兜底：若本页不是从首页 navigateTo 进来的（页面栈只有一层），navigateBack 会失败
      fail: () => wx.switchTab({ url: '/pages/index/index' })
    })
  },

  // 列表里直接唤起导航（不用先回首页看图钉）
  onNavigateTap: function (e) {
    const p = this.pick(e)
    if (!p) return
    const lat = Number(p.latitude)
    const lng = Number(p.longitude)
    if (!isFinite(lat) || !isFinite(lng)) {
      wx.showToast({ title: this.getLang().pointList.navigateFail, icon: 'none' })
      return
    }
    wx.openLocation({
      latitude: lat,
      longitude: lng,
      name: p.name,
      scale: 18,
      fail: err => {
        // 用户点左上角返回也会走 fail（errMsg 含 cancel），不算错误
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('cancel') > -1) return
        console.error('打开内置地图失败：', err)
        wx.showToast({ title: this.getLang().pointList.navigateFail, icon: 'none' })
      }
    })
  },

  // 从事件里取出被点的点位（sections 是两段结构，靠 data-group + data-index 定位）
  pick: function (e) {
    const ds = e.currentTarget.dataset
    const section = (this.data.sections || []).filter(s => s.key === ds.group)[0]
    if (!section) return null
    return section.items[ds.index] || null
  },

  // 重新定位（用户之前拒绝过权限、现在想再试）
  onRetryLocate: function () {
    this.reload()
  }
})
