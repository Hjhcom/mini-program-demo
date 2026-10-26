// pages/notifications/notifications.js —— 消息通知
// N1：进入消息页才把未读置为已读，未读数驱动 tabBar 角标；
// N2：点赞/评论通知点击后跳到动态流并高亮对应那条；
// L1：动作文案、时间格式、空状态全部走语言包。
const app = getApp()
const i18n = require('../../utils/i18n')

Page({
  data: {
    list: [],
    loading: true,
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
    wx.setNavigationBarTitle({ title: lang.notifications.navTitle })
    this.fetchList(true)
  },

  onPullDownRefresh() {
    this.fetchList(true).then(() => wx.stopPullDownRefresh())
  },

  formatTime(t) {
    const common = this.data.lang.common
    if (!t) return ''
    const d = new Date(t)
    const now = new Date()
    const diff = (now - d) / 1000
    if (diff < 60) return common.timeJustNow
    if (diff < 3600) return i18n.format(common.timeMin, { n: Math.floor(diff / 60) })
    if (diff < 86400) return i18n.format(common.timeHour, { n: Math.floor(diff / 3600) })
    return i18n.format(common.timeDay, { m: d.getMonth() + 1, d: d.getDate() })
  },

  // 按当前语言拼通知动作（服务端只回 type / text，不写死中文）
  actionText(n) {
    const lang = this.data.lang.notifications
    if (n.type === 'like') return lang.actionLike
    if (n.type === 'comment') return i18n.format(lang.actionComment, { text: n.text || '' })
    if (n.type === 'friend') return lang.actionFriend
    return ''
  },

  async fetchList(markRead) {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getNotifications',
        data: { markRead: !!markRead }
      })
      if (res.result && res.result.code === 0) {
        const raw = res.result.list || []
        const unread = res.result.unread || 0
        // tabBar 未读角标（消息是第 3 个 tab，index 2）
        if (unread > 0) {
          wx.setTabBarBadge({ index: 2, text: String(unread) })
        } else {
          wx.removeTabBarBadge({ index: 2 })
        }

        // 头像 fileID 换临时链接
        const fileIDs = raw.filter(n => n.avatarUrl && n.avatarUrl.startsWith('cloud://')).map(n => n.avatarUrl)
        let urlMap = {}
        if (fileIDs.length > 0) {
          try {
            const ures = await wx.cloud.getTempFileURL({ fileList: fileIDs })
            ures.fileList.forEach(f => { urlMap[f.fileID] = f.tempFileURL })
          } catch (e) {}
        }

        const list = raw.map(n => ({
          ...n,
          avatarUrl: urlMap[n.avatarUrl] || n.avatarUrl,
          avatarText: (n.nickname || '').charAt(0) || '?',
          action: this.actionText(n),
          timeText: this.formatTime(n.createTime)
        }))
        this.setData({ list, loading: false })
      } else {
        throw new Error((res.result && res.result.msg) || this.data.lang.notifications.loadFail)
      }
    } catch (e) {
      console.error('消息加载失败：', e)
      this.setData({ loading: false })
    }
  },

  // N2：点赞/评论通知 → 跳动态流并高亮该条；好友通知 → 进入对方主页；
  // 早期旧通知没有句柄时不跳转，仅作为兜底。
  onItemTap(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(n => n._id === id)
    if (!item) return

    // 好友通知：带对方视角关系句柄进主页，归属校验由 userProfile 云函数完成
    if (item.type === 'friend') {
      if (!item.friendRecordId) return
      wx.navigateTo({
        url: `/pages/user-profile/user-profile?friendRecordId=${item.friendRecordId}`
      })
      return
    }

    // 点赞 / 评论通知：回到动态流并高亮对应那条
    if (!item.recordId) return
    app.globalData.pendingHighlightRecordId = item.recordId
    wx.switchTab({ url: '/pages/nearby/nearby' })
  }
})
