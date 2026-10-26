// tools/check-sync.js —— 跨目录「重复常量 / 重复逻辑」一致性自检
//
// 为什么需要这个脚本：
//   微信云函数**各自独立打包**，既不允许云函数之间互相 require，前端也 require 不到
//   云函数目录里的文件。于是项目里有几处「同一套规则必须写两遍」的地方：
//
//     1. 咒语规范化 normalizeSpell  →  code/code/utils/spell.js
//                                  +  code/code/cloudfunctions/createPoint/lib/validate.js
//                                  +  code/code/cloudfunctions/voiceCheckin/lib/match.js（叫 normalize）
//     2. 咒语长度上限 SPELL_MIN/MAX →  同上前两份
//     3. 打卡基础积分 CHECKIN_POINTS →  code/code/pages/index/index.js（F-07 庆祝卡片上的「+10 分」）
//                                  +  code/code/cloudfunctions/getRanking/lib/points.js（POINTS.checkin）
//
//   这些"两份拷贝"一旦漂移，症状很隐蔽：咒语长度判定不一致 → 能建出永远打不上卡的点位；
//   积分不一致 → 庆祝卡片写 +10、排行榜却算别的分。**改任何一处规则后跑这个脚本**：
//       node tools/check-sync.js
//
// 说明：脚本只做「读取 + 对比」，不依赖云环境，也不改动任何文件。

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const P = rel => path.join(ROOT, rel)
const read = rel => fs.readFileSync(P(rel), 'utf8')

let fail = 0
function ok(cond, msg) {
  console.log((cond ? '  ✅ ' : '  ❌ ') + msg)
  if (!cond) fail++
}
function section(title) {
  console.log('\n=== ' + title + ' ===')
}

// 从源码里抠出一个具名函数的源码（不能 require 的文件才需要，如依赖 wx-server-sdk 的云函数）
// 做法：找到 `function <name>(`，再找到其后第一个「行首的 }」作为函数结束。
// 目前没有调用方（voiceCheckin 的 normalize 已抽成可 require 的 lib/match.js），留着备用。
function extractFn(src, name) {
  const at = src.indexOf('function ' + name + '(')
  if (at < 0) return null
  const end = src.indexOf('\n}', at)
  if (end < 0) return null
  return src.slice(at, end + 2)
}

// ----------------------------------------------------------------------------
section('1. 咒语规范化 normalizeSpell：前端 vs createPoint vs voiceCheckin')
// ----------------------------------------------------------------------------
const frontSpell = require(P('code/code/utils/spell.js'))
const createPointValidate = require(P('code/code/cloudfunctions/createPoint/lib/validate.js'))
// voiceCheckin 的 normalize 已抽到同目录 lib/match.js —— 纯函数、不依赖 wx-server-sdk，
// 所以这里可以直接 require（它早期内联在 index.js 里，那时只能抠源码出来 eval）。
const voiceMatch = require(P('code/code/cloudfunctions/voiceCheckin/lib/match.js'))

// 覆盖容易出分歧的输入：全角字母数字、中文标点、英文标点、全角空格、emoji、非字符串
const SAMPLES = [
  '明德精工，创新包容', '明德精工', '  ABC  ', 'ａｂｃ', 'ＡＢＣ１２３',
  'abc，def。ghi', 'a!b?c;d:e', '（）【】', '！＠＃￥％', '；：""' + "''",
  '明德 精工', '，。、！？；：', 'test', 'Test123', '🎉打卡', '',
  '“”', '‘’', '【】', '～！@#',
  null, undefined, 1234, true
]
const rows = SAMPLES.map(s => ({
  input: s,
  front: frontSpell.normalizeSpell(s),
  create: createPointValidate.normalizeSpell(s),
  voice: voiceMatch.normalize(s)
}))
const diffFrontCreate = rows.filter(r => r.front !== r.create)
ok(diffFrontCreate.length === 0,
  'utils/spell.js 与 createPoint/lib/validate.js 对 ' + SAMPLES.length + ' 个样本结果一致'
  + (diffFrontCreate.length ? '（不一致：' + JSON.stringify(diffFrontCreate) + '）' : ''))

