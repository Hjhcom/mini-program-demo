// cloudfunctions/voiceCheckin/lib/match.js —— 声控打卡的判定核心（纯函数）
//
// 为什么单独拆一个文件：云函数是**各自独立打包**的，判定逻辑内联在 index.js 里就没法本地单测
// （index.js require 了 wx-server-sdk，本地跑不起来）。抽到本文件后不依赖任何东西，
// tools/test-voice-match.js 可以直接 require 它跑用例。
// （同 F-03 的 getRanking/lib/points.js、F-04 的 getBadges/lib/badges.js、F-05 的 createPoint/lib/validate.js）
//
// ⚠️ 这里的 normalize() 与前端 code/code/utils/spell.js 的 normalizeSpell() 必须**行为逐字一致**
//    （同一套规则写了两遍：前端用于创建点位时校验/预览，云函数用于实际比对）。
//    改一处必须改两处，跑 `node tools/check-sync.js` 验证。

// 编辑距离相似度阈值：≥ 0.8 判通过（与文档 3.1 的设计一致）
const SIM_THRESHOLD = 0.8
// 「互为包含」时，较短一方要求的最小有效字数（归一化后）。见 matchSpell 里的说明。
const MIN_CONTAIN_LEN = 2

// 星级评价（F-13）：基于识别相似度的星级（0~1 编辑距离相似度）
//    ≥ 0.9 → 3 星（念得完美）；≥ 0.7 → 2 星（念得很准）；其余成功 → 1 星（过关）
//    纯函数：不依赖云环境，可被 tools/test-voice-match.js 本地单测
function starsOf(sim) {
  if (sim >= 0.9) return 3
  if (sim >= 0.7) return 2
  return 1
}

// 判定原因：调用方据此决定「要不要写打卡记录」「给用户什么提示」
const REASON = {
  SIMILAR: 'similar',            // 相似度达标
  CONTAINED: 'contained',        // 互为包含（较短一方 ≥ 2 字）
  MISMATCH: 'mismatch',          // 确实说了话，但跟咒语对不上 → 写一条 matched:false 的记录
  NO_SPEECH: 'noSpeech',         // 没听清（识别结果归一化后为空）→ 不算一次打卡尝试，不写记录
  INVALID_SPELL: 'invalidSpell'  // 咒语本身是脏数据（归一化后为空）→ 报错，不写记录
}

// 归一化：转小写、全角转半角、去掉空白与常见中英文标点
// 例：「明德精工，创新包容」→「明德精工创新包容」（有效长度 8）
// ⚠️ 过滤表里那对引号是 **ASCII 直引号**（U+0022 / U+0027），不是中文弯引号 ——
//    必须与 utils/spell.js、createPoint/lib/validate.js 里那份逐字一致（码点也要一致），
//    别凭视觉抄成 “”。中文弯引号不在表里，三处都不去掉（这个"不完美"是三处一致的）。
function normalize(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[\s，。、！？；：""''（）,.!?;:()\u3000]/g, '')
}

// 按码点数字数（emoji 算 1 个，而不是 UTF-16 的 2 个）
function charLen(s) {
  return Array.from(String(s == null ? '' : s)).length
}

// 编辑距离相似度（0~1，1 表示完全一样）
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

// 判定一次识别结果：返回 { matched, similarity, gotLen, targetLen, reason }
//   recognizedText：讯飞识别出的原文（可能是空串）
//   targetSpell   ：目标咒语（点位咒语，任务打卡时是任务里的咒语）
function matchSpell(recognizedText, targetSpell) {
  const target = normalize(targetSpell)
  const got = normalize(recognizedText)
  const targetLen = charLen(target)
  const gotLen = charLen(got)

  // ① 咒语归一化后为空 = 脏数据（老数据可能绕过 createPoint 的校验存进「纯标点咒语」）。
  //    不能拿它当标准答案 —— 此时两侧都为空，similarity 的 `a === b` 分支会直接返回 1。
  if (targetLen === 0) {
    return { matched: false, similarity: 0, gotLen: gotLen, targetLen: targetLen, reason: REASON.INVALID_SPELL }
  }

  // ② 识别结果为空 = 没听清。**必须显式拦掉**：
  //    JS 里任何字符串都「包含」空串（'明德精工'.includes('') === true），
  //    不拦的话「啥也没说」也会命中下面的「互为包含」→ 被判打卡成功。
  //    这是 2026-10-17 真机实测复现的缺陷（文档 1.3 表 P7 / 3.13）。
  if (gotLen === 0) {
    return { matched: false, similarity: 0, gotLen: gotLen, targetLen: targetLen, reason: REASON.NO_SPEECH }
  }

  const sim = similarity(got, target)
  const simOk = sim >= SIM_THRESHOLD

  // 互为包含：两个方向都认 —— ① 用户说了一句很长的话，里面含咒语；
  // ② 咒语较长，用户只念了其中一段。都视为「会念这个咒语」。
  // ⚠️ 但要求较短一方 ≥ MIN_CONTAIN_LEN 字：只说一个字时 '明德精工'.includes('明') 也为真，
  //    不设这个下限等于「说一个字就过关」，咒语就形同虚设了。
  const contained = Math.min(gotLen, targetLen) >= MIN_CONTAIN_LEN &&
    (got.includes(target) || target.includes(got))

  return {
    matched: simOk || contained,
    similarity: Math.round(sim * 100) / 100,
    gotLen: gotLen,
    targetLen: targetLen,
    reason: simOk ? REASON.SIMILAR : contained ? REASON.CONTAINED : REASON.MISMATCH
  }
}

module.exports = {
  SIM_THRESHOLD,
  MIN_CONTAIN_LEN,
  REASON,
  normalize,
  charLen,
  similarity,
  matchSpell,
  starsOf
}
