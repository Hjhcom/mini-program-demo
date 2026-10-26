// pages/records/records.js —— 我的打卡记录：分页列表（触底加载更多 / 下拉刷新）+ 详情
const app = getApp()
const i18n = require('../../utils/i18n')

Page({
  data: {
    records: [],       // 已加载的打卡记录（分页累加）
    total: 0,          // 总记录数（服务端全量）
    successCount: 0,   // 成功次数（服务端全量统计，不随翻页变化）
    page: 0,           // 已加载到第几页
    hasMore: true,     // 还有没有下一页
    loading: true,     // 首屏加载中
    loadingMore: false,// 触底加载下一页中
    showDetail: false, // 是否显示详情弹窗
    detail: null,      // 当前查看的记录
    dark: false,       // 深色模式（全局设置）
    fontScale: 'md',   // 字体大小（全局设置）
    lang: i18n.zh      // 当前语言文案
  },

  onLoad: function () {
    // ⚠️ 首屏就要用到 lang（全屏 loading 文案、加载失败提示），不能只在 onShow 里取，
    //    否则英文模式下首屏会闪出中文文案
    const isEn = app.globalData.language === 'en'
    this.setData({ lang: isEn ? i18n.en : i18n.zh })
    this.loadRecords(true)
  },

  // 页面显示：同步全局设置（深色模式 / 字体大小 / 语言）
  onShow: function () {
    const isEn = app.globalData.language === 'en'
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: isEn ? i18n.en : i18n.zh
    })
    wx.setNavigationBarTitle({ title: this.data.lang.records.navTitle })
  },

  // 触底加载下一页（触发距离在 records.json 的 onReachBottomDistance）
  onReachBottom: function () {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return
    this.loadRecords(false)
  },

  // 下拉刷新：回到第 1 页重载（records.json 里已开启 enablePullDownRefresh）
  onPullDownRefresh: function () {
    // silent = true：下拉刷新自带转圈，不要再叠一个全屏 loading
    this.loadRecords(true, true).then(() => wx.stopPullDownRefresh())
  },

  // 加载打卡记录（调 getRecords 云函数）
  //  reset  = true  从第 1 页重载（首屏 / 下拉刷新）；false 追加下一页
  //  silent = true  不弹全屏 loading（下拉刷新用）
  //  返回 promise，方便调用方在结束后收尾（如 stopPullDownRefresh）
  loadRecords: function (reset, silent) {
    const page = reset ? 1 : this.data.page + 1
    if (reset) {
      this.setData({ loading: true })
      if (!silent) wx.showLoading({ title: this.data.lang.records.loading })
    } else {
      // 加载更多只在列表底部显示，避免全屏 loading 遮住已经看到的内容
      this.setData({ loadingMore: true })
    }

    return wx.cloud.callFunction({
      name: 'getRecords',
      data: { page: page }
    }).then(async res => {
      wx.hideLoading()
      const r = res.result || {}
      if (r.code !== 0) throw new Error(r.msg || '加载失败')
      // 打卡照片：云存储 fileID 换成临时 https 链接供 <image> 渲染
      const rawList = r.records || []
      const photoIDs = rawList.map(i => i.photoFileID).filter(f => f && f.indexOf('cloud://') === 0)
      let photoMap = {}
      if (photoIDs.length > 0) {
        try {
          const urlRes = await wx.cloud.getTempFileURL({ fileList: photoIDs })
          ;(urlRes.fileList || []).forEach(f => { photoMap[f.fileID] = f.tempFileURL })
        } catch (e) {
          console.error('照片临时链接获取失败：', e)
        }
      }
      // 补充展示字段：格式化时间、相似度百分比、照片临时链接
      const list = rawList.map(item => ({
        ...item,
        photoUrl: photoMap[item.photoFileID] || '',
        timeText: this.formatTime(item.createTime),
        simText: Math.round((item.similarity || 0) * 100) + '%'
      }))
      this.setData({
        records: reset ? list : this.data.records.concat(list),
        page: page,
        total: r.total || 0,
        successCount: r.successTotal || 0, // 服务端全量统计，翻页不会漂
        hasMore: r.hasMore === true,
        loading: false,
        loadingMore: false
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('加载打卡记录失败：', err)
      this.setData({ loading: false, loadingMore: false })
      wx.showToast({
        title: reset ? this.data.lang.records.loadFail : this.data.lang.records.loadMoreFail,
        icon: 'none'
      })
    })
  },

  // 云数据库时间 → 本地时间字符串
  formatTime: function (t) {
    const d = new Date(t)
    if (isNaN(d.getTime())) return ''
    const pad = n => (n < 10 ? '0' + n : '' + n)
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  },

  // 点击列表项 → 查看详情
  onItemTap: function (e) {
    const item = this.data.records[e.currentTarget.dataset.index]
    if (item) {
      this.setData({ showDetail: true, detail: item })
    }
  },

  // 点击照片 → 全屏预览（缩略图上用 catchtap 阻止冒泡，不触发详情弹窗）
  onPhotoPreview: function (e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    wx.previewImage({ urls: [src], current: src })
  },

  // 关闭详情弹窗
  closeDetail: function () {
    this.setData({ showDetail: false })
  },

  // 去首页打卡
  goHome: function () {
    wx.switchTab({ url: '/pages/index/index' })
  },

  // 右上角「...」菜单 → 转发给朋友：分享指向首页
  onShareAppMessage: function () {
    const user = app.globalData.userInfo
    const invite = (user && user.inviteCode) || ''
    const title = (app.globalData.language === 'en' ? i18n.en : i18n.zh).common.shareHome
    return {
      title: title,
      path: '/pages/index/index' + (invite ? '?invite=' + invite : '')
    }
  },

  // 右上角「...」菜单 → 分享到朋友圈
  onShareTimeline: function () {
    const user = app.globalData.userInfo
    const invite = (user && user.inviteCode) || ''
    const title = (app.globalData.language === 'en' ? i18n.en : i18n.zh).common.shareHome
    return {
      title: title,
      query: invite ? 'invite=' + invite : 'from=timeline'
    }
  }
})
