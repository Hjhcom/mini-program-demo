// 云函数：voiceCheckin 声控打卡
// 流程：下载录音 → 讯飞语音识别 → 与打卡点咒语比对 → 写入 records 打卡记录
const cloud = require('wx-server-sdk')
const crypto = require('crypto') // Node 内置：签名用
const WebSocket = require('ws') // WebSocket 客户端（云端安装依赖时自动安装）

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// ========== 讯飞凭证（把你们申请到的三个值填进来）==========
const XF_APPID = '6b3af9a7'
const XF_API_KEY = 'bdb886586f54fa8500e9e29933065a28'
const XF_API_SECRET = 'OTUxNzYyMmJmYTJmYmQxODA1YjAwOGM1'
const XF_URL = 'wss://iat-api.xfyun.cn/v2/iat'

// ========== 工具函数 ==========

// 1. 生成讯飞鉴权 URL（RFC1123 时间 + HMAC-SHA256 签名）
function getAuthUrl() {
  const date = new Date().toUTCString() // 例：Mon, 21 Sep 2026 10:00:00 GMT
  const host = 'iat-api.xfyun.cn'
  const signatureOrigin = 'host: ' + host + '\ndate: ' + date + '\nGET /v2/iat HTTP/1.1'
  const signature = crypto
    .createHmac('sha256', XF_API_SECRET)
    .update(signatureOrigin)
    .digest('base64')
  const authorizationOrigin =
    'api_key="' + XF_API_KEY + '", algorithm="hmac-sha256", headers="host date request-line", signature="' + signature + '"'
  const authorization = Buffer.from(authorizationOrigin).toString('base64')
  return (
    XF_URL +
    '?authorization=' + encodeURIComponent(authorization) +
    '&date=' + encodeURIComponent(date) +
    '&host=' + host
  )
}

// 2. 归一化文本：转小写、全角转半角、去掉空格和标点（用于咒语比对）
function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[\s，。、！？；：""''（）,.!?;:()\u3000]/g, '')
}

// 3. 编辑距离相似度（0~1，1 表示完全一样）
function similarity(a, b) {
  if (a === b) return 1
  const m = a.length
  const n = b.length
  if (m === 0 || n === 0) return 0
  const dp = []
  for (let i = 0; i <= m; i++) {
    dp[i] = [i]
    for (let j = 1; j <= n; j++) dp[i][j] = 0
  }
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return 1 - dp[m][n] / Math.max(m, n)
}

// 4. 调用讯飞语音听写：传入音频 Buffer，返回识别文本
function recognize(audioBuffer) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(getAuthUrl())
    let text = ''

    ws.on('open', () => {
      // 把音频切成小块，逐帧发送（首帧带鉴权信息）
      const chunkSize = 8000 // 每帧最多 8000 字节
      const frames = []
      for (let i = 0; i < audioBuffer.length; i += chunkSize) {
        frames.push(audioBuffer.slice(i, i + chunkSize))
      }
      if (frames.length === 0) frames.push(Buffer.alloc(0))

      frames.forEach((chunk, i) => {
        const status = i === 0 ? 0 : i === frames.length - 1 ? 2 : 1
        const frame = {
          data: {
            status: status,
            audio: chunk.toString('base64')
          }
        }
        // 第一帧带上应用信息和音频格式
        if (i === 0) {
          frame.common = { app_id: XF_APPID }
          frame.business = {
            language: 'zh_cn',
            domain: 'iat',
            accent: 'mandarin',
            vad_eos: 10000 // 静音 10 秒自动结束
          }
          frame.data.format = 'audio/L16;rate=16000'
          frame.data.encoding = 'wav'
        }
        ws.send(JSON.stringify(frame))
      })
    })

    ws.on('message', data => {
      const msg = JSON.parse(data.toString())
      if (msg.code !== 0) {
        reject(new Error('讯飞返回错误 ' + msg.code + ': ' + msg.message))
        ws.close()
        return
      }
      // 拼接识别出的文字片段
      if (msg.data && msg.data.result && msg.data.result.ws) {
        msg.data.result.ws.forEach(wsItem => {
          wsItem.cw.forEach(cw => {
            text += cw.w
          })
        })
      }
      // 最后一帧（status=2）：识别完成
      if (msg.data && msg.data.status === 2) {
        ws.close()
        resolve(text)
      }
    })

    ws.on('error', err => reject(err))
  })
}

// ========== 云函数主入口 ==========
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const fileID = event.fileID
  const pointId = event.pointId

  // 1. 下载用户录音
  const dl = await cloud.downloadFile({ fileID })
  const audio = dl.fileContent

  // 诊断：打印录音文件信息（排查 10107 用，可保留）
  console.log('录音文件大小(字节)：', audio.length)
  if (audio.length >= 44) {
    console.log('wav参数-采样率：', audio.readUInt32LE(24), '声道：', audio.readUInt16LE(22), '位深：', audio.readUInt16LE(34))
  } else {
    console.log('警告：录音文件过小，很可能是空录音（麦克风没录到声音）')
  }

  // 2. 读取打卡点（拿咒语）
  const pointRes = await db.collection('points').doc(pointId).get()
  const point = pointRes.data

  // 3. 讯飞识别
  const recognizedText = await recognize(audio)

  // 4. 归一化后比对（相似度 ≥ 0.8 或互为包含 都算通过）
  const target = normalize(point.spell)
  const got = normalize(recognizedText)
  const sim = similarity(got, target)
  const matched = sim >= 0.8 || (got.includes(target) || target.includes(got))

  // 5. 写入打卡记录
  await db.collection('records').add({
    data: {
      openid: OPENID,
      pointId: pointId,
      pointName: point.name,
      spell: point.spell,
      recognizedText: recognizedText,
      similarity: Math.round(sim * 100) / 100,
      matched: matched,
      createTime: db.serverDate()
    }
  })

  return {
    code: 0,
    recognizedText: recognizedText,
    matched: matched,
    similarity: Math.round(sim * 100) / 100
  }
}
