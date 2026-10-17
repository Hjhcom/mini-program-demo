// 云函数：cleanVoice 录音文件清理（F-11）
//
// 背景（P5）：用户每次打卡都会往云存储传一段 wav（voice/ 目录），`voiceCheckin`
// 只负责下载识别，从来没人删 —— 文件会无限堆积，既占配额也留隐私痕迹。
//
// 本函数由**定时触发器**每天 04:00 跑一次（见 config.json 的 triggers）：
//   1. 找 records 里 createTime 早于「现在 - 7 天」、且带 fileID 的记录
//   2. 分批（每批 ≤50）调用 cloud.deleteFile 删掉云存储里的录音
//   3. 删成功的记录把 fileID 清空 —— 同时起到「已处理」标记的作用，下次不会再被扫到
//
// ⚠️ 为什么靠 records 反查、而不是「列出 voice/ 目录」：
//    微信云开发的 wx-server-sdk **没有列目录 / 列文件的 API**（只有 uploadFile /
//    downloadFile / deleteFile / getTempFileURL），拿不到文件清单。
//    所以从 F-11 起 `voiceCheckin` 写记录时会存一份 `fileID`，清理走「记录 → 文件」这条链。
//    代价：F-11 之前写的记录没有 fileID，那些老录音无法自动定位（文档里已写明）。
//
// ⚠️ 触发器的时间是**北京时间**（微信云开发控制台按 UTC+8），而云函数容器时区是 UTC。
//    这里所有时间比较都用「毫秒时间戳」，不依赖容器本地时区，不受影响。
const cloud = require('wx-server-sdk')
const { RETENTION_DAYS, DAY_MS, DELETE_BATCH, toMs, pickExpired, chunk } = require('./lib/clean')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const PAGE_SIZE = 100 // 每次查询取多少条记录
const MAX_RECORDS = 500 // 单次运行最多扫这么多条，防止一次跑太久撞上云函数超时（默认 3s~20s）

exports.main = async (event, context) => {
  const ev = event || {}
  // dryRun：只统计「会删几条」，不真删。第一次上线务必先用它试跑（控制台「测试」里传 {"dryRun": true}）
  const dryRun = ev.dryRun === true
  // now / days 允许覆盖，只为本地与控制台测试方便；定时触发时不传，走默认
  const now = toMs(ev.now) || Date.now()
  const days = ev.days == null ? RETENTION_DAYS : Number(ev.days)
  const cutoff = new Date(now - (isFinite(days) && days >= 0 ? days : RETENTION_DAYS) * DAY_MS)

  console.log('[cleanVoice] 开始', {
    dryRun: dryRun,
    now: new Date(now).toISOString(),
    cutoff: cutoff.toISOString(),
    retentionDays: days
  })

  // ===== 1. 扫出过期的记录（服务端先用条件过滤，减少传输量）=====
  // ⚠️ 时间字段用 _.lt(Date) 比较：records.createTime 是 db.serverDate() 写的原生 Date。
  //    老数据若是控制台手工敲进去的字符串，这个条件匹配不上 —— 这种情况下面 pickExpired
  //    的 JS 侧判定兜不住（压根没被查出来）。文档里已注明「别在控制台手工造 records」。
  const scanned = []
  let page = 0
  while (page * PAGE_SIZE < MAX_RECORDS) {
    const res = await db
      .collection('records')
      .where({ createTime: _.lt(cutoff) })
      .orderBy('createTime', 'asc')
      .skip(page * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .field({ fileID: true, createTime: true })
      .get()
    const list = res.data || []
    for (let i = 0; i < list.length; i++) scanned.push(list[i])
    if (list.length < PAGE_SIZE) break
    page++
  }

  // ===== 2. 挑出真正该删的（有 fileID + 时间可解析 + 确实过期）=====
  // 这里再过一遍纯函数，是为了挡住两类脏数据：
  //   · createTime 缺失/不可解析 → 不能一刀切当成过期
  //   · fileID 为空（老记录或已清空）→ 没有可删的目标
  const picked = pickExpired(scanned, now, days)
  const expired = picked.expired

  const summary = {
    code: 0,
    dryRun: dryRun,
    retentionDays: isFinite(days) && days >= 0 ? days : RETENTION_DAYS,
    cutoff: cutoff.toISOString(),
    scanned: scanned.length,
    expired: expired.length,
    deleted: 0,
    failed: 0,
    skipped: picked.skipped,
    // 扫到上限还没扫完 → 下次运行继续（每天一次，很快能追平）
    truncated: scanned.length >= MAX_RECORDS
  }

  if (dryRun || expired.length === 0) {
    console.log('[cleanVoice] 结束（未删除）', summary)
    return summary
  }

  // ===== 3. 分批删除云存储文件 =====
  const batches = chunk(expired, DELETE_BATCH)
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    const fileList = batch.map(x => x.fileID)

    let res
    try {
      res = await cloud.deleteFile({ fileList: fileList })
    } catch (e) {
      // 整批失败（网络/权限/参数），不中断，继续下一批
      console.error('[cleanVoice] deleteFile 整批失败', e)
      summary.failed += batch.length
      continue
    }

    // 逐条判定：status === 0 为成功；
    // 文件本就不存在（errMsg 含 not exist / not found）也算「已达成目标」，同样清字段。
    // 这样函数是**幂等**的：重复执行、或者上一次删了文件但没来得及清字段，都不会卡住。
    const okFileIDs = {}
    const fileRes = (res && res.fileList) || []
    for (let i = 0; i < fileRes.length; i++) {
      const f = fileRes[i] || {}
      const msg = String(f.errMsg || '').toLowerCase()
      if (f.status === 0 || msg.indexOf('not exist') > -1 || msg.indexOf('not found') > -1) {
        okFileIDs[f.fileID] = true
      }
    }

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i]
      if (!okFileIDs[item.fileID]) {
        summary.failed++
        console.warn('[cleanVoice] 删除失败，保留 fileID 下次重试', item.fileID)
        continue
      }
      summary.deleted++
      // 清空 fileID：既是「已处理」标记，也避免把存储句柄长期留在库里
      try {
        await db.collection('records').doc(item._id).update({ data: { fileID: '' } })
      } catch (e) {
        // 字段没清掉不影响文件已删；下次扫描会再试一次（那时 deleteFile 会返回不存在 → 仍算成功）
        console.warn('[cleanVoice] 清空 fileID 失败', item._id, e)
      }
    }
  }

  console.log('[cleanVoice] 结束', summary)
  return summary
}
