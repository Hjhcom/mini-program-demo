// 云函数：登录
// 作用：
//  - 默认：微信自动识别用户身份（openid），首次登录自动在数据库建档 —— 微信一键登录/静默登录
//  - 传 phoneCode：手机号验证登录（需企业认证小程序；个人主体拿不到 code）
//  - 传 profile：完善资料（更新当前 openid 用户的头像昵称）
//  - 所有云端用户自动生成唯一邀请码 inviteCode（用于好友 PK）
const cloud = require('wx-server-sdk')

// 初始化云开发：自动使用当前环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 生成唯一 6 位邀请码（大写字母+数字，去掉易混淆字符 0/O/1/I），最多重试 5 次
async function genInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let i = 0; i < 5; i++) {
    let code = ''
    for (let j = 0; j < 6; j++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    const exist = await db.collection('users').where({ inviteCode: code }).count()
    if (exist.total === 0) return code
  }
  // 兜底：时间戳转 36 进制
  return 'A' + Date.now().toString(36).toUpperCase().slice(-5)
}

// 确保用户有邀请码：没有则生成并落库，返回带 inviteCode 的用户对象
async function ensureInviteCode(user) {
  if (user.inviteCode) return user
  const code = await genInviteCode()
  await db.collection('users').doc(user._id).update({ data: { inviteCode: code } })
  user.inviteCode = code
  return user
}

// ⚠️ 出参白名单：users 的文档不整份回传（团队约定：云函数对外只给白名单字段）
//    - openid 是敏感凭据，不出服务端；身份一律取自 getWXContext()，不靠前端传
//    - phone 是 PII，前端也从不展示，没必要落到 wx.setStorageSync 里
//    - totalCheckins 恒 0（无累加逻辑），传出去只会被误当数据源
//    前端实际只读 nickname / avatarUrl / inviteCode（source 由前端登录方式自行标注）
function pickUser(user) {
  return {
    nickname: user.nickname || '打卡玩家',
    avatarUrl: user.avatarUrl || '',
    inviteCode: user.inviteCode || '',
    gender: user.gender || '',
    region: Array.isArray(user.region) ? user.region : []
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  // ===== 短信验证码登录（手机号 + 验证码）=====
  if (event.phone && event.code) {
    const phone = String(event.phone)
    const code = String(event.code)
    const now = new Date()

    // 1. 校验验证码：取该手机号最新一条未使用的
    const codeRes = await db.collection('sms_codes')
      .where({ phone: phone, code: code, used: false })
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
    if (codeRes.data.length === 0) {
      return { code: -1, msg: '验证码错误，请重新获取' }
    }
    const record = codeRes.data[0]

    // 2. 过期检查（5 分钟有效）
    if (record.expireAt && new Date(record.expireAt) < now) {
      return { code: -1, msg: '验证码已过期，请重新获取' }
    }

    // 3. 标记验证码已使用（防止重复登录）
    await db.collection('sms_codes').doc(record._id).update({
      data: { used: true }
    })

    // 4. 按手机号查/建用户
    let res = await db.collection('users').where({ phone }).get()
    if (res.data.length === 0) {
      const newUser = {
        openid: OPENID || '',
        phone: phone,
        nickname: '手机用户' + phone.slice(-4),
        avatarUrl: '',
        inviteCode: await genInviteCode(),
        totalCheckins: 0,
        createdAt: db.serverDate()
      }
      await db.collection('users').add({ data: newUser })
      return { code: 0, isNew: true, user: pickUser(newUser) }
    }
    return { code: 0, isNew: false, user: pickUser(await ensureInviteCode(res.data[0])) }
  }

  // ===== 手机号快速验证登录（getPhoneNumber 动态 code，需企业认证主体）=====
  if (event.phoneCode) {
    try {
      // 用前端传来的动态 code 换取手机号（需在云开发控制台为该云函数开通权限）
      const phoneRes = await cloud.openapi.phonenumber.getPhoneNumber({
        code: event.phoneCode
      })
      const phone = phoneRes.phoneInfo.purePhoneNumber

      // 按手机号查/建用户
      let res = await db.collection('users').where({ phone }).get()
      if (res.data.length === 0) {
        const newUser = {
          openid: OPENID || '',
          phone: phone,
          nickname: '手机用户' + phone.slice(-4),
          avatarUrl: '',
          inviteCode: await genInviteCode(),
          totalCheckins: 0,
          createdAt: db.serverDate()
        }
        await db.collection('users').add({ data: newUser })
        return { code: 0, isNew: true, user: pickUser(newUser) }
      }
      return { code: 0, isNew: false, user: pickUser(await ensureInviteCode(res.data[0])) }
    } catch (e) {
      console.error('手机号登录失败：', e)
      return { code: -1, msg: '手机号登录失败：' + (e.errMsg || e.message) }
    }
  }

  // ===== 微信一键登录（默认）=====
  // 微信自动识别用户，不需要账号密码
  const users = db.collection('users')
  let res = await users.where({ openid: OPENID }).get()

  // 第一次来：自动创建用户档案
  if (res.data.length === 0) {
    const newUser = {
      openid: OPENID,
      nickname: '打卡玩家',
      avatarUrl: '',
      inviteCode: await genInviteCode(),
      totalCheckins: 0,
      createdAt: db.serverDate()
    }
    await users.add({ data: newUser })
    return { code: 0, isNew: true, user: pickUser(newUser) }
  }

  // 完善资料：更新当前用户的头像昵称（微信登录弹窗确认后调用）
  if (event.profile) {
    const p = event.profile
    const update = {
      nickname: (p.nickname || '打卡玩家').toString().slice(0, 20),
      avatarUrl: p.avatarUrl || '',
      updatedAt: db.serverDate()
    }
    // 性别 / 地区可选：传了才更新；性别限定枚举值
    if (p.gender !== undefined) {
      update.gender = ['male', 'female', 'secret'].indexOf(p.gender) >= 0 ? p.gender : ''
    }
    if (p.region !== undefined) {
      update.region = Array.isArray(p.region) && p.region.length === 3
        ? p.region.map(t => String(t).slice(0, 20))
        : []
    }
    await users.where({ openid: OPENID }).update({ data: update })
    const after = await users.where({ openid: OPENID }).get()
    return { code: 0, isNew: false, user: pickUser(await ensureInviteCode(after.data[0])) }
  }

  // 老用户：直接返回已存的信息（补邀请码）
  return { code: 0, isNew: false, user: pickUser(await ensureInviteCode(res.data[0])) }
}
