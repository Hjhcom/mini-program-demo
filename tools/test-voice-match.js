// tools/test-voice-match.js —— 声控打卡判定规则的本地单元测试
// 用法（仓库根目录）： node tools/test-voice-match.js
//
// 为什么要有这个脚本：voiceCheckin 要连数据库 + 打讯飞 WebSocket 才能跑，但真正容易写错的是
// 「识别结果怎么算通过」这部分规则。规则已抽到同目录 lib/match.js（不 require wx-server-sdk），
// 所以能在这里全测掉。（同 F-03 的 points、F-04 的 badges、F-05 的 validate）
//
// 本文件的起源是一个**真机实测发现的缺陷**（文档 1.3 表 P7 / 3.13）：
//   啥也没说，界面显示「打卡成功」。根因是 `'明德精工'.includes('')` 在 JS 里恒为 true，
//   所以「互为包含」这条路会把空识别结果放过去。下面的「空识别结果」一节就是它的回归用例。
const path = require('path')
const V = require(
  path.join(__dirname, '..', 'code', 'code', 'cloudfunctions', 'voiceCheckin', 'lib', 'match.js')
)

let pass = 0
let fail = 0

function eq(actual, expected, title) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log('  ✅ ' + title)
  } else {
    fail++
    console.log('  ❌ ' + title + '  期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
  }
}

// 只比「调用方真正关心的三件事」：判没判过、为什么、相似度多少
function judge(rec, spell, exp, title) {
  const r = V.matchSpell(rec, spell)
  eq({ matched: r.matched, reason: r.reason, similarity: r.similarity },
    { matched: exp.matched, reason: exp.reason, similarity: exp.similarity }, title)
}

const R = V.REASON
const SPELL = '明德精工' // 4 个字的咒语，够短，边界好算

console.log('— 常量 —')
eq(V.SIM_THRESHOLD, 0.8, '相似度阈值 0.8')
eq(V.MIN_CONTAIN_LEN, 2, '互为包含时较短一方下限 2 字')
eq(Object.keys(R).sort(), ['CONTAINED', 'INVALID_SPELL', 'MISMATCH', 'NO_SPEECH', 'SIMILAR'], 'REASON 五个原因齐全')
eq([R.SIMILAR, R.CONTAINED, R.MISMATCH, R.NO_SPEECH, R.INVALID_SPELL],
  ['similar', 'contained', 'mismatch', 'noSpeech', 'invalidSpell'], 'REASON 取值（前端按字符串判断）')

console.log('— normalize（与前端 utils/spell.js 的 normalizeSpell 一致）—')
eq(V.normalize('明德精工，创新包容'), '明德精工创新包容', '中文逗号被去掉')
eq(V.normalize('ＡＢＣ１２３'), 'abc123', '全角字母数字 → 半角小写')
eq(V.normalize('  ABC  '), 'abc', '首尾空格被去掉')
eq(V.normalize('德 精'), '德精', '中间空格被去掉')
eq(V.normalize(null), '', 'null → 空串（有兜底，不产生 "null" 这种字面量）')
eq(V.normalize(undefined), '', 'undefined → 空串')
eq(V.normalize(1234), '1234', '数字 → 字符串')
eq(V.charLen('明德精工'), 4, 'charLen 按码点计数')
eq(V.charLen('🎉打卡'), 3, 'charLen 里 emoji 算 1 个（不是 UTF-16 的 2 个）')

console.log('— ⚠️ 回归：空识别结果不能判成功（真机实测复现的缺陷 P7）—')
judge('', SPELL, { matched: false, reason: R.NO_SPEECH, similarity: 0 }, '空串 → 没听清，不判成功')
judge('   ', SPELL, { matched: false, reason: R.NO_SPEECH, similarity: 0 }, '只有空白 → 没听清')
judge('。', SPELL, { matched: false, reason: R.NO_SPEECH, similarity: 0 }, '只有句号 → 没听清')
judge('，。、！？；：', SPELL, { matched: false, reason: R.NO_SPEECH, similarity: 0 }, '只有中文标点 → 没听清')
// 下面这条钉住一个"三处一致的已知取舍"：过滤表里是 ASCII 直引号，中文弯引号不在表里，不去掉。
// 影响很小 —— 咒语「明德“精工”」（8 字）照样能被「明德精工」命中（互为包含，见下面那一节）。
// 真要支持弯引号，utils/spell.js / createPoint/lib/validate.js / 本 lib 三处必须一起改。
judge('“”', SPELL, { matched: false, reason: R.MISMATCH, similarity: 0 }, '中文弯引号不在过滤表里（三处一致的已知取舍）')
judge(null, SPELL, { matched: false, reason: R.NO_SPEECH, similarity: 0 }, 'null → 没听清')
judge(undefined, SPELL, { matched: false, reason: R.NO_SPEECH, similarity: 0 }, 'undefined → 没听清')
eq(V.matchSpell('', SPELL).matched, false, 'matched 是布尔 false（不是 undefined/0）')
eq([V.matchSpell('', SPELL).gotLen, V.matchSpell('', SPELL).targetLen], [0, 4], 'gotLen/targetLen 如实返回')

