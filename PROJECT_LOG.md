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
│   │   │   ├── task/              # 打卡任务页（我发布的 / 我接的）
│   │   │   ├── task-create/       # 发布打卡任务页
│   │   │   ├── records/           # 打卡记录页
│   │   │   ├── agreement/         # 用户协议 / 隐私政策页
│   │   │   └── settings/          # 设置页（深色模式/字体大小/清除缓存）
│   │   └── cloudfunctions/
│   │       ├── login/             # 登录云函数（微信/手机号/资料更新）
│   │       ├── sendCode/          # 短信验证码云函数
│   │       ├── getRecords/        # 打卡记录查询云函数
│   │       ├── getPoints/         # 打卡点列表
│   │       ├── createTask/        # 创建打卡任务（生成 6 位任务码）
│   │       ├── acceptTask/        # 凭任务码接受任务
│   │       ├── listTasks/         # 查询我发布 / 我接受的任务
│   │       └── voiceCheckin/      # 声控打卡（支持任务打卡 taskId）
│   ├── project.config.json
│   └── project.private.config.json
├── docs/                          # 开发文档
│   └── 下一步功能规划与操作说明.md
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

> 本批改动为 10-13 晚 ~ 10-14 凌晨连续开发，按提交日期记为 10-14。

- 新增**打卡任务系统**（对应课程选题要求「用户可以给他人设定打卡任务」，`7c42d53` 新增打卡任务系统）：
  - 新增云函数 `createTask`：随机生成 6 位任务码（生成时查重重试），写入 `tasks` 集合并返回 `{ taskId, inviteCode }`；任务咒语默认取点位咒语。
  - 新增云函数 `acceptTask`：凭任务码查找 `pending` 状态任务，拦截「接受自己发布的任务」；截止时间已过则顺手将任务置为 `expired`；通过后写入 `assigneeOpenid` 并将状态改为 `accepted`。
  - 新增云函数 `listTasks`：按 `type=created|assigned` 分别查询「我发布的」「我接的」任务，`createdAt` 倒序、上限 50 条。
  - 改造云函数 `voiceCheckin` 支持任务打卡（新增入参 `event.taskId`）：在调用讯飞识别前先做任务校验（任务存在 / 状态为 `accepted` / 属于当前用户 / **点位与任务指定点位一致** / 未超时）；比对咒语由点位默认咒语改为任务咒语（`targetSpell`）；打卡记录新增 `taskId` 字段；打卡成功后回写任务 `status=completed` + `completedAt` + `recordId`，实现「同一任务不可重复打卡」。
  - 新增页面 `pages/task`：顶部 Tab「我发布的 / 我接的」、任务卡片（标题 / 点位 / 咒语 / 截止时间 / 状态徽标）、点击待接受任务复制任务码、右上角输入任务码接受任务、右下角悬浮按钮跳转发布页、支持下拉刷新。
  - 新增页面 `pages/task-create`：从打卡点列表中选择点位，填写标题（必填，最多 30 字）与描述，有效期四选一（1 小时 / 6 小时 / 24 小时 / 3 天），提交后弹窗以大字展示任务码并支持一键复制。
  - 首页 `pages/index`：新增「待完成任务」提示条（显示任务点位与咒语，点击跳转任务页）；录音打卡携带 `taskId`（仅当任务点位与当前选中点位一致时）；补上云函数返回码非 0 的提示分支（原先只判断 `matched`，任务校验失败时会显示「听到：undefined」）。
  - 「我的」页新增「打卡任务」入口（未登录时先引导登录）；`app.json` 注册 `pages/task/task`、`pages/task-create/task-create`。
- 新增开发文档 `docs/下一步功能规划与操作说明.md`：对照课程实践指南的选题要求梳理现状差距，给出 P0/P1/P2 功能优先级、逐项操作步骤、云开发控制台操作清单（集合 / 索引 / 权限 / 部署）、验收用例与开发排期建议。
- 云开发控制台配置（代码之外，不随仓库同步，需在控制台手工完成）：
  - 新建 `tasks` 集合，权限统一设为「所有用户不可读写」（所有数据访问一律走云函数，客户端不直连数据库）；
  - 为 `tasks` 建立 3 条索引：`inviteCode`（**唯一**，任务码不重复的最后一道防线）、`creatorOpenid + createdAt`（降序）、`assigneeOpenid + createdAt`（降序）；
  - `createTask` / `acceptTask` / `listTasks` / `voiceCheckin` 四个云函数均以「上传并部署：云端安装依赖」方式部署。
