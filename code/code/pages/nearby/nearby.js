// pages/nearby/nearby.js —— 动态
Page({
  data: {
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
      const res = await wx.cloud.callFunction({ name: 'getNearby' })
      if (res.result && res.result.code === 0) {
        const rawList = res.result.list || []
        // 批量把云存储 fileID 转成临时 URL（头像 + 照片）
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

  // 加载评论
  async loadComments(recordId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getComments',
        data: { recordId }
      })
      if (res.result && res.result.code === 0) {
        let list = res.result.list || []
        // 评论里的头像也要转临时URL
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

  // 关闭评论面板
  closeCommentPanel() {
    this.setData({ showCommentPanel: false })
  },

  // 评论输入
  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  // 发送评论
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
        // 重新加载评论
        await this.loadComments(this.data.currentRecordId)
        // 更新列表里的评论数
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