console.log('— ⚠️ 回归：只说一个字不能判成功 —')
judge('明', SPELL, { matched: false, reason: R.MISMATCH, similarity: 0.25 }, '说 1 个字（咒语里的字）→ 不判成功')
judge('精', SPELL, { matched: false, reason: R.MISMATCH, similarity: 0.25 }, '说咒语中间 1 个字 → 不判成功')
judge('德', SPELL, { matched: false, reason: R.MISMATCH, similarity: 0.25 }, '说咒语第 2 个字 → 不判成功')

console.log('— 正常成功：完全一致 / 只差标点或大小写 —')
judge(SPELL, SPELL, { matched: true, reason: R.SIMILAR, similarity: 1 }, '一字不差 → 相似度 1')
judge('明德精工，创新包容', '明德精工创新包容', { matched: true, reason: R.SIMILAR, similarity: 1 }, '标点差异被归一化吃掉')
judge('ａｂｃ', 'ABC', { matched: true, reason: R.SIMILAR, similarity: 1 }, '全角小写 vs 半角大写 → 同一件事')
judge(' 明德精工 ', SPELL, { matched: true, reason: R.SIMILAR, similarity: 1 }, '首尾空格不影响')

console.log('— 相似度阈值 0.8 的边界 —')
// 「明德精精工」= 在「明德精工」里多插一个「精」，编辑距离 1，长度 5 → 1 - 1/5 = 0.80，正好卡在阈值上
judge('明德精精工', SPELL, { matched: true, reason: R.SIMILAR, similarity: 0.8 }, '相似度正好 0.80 → 通过（>= 含等于）')
// 「明德精精精」编辑距离 2，长度 5 → 1 - 2/5 = 0.60，且互不包含
judge('明德精精精', SPELL, { matched: false, reason: R.MISMATCH, similarity: 0.6 }, '相似度 0.60 且互不包含 → 不通过')
// 等长替换一个字：编辑距离 1，长度 4 → 0.75，刚好卡在阈值之下
judge('明德精天', SPELL, { matched: false, reason: R.MISMATCH, similarity: 0.75 }, '相似度 0.75 → 不通过')

console.log('— 互为包含（两个方向都认）—')
judge('我觉得明德精工挺好的', SPELL, { matched: true, reason: R.CONTAINED, similarity: 0.4 }, '长句里含咒语 → 通过')
judge(SPELL, '明德精工创新包容', { matched: true, reason: R.CONTAINED, similarity: 0.5 }, '咒语长、只念前半段 → 通过')
judge('德精工', SPELL, { matched: true, reason: R.CONTAINED, similarity: 0.75 }, '只念咒语后半段（3 字）→ 通过')
judge('德精工', '明德精工创新包容', { matched: true, reason: R.CONTAINED, similarity: 0.38 }, '长咒语 + 念中间一段 → 通过')
judge('明德', '明德精工创新包容', { matched: true, reason: R.CONTAINED, similarity: 0.25 }, '只说前 2 个字 → 通过（下限就是 2）')

console.log('— 说错话：不通过 —')
judge('随便说点啥', SPELL, { matched: false, reason: R.MISMATCH, similarity: 0 }, '完全对不上 → 不通过')
judge('创新包容', SPELL, { matched: false, reason: R.MISMATCH, similarity: 0 }, '说的是另一个咒语 → 不通过')
judge('明德精工创新', '包容天下', { matched: false, reason: R.MISMATCH, similarity: 0 }, '两个不相干的短语 → 不通过')

console.log('— 脏数据咒语（老数据可能绕过 createPoint 校验）—')
judge(SPELL, '', { matched: false, reason: R.INVALID_SPELL, similarity: 0 }, '咒语是空串 → 咒语无效')
judge(SPELL, '。，！？', { matched: false, reason: R.INVALID_SPELL, similarity: 0 }, '咒语全是标点 → 咒语无效')
judge(SPELL, null, { matched: false, reason: R.INVALID_SPELL, similarity: 0 }, '咒语是 null → 咒语无效')
judge('', '', { matched: false, reason: R.INVALID_SPELL, similarity: 0 }, '两边都空 → 判咒语无效（不能因 a===b 拿到相似度 1）')
judge(null, undefined, { matched: false, reason: R.INVALID_SPELL, similarity: 0 }, '两边都是 null/undefined → 咒语无效')
// 两边都空这条特别重要：similarity 的第一行 `if (a === b) return 1` 会让空 vs 空算出相似度 1，
// 所以必须先判 targetLen —— 上面把它断言成 invalidSpell 就是为了钉住这个顺序。

console.log('\n' + (fail === 0
  ? '全部通过 ✅  ' + pass + ' 条'
  : pass + ' 条通过，' + fail + ' 条失败 ❌'))
process.exit(fail === 0 ? 0 : 1)