- 修复与加固：
  - `app.json` 中页面路径原写作 `"pages/task"`（缺少文件名一层），导致开发者工具每次编译都自动生成空白页面文件 `pages/task.js` / `pages/task.wxml`，已改为 `"pages/task/task"` 并删除自动生成的文件；
  - 云函数读取单条记录原用 `db.collection().doc(id).get()`，记录不存在时会**抛异常**而非返回空值，导致友好提示永远执行不到，已统一改为 `where({ _id: id })` 再取 `data[0]`（涉及 `voiceCheckin` 读取打卡点与任务）；
  - `voiceCheckin` 原先不校验任务指定点位，用户在其他点位念对咒语也会判定完成，已补上点位校验。
- 涉及模块：`cloudfunctions/createTask`、`cloudfunctions/acceptTask`、`cloudfunctions/listTasks`、`cloudfunctions/voiceCheckin`、`pages/task`、`pages/task-create`、`pages/index`、`pages/mine`、`app.json`、`docs/`、`.gitignore`
- 注意事项：
  - `voiceCheckin` 属**改造**，必须重新部署，否则前端传入的 `taskId` 不生效；
  - 任务码的唯一性依赖 `tasks.inviteCode` 的唯一索引（云函数内查重无法覆盖并发场景），该索引只能在控制台手工创建；
  - `.workbuddy/` 为本地工作目录，已加入 `.gitignore`，不随仓库共享；
  - `login`、`friends` 云函数需在开发者工具中「上传并部署：云端安装依赖」后生效；数据库需新建 `friends` 集合（`users` 集合已有）；老用户重新登录一次即可获得邀请码；
  - 新增/改动页面后需重新编译预览；`splash` 为启动页，冷启动时最先展示。

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
- **合并记录**：本次将「打卡任务系统」与远程的「分享 / 启动页 / 好友 PK / 中英文切换」合并到 `main`。冲突集中在 4 个文件、7 处，按「双方功能都保留」原则解决：
  - `pages/mine`：功能列表同时保留「打卡任务」与「好友打卡PK」入口；`data-type` 统一为英文标识符（`records` / `task` / `pk` / `settings` / `about`），并删除了重复的旧「设置」项；
  - `pages/index`：保留任务待办提示条与 `taskId` 传参，提示语统一改走 `utils/i18n.js`（采纳 `refreshTip()` 结构，并在其中补上待办任务查询）；
  - `utils/i18n.js`：新增 `mine.task`、`index.tipHasTask` 词条（zh / en 两套）。
  - ✅ 后续已补：`pages/task`、`pages/task-create` 的文案已全部接入 i18n（见下一条）。
- 两个任务页接入中英文切换，并清理历史残留的冲突标记：
  - `utils/i18n.js` 新增 `task`（32 条）、`taskCreate`（26 条）两个词条分区，zh / en 各 58 条，合计 191 条；
    覆盖两个任务页的 Tab、按钮、空状态、状态徽标（待接受 / 进行中 / 已完成 / 已过期）、任务详情弹窗、接受任务弹窗、发布表单与任务码弹窗。
  - `pages/task`：`STATUS_MAP` 由「状态 → 中文文案」改为「状态 → 文案键」映射，展示时按当前语言解析；所有 toast / modal / 导航栏标题统一走 `i18n`；
    「任务码 123456 · 点击复制」因 wxml 无法调用函数，改为在 `decorate()` 中先用 `i18n.format()` 拼好 `codeText`。
  - `pages/task-create`：有效期选项由「固定中文标签」改为「文案键 + 小时数」结构，`onShow` 时按语言生成标签；表单标题 / 占位符 / 校验提示 / 任务码弹窗全部接入 i18n。
  - 修复 `project.private.config.json`（仓库根目录）：该文件自早期提交（`3f8056d`）起就带着 Git 冲突标记（`<<<<<<< HEAD` / `>>>>>>> 9b5bc6f...`），早已不是合法 JSON；已清理为合法 JSON（`libVersion` 取 `3.17.3`，保留 `useGlassEaselForWxml: false`）并补上文件末尾换行。
  - 涉及模块：`utils/i18n.js`、`pages/task`、`pages/task-create`、`project.private.config.json`。
  - 说明：各页 `json` 中的 `navigationBarTitleText` 保留中文作为默认值（与既有页面一致），运行时由 `wx.setNavigationBarTitle` 按当前语言覆盖。
