# 项目日志（Project Log）

## 项目概览

- **项目名称**：mini-program-demo
- **项目简介**：微信小程序团队开发项目 —— 声控打卡游戏
- **技术栈**：微信小程序原生框架、微信云开发（云函数）
- **仓库地址**：https://github.com/Hjhcom/mini-program-demo
- **当前分支**：main

## 项目结构

```
mini-program-demo/
├── code/                          # 小程序代码
│   ├── code/
│   │   ├── app.js / app.json / app.wxss
│   │   ├── sitemap.json
│   │   ├── images/
│   │   │   └── tabbar/            # tabBar 图标（首页/我的 × 灰色/选中蓝）
│   │   ├── pages/
│   │   │   ├── login/             # 登录方式选择页（微信/手机号/游客）
│   │   │   ├── index/             # 首页（地图打卡）
│   │   │   ├── mine/              # 我的页
│   │   │   └── records/           # 打卡记录页
│   │   └── cloudfunctions/
│   │       ├── login/             # 登录云函数（微信/手机号/资料更新）
│   │       ├── sendCode/          # 短信验证码云函数
│   │       ├── getRecords/        # 打卡记录查询云函数
│   │       ├── getPoints/         # 打卡点列表
│   │       └── voiceCheckin/      # 声控打卡
│   ├── project.config.json
│   └── project.private.config.json
├── .gitignore
├── README.md
└── PROJECT_LOG.md                 # 本文件
```

## 开发日志

### 2026-09-27
- 初始化 Git 仓库（`556b1d8` Initial commit）。
- 搭建小程序基础工程（`67a69ef` 初始提交：小程序基础代码）：
  - 创建 `app.js` / `app.json` / `app.wxss` 全局配置与样式；
  - 创建首页 `pages/index`；
  - 创建登录云函数 `cloudfunctions/login`；
  - 配置 `project.config.json`、`sitemap.json` 及 `.gitignore`。

### 2026-09-28
- 新增登录界面（`afd4325` 新增登录界面）：
  - 创建 `pages/login` 页面（wxml / wxss / js / json）；
  - 在 `app.json` 中注册登录页面为首页路由；
  - 配置位置权限说明（`scope.userLocation`），用于显示附近打卡点位置。

### 2026-10-12
- 新增底部导航栏（tabBar）：
  - 「首页」`pages/index` + 「我的」`pages/mine` 两个 tab；
  - 生成 tabBar 图标 `images/tabbar/`（首页/我的 × 灰色/选中蓝两态）；
  - 首页改为启动页，登录页降为普通页面。
- 新增「我的」页面 `pages/mine`：
  - 用户信息卡片（头像/昵称，未登录时显示登录引导）；
  - 功能列表（打卡记录 / 设置 / 关于）与退出登录；
  - 未登录时页面下方显示「点击登录」按钮，退出登录后保持未登录态。
- 搭建登录体系：
  - `app.js` 新增全局登录态管理（`setUser` / `clearUser` / `restoreUser`，本地缓存持久化）；
  - 登录方式选择页 `pages/login`：微信一键登录、手机号验证码登录、游客登录；
  - 协议勾选校验：未勾选《用户协议》《隐私政策》时拦截所有登录方式；
  - 微信登录：静默 openid 建档 + 头像昵称授权弹窗（`chooseAvatar` + `nickname` 输入，头像上传云存储、昵称写入 `users` 表，老用户资料完整时直接登录）；
  - 手机号验证码登录：新增云函数 `sendCode`（生成 6 位验证码存入 `sms_codes`，5 分钟有效、一次性使用），`login` 云函数增加验证码校验分支（演示模式未接真实短信，验证码直接返回前端展示）；
  - 游客登录：本地生成游客身份，不依赖微信账号。
- 首页打卡登录门槛：
  - 未登录时底部面板显示「请先登录，登录后才能打卡」，不展示打卡入口；
  - 点击「定位打卡」/「说咒语」时提示「请先登录」并自动跳转登录界面；
  - 登录态在首页 `onShow` 实时同步。
- 打通打卡记录（首页打卡 → 我的页 → 记录详情）：
  - 新增云函数 `getRecords`：按 openid 查询 `records` 集合，时间倒序、分页（每页 20 条）、返回总数；
  - 新增页面 `pages/records`：顶部统计栏（总记录 / 成功次数）、记录列表（打卡点、时间、成功/失败徽标）、详情弹窗（打卡时间、应念咒语、识别结果、相似度）、空状态引导；
  - 「我的」页「我的打卡记录」入口打通（未登录时提示先登录并跳转登录页）。
- 涉及模块：`app.js`、`app.json`、`pages/index`、`pages/login`、`pages/mine`、`pages/records`、`cloudfunctions/login`、`cloudfunctions/sendCode`、`cloudfunctions/getRecords`、`images/tabbar`
- 注意事项：
  - `login`、`sendCode` 云函数均有改动/新增，需在开发者工具中「上传并部署：云端安装依赖」后生效；
  - 真实短信验证码通道（腾讯云 SMS）待接入，当前为演示模式。

## 后续计划

> 待补充：以下为基于当前进度的建议项，请按团队实际安排更新。

- [x] 首页打卡功能开发（地图 / 定位 / 录音声控打卡）
- [x] 登录体系与前端联调（微信 / 手机号验证码 / 游客）
- [x] 用户数据存储与查询（`users` / `records` / `sms_codes` 集合）
- [x] 「我的打卡记录」页面（列表 + 详情弹窗）
- [ ] 接入真实短信验证码通道（腾讯云 SMS，需企业实名 + 签名审核）
- [ ] 打卡记录分页加载（下拉加载更多）
- [ ] 界面样式统一与视觉优化

## 日志规范

- 每次提交代码时，在本文档对应日期下追加一条记录，注明提交说明、涉及模块与关键改动。
- 日期按实际开发日期填写；跨天开发请分条记录。
- 无法确定具体日期的改动，可先记录到"待归档"段落，补上日期后移入对应条目。
