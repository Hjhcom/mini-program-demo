// pages/nearby/nearby.js —— 动态（附近 / 关注 双 tab）
// F1：上拉分页加载；F3：评论时间 / 本人删除 / 评论点赞；
// N2：通知跳转过来后高亮对应动态；L1：文案全部走语言包。
const app = getApp()
const i18n = require('../../utils/i18n')

const FEED_PAGE_SIZE = 20

Page({
  data: {
    feedType: 'nearby', // nearby=附近所有人, friends=关注的人+自己
    list: [],
    loading: true,
    loadingMore: false,
    hasMore: false,
    isEmpty: false,
    dark: false,
    fontScale: 'md',
    lang: i18n.zh,
    // 评论面板
    showCommentPanel: false,
    currentRecordId: '',
    commentList: [],
    commentText: '',
    commentHasMore: false,
    commentLoadingMore: false
  },

  onShow() {
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang
    })
    wx.setNavigationBarTitle({ title: lang.nearby.navTitle })
    app.refreshNotificationBadge()
    // 发布页返回后、切换 tab 回来都重拉第一页，保证最新动态可见
    this.fetchList(true)
  },

  onPullDownRefresh() {
    this.fetchList(true).then(() => wx.stopPullDownRefresh())
  },

  // F1：上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) {
      this.fetchList(false)
    }
  },

  // 切换 tab
  switchTab(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.feedType) return
    this.setData({ feedType: type, list: [], isEmpty: false, hasMore: false })
    this.fetchList(true)
  },

  // 跳转发布页
  goPublish() {
    wx.navigateTo({ url: '/pages/feed-publish/feed-publish' })
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

  async fetchList(reset) {
    const skip = reset ? 0 : this.data.list.length
    this.setData(reset ? { loading: true } : { loadingMore: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getNearby',
        data: { feedType: this.data.feedType, skip }
      })
      if (res.result && res.result.code === 0) {
        const rawList = res.result.list || []
        const fileIDs = []
        rawList.forEach(item => {
          if (item.avatarUrl && item.avatarUrl.startsWith('cloud://')) fileIDs.push(item.avatarUrl)
          if (item.photoFileID && item.photoFileID.startsWith('cloud://')) fileIDs.push(item.photoFileID)
        })

        let tempUrlMap = {}
        if (fileIDs.length > 0) {
          try {
            const urlRes = await wx.cloud.getTempFileURL({ fileList: fileIDs })
            urlRes.fileList.forEach(f => { tempUrlMap[f.fileID] = f.tempFileURL })
          } catch (e) {
            console.error('获取临时URL失败：', e)
          }
        }

        const mapped = rawList.map(item => ({
          ...item,
          avatarUrl: tempUrlMap[item.avatarUrl] || item.avatarUrl,
          photoFileID: tempUrlMap[item.photoFileID] || item.photoFileID,
          timeText: this.formatTime(item.createTime),
          avatarText: (item.nickname || '').charAt(0) || '?',
          highlight: false
        }))
        const list = reset ? mapped : this.data.list.concat(mapped)
        this.setData({
          list,
          loading: false,
          loadingMore: false,
          hasMore: !!res.result.hasMore,
          isEmpty: list.length === 0
        })
        // N2：列表就绪后再消费待高亮动态
        this.applyPendingHighlight()
      } else {
        throw new Error((res.result && res.result.msg) || this.data.lang.nearby.loadFail)
      }
    } catch (e) {
      console.error('动态加载失败：', e)
      wx.showToast({ title: this.data.lang.nearby.loadFail, icon: 'none' })
      this.setData({ loading: false, loadingMore: false, isEmpty: this.data.list.length === 0 })
    }
  },

  // N2：消费通知带来的待高亮 recordId，高亮 2.5 秒后自动取消
  applyPendingHighlight() {
    const targetId = app.globalData.pendingHighlightRecordId
    if (!targetId) return
    app.globalData.pendingHighlightRecordId = ''
    const index = this.data.list.findIndex(item => item._id === targetId)
    if (index < 0) return
    this.setData({ [`list[${index}].highlight`]: true })
    setTimeout(() => {
      const i = this.data.list.findIndex(item => item._id === targetId)
      if (i >= 0) this.setData({ [`list[${i}].highlight`]: false })
    }, 2500)
  },

  // 照片大图预览
  onPhotoPreview(e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    wx.previewImage({ urls: [src], current: src })
  },

  // F2：点击头像/昵称进入他人主页（服务端按动态记录解析作者，前端不接触 openid）
  onAvatarTap(e) {
    const recordId = e.currentTarget.dataset.id
    if (!recordId) return
    wx.navigateTo({ url: '/pages/user-profile/user-profile?recordId=' + recordId })
  },

  // 点赞/取消点赞动态
  async onLikeTap(e) {
    const recordId = e.currentTarget.dataset.id
    const index = this.data.list.findIndex(item => item._id === recordId)
    if (index < 0) return

    const item = this.data.list[index]
    const newLiked = !item.isLiked
    const newCount = item.likesCount + (newLiked ? 1 : -1)

    this.setData({
      [`list[${index}].isLiked`]: newLiked,
      [`list[${index}].likesCount`]: newCount
    })

    try {
      const res = await wx.cloud.callFunction({ name: 'likeFeed', data: { recordId } })
      if (res.result && res.result.code !== 0) {
        this.setData({
          [`list[${index}].isLiked`]: item.isLiked,
          [`list[${index}].likesCount`]: item.likesCount
        })
        wx.showToast({ title: res.result.msg || this.data.lang.nearby.loadFail, icon: 'none' })
      }
    } catch (e) {
      this.setData({
        [`list[${index}].isLiked`]: item.isLiked,
        [`list[${index}].likesCount`]: item.likesCount
      })
      console.error('点赞失败：', e)
    }
  },

  // 删除自己的动态
  onDeleteTap(e) {
    const recordId = e.currentTarget.dataset.id
    const index = this.data.list.findIndex(item => item._id === recordId)
    if (index < 0) return
    const lang = this.data.lang.nearby

    wx.showModal({
      title: lang.deleteTitle,
      content: lang.deleteContent,
      confirmColor: '#e64340',
      confirmText: lang.delete,
      cancelText: this.data.lang.common.cancel,
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: lang.deleting })
        try {
          const res = await wx.cloud.callFunction({
            name: 'deleteRecord',
            data: { recordId }
          })
          wx.hideLoading()
          if (res.result && res.result.code === 0) {
            const newList = this.data.list.filter((_, i) => i !== index)
            this.setData({ list: newList, isEmpty: newList.length === 0 })
            wx.showToast({ title: lang.deleted, icon: 'success' })
          } else {
            wx.showToast({ title: (res.result && res.result.msg) || lang.deleteFail, icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          console.error('删除失败：', err)
          wx.showToast({ title: lang.deleteFail, icon: 'none' })
        }
      }
    })
  },

  // ===== 评论面板 =====
  async onCommentTap(e) {
    const recordId = e.currentTarget.dataset.id
    this.setData({
      showCommentPanel: true,
      currentRecordId: recordId,
      commentList: [],
      commentText: '',
      commentHasMore: false,
      commentLoadingMore: false
    })
    await this.loadComments(true)
  },

  async loadComments(reset) {
    const skip = reset ? 0 : this.data.commentList.length
    this.setData(reset ? {} : { commentLoadingMore: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getComments',
        data: { recordId: this.data.currentRecordId, skip }
      })
      if (res.result && res.result.code === 0) {
        let list = res.result.list || []
        const fileIDs = list.filter(c => c.avatarUrl && c.avatarUrl.startsWith('cloud://')).map(c => c.avatarUrl)
        if (fileIDs.length > 0) {
          try {
            const urlRes = await wx.cloud.getTempFileURL({ fileList: fileIDs })
            const map = {}
            urlRes.fileList.forEach(f => { map[f.fileID] = f.tempFileURL })
            list = list.map(c => ({ ...c, avatarUrl: map[c.avatarUrl] || c.avatarUrl }))
          } catch (e) {}
        }
        const mapped = list.map(c => ({ ...c, timeText: this.formatTime(c.createTime), avatarText: (c.nickname || '').charAt(0) || '?' }))
        this.setData({
          commentList: reset ? mapped : this.data.commentList.concat(mapped),
          commentHasMore: !!res.result.hasMore,
          commentLoadingMore: false
        })
      } else {
        this.setData({ commentLoadingMore: false })
      }
    } catch (e) {
      console.error('加载评论失败：', e)
      this.setData({ commentLoadingMore: false })
    }
  },

  // 评论面板内上拉加载更多
  loadMoreComments() {
    if (this.data.commentHasMore && !this.data.commentLoadingMore) {
      this.loadComments(false)
    }
  },

  closeCommentPanel() {
    this.setData({ showCommentPanel: false })
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  async onSendComment() {
    const lang = this.data.lang.nearby
    const content = this.data.commentText.trim()
    if (!content) {
      wx.showToast({ title: lang.commentRequired, icon: 'none' })
      return
    }

    wx.showLoading({ title: lang.sending })
    try {
      // 文字内容安全检测
      const mr = await wx.cloud.callFunction({
        name: 'moderation',
        data: { type: 'text', text: content }
      })
      if (mr.result && mr.result.code !== 0) {
        wx.hideLoading()
        wx.showToast({ title: mr.result.msg || '内容违规', icon: 'none' })
        return
      }

      const res = await wx.cloud.callFunction({
        name: 'addComment',
        data: { recordId: this.data.currentRecordId, content }
      })
      wx.hideLoading()
      if (res.result && res.result.code === 0) {
        this.setData({ commentText: '' })
        await this.loadComments(true)
        const index = this.data.list.findIndex(item => item._id === this.data.currentRecordId)
        if (index >= 0) {
          this.setData({
            [`list[${index}].commentCount`]: this.data.list[index].commentCount + 1
          })
        }
        wx.showToast({ title: lang.sent, icon: 'success' })
      } else {
        wx.showToast({ title: (res.result && res.result.msg) || lang.sendFail, icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('发送评论失败：', e)
      wx.showToast({ title: lang.sendFail, icon: 'none' })
    }
  },

  // 点赞/取消点赞评论
  async onLikeComment(e) {
    const commentId = e.currentTarget.dataset.id
    const index = this.data.commentList.findIndex(c => c._id === commentId)
    if (index < 0) return
    const c = this.data.commentList[index]
    const newLiked = !c.isLiked
    const newCount = c.likesCount + (newLiked ? 1 : -1)
    this.setData({
      [`commentList[${index}].isLiked`]: newLiked,
      [`commentList[${index}].likesCount`]: newCount
    })
    try {
      const res = await wx.cloud.callFunction({ name: 'likeComment', data: { commentId } })
      if (res.result && res.result.code !== 0) {
        this.setData({
          [`commentList[${index}].isLiked`]: c.isLiked,
          [`commentList[${index}].likesCount`]: c.likesCount
        })
      }
    } catch (e) {
      this.setData({
        [`commentList[${index}].isLiked`]: c.isLiked,
        [`commentList[${index}].likesCount`]: c.likesCount
      })
      console.error('评论点赞失败：', e)
    }
  },

  // 删除本人评论
  onDeleteComment(e) {
    const commentId = e.currentTarget.dataset.id
    const index = this.data.commentList.findIndex(c => c._id === commentId)
    if (index < 0) return
    const lang = this.data.lang.nearby
    wx.showModal({
      title: lang.commentDelete,
      content: lang.deleteContent,
      confirmColor: '#e64340',
      confirmText: lang.delete,
      cancelText: this.data.lang.common.cancel,
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: lang.deleting })
        try {
          const res = await wx.cloud.callFunction({
            name: 'deleteComment',
            data: { commentId }
          })
          wx.hideLoading()
          if (res.result && res.result.code === 0) {
            const recordId = res.result.recordId || this.data.currentRecordId
            const newList = this.data.commentList.filter((_, i) => i !== index)
            this.setData({ commentList: newList })
            const feedIndex = this.data.list.findIndex(item => item._id === recordId)
            if (feedIndex >= 0) {
              this.setData({
                [`list[${feedIndex}].commentCount`]: Math.max(0, this.data.list[feedIndex].commentCount - 1)
              })
            }
            wx.showToast({ title: lang.commentDeleted, icon: 'success' })
          } else {
            wx.showToast({ title: (res.result && res.result.msg) || lang.commentDeleteFail, icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          console.error('删除评论失败：', err)
          wx.showToast({ title: lang.commentDeleteFail, icon: 'none' })
        }
      }
    })
  }
})
