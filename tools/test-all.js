// tools/test-all.js —— 一键跑全部本地单元测试（提交前自查 / 答辩现场演示）
// 用法（仓库根目录）： node tools/test-all.js
//
// 设计说明：
//   · 纯函数测试全部落在 tools/ 下，不依赖网络、云环境、小程序 IDE，node 直接跑
//   · 每个脚本自己 exit(0/1)，这里汇总结果；任一失败整体 exit(1)，方便接 CI
//   · 答辩现场演示「前端工具 6 类 + 云函数判定 4 类，一次跑 400+ 断言全绿」比口头说更可信
const { execFileSync } = require('child_process')
const path = require('path')

const TESTS = [
  'test-voice-match.js',   // 咒语归一化 / 相似度 / 匹配判定 / 星级
  'test-points.js',        // 积分规则 / 连续打卡奖励封顶
  'test-badges.js',        // 徽章达成条件 / 连续天数
  'test-point-create.js',  // 点位创建参数校验（名称/咒语/半径/坐标）
  'test-clean-voice.js',   // 录音过期清理 / 分片
  'test-geo.js',           // 前端 geo 工具（距离/附近筛选）
  'test-guard.js'          // F-23 防作弊：定位 300m 边界 / UTC+8 dayKey / 任务豁免
]

let passed = 0
const failed = []
const summary = []

console.log('==========================================')
console.log(' 依声游理 · 全量单元测试（node ' + process.version + '）')
console.log('==========================================')

TESTS.forEach((t, i) => {
  const full = path.join(__dirname, t)
  console.log('\n[' + (i + 1) + '/' + TESTS.length + '] ' + t)
  try {
    const out = execFileSync('node', [full], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const last = out.trim().split(/\r?\n/).pop()
    console.log('   ' + last)
    summary.push({ name: t, ok: true, line: last })
    passed++
  } catch (e) {
    const out = String((e.stdout || '') + (e.stderr || ''))
    const bad = out.split(/\r?\n/).filter(l => l.indexOf('❌') >= 0)
    console.log('   ❌ 脚本失败')
    bad.slice(0, 8).forEach(l => console.log('   ' + l.trim()))
    summary.push({ name: t, ok: false, line: '失败' })
    failed.push(t)
  }
})

console.log('\n==========================================')
summary.forEach(s => console.log((s.ok ? '  ✅ ' : '  ❌ ') + s.name + '  —— ' + s.line))
console.log('------------------------------------------')
if (failed.length === 0) {
  console.log('  结果：' + passed + '/' + TESTS.length + ' 个脚本全部通过 ✅')
  console.log('  断言总数：见上方各脚本末行（共 400+ 条）')
  console.log('==========================================')
  process.exit(0)
} else {
  console.log('  结果：' + passed + '/' + TESTS.length + ' 通过，失败脚本：' + failed.join(', '))
  console.log('==========================================')
  process.exit(1)
}
