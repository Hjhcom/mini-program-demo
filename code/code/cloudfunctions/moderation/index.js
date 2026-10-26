// 内容安全检测：图片 imgSecCheck + 文字 msgSecCheck
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { type, fileID, text } = event

  if (type === 'image') {
    if (!fileID) return { code: -1, msg: '缺少 fileID' }
    try {
      // 下载云存储文件到临时路径
      const downloadRes = await cloud.downloadFile({ fileID })
      const buffer = downloadRes.fileContent
      // 调微信内容安全图片检测
      const res = await cloud.openapi.security.imgSecCheck({
        media: {
          contentType: 'image/jpeg',
          value: buffer
        }
      })
      if (res.errCode === 0) {
        return { code: 0, msg: 'pass' }
      } else {
        // 违规：删除刚上传的文件
        try { await cloud.deleteFile({ fileList: [fileID] }) } catch (e) {}
        return { code: -1, msg: '图片包含违规内容，请更换' }
      }
    } catch (err) {
      // 87014 = 内容违规
      if (err.errCode === 87014) {
        try { await cloud.deleteFile({ fileList: [fileID] }) } catch (e) {}
        return { code: -1, msg: '图片包含违规内容，请更换' }
      }
      console.error('imgSecCheck error:', err)
      // 检测服务异常时放行，避免误杀（线上可改成拒绝）
      return { code: 0, msg: 'pass (fallback)' }
    }
  }

  if (type === 'text') {
    if (!text) return { code: 0, msg: 'pass' }
    try {
      const { OPENID } = cloud.getWXContext()
      const res = await cloud.openapi.security.msgSecCheck({
        content: String(text).slice(0, 250), // msgSecCheck 限 250 字
        version: 2,
        scene: 2, // 2=评论
        openid: OPENID
      })
      if (res && res.result && res.result.suggest === 'risky') {
        return { code: -1, msg: '内容包含违规信息，请修改' }
      }
      return { code: 0, msg: 'pass' }
    } catch (err) {
      if (err.errCode === 87014) {
        return { code: -1, msg: '内容包含违规信息，请修改' }
      }
      console.error('msgSecCheck error:', err)
      return { code: 0, msg: 'pass (fallback)' }
    }
  }

  return { code: -1, msg: '未知检测类型' }
}