// ⚠️ 这里是本项目最容易踩的一处：过滤表里那对引号是 **ASCII 直引号**（U+0022/U+0027）。
//    视觉上极易抄成中文弯引号 “”（U+201C/U+201D），两者**行为不同** ——
//    2026-10-17 抽 lib/match.js 时就真抄错过一次，靠下面这条断言逮住。
//    三处（含非字符串样本：null/undefined/数字/布尔）必须完全一致。
const diffVoice = rows.filter(r => r.front !== r.voice)
ok(diffVoice.length === 0,
  '三处 normalize 对 ' + SAMPLES.length + ' 个样本（含 null / undefined / 数字 / 布尔）完全一致'
  + (diffVoice.length ? '（不一致：' + JSON.stringify(diffVoice) + '）' : ''))
// 两个典型断言：中文逗号被去掉、全角字母被转成半角小写
ok(rows[0].front === '明德精工创新包容', '「明德精工，创新包容」→「明德精工创新包容」（有效长度 8，不会误判超限）')
ok(rows[3].front === 'abc', '「ａｂｃ」（全角）→「abc」')
ok(rows[4].front === 'abc123', '「ＡＢＣ１２３」→「abc123」')
ok(rows.every(r => r.front === r.create && r.create === r.voice),
  '同一份样本在三个文件里给出完全相同的输出（无第二/第三份实现漂移）')

// ----------------------------------------------------------------------------
section('2. 咒语长度上下限 SPELL_MIN / SPELL_MAX')
// ----------------------------------------------------------------------------
ok(frontSpell.SPELL_MIN === createPointValidate.LIMITS.SPELL_MIN,
  'SPELL_MIN 一致：前端 ' + frontSpell.SPELL_MIN + ' / 云函数 ' + createPointValidate.LIMITS.SPELL_MIN)
ok(frontSpell.SPELL_MAX === createPointValidate.LIMITS.SPELL_MAX,
  'SPELL_MAX 一致：前端 ' + frontSpell.SPELL_MAX + ' / 云函数 ' + createPointValidate.LIMITS.SPELL_MAX)

// 纯符号判定也应该两边一致（挡「@#」这类永远打不上卡的咒语）
const SYMBOL_SAMPLES = ['@#', '！！', '，，', 'a', 'ab', '明', '12', '@a', 'a1']
const badMeaning = SYMBOL_SAMPLES.filter(s =>
  frontSpell.hasMeaningfulChar(s) !== createPointValidate.hasMeaningfulChar(s))
ok(badMeaning.length === 0,
  'hasMeaningfulChar 对 ' + SYMBOL_SAMPLES.length + ' 个样本结论一致'
  + (badMeaning.length ? '（不一致：' + badMeaning.join(' / ') + '）' : ''))

// ----------------------------------------------------------------------------
section('3. 打卡基础积分 CHECKIN_POINTS：首页庆祝卡片 vs 云函数积分规则')
// ----------------------------------------------------------------------------
const indexSrc = read('code/code/pages/index/index.js')
const pointsLibSrc = read('code/code/cloudfunctions/getRanking/lib/points.js')
const mPage = /const CHECKIN_POINTS = (\d+)/.exec(indexSrc)
const mLib = /checkin:\s*(\d+)/.exec(pointsLibSrc)
ok(!!mPage, '在 pages/index/index.js 里找到 const CHECKIN_POINTS')
ok(!!mLib, '在 getRanking/lib/points.js 的 POINTS 里找到 checkin')
if (mPage && mLib) {
  const pageVal = Number(mPage[1])
  const libVal = Number(mLib[1])
  ok(pageVal === libVal,
    'CHECKIN_POINTS 一致：前端 ' + pageVal + ' / 云函数 POINTS.checkin ' + libVal
    + '（不等于的话庆祝卡片上的「+N 分」会和排行榜算出来的分对不上）')
}
// 顺带把「+{n} 分」这条文案的占位符检查一下，避免文案被改成没有 {n} 的硬编码
const i18n = require(P('code/code/utils/i18n.js'))
ok(/\{n\}/.test(i18n.zh.index.celebratePoints) && /\{n\}/.test(i18n.en.index.celebratePoints),
  'celebratePoints 文案两侧都保留 {n} 占位符：zh「' + i18n.zh.index.celebratePoints
  + '」/ en「' + i18n.en.index.celebratePoints + '」')