- 打卡任务云函数加固（`createTask` / `acceptTask` / `listTasks`，三处均为既有代码的缺陷修复）：
  - `createTask`：① 读取打卡点由 `db.collection('points').doc(pointId).get()` 改为 `where({ _id: pointId })` 再取 `data[0]`——云函数端 `doc(id).get()` 在记录不存在时**抛异常**而非返回空值，导致原先写好的「打卡点不存在」友好提示永远执行不到，前端只会收到函数执行失败；② 新增截止时间校验：必须为合法日期、晚于当前时间、且不超过 30 天（前端有效期最大 3 天，30 天只是防客户端被改的宽松上限）。
  - `acceptTask`：返回值不再回传整个任务对象（原对象含 `creatorOpenid` / `assigneeOpenid`），改为白名单字段（`_id` / `title` / `desc` / `pointId` / `pointName` / `spell` / `radius` / `deadline` / `status` / `inviteCode` / `creatorNickname`），遵循「不下发 openid」约定。前端只判断 `code`、不消费该对象，无需配合改动。
  - `listTasks`：补上此前注释声称却并未实现的「顺手把过期的标一下」——把本次查出的 50 条中状态仍为 `pending` / `accepted` 且已过 `deadline` 的任务批量置为 `expired`，并同步修正返回值，前端本次刷新即可看到「已过期」徽标。彻底清理仍建议走定时触发器（见文档 3.9）。
  - 注意：三个函数改动后都必须重新部署（「上传并部署：云端安装依赖」）。
  - 涉及模块：`cloudfunctions/createTask`、`cloudfunctions/acceptTask`、`cloudfunctions/listTasks`。
- 新增**点位打卡用户信息展示**（F-02 / P0，文档 3.2）：
  - 新增云函数 `getPointUsers`：给定 `pointId`，返回该点位「打卡成功」的**人数**（按 openid 去重）与**最近打卡的 5 位玩家**（昵称 + 头像）。
    - 人数统计用 `aggregate().match({pointId, matched:true}).group({_id:'$openid'}).count('n')`——只回传一个数字，不会像 `addToSet('$openid')` 那样把全部 openid 堆进一个数组顶到聚合内存上限；
    - 头像墙先取最近 20 条成功记录再去重取 5 个不同用户（同一用户连续打卡也能凑满 5 人）；
    - `users.avatarUrl` 存的是云存储 fileID，在云函数里用 `cloud.getTempFileURL()` 批量换成 https 临时链接再返回（`<image>` 不能直接渲染 fileID），失败时退回昵称首字占位；
    - **隐私**：openid 只在服务端用于去重与排序，**返回值里不含 openid**（openid 属于敏感标识，报告里需说明这一点）。
  - 首页 `pages/index` 改造：
    - 选中图钉后自动拉取该点位玩家数据，底部面板新增「点位名 + 咒语」标题区与玩家区（`已有 N 位玩家在此打卡成功` + 头像墙；无人时显示「还没有人在这里打卡，你可以做第一个！」）；
    - 选中点位时面板加 `.panel-sheet` 类变为可滚动的半屏卡片（`max-height: 45vh`），未选中时保持原样，不改动打卡主流程的按钮与提示语；
    - 新增「给好友设个任务」按钮（跳 `pages/task-create`），把 F-01 与 F-02 串起来；
    - 打卡成功后自动刷新头像墙；连点不同图钉时用请求序号丢弃过期响应，避免数据错位。
  - i18n：`utils/i18n.js` 的 `index` 分区新增 8 条（`spellLabel` / `taskBarTitle` / `taskBarDesc` / `usersCount` / `usersEmpty` / `usersLoading` / `usersFallbackName` / `createTaskForFriend`，zh/en 各 8 条，语言包总量 191 → 199），并顺带把首页任务提示条里原先硬编码的两句中文接入 i18n。
  - 修复：`cloudfunctions/acceptTask/index.js`、`cloudfunctions/voiceCheckin/index.js` 的 require 曾被误改为相对路径 `'../getPointUsers/node_modules/wx-server-sdk'`（本地无该目录、云端更不存在，会导致这两个函数运行失败），已还原为 `require('wx-server-sdk')`。
  - 涉及模块：`cloudfunctions/getPointUsers`（新建）、`pages/index`、`utils/i18n.js`、`cloudfunctions/acceptTask`、`cloudfunctions/voiceCheckin`、`docs/下一步功能规划与操作说明.md`。
  - 注意：`getPointUsers` 为新函数，需在开发者工具中「创建并部署：云端安装依赖」；`acceptTask` / `voiceCheckin` 若之前用被改坏的版本部署过，需重新部署一次。
