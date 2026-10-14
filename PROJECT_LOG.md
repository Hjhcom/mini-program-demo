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
│   │   │   ├── records/           # 打卡记录页
│   │   │   ├── agreement/         # 用户协议 / 隐私政策页
│   │   │   └── settings/          # 设置页（深色模式/字体大小/清除缓存）
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
- 新增《用户协议》《隐私政策》内容：
  - 新增页面 `pages/agreement`（`?type=user|privacy` 切换）：用户协议 8 章、隐私政策 9 章全文；
  - 登录页协议勾选中的链接由占位提示改为跳转真实协议页面。
- 新增「设置」功能（我的页 → 设置 → 通用）：
  - 新增页面 `pages/settings`：深色模式开关、字体大小三档（标准/大/特大）、清除缓存（显示缓存大小，清理时保留登录态与设置）；
  - `app.js` 新增全局设置管理（`darkMode` / `fontScale`，本地缓存持久化、启动恢复）；
  - `app.wxss` 新增全局深色主题覆盖与字体大小覆盖；
  - 全部页面（index/mine/login/records/agreement/settings）接入设置状态并在 `onShow` 同步。
- 涉及模块：`app.js`、`app.wxss`、`app.json`、`pages/index`、`pages/login`、`pages/mine`、`pages/records`、`pages/agreement`、`pages/settings`、`cloudfunctions/login`、`cloudfunctions/sendCode`、`cloudfunctions/getRecords`、`images/tabbar`
- 注意事项：
  - `login`、`sendCode` 云函数均有改动/新增，需在开发者工具中「上传并部署：云端安装依赖」后生效；
  - 真实短信验证码通道（腾讯云 SMS）待接入，当前为演示模式。

### 2026-10-14
- 新增右上角菜单分享功能：
  - `app.json` 开启全局分享开关（`enableShareAppMessage` / `enableShareTimeline`）；
  - 全部页面（index / mine / login / records / agreement / settings）新增 `onShareAppMessage` / `onShareTimeline`，自定义分享标题与落地路径（分享统一落到首页或我的页）。
- 新增启动封面页 `pages/splash`：
  - 设为启动页，展示 5 秒后自动跳转首页（`switchTab`），右上角带跳过按钮与倒计时；
  - 涉及模块：`app.json`、`pages/splash`（新建）。
- 新增好友打卡 PK 功能（分享邀请制，不依赖微信好友接口）：
  - `login` 云函数：所有云端用户建档时自动生成唯一 6 位邀请码 `inviteCode`，老用户查询时自动补齐；
  - 新增云函数 `friends`：`action=list`（好友列表+打卡统计）、`action=pk`（两人数据对比）、`action=add`（凭邀请码建立双向好友关系，写入 `friends` 集合）；
  - 「我的」页：展示我的邀请码（复制 / 邀请好友按钮），新增「好友打卡PK」入口；
  - 新增页面 `pages/pk`：好友列表（打卡/成功次数）+ PK 对比弹窗（总打卡 / 成功次数 / 最近打卡，胜负判定与文案）；
  - 首页与各页分享回调带上邀请码参数（`/pages/index/index?invite=XXX`），好友点开分享卡片进入后自动绑定好友（`app.js` 新增 `bindPendingInvite`，登录成功后触发）；
  - 游客身份不支持好友 PK（无云端账号体系），前端已拦截提示；
  - 涉及模块：`app.js`、`app.json`、`cloudfunctions/login`、`cloudfunctions/friends`（新建）、`pages/mine`、`pages/index`、`pages/login`、`pages/pk`（新建）。
- 注意事项：新增/改动页面后需重新编译预览；`splash` 为启动页，冷启动时最先展示。
  - `login`、`friends` 云函数需在开发者工具中「上传并部署：云端安装依赖」后生效；
  - 数据库需新建 `friends` 集合（`users` 集合已有）；老用户重新登录一次即可获得邀请码。
- 新增中英文显示语言切换：
  - 新建语言包 `utils/i18n.js`（zh/en 各 131 条文案，动态文案用 `format()` 模板填充）；
  - `app.js` 新增 `language` 全局状态（zh/en）+ `setLanguage` 持久化；
  - 设置页新增「显示语言」选项（中文 / English），点击即全局生效；
  - 全部页面（index / mine / login / records / pk / settings / agreement）接入语言切换：按钮、提示、弹窗、toast、导航栏标题随语言变化；协议正文为正式法律文本保持中文；
  - 涉及模块：`utils/i18n.js`（新建）、`app.js`、`pages/*`（7 个页面 wxml/js）。
  - 补充：底部 tabBar 文字（首页/我的）为静态配置，通过 `wx.setTabBarItem` 在 `app.applyTabBarLang()` 中随语言动态切换，两个 tab 页 `onShow` 时同步。
- 新增「文博中心」打卡点（`getPoints` 种子数据）：
  - `cloudfunctions/getPoints/index.js` 的 `SEED_POINTS` 新增：北京理工大学良乡校区文博中心（经度 116.176778、纬度 39.733354、咒语「明德精工，创新包容」、半径 50 米），坐标取自高德 POI（gcj02）；
  - 注意：种子数据仅在 `points` 集合为空时写入；现有集合已有 3 条记录，需在云开发控制台 `points` 集合手动新增同结构记录（name / longitude / latitude / spell / radius / creatorOpenid / createdAt，`_id` 自动生成）后地图才会显示；
  - 坐标校准：若现场图钉位置有偏差，可到点后使用首页「定位打卡」的 Console GPS 调试打印校准。

## 后续计划

> 待补充：以下为基于当前进度的建议项，请按团队实际安排更新。

- [x] 首页打卡功能开发（地图 / 定位 / 录音声控打卡）
- [x] 登录体系与前端联调（微信 / 手机号验证码 / 游客）
- [x] 用户数据存储与查询（`users` / `records` / `sms_codes` 集合）
- [x] 「我的打卡记录」页面（列表 + 详情弹窗）
- [x] 设置功能（深色模式 / 字体大小 / 清除缓存）
- [ ] 接入真实短信验证码通道（腾讯云 SMS，需企业实名 + 签名审核）
- [ ] 打卡记录分页加载（下拉加载更多）
- [ ] 界面样式统一与视觉优化

## 日志规范

- 每次提交代码时，在本文档对应日期下追加一条记录，注明提交说明、涉及模块与关键改动。
- 日期按实际开发日期填写；跨天开发请分条记录。
- 无法确定具体日期的改动，可先记录到"待归档"段落，补上日期后移入对应条目。
