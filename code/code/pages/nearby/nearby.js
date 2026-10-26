// pages/nearby/nearby.js —— 动态（附近 / 关注 双 tab）
Page({
  data: {
    feedType: 'nearby', // nearby=附近所有人, friends=关注的人+自己
    list: [],
    loading: true,
    isEmpty: false,
    // 评论面板
    showCommentPanel: false,
    currentRecordId: '',
    commentList: [],
    commentText: ''
  },

  onLoad() {
    this.fetchList()
  },

  onPullDownRefresh() {
    this.fetchList().then(() => wx.stopPullDownRefresh())
  },

  // 切换 tab
  switchTab(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.feedType) return
    this.setData({ feedType: type, list: [], isEmpty: false })
    this.fetchList()
  },

  // 跳转发布页
  goPublish() {
    wx.navigateTo({ url: '/pages/feed-publish/feed-publish' })
  },

  formatTime(t) {
    if (!t) return ''
    const d = new Date(t)
    const now = new Date()
    const diff = (now - d) / 1000
    if (diff < 60) return '刚刚'
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前'
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前'
    return (d.getMonth() + 1) + '-' + d.getDate()
  },

  async fetchList() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getNearby',
        data: { feedType: this.data.feedType }
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

        const list = rawList.map(item => ({
          ...item,
          avatarUrl: tempUrlMap[item.avatarUrl] || item.avatarUrl,
          photoFileID: tempUrlMap[item.photoFileID] || item.photoFileID,
          timeText: this.formatTime(item.createTime)
        }))
        this.setData({
          list,
          loading: false,
          isEmpty: list.length === 0
        })
      } else {
        throw new Error(res.result.msg || '加载失败')
      }
    } catch (e) {
      console.error('动态加载失败：', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false, isEmpty: true })
    }
  },

  // 照片大图预览
  onPhotoPreview(e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    wx.previewImage({
      urls: [src],
      current: src
    })
  },

  // 点赞/取消点赞
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
      const res = await wx.cloud.callFunction({
        name: 'likeFeed',
        data: { recordId }
      })
      if (res.result && res.result.code !== 0) {
        this.setData({
          [`list[${index}].isLiked`]: item.isLiked,
          [`list[${index}].likesCount`]: item.likesCount
        })
        wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' })
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

    wx.showModal({
      title: '删除这条动态？',
      content: '删除后不可恢复',
      confirmColor: '#e64340',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '删除中...' })
        try {
          const res = await wx.cloud.callFunction({
            name: 'deleteRecord',
            data: { recordId }
          })
          wx.hideLoading()
          if (res.result && res.result.code === 0) {
            // 从列表移除
            const newList = this.data.list.filter((_, i) => i !== index)
            this.setData({ list: newList, isEmpty: newList.length === 0 })
            wx.showToast({ title: '已删除', icon: 'success' })
          } else {
            wx.showToast({ title: (res.result && res.result.msg) || '删除失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          console.error('删除失败：', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  // 打开评论面板
  async onCommentTap(e) {
    const recordId = e.currentTarget.dataset.id
    this.setData({
      showCommentPanel: true,
      currentRecordId: recordId,
      commentList: [],
      commentText: ''
    })
    await this.loadComments(recordId)
  },

  async loadComments(recordId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getComments',
        data: { recordId }
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
        this.setData({ commentList: list })
      }
    } catch (e) {
      console.error('加载评论失败：', e)
    }
  },

  closeCommentPanel() {
    this.setData({ showCommentPanel: false })
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  async onSendComment() {
    const content = this.data.commentText.trim()
    if (!content) {
      wx.showToast({ title: '评论不能为空', icon: 'none' })
      return
    }

    wx.showLoading({ title: '发送中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'addComment',
        data: {
          recordId: this.data.currentRecordId,
          content
        }
      })
      wx.hideLoading()
      if (res.result && res.result.code === 0) {
        this.setData({ commentText: '' })
        await this.loadComments(this.data.currentRecordId)
        const index = this.data.list.findIndex(item => item._id === this.data.currentRecordId)
        if (index >= 0) {
          this.setData({
            [`list[${index}].commentCount`]: this.data.list[index].commentCount + 1
          })
        }
        wx.showToast({ title: '已发送', icon: 'success' })
      } else {
        wx.showToast({ title: res.result.msg || '发送失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('发送评论失败：', e)
      wx.showToast({ title: '发送失败', icon: 'none' })
    }
  }
})
