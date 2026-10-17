// cloudfunctions/cleanVoice/lib/clean.js
// 「哪条录音该删」的判定逻辑 —— 纯函数，**不 require wx-server-sdk**，
// 所以能被 tools/test-clean-voice.js 直接 require 出来跑本地单测。
//
// ⚠️ 云函数各自独立打包，别的云函数目录 require 不到这里；本文件只服务于 cleanVoice。

const RETENTION_DAYS = 7 // 录音保留天数（文档 3.9.5：7 天前的录音删掉）
const DAY_MS = 24 * 60 * 60 * 1000
const DELETE_BATCH = 50 // cloud.deleteFile 单次 fileList 上限就是 50，超了整批失败

/**
 * 把各种来源的时间值转成毫秒时间戳，转不出来返回 null。
 *
 * ⚠️ **0 与负数一律视为「无效」**，不是合法时间。
 *    原因：`Number(null) === 0`、`Number('') === 0` 且 `isFinite(0)` 为真 ——
 *    如果把 0 当合法时间戳，一条「createTime 字段缺失」的记录会被当成 1970 年，
 *    立刻判为过期、把录音删掉。本项目已经在同类坑上栽过两次
 *    （utils/geo.js 的 hasCoords 与 formatDistance），这里必须先挡。
 *
 * 支持：Date 对象 / 毫秒数字 / 可被 Date 解析的字符串 / 控制台导出的 { $date }
 */
function toMs(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    const t = v.getTime()
    return isFinite(t) ? t : null
  }
  if (typeof v === 'number') {
    return isFinite(v) && v > 0 ? v : null
  }
  if (typeof v === 'string') {
    const t = new Date(v).getTime()
    return isFinite(t) && t > 0 ? t : null
  }
  if (typeof v === 'object' && typeof v.$date === 'number') {
    return toMs(v.$date)
  }
  return null
}

/**
 * 过期分界线：早于这个时刻的录音该删。
 * days 非法（null / NaN / 负数）时回落到 RETENTION_DAYS，绝不返回 null 之外的怪值。
 */
function cutoffOf(now, days) {
  const t = toMs(now)
  if (t == null) return null
  const n = Number(days)
  const d = days == null || !isFinite(n) || n < 0 ? RETENTION_DAYS : n
  return new Date(t - d * DAY_MS)
}

/**
 * 单条记录是否过期。
 * - 时间不可解析 → **false**（宁可留一条脏记录，也不误删用户数据）
 * - 恰好等于分界线 → **false**（完整保留 days 天，边界算「还没过期」）
 */
function isExpired(createTime, now, days) {
  const t = toMs(createTime)
  if (t == null) return false
  const cutoff = cutoffOf(now, days)
  if (!cutoff) return false
  return t < cutoff.getTime()
}

/**
 * 从一批 records 文档里挑出「有录音文件 + 已过期」的那些。
 *
 * 返回 { expired, skipped }：
 * - expired: [{ _id, fileID, createTime }] —— 可以直接拿去 deleteFile
 * - skipped: { noFile, badTime, notExpired } —— 只用于日志，说明「为什么没删它」
 *
 * 老记录（F-11 之前写的）没有 fileID 字段，会被计入 noFile 跳过 —— 它们的录音
 * 无法从 records 反查，属于历史遗留，文档里已说明。
 */
function pickExpired(records, now, days) {
  const list = Array.isArray(records) ? records : []
  const expired = []
  const skipped = { noFile: 0, badTime: 0, notExpired: 0 }
  const cutoff = cutoffOf(now, days)
  if (!cutoff) return { expired, skipped }
  const cut = cutoff.getTime()

  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    if (!r || typeof r !== 'object') {
      skipped.badTime++
      continue
    }
    const fileID = typeof r.fileID === 'string' ? r.fileID.trim() : ''
    if (!fileID) {
      skipped.noFile++
      continue
    }
    const t = toMs(r.createTime)
    if (t == null) {
      skipped.badTime++
      continue
    }
    if (t >= cut) {
      skipped.notExpired++
      continue
    }
    expired.push({ _id: r._id, fileID: fileID, createTime: t })
  }
  return { expired, skipped }
}

/** 把数组切成 size 大小的小块（deleteFile 一批最多 50 个） */
function chunk(arr, size) {
  const list = Array.isArray(arr) ? arr : []
  const n = Number(size)
  if (!isFinite(n) || n <= 0) return list.length ? [list.slice()] : []
  const out = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

module.exports = {
  RETENTION_DAYS,
  DAY_MS,
  DELETE_BATCH,
  toMs,
  cutoffOf,
  isExpired,
  pickExpired,
  chunk
}
