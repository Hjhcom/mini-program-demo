// 云函数：登录
// 作用：
//  - 默认：微信自动识别用户身份（openid），首次登录自动在数据库建档 —— 微信一键登录/静默登录
//  - 传 phoneCode：手机号验证登录（需企业认证小程序；个人主体拿不到 code）
//  - 传 profile：完善资料（更新当前 openid 用户的头像昵称）
const cloud = require('wx-server-sdk')

// 初始化云开发：自动使用当前环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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
        totalCheckins: 0,
        createdAt: db.serverDate()
      }
      await db.collection('users').add({ data: newUser })
      return { code: 0, isNew: true, user: newUser }
    }
    return { code: 0, isNew: false, user: res.data[0] }
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
          totalCheckins: 0,
          createdAt: db.serverDate()
        }
        await db.collection('users').add({ data: newUser })
        return { code: 0, isNew: true, user: newUser }
      }
      return { code: 0, isNew: false, user: res.data[0] }
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
      totalCheckins: 0,
      createdAt: db.serverDate()
    }
    await users.add({ data: newUser })
    return { code: 0, isNew: true, user: newUser }
  }

  // 完善资料：更新当前用户的头像昵称（微信登录弹窗确认后调用）
  if (event.profile) {
    const p = event.profile
    await users.where({ openid: OPENID }).update({
      data: {
        nickname: (p.nickname || '打卡玩家').toString().slice(0, 20),
        avatarUrl: p.avatarUrl || '',
        updatedAt: db.serverDate()
      }
    })
    const after = await users.where({ openid: OPENID }).get()
    return { code: 0, isNew: false, user: after.data[0] }
  }

  // 老用户：直接返回已存的信息
  return { code: 0, isNew: false, user: res.data[0] }
}
