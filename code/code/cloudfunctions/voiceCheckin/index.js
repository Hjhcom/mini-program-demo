// 云函数：voiceCheckin 声控打卡
// 流程：下载录音 → 讯飞语音识别 → 与打卡点咒语比对 → 写入 records 打卡记录
const cloud = require('wx-server-sdk')
const crypto = require('crypto') // Node 内置：签名用
const WebSocket = require('ws') // WebSocket 客户端（云端安装依赖时自动安装）
// 判定核心（归一化 + 相似度 + 匹配判定）在同目录 lib/match.js：纯函数、不依赖 wx-server-sdk，
// 所以能直接 require 出来跑本地单测（node tools/test-voice-match.js）。
// ⚠️ 云函数各自独立打包，只能 require 自己目录内的文件 —— code/code/utils/spell.js 是**前端**
//    那份拷贝（两者必须行为一致，由 tools/check-sync.js 兜底比对），云函数 require 不到。
const { matchSpell, REASON } = require('./lib/match')

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

// 2. 调用讯飞语音听写：传入音频 Buffer，返回识别文本（没听清时返回空串）
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
  const taskId = event.taskId || ''

  // 1. 下载用户录音
  const dl = await cloud.downloadFile({ fileID })
  const audio = dl.fileContent

  // 诊断：打印录音文件信息（排查 10107 用，可保留）
  console.log('录音文件大小(字节)：', audio.length)
  if (audio.length >= 44) {
    console.log('wav参数-采样率：', audio.readUInt32LE(24), '声道：', audio.readUInt16LE(22), '位深：', audio.readUInt16LE(34))
  }

  // 2. 读取打卡点（拿咒语）
  //    ⚠️ 同样用 where：云函数端 doc(pointId).get() 在点位不存在时会「抛异常」，
  //    不是返回 null，友好提示写不出来。where 空结果返回空数组，data[0] 为 undefined。
  const pointRes = await db.collection('points').where({ _id: pointId }).get()
  const point = pointRes.data[0]
  if (!point) return { code: -1, msg: '打卡点不存在' }

  let targetSpell = point.spell
  let task = null
  if (taskId) {
    // ⚠️ 必须用 where 查，不能用 doc(taskId).get()
    //    云函数端 doc().get() 查不到记录时会「抛异常」，不是返回 null：
    //    errCode: -1, errMsg: document.get:fail document with _id xxx does not exist
    //    也就是说下面的 if (!task) 永远执行不到，前端只会收到一个函数执行失败的报错。
    //    where 查询空结果返回空数组，才能真正走到友好提示。
    const tRes = await db.collection('tasks').where({ _id: taskId }).get()
    task = tRes.data[0]
    if (!task) return { code: -1, msg: '任务不存在' }
    if (task.status !== 'accepted') return { code: -1, msg: '任务状态异常' }
    if (task.assigneeOpenid !== OPENID) return { code: -1, msg: '这不是指派给你的任务' }
    // 任务必须在指定点位完成：任务写在 A 点，站在 B 点念对咒语也不算过。
    // 前端虽然限制了「同点位才传 taskId」，但前端不可信，云函数才是真正的关卡。
    if (task.pointId !== pointId) return { code: -1, msg: '请在任务指定点位打卡' }
    if (new Date(task.deadline) < new Date()) return { code: -1, msg: '任务已超时' }
    targetSpell = task.spell
  }

  // 3. 讯飞识别
  //    只有 44 字节 = 裸 wav 头、一个采样点都没有（麦克风压根没录到声音）。
  //    这种情况不必去打讯飞（白等一次 WebSocket 往返 + 可能报 10107），
  //    直接把识别结果当空串，交给下面统一按「没听清」处理。
  const isSilentWav = audio.length <= 44
  if (isSilentWav) console.log('录音仅 44 字节文件头（无音频数据），跳过讯飞识别')
  const recognizedText = isSilentWav ? '' : await recognize(audio)

  // 4. 与目标咒语比对（规则见 lib/match.js：相似度 ≥ 0.8，或互为包含且较短一方 ≥ 2 字）
  const judge = matchSpell(recognizedText, targetSpell)
  const matched = judge.matched
  const sim = judge.similarity

  // 5. 「没听清」和「咒语无效」都不是一次可以记录的打卡尝试 → 不写记录，直接返回
  //    ⚠️ 空识别结果必须在这里就被拦住：JS 里任何字符串都包含空串，
  //       target.includes(got) 在 got === '' 时恒为 true —— 不拦的话「啥也没说」
  //       会被判成打卡成功，而且会写进 records（连带影响积分 F-03 / 连续打卡 F-04）。
  //       常理上"没听清"也不该在记录里留一条 matched:false 的空记录污染列表。
  if (judge.reason === REASON.NO_SPEECH) {
    console.log('识别结果为空，按「没听清」处理（不写打卡记录）')
    return { code: 0, matched: false, noSpeech: true, recognizedText: '', similarity: 0 }
  }
  if (judge.reason === REASON.INVALID_SPELL) {
    console.log('打卡点咒语的归一化结果为空，判为脏数据：', pointId)
    return { code: -1, msg: '该打卡点的咒语无效，请联系创建者重新设置' }
  }

  // 6. 写入打卡记录
  //    dayKey：按 UTC+8 算出的自然日（'YYYY-MM-DD'），供 F-04 连续打卡统计使用，
  //    也是将来给 records 建「同一用户同一点位同一天唯一」索引的前提。
  //    ⚠️ 云函数容器时区是 UTC，直接取本地日期会差 8 小时 ——
  //       北京时间 00:00~08:00 的打卡会被算成前一天，连续打卡天数就会错。
  //    另外：各云函数目录之间不能互相 require（部署时是各自独立打包的），
  //    所以这里的换算逻辑只能就地实现，不能引 getBadges/lib/badges.js。
  const bjNow = new Date(Date.now() + 8 * 3600 * 1000)
  const bjMonth = bjNow.getUTCMonth() + 1
  const bjDate = bjNow.getUTCDate()
  const dayKey = bjNow.getUTCFullYear() + '-' +
    (bjMonth < 10 ? '0' : '') + bjMonth + '-' +
    (bjDate < 10 ? '0' : '') + bjDate

  const addRes = await db.collection('records').add({
    data: {
      openid: OPENID,
      pointId: pointId,
      pointName: point.name,
      spell: targetSpell,                 // 原来是 point.spell，改成实际比对用的咒语
      recognizedText: recognizedText,
      similarity: sim,
      matched: matched,
      taskId: taskId || null,             // 新增
      dayKey: dayKey,                     // 新增：F-04 连续打卡统计用
      createTime: db.serverDate()
    }
  })

  // 打卡成功且属于任务打卡 → 把任务置为已完成
  if (task && matched) {
    await db.collection('tasks').doc(taskId).update({
      data: {
        status: 'completed',
        completedAt: db.serverDate(),
        recordId: addRes._id              // 对应 tasks 字段表里的 recordId
      }
    })
  }

  return {
    code: 0,
    recognizedText: recognizedText,
    matched: matched,
    similarity: sim
  }
}