// ----------------------------------------------------------------------------
section('4. 声控判定规则只有一处实现（voiceCheckin/lib/match.js）')
// ----------------------------------------------------------------------------
// 判定规则（阈值、互为包含、空结果拦截）只在 lib/match.js 里写一遍：
// 云函数 index.js 负责"读数据库 + 打讯飞"，前端只把云函数返回的 reason 变成文案，都不重复实现。
// 下面几条是**防回退**断言 —— 哪天有人图省事把判定内联回 index.js，这里会红。
const voiceIndexSrc = read('code/code/cloudfunctions/voiceCheckin/index.js')
ok(/require\('\.\/lib\/match'\)/.test(voiceIndexSrc),
  "voiceCheckin/index.js 从 './lib/match' 引入判定")
ok(!/function\s+normalize\s*\(/.test(voiceIndexSrc) && !/function\s+similarity\s*\(/.test(voiceIndexSrc),
  'voiceCheckin/index.js 里没有内联的 normalize / similarity 副本（内联了本地单测就覆盖不到）')
ok(voiceMatch.SIM_THRESHOLD === 0.8 && voiceMatch.MIN_CONTAIN_LEN === 2,
  '阈值只在 lib/match.js 一处定义：相似度 ' + voiceMatch.SIM_THRESHOLD + ' / 互为包含下限 ' + voiceMatch.MIN_CONTAIN_LEN + ' 字')
ok(typeof voiceMatch.matchSpell === 'function',
  'matchSpell 已导出（tools/test-voice-match.js 依赖它做回归）')

// ----------------------------------------------------------------------------
section('5. 打卡口径：统计类云函数必须排除 type=\'text\' 心情动态')
// ----------------------------------------------------------------------------
// records 集合同时存两类文档：
//   · type='checkin'（早期记录无 type 字段）—— 真正的打卡尝试
//   · type='text' —— 附近动态流里的心情动态，matched:true 只是为了进动态流
// 积分、徽章、记录列表、好友 PK、已点亮点位都只应统计前者；getNearby 是唯一
// 需要把两类都取出来的函数，不能加这个过滤。
const STAT_CLOUDFUNCTIONS = [
  'getRanking', 'getBadges', 'getRecords', 'friends', 'getPoints', 'userProfile'
]
STAT_CLOUDFUNCTIONS.forEach(name => {
  const src = read(`code/code/cloudfunctions/${name}/index.js`)
  ok(/const nonTextType = db\.command\.or\(\[db\.command\.exists\(false\), db\.command\.neq\('text'\)\]\)/.test(src),
    `${name} 定义了 nonTextType 过滤条件（兼容无 type 的早期打卡记录）`)
  const usageCount = (src.match(/type: nonTextType/g) || []).length
  ok(usageCount > 0, `${name} 的记录查询使用了 nonTextType（命中 ${usageCount} 处）`)
})

const nearbySrc = read('code/code/cloudfunctions/getNearby/index.js')
ok(!/nonTextType/.test(nearbySrc),
  'getNearby 保持不排除 type=\'text\'（动态流需要同时展示心情动态与成功打卡）')

const publishSrc = read('code/code/cloudfunctions/publishFeed/index.js')
const voiceSrc = read('code/code/cloudfunctions/voiceCheckin/index.js')
ok(/type: 'text'/.test(publishSrc), 'publishFeed 写入 type=\'text\' 心情动态')
ok(/type: 'checkin'/.test(voiceSrc), 'voiceCheckin 写入 type=\'checkin\' 打卡记录')

// ----------------------------------------------------------------------------
console.log(fail === 0 ? '\n全部一致 ✅' : '\n发现 ' + fail + ' 处不一致 ❌')
process.exit(fail === 0 ? 0 : 1)
