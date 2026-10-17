// pages/about/about.js —— 「关于」页（F-12）
//
// 课程要求：版本、团队分工、**AI 使用说明**都要能查得到（AI 辅助未标注按学术不端处理）。
// 所以这一页不只是"装饰"，它是提交材料的一部分 —— 改版本号时记得同步这里。
//
// ⚠️⚠️ 交作业前请把下面两个常量改成你们组的真实信息：
//   1. APP_VERSION：跟 app.json 里的版本号一起改
//   2. TEAM：姓名 / 分工按实际人数增删（现在是人头占位）
const app = getApp()
const i18n = require('../../utils/i18n')

const APP_VERSION = '1.0.0'

// 团队分工（姓名是占位符，请替换成真实姓名；人数不同就增删条目）
const TEAM = [
  { who: '（待填写）', jobKey: 'roleArch' },
  { who: '（待填写）', jobKey: 'roleFront' },
  { who: '（待填写）', jobKey: 'roleCloud' },
  { who: '（待填写）', jobKey: 'roleDoc' }
]

Page({
  data: {
    version: APP_VERSION,
    team: [],          // [{ who, job }]，job 由语言包按 jobKey 取
    dark: false,
    fontScale: 'md',
    lang: i18n.zh
  },

  // 本页文案全在 wxml 里用 lang.about.* 取，唯一例外是分工里的"职责"要按语言映射，
  // 所以 onLoad 就把语言取好（否则英文模式下职责会残留中文）。
  onLoad: function () {
    this.renderTeam()
  },

  onShow: function () {
    const lang = this.syncGlobalSettings()
    wx.setNavigationBarTitle({ title: lang.about.navTitle })
    this.renderTeam()
  },

  syncGlobalSettings: function () {
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    this.setData({
      dark: app.globalData.darkMode,
      fontScale: app.globalData.fontScale,
      lang: lang
    })
    return lang
  },

  // 把 jobKey 换成当前语言下的职责文案
  renderTeam: function () {
    const isEn = app.globalData.language === 'en'
    const lang = isEn ? i18n.en : i18n.zh
    const team = TEAM.map(t => ({ who: t.who, job: lang.about[t.jobKey] || '' }))
    this.setData({ team: team })
  },

  // 点版本号复制一条可直接贴进文档的版本信息（答辩时方便）
  copyVersion: function () {
    const lang = this.data.lang
    const text = lang.common.appName + ' v' + APP_VERSION
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: lang.about.versionCopied, icon: 'success' })
    })
  }
})
