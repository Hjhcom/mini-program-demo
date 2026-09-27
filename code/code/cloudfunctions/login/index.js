// 云函数：登录
// 作用：微信自动识别用户身份（openid），首次登录自动在数据库建档
const cloud = require('wx-server-sdk')

// 初始化云开发：自动使用当前环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  // 微信自动识别用户，不需要账号密码
  const { OPENID } = cloud.getWXContext()

  // 1. 在用户表里找这个用户
  const users = db.collection('users')
  let res = await users.where({ openid: OPENID }).get()

  // 2. 第一次来：自动创建用户档案
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

  // 3. 老用户：直接返回已存的信息
  return { code: 0, isNew: false, user: res.data[0] }
}
