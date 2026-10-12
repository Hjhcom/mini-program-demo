// 云函数：sendCode 发送短信验证码
// 作用：手机号登录 —— 生成 6 位验证码存入 sms_codes 集合（5 分钟有效）
// 说明：演示模式下未接真实短信通道，验证码直接返回给前端展示；
//       接入腾讯云短信（SMS）后，把发送逻辑替换为真实短信即可。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const phone = String(event.phone || '')

  // 1. 手机号格式校验：11 位数字
  if (!/^1\d{10}$/.test(phone)) {
    return { code: -1, msg: '手机号格式不正确' }
  }

  // 2. 生成 6 位随机验证码
  const code = String(Math.floor(100000 + Math.random() * 900000))

  // 3. 存入数据库：手机号 + 验证码 + 5 分钟过期
  await db.collection('sms_codes').add({
    data: {
      phone: phone,
      code: code,
      used: false, // 使用后置为 true，防止重复使用
      createdAt: db.serverDate(),
      expireAt: new Date(Date.now() + 5 * 60 * 1000)
    }
  })

  // 4. TODO: 接入真实短信服务后，在这里调用短信发送接口（如腾讯云 SMS）
  //    演示模式：直接把验证码返回，前端以提示形式展示
  return {
    code: 0,
    devCode: code,
    msg: '演示模式：未接入真实短信，验证码见提示'
  }
}
