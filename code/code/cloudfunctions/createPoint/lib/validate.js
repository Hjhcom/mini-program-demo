// createPoint 的入参校验与规范化
//
// ⚠️ 为什么把这部分单独抽成一个文件：
//    云函数本体依赖 wx-server-sdk，没法在本地直接 require 跑测试；而"校验规则"恰恰是
//    最容易写错的部分（边界值、全角标点、坐标范围、上限判定）。
//    抽成不依赖 sdk 的纯函数后，可以用 tools/test-point-create.js 在本地跑用例。
//    （同 F-03 的 lib/points.js、F-04 的 lib/badges.js 是同一套做法。）

const LIMITS = {
  NAME_MAX: 20,          // 点位名称最长 20 个字符
  SPELL_MIN: 2,          // 咒语有效长度下限（太短没区分度，也容易被误识别）
  SPELL_MAX: 8,          // 咒语有效长度上限（太长讯飞识别准确率明显下降）
  RADIUS_MIN: 20,        // 半径下限（米）：再小 GPS 漂移就总是"不在范围内"
  RADIUS_MAX: 200,       // 半径上限（米）：再大就失去"到点打卡"的意义
  MAX_POINTS_PER_USER: 10 // 同一用户最多自建的点位数（防刷）
}

// 与 voiceCheckin 里的 normalize 保持一致：全角转半角 + 去掉空白与常见中英文标点。
//
// ⚠️ 为什么要一致：咒语的"长度"应该按「识别时真正参与比对的那串字符」来算。
//    否则「明德精工，创新包容」会因为多了一个逗号被判成 9 个字而超限，
//    而实际比对时逗号是被丢掉的（有效长度 8）。
function normalizeSpell(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[\s，。、！？；：""''（）,.!?;:()\u3000]/g, '')
}

// 按「码点」数长度：中文 1、emoji 1、英文 1。
// 不用 s.length —— emoji 在 UTF-16 里占 2 个单元，会让长度判断虚高。
function charLen(s) {
  return Array.from(String(s == null ? '' : s)).length
}

// 是否含有「有意义的字符」：汉字 / 英文字母 / 数字。
// 用途：挡住「@#」「！！」这类纯符号咒语 —— 它们的有效长度可能刚好够 2，
// 但语音识别出来的文本几乎不可能命中纯符号，等于建了一个永远打不上卡的点位。
// 全角字母数字会先被 normalizeSpell 转成半角，所以这里只判半角即可。
function hasMeaningfulChar(s) {
  return /[\u3400-\u4dbf\u4e00-\u9fffa-z0-9]/.test(String(s == null ? '' : s))
}

function trimStr(v) {
  return typeof v === 'string' ? v.trim() : ''
}

// 名称：去掉首尾空白后 1~20 个字符
function validateName(name) {
  const s = trimStr(name)
  if (!s) return { ok: false, msg: '请填写打卡点名称' }
  if (charLen(s) > LIMITS.NAME_MAX) {
    return { ok: false, msg: '名称最多 ' + LIMITS.NAME_MAX + ' 个字' }
  }
  return { ok: true, value: s }
}

// 咒语：按「归一化后的有效长度」判 2~8；原文照存（保留标点，展示更自然）
function validateSpell(spell) {
  const raw = trimStr(spell)
  if (!raw) return { ok: false, msg: '请填写打卡咒语' }
  const eff = normalizeSpell(raw)
  if (!hasMeaningfulChar(eff)) {
    return { ok: false, msg: '咒语里至少要有一个汉字、字母或数字' }
  }
  const n = charLen(eff)
  if (n < LIMITS.SPELL_MIN) {
    return { ok: false, msg: '咒语至少 ' + LIMITS.SPELL_MIN + ' 个字（不含标点空格）' }
  }
  if (n > LIMITS.SPELL_MAX) {
    return { ok: false, msg: '咒语最多 ' + LIMITS.SPELL_MAX + ' 个字（不含标点空格），太长会影响识别' }
  }
  return { ok: true, value: raw, effectiveLength: n }
}

// 半径：20~200 米的数字（允许传数字字符串，前端输入框可能给字符串）
function validateRadius(radius) {
  const n = Number(radius)
  if (!isFinite(n)) return { ok: false, msg: '打卡半径必须是数字' }
  if (n < LIMITS.RADIUS_MIN || n > LIMITS.RADIUS_MAX) {
    return { ok: false, msg: '打卡半径需在 ' + LIMITS.RADIUS_MIN + '~' + LIMITS.RADIUS_MAX + ' 米之间' }
  }
  return { ok: true, value: Math.round(n) }
}

// 坐标：经纬度范围校验 + 拒绝 (0,0)
// 拒绝 (0,0) 的理由：这是几内亚湾海面上的"空坐标"，出现它几乎一定是取位置失败后
// 用了默认值 —— 让它落库会在地图上造出一个永远打不上卡的野点位。
function validateCoords(longitude, latitude) {
  const lng = Number(longitude)
  const lat = Number(latitude)
  if (!isFinite(lng) || !isFinite(lat)) return { ok: false, msg: '坐标格式不正确' }
  if (lng < -180 || lng > 180) return { ok: false, msg: '经度需在 -180~180 之间' }
  if (lat < -90 || lat > 90) return { ok: false, msg: '纬度需在 -90~90 之间' }
  if (lng === 0 && lat === 0) return { ok: false, msg: '没有取到有效坐标，请重新选点' }
  return { ok: true, value: { longitude: lng, latitude: lat } }
}

// 汇总校验：输入 event + 该用户已有点位数 → {ok, msg?, data?}
// 一次返回第一个错误，前端直接展示 msg（不做多错并列，表单场景够用）
function validatePoint(input, ownedCount) {
  const src = input || {}

  const owned = Number(ownedCount) || 0
  if (owned >= LIMITS.MAX_POINTS_PER_USER) {
    return { ok: false, msg: '每人最多创建 ' + LIMITS.MAX_POINTS_PER_USER + ' 个打卡点' }
  }

  const name = validateName(src.name)
  if (!name.ok) return name

  const spell = validateSpell(src.spell)
  if (!spell.ok) return spell

  const radius = validateRadius(src.radius)
  if (!radius.ok) return radius

  const coords = validateCoords(src.longitude, src.latitude)
  if (!coords.ok) return coords

  return {
    ok: true,
    data: {
      name: name.value,
      spell: spell.value,
      radius: radius.value,
      longitude: coords.value.longitude,
      latitude: coords.value.latitude
    }
  }
}

module.exports = {
  LIMITS,
  normalizeSpell,
  charLen,
  hasMeaningfulChar,
  validateName,
  validateSpell,
  validateRadius,
  validateCoords,
  validatePoint
}
