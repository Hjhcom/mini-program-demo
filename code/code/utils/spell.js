// utils/spell.js —— 咒语文本的规范化与长度计算（前端用）
//
// ⚠️ 这里和 cloudfunctions/createPoint/lib/validate.js 里的 normalizeSpell 是**同一套规则的两份拷贝**。
//    原因：云函数部署时只打包自己目录下的文件，前端 require 不到云函数 lib；
//    反过来前端 utils/ 也不会被打进云函数包。两边都不允许跨目录 require，
//    所以只能各存一份 —— 改规则时**两处都要改**（voiceCheckin 的 dayKey 也是同样的情况）。
//
//    这套规则本身要与 cloudfunctions/voiceCheckin/index.js 的 normalize() 保持一致：
//    全角转半角 + 去掉空白与常见中英文标点。因为咒语的"有效长度"应该按
//    「识别时真正参与比对的那串字符」算，否则「明德精工，创新包容」会因为
//    多了一个逗号被判成 9 个字而超限。

// 咒语有效长度限制（与 createPoint/lib/validate.js 的 LIMITS 一致）
const SPELL_MIN = 2
const SPELL_MAX = 8

function normalizeSpell(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[\s，。、！？；：""''（）,.!?;:()\u3000]/g, '')
}

// 按码点数长度（emoji 算 1 个，不用 s.length）
function charLen(s) {
  return Array.from(String(s == null ? '' : s)).length
}

// 咒语的有效长度（不含标点与空格）
function spellLength(s) {
  return charLen(normalizeSpell(s))
}

// 是否含有「有意义的字符」（汉字 / 字母 / 数字）—— 与云函数端的规则一致，
// 用来在提交前就挡住「@#」「！！」这类纯符号咒语
function hasMeaningfulChar(s) {
  return /[\u3400-\u4dbf\u4e00-\u9fffa-z0-9]/.test(String(s == null ? '' : s))
}

module.exports = {
  SPELL_MIN,
  SPELL_MAX,
  normalizeSpell,
  charLen,
  spellLength,
  hasMeaningfulChar
}