- 文档补充**验收与部署清单**（`docs/下一步功能规划与操作说明.md`）：
  - 第 6 节重构为 6.1 功能验收用例（T-01~T-09 / U-01~U-05 逐条可打勾）、6.2 双账号测试环境（多账号调试 / 体验版 / 体验成员三种方案对比）、6.3~6.5 功能完整性 / 代码质量 / 文档自检；3.1.6、3.2.4 处加了指向 6.1 的交叉引用；
  - 3.9.2 索引表新增 IDX-10（`records` 的 `pointId + matched + createTime`，F-02 聚合与"取最近 5 人"用）、IDX-11~IDX-13（`friends` 好友列表 / 好友关系唯一索引、`users.inviteCode` 唯一索引），并补了唯一索引建不上的处理说明；
  - 3.9.3 权限表补 `friends` 集合（同学提交的好友 PK 功能引入，之前遗漏）；
  - 3.9.4 云函数部署改为**完整部署清单**（10 个函数逐项标注「必传 / 可跳过」及原因），补充「右键显示『创建并部署』需先同步云函数列表」的排错说明；
  - 第 8 节「马上可以做的 5 件事」同步更新为 IDX-10 + IDX-07~09、5 个集合权限。

## 后续计划

> 待补充：以下为基于当前进度的建议项，请按团队实际安排更新。

- [x] 首页打卡功能开发（地图 / 定位 / 录音声控打卡）
- [x] 登录体系与前端联调（微信 / 手机号验证码 / 游客）
- [x] 用户数据存储与查询（`users` / `records` / `sms_codes` 集合）
- [x] 「我的打卡记录」页面（列表 + 详情弹窗）
- [x] 设置功能（深色模式 / 字体大小 / 清除缓存）
- [x] 打卡任务系统（发布任务 / 凭任务码接受 / 任务打卡，`tasks` 集合）
- [x] 点位打卡用户展示（在地图上查看每个点位打卡成功的用户信息，`getPointUsers`）
- [ ] 积分排行榜与用户积分（增强游戏性）
- [ ] 连续打卡与成就徽章
- [ ] 用户自建打卡点位
- [ ] 接入真实短信验证码通道（腾讯云 SMS，需企业实名 + 签名审核）
- [ ] 打卡记录分页加载（下拉加载更多）
- [ ] 定时触发器：自动将超时任务置为 `expired`
- [ ] 云函数敏感配置外置（讯飞 APPID / APIKey / APISecret 改为环境变量并轮换）
- [ ] 界面样式统一与视觉优化

## 日志规范

- 每次提交代码时，在本文档对应日期下追加一条记录，注明提交说明、涉及模块与关键改动。
- 日期按实际开发日期填写；跨天开发请分条记录。
- 无法确定具体日期的改动，可先记录到"待归档"段落，补上日期后移入对应条目。
