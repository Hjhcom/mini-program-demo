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
│   │   │   ├── tabbar/            # tabBar 图标（首页/我的 × 灰色/选中蓝）
│   │   │   └── marker/            # 地图图钉（官方蓝 / 玩家自建橙，F-05）
│   │   ├── pages/
│   │   │   ├── splash/            # 启动页（app.json 里的首个页面）
│   │   │   ├── login/             # 登录方式选择页（微信/手机号/游客）
│   │   │   ├── index/             # 首页（地图打卡 + 定位/导航 + 反馈动效 + 点位玩家展示）
│   │   │   ├── mine/              # 我的页
│   │   │   ├── task/              # 打卡任务页（我发布的 / 我接的 + 分享任务 / 接受邀请）
│   │   │   ├── task-create/       # 发布打卡任务页
│   │   │   ├── ranking/           # 积分排行榜页（玩家榜 / 点位榜）
│   │   │   ├── badges/            # 成就徽章页（连续打卡 + 8 枚徽章）
│   │   │   ├── point-create/      # 创建打卡点页（自建点位：名称/咒语/位置/半径）
│   │   │   ├── point-list/        # 打卡点列表页（按距离分组：附近 500 米内 / 其他）
│   │   │   ├── pk/                # 好友打卡 PK 页
│   │   │   ├── records/           # 打卡记录页
│   │   │   ├── agreement/         # 用户协议 / 隐私政策页
│   │   │   └── settings/          # 设置页（深色模式/字体大小/清除缓存）
│   │   ├── utils/
│   │   │   ├── i18n.js            # 中英文语言包（各页面文案统一走这里，14 个分区）
│   │   │   ├── spell.js           # 咒语归一化与有效长度（F-05）
│   │   │   └── geo.js             # 距离计算/格式化/分组（F-09，首页与点位列表共用）
│   │   └── cloudfunctions/
│   │       ├── login/             # 登录云函数（微信/手机号/资料更新；user 出参走 pickUser() 白名单）
│   │       ├── sendCode/          # 短信验证码云函数
│   │       ├── getRecords/        # 打卡记录查询（分页 + successTotal/hasMore + 白名单出参）
│   │       ├── getPoints/         # 打卡点列表（白名单出参 + isMine/isOfficial + 过滤 hidden）
│   │       ├── getPointUsers/     # 点位打卡玩家展示（人数 + 最近打卡玩家）
│   │       ├── getRanking/        # 积分排行榜（玩家榜 + 点位热度榜，含 lib/points.js）
│   │       ├── getBadges/         # 连续打卡 + 成就徽章（含 lib/badges.js，判定 8 枚徽章）
│   │       ├── createPoint/       # 用户自建打卡点（含 lib/validate.js 校验规则）
│   │       ├── reportPoint/       # 自建点位举报 + 达阈值自动隐藏（内容安全）
│   │       ├── createTask/        # 创建打卡任务（生成 6 位任务码）
│   │       ├── acceptTask/        # 凭任务码接受任务
│   │       ├── listTasks/         # 查询我发布 / 我接受的任务
│   │       ├── friends/           # 好友 PK（出参不下发 openid，PK 用好友记录 _id 作句柄）
│   │       └── voiceCheckin/      # 声控打卡（判定在 lib/match.js；支持任务打卡 taskId，写入 dayKey）
│   ├── project.config.json
│   └── project.private.config.json
├── docs/                          # 开发文档
│   └── 下一步功能规划与操作说明.md
├── tools/                         # 本地开发脚本（不进小程序包）
│   ├── test-points.js             # F-03 积分规则单元测试（node tools/test-points.js）
│   ├── test-badges.js             # F-04 连续打卡与徽章单元测试（node tools/test-badges.js）
│   ├── test-point-create.js       # F-05 自建点位校验单元测试（node tools/test-point-create.js）
│   ├── test-voice-match.js        # 声控判定单元测试：空结果/单字/阈值边界/互为包含（node tools/test-voice-match.js）
│   ├── test-geo.js                # 距离计算与分组单元测试：48 条（node tools/test-geo.js）
│   ├── check-i18n.js              # i18n 自检：zh/en 键名、分区条数、空文案、wxml 引用的键是否存在（node tools/check-i18n.js）
│   └── check-sync.js              # 跨目录重复规则自检：normalizeSpell 三处 / 咒语长度上下限 / CHECKIN_POINTS / 判定只在 lib/match.js（node tools/check-sync.js）
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
- 新增**积分与排行榜**（F-03 / P1，文档 3.3）：
  - 新增云函数 `getRanking`：`type=user`（默认）返回玩家积分榜 + 「我的排名」，`type=point` 返回点位热度榜（总打卡次数 + 独立用户数）。
    - **积分按文档 3.3.1 四条规则实时计算、不落库**：`成功打卡 × 10 + 完成他人任务 × 20 + 发布被完成 × 5 + 连续打卡奖励`；同分依次比成功次数、打卡点位数。
    - **连续打卡奖励**：按「用户 + 自然日」去重（`$dateToString` + `timezone: 'Asia/Shanghai'`）拿到 dayKey，再在 JS 里按天扫描算 streak（`+5 × min(n, 5)`，n≥2 起算、断档重置）。该聚合包在 `try/catch` 中，失败时奖励按 0 计并打日志，不影响榜单其余部分。
    - **聚合不用 `addToSet`**：打卡按 (openid, pointId) 两阶段聚合，点位榜按 (pointId, openid) → pointId 两阶段聚合，只回传计数值，避免把大量 openid 装进数组顶到聚合内存上限。
    - **隐私**：openid 仅用于服务端去重 / 排序 / 映射昵称，**返回值里不含 openid**；头像 `cloud://` fileID 用 `getTempFileURL` 换 https 临时链接（每批 50 个），失败退回昵称首字占位。
    - 纯计算部分抽到 `cloudfunctions/getRanking/lib/points.js`（不依赖 `wx-server-sdk`），配套本地单测 `tools/test-points.js`（**25 条用例，全部通过**，覆盖连续打卡的天数边界：首日不计、断档重置、封顶、跨月跨年、闰年）。
  - 新增页面 `pages/ranking/ranking`（已注册 `app.json`）：玩家榜 / 点位榜两个 Tab，顶部「我的排名」卡，前三名金银铜徽标，点击弹出**积分明细**（四项各「几次 × 多少分」+ 合计），底部「积分规则」说明；支持下拉刷新、深色模式、字体大小、中英文切换（`i18n.ranking` 31 条 × zh/en）。
  - 入口：「我的」页功能列表新增「积分排行榜」；首页底部面板新增「🏆 排行榜」按钮；**未登录也能看**（无云端数据时只少「我的排名」卡）。
  - 涉及模块：`cloudfunctions/getRanking`（新建）、`pages/ranking`（新建）、`pages/index`、`pages/mine`、`utils/i18n.js`、`app.json`、`tools/test-points.js`（新建）、`docs/下一步功能规划与操作说明.md`。
  - 注意：`getRanking` 为新函数需「创建并部署：云端安装依赖」（带 `lib/points.js` 子目录，共 4 个文件）；本功能**不需要新建集合与索引也能跑**（数据量小），索引可在控制台按需补 IDX-14/IDX-15。

### 2026-10-15
- 新增**连续打卡与成就徽章**（F-04 / P1，文档 3.4）：
  - 新增云函数 `getBadges`：实时算出「当前连续 / 历史最长连续」打卡天数，判定 8 枚成就徽章（初次打卡 / 百灵鸟 / 马拉松选手 / 探险家 / 一鸣惊人 / 夜猫子 / 任务达人 / 任务发布者），把**新解锁**的补发到 `user_badges` 集合，并回传全部徽章状态与各项进度统计。
    - **徽章改为「按需懒判定」，没有放在 `voiceCheckin` 里做**（与文档 3.4 的建议不同）：徽章判定要读「该用户全部打卡记录 + 任务统计」，塞进打卡主链路会明显拖慢响应、且任一步失败都可能拖挂打卡。现在改成打卡成功后前端**异步**调一次（有新徽章就弹窗提示），打开徽章页时再调一次（补发「几天没打开 App」期间应得的徽章）。代价是徽章延迟几分钟显示，收益是打卡主链路零风险。
    - **徽章一律按「历史最长连续 `maxStreak`」判定，不用「当前连续 `curStreak`」**：懒判定下用户可能过几天才打开徽章页，那时当前连续已断成 0，按它判定的话「马拉松选手」永远发不出去。`curStreak` 只用于页面展示，且仅在「最后一天是今天或昨天」时才不为 0。
    - 统计方式**没有用聚合**，而是「拉该用户最近 1000 条成功记录 + 纯函数计算」：单用户数据量小，换来的是计算逻辑能整体抽到 `lib/badges.js`（不依赖 `wx-server-sdk`）从而**可本地单测**。
    - **时区**：云函数容器是 UTC，所有「哪一天」的判断统一走 `toDayKey()`（固定按 UTC+8）；`hourOf()` 同样按 +8 取小时用于「夜猫子」判定。
    - **新旧数据兼容**：`dayKeyOf()` 优先用记录里的 `dayKey`，老数据没有该字段就从 `createTime` 现算。
    - **`user_badges` 集合未创建时降级**（读写都包了容错）：页面照常显示实时判定结果，只是拿不到获得时间、也不弹「新解锁」，并在页面上提示去建集合；返回值 `persist: false` 表达该状态。
    - 纯计算部分抽到 `cloudfunctions/getBadges/lib/badges.js`，配套本地单测 `tools/test-badges.js`（**81 条用例，全部通过**：UTC+8 跨日边界、当前连续 vs 历史最长、跨月跨年闰年、8 枚徽章的阈值边界、以及「最长连续已断仍应发徽章」的回归用例）。
  - 改造 `cloudfunctions/voiceCheckin/index.js`：写入 `records` 时新增 `dayKey` 字段（UTC+8 的 `YYYY-MM-DD`），供连续打卡统计使用，也是将来启用 IDX-03 唯一索引的前提。⚠️ 各云函数目录独立打包、不能互相 require，故换算逻辑就地实现。
  - 新增页面 `pages/badges/badges`（已注册 `app.json`）：顶部连续打卡卡（当前连续 / 最长连续 / 今日是否已打卡），下方 8 枚徽章网格（已解锁高亮 + 获得日期，未解锁灰显并**显示进度**如「2/3 天」），点徽章弹详情（名称 / 条件 / 状态 / 进度）；支持下拉刷新、深色模式、字体大小、中英文切换（`i18n.badges` 43 条 × zh/en，语言包总量 232 → **276**）。
  - 入口与联动：「我的」页新增「成就徽章」入口；首页打卡成功后异步查询新解锁徽章，有则弹窗告知（失败静默，不影响打卡结果）。
  - 涉及模块：`cloudfunctions/getBadges`（新建）、`pages/badges`（新建）、`tools/test-badges.js`（新建）、`cloudfunctions/voiceCheckin`、`pages/index`、`pages/mine`、`utils/i18n.js`、`app.json`、`docs/下一步功能规划与操作说明.md`。
  - 注意：`getBadges` 为新函数需「创建并部署：云端安装依赖」（带 `lib/badges.js` 子目录）；`voiceCheckin` 改动过需**重新部署**；需在控制台**新建 `user_badges` 集合**（权限「仅管理端可读写」）并建 **IDX-16**（`openid + badgeId` 唯一索引）。
- 文档同步（`docs/下一步功能规划与操作说明.md`）：3.0 云函数总览表补 `getBadges` 与 `voiceCheckin` 二次改造并更新状态列；**3.4.1 新增「已落地与设计差异」**（写明上述 4 处调整及理由）+ **3.4.2 新增验收用例 B-01~B-06**；3.9.1 把 `user_badges` 从「可选」改为必需、3.9.2 新增 **IDX-16**（并补唯一索引建不上的处理）、3.9.3 权限表补 `user_badges`、3.9.4 部署清单补 `getBadges` 与 `voiceCheckin`（含「带 `lib/` 的函数上传回执文件数会 +1，属正常」的说明）；6.1 新增 F-04 打勾清单并把本地自测提示扩到两份脚本；3.10 的 `dayKey` 项标记为已完成；第 8 节「马上可以做的 5 件事」按当前进度重写；文末文件索引补 `pages/badges`、`getBadges`、`tools/test-badges.js`；项目结构树补 `pages/splash`（此前遗漏）、`pages/badges`、`getBadges`。

### 2026-10-16
- 提交并推送 F-04（`c6c7f8e`，17 个文件 / +1394 −20），远程 `main` 与本地一致。
- 新增**用户自建打卡点**（F-05 / P1，文档 3.5）：
  - 新增云函数 `createPoint`：校验名称（1~20 字）、咒语（有效长度 2~8）、半径（20~200 米）、经纬度范围，并限「每人最多 10 个点位」与同用户同名查重，通过后写入 `points`（`creatorOpenid` + `creatorNickname` + `hidden:false`）。
    - **咒语长度按「归一化后的有效长度」算，不按原始字符数**：规则与 `voiceCheckin` 的 `normalize()` 一致（全角转半角 + 去掉空白与常见标点），否则种子数据里的 `明德精工，创新包容`（9 个字符、有效 8）会被自己的规则判成超限。另补一条：归一化后必须至少含一个汉字/字母/数字，挡住 `@#`、`！！` 这类纯符号咒语。
    - 校验规则整体抽到 `cloudfunctions/createPoint/lib/validate.js`（纯函数，不依赖 `wx-server-sdk`），配套本地单测 `tools/test-point-create.js`（**84 条用例，全部通过**：长度/半径/坐标边界、全角标点归一化、`(0,0)` 无效坐标、人均上限）。
  - 新增云函数 `reportPoint`（**内容安全**）：举报写入独立集合 `reports`，按「**不同举报人**去重」计数，达到阈值 3 就把 `points.hidden` 置 `true`（同一个人反复举报只算 1 票，这是防刷的关键）。用独立集合而非文档内嵌数组，是为了能对 `pointId + reporterOpenid` 建唯一索引（并发下不重复计票）。
  - **改造 `getPoints`**：出参改**白名单**，剥掉 `creatorOpenid`（团队隐私约定），改为回传两个布尔值 `isMine` / `isOfficial` 让前端区分图钉颜色与举报入口；同时过滤 `hidden` 点位，并显式 `limit(200)`。
  - 新增页面 `pages/point-create`：名称 / 咒语（带实时字数与「有效字数」提示）/ 半径四档 / 位置选取。位置做了**双路径**——主路径 `wx.chooseLocation()`（地图拖图钉、能看到地点名），失败自动回退「用当前位置」（只依赖 `wx.getLocation`），因此**即使 `chooseLocation` 接口权限没批下来功能依然可用**。
  - 地图与首页联动：新增两张 64×64 图钉图标（官方深蓝 / 玩家自建橙色，脚本生成的纯色水滴形）；marker 配 `iconPath` 与 `callout`（点图钉弹点位名）；面板显示点位来源标签、「我的点位」与创建者昵称；**举报入口只对「别人建的玩家点位」显示**；点位变化后按 `_id` 重新对齐当前选中项，避免面板继续显示图上已消失的点位。
  - 形成闭环：创建成功弹窗可直接「给好友设个任务」，跳 `task-create` 并**预选刚建好的点位**（`?pointId=`）；新建点位回首页时按 `app.globalData.pointsDirty` 标记自动刷新地图。
  - 顺带清理：首页原先三处各抄一遍的「未登录 → toast + 延时跳登录」抽成 `requireLogin()`（F-05 是第 4 个调用点）。
  - i18n：新增 `pointCreate` 分区 36 条 × zh/en、`index` 14 条、`mine.pointCreate` 1 条，语言包总量 276 → **327**（脚本核对全部分区 zh/en 键名一致）。
  - 涉及模块：`cloudfunctions/createPoint`（新建）、`cloudfunctions/reportPoint`（新建）、`cloudfunctions/getPoints`（改造）、`pages/point-create`（新建）、`utils/spell.js`（新建）、`images/marker/*`（新建）、`tools/test-point-create.js`（新建）、`pages/index`、`pages/task-create`、`pages/mine`、`utils/i18n.js`、`app.js`、`app.json`。
  - 注意：`createPoint` / `reportPoint` 为新函数需「创建并部署」，`getPoints` 改动过需**重新部署**（三者是一套，少传一个自建点位就会显示成官方样式）；需在控制台**新建 `reports` 集合**（权限「所有用户不可读写」）并建 **IDX-17**（`pointId + reporterOpenid` 唯一）、**IDX-18**（`points.creatorOpenid`）；`app.json` 的 `requiredPrivateInfos` 需补 `"chooseLocation"`（已补）。
- 文档同步（`docs/下一步功能规划与操作说明.md`）：3.0 云函数表补 `createPoint` / `reportPoint` / `getPoints` 改造并更新 F-04 状态；**3.5.1 新增「已落地与设计差异」**（写明上述 5 处取舍及理由）+ **3.5.2 新增验收用例 C-01~C-07**；3.9.1 新增 `reports` 集合并说明 `points` 不用改结构、3.9.2 新增 **IDX-17/IDX-18**（含字段顺序与前缀命中的说明）、3.9.3 权限表补 `reports`、3.9.4 部署清单补三项（共 13 个函数）；3.11 常见报错速查补 5 条（`requiredPrivateInfos` 报错、`chooseLocation` 权限、自建点位显示成官方、举报未就绪、点位被隐藏）；5 排期与展示脚本按 F-05 更新；6.1 新增 F-05 打勾清单；第 8 节重写；文末文件索引补齐。

- **隐私整改：好友模块不再下发 `openid`**（对应文档 **3.12**）
  - 起因：同学的 `friends` 云函数有三处把 `openid` 明文回传前端（`action=list` 的每个好友对象、`action=pk` 的 `me`/`friend`、`action=add` 的 `friend.openid`），与团队「云函数对外只给白名单字段」的约定不一致；且 `pages/pk` 为 PK 又把 `f.openid` 传回云函数，形成「前端传 openid」的调用形态。当前没有可直接利用的漏洞（所有云函数的身份都取自 `cloud.getWXContext()`，从不信前端传的身份），但这种形态本身必须掐掉 —— 一旦某处图省事写成 `event.openid || OPENID`，就是任意账号越权的入口。
  - 改法：不新增字段、不改集合结构，把对外标识换成 **`friends` 集合里关系文档的主键 `_id`（下称 `recordId`）**。客户端无权读 `friends` 集合，拿到 `recordId` 关联不到任何用户信息；`action=pk` 用 `where({ _id: friendRecordId, userOpenid: OPENID })` **一次查询同时完成「取好友」+「校验归属」**，只能 PK 自己的好友。`action=list` 出参每项加 `recordId`，`action=add` 出参加 `recordId`（`add()` 返回值就带 `_id`）。
  - ⚠️ `action=pk` 取单条用 `where({_id})` 取 `data[0]`，**没有**用 `doc(id).get()` —— 后者记录不存在时会抛异常，走不到「你们还不是好友」的兜底分支。
  - **顺带整改 `login`**：原先把 `users` 的整份文档（含 `openid`、`phone`）当 `user` 回传，前端还会整份写进 `wx.setStorageSync`。现新增 `pickUser()` 白名单，只回 `nickname` / `avatarUrl` / `inviteCode`（7 处 return 全部包一层）。已逐处核对前端真正读取的字段（`pages/{index,login,mine,pk}`、`app.js`）确实只有这三个 + 前端自己标注的 `source`。
  - 涉及模块：`cloudfunctions/friends/index.js`、`cloudfunctions/login/index.js`、`pages/pk/pk.js`、`pages/pk/pk.wxml`（`wx:key` 改用 `recordId`）、`docs/下一步功能规划与操作说明.md`。
  - ⚠️ **接口契约变更**：`action=pk` 的入参名由 `friendOpenid` 改为 `friendRecordId`，`friends` 云函数与前端必须**同时更新**，否则 PK 会提示「缺少好友信息」。需重传 `friends` + `login`（文档 3.9.4 已标为必传）。
  - 新增验收用例 **P-01~P-03**（文档 3.12.5），其中 P-03 是整改的核心收益验证：把 `recordId` 换成随机串后 PK 只回「你们还不是好友」，**换个 id 探测不到任何人**。
  - 注：改的是同学的模块（`friends` 云函数与 `pages/pk` 来自 `ca2adc0`），改动处均已就地写注释说明原因，后续与同学合并时注意这两处。

- **F-06 打卡记录分页加载**（P2，对应文档 **3.6**，顺手修了缺陷 P6）
  - 背景：`getRecords` 云函数本来就支持分页（`event.page`、每页 20、返回 `total`），但 `pages/records` 从不传 `page` → **永远只显示第一页**，记录一多用户就看不到历史。
  - **改造 `getRecords`**：新增 `successTotal`（成功次数，服务端 `count()` 全量统计）与 `hasMore`（`page * PAGE_SIZE < total`，由服务端算，前端不再用已累加的数组长度自己推）；出参改 `pickRecord()` 白名单，**剥掉 `openid`**（原先直接回传 records 原始文档，含 `openid`，与团队白名单约定不符），顺带把 `matched` 归一成布尔；补 `OPENID` 空值兜底、`page` 做 `Math.max(1, …)`。
  - **改造 `pages/records`**：`loadRecords(reset, silent)` 并**返回 promise**（便于 `stopPullDownRefresh` 收尾）；新增 `onReachBottom` 触底加载下一页；**额外加了 `onPullDownRefresh` 下拉刷新**（分页列表光有"加载更多"没有"回到顶部重载"，用户看到一半只能退出重进）；`onLoad` 里就取 `lang`（首屏 loading 与错误提示要用，只在 `onShow` 取会闪中文）。
  - **顺带修缺陷 P6 的核心 bug**：`successCount` 原先是用**当前页**数据统计的（`records.filter(r => r.matched).length`），分页后会变成"已加载页的成功数"、随翻页一路变大。现在统计栏的「总记录 / 打卡成功」两个数字都来自服务端（`total` + `successTotal`），**翻页恒定**。这条值得单独写进报告的"缺陷修复记录"。
  - UI：`records.wxml` 列表底部加 `.list-footer` 三态（加载中转圈 / 上拉加载更多 / 没有更多了）；`records.wxss` 加 `.spinner`（CSS 圆环 `@keyframes` 旋转）与 `.page.dark` 深色规则（页面私有类，全局 `app.wxss` 里没有）；`records.json` 开 `enablePullDownRefresh` 并设 `onReachBottomDistance: 100`。
  - i18n：`records` 分区新增 `loading`（原先是硬编码中文 `'加载中…'`，英文模式会露中文）/ `loadingMore` / `pullUpMore` / `noMore` / `loadMoreFail` 五条 × zh/en，语言包 **327 → 332 条**。
  - 新增 `tools/check-i18n.js`：语言包自检脚本（zh/en 键集合是否一致、每个分区条数、有无空文案），`node tools/check-i18n.js` 一把跑完。**332 条/语言，13 个分区全部 zh/en 对齐**。
  - 不需要新建索引：分页查询 `where({openid}).orderBy('createTime','desc')` 走的正是既有的 **IDX-02**（`records: openid + createTime 降序`）。
  - 涉及模块：`cloudfunctions/getRecords/index.js`、`pages/records/{records.js,records.wxml,records.wxss,records.json}`、`utils/i18n.js`、`tools/check-i18n.js`（新建）、`docs/下一步功能规划与操作说明.md`。
  - ⚠️ `getRecords` 改动过需**重新部署**（文档 3.9.4 已从"不用传"改为必传）；不重传的话前端拿不到 `successTotal`/`hasMore`，记录页「打卡成功」恒为 0、底部一直显示「上拉加载更多」。
  - 文档同步：**1.3 表 P6 标为已修**；3.0 表加 `getRecords` 改造行；**3.6 重写**（保留原始设计 + 新增 3.6.2 已落地与 5 处设计差异、文件清单、索引说明、分页 `skip` 的局限 + 3.6.3 验收用例 **L-01~L-04**）；3.9.4 部署清单 `getRecords` 改必传；6.1 加 L-01~L-04；第 8 节重写（云函数重传清单 + 单账号可跑的验收范围）；5 排期进度与第 2 节 P2 表的 F-06 状态更新；文末文件索引补 `tools/check-i18n.js` 并把语言包条数改为 332。

### 2026-10-17
- **打卡结果反馈动效**（F-07 / P2，文档 3.7）：
  - **成功**：整屏撒花（14 片、每片 `left`/延迟/时长/颜色/尺寸随机，`@keyframes confetti-fall`）+ 居中结果卡（绿色 ✓ 徽章 `result-pop` 放大弹入 + 标题 + 大字 `+10 分` + 「你说的是「…」，相似度 xx%」），2.2s 后自动收起。
  - **失败**：录音按钮 `.shake` 抖动 0.5s + 屏幕上沿滑入的红色提示条 + 震动。
  - 三个关键取舍（都写进了代码注释与文档 3.7.2）：① **用纯 CSS keyframes 而不是 `wx.createAnimation`** —— 一次庆祝要驱动「14 片各自不同的 left/延迟/时长/颜色」+ 卡片弹入，用 `createAnimation` 得维护 15 套实例逐帧 export；② **失败提示条放上方**（文档原本写"底部"，但底部正是「说咒语」按钮，失败后用户马上要重录，压住按钮等于挡住最要紧的操作）；③ **两个浮层都 `pointer-events:none`** —— 只负责显示、不接管交互，所以敢铺满整屏且不加关闭按钮。
  - ⚠️ **浮层是普通 `view` 盖在 `map` 上**：`map` 历史上是原生组件、层级最高（须用 `cover-view`），但基础库 2.7.0(iOS)/2.8.0(Android) 起已支持**同层渲染**，当前客户端都能盖住；若遇极老客户端被遮挡，改 `cover-view` 或把动画限制在面板区域（已记进文档，便于答辩时回答原生组件层级问题）。
  - **「失败」的定义放宽到三种**：念错 / 任务校验失败（`code !== 0`）/ 请求异常（`catch`）—— 原先只有念错改了 tip，从用户视角三种都是"这次没成"，给同一种强反馈。
  - 震动 `wx.vibrateShort({type})` 包 `try/catch` + 空 `fail`（低版本与部分 iOS 机型不支持，震动只是锦上添花，不能因为它报错打断打卡）。
  - 顺带修掉一处**硬编码中文**：`if (r.code !== 0)` 分支里的 `'打卡失败，请重试'` 改为语言包 `failTitleGeneric`（与 F-06 修的 `'加载中…'` 同类问题）。
  - i18n：`index` 分区新增 7 条 × zh/en（`celebrateTitle` / `celebratePoints` / `celebrateSub` / `failTitle` / `failSub` / `failNoHear` / `failTitleGeneric`），语言包 **332 → 339 条**；「+10」的**数字**放代码常量 `CHECKIN_POINTS`、**单位**放语言包（`+{n} 分` / `+{n} pts`）。
  - **音效未做**：`wx.createInnerAudioContext` 需要音频文件，仓库没有合适素材。文档原写「动效与音效」，本轮只做动效，代码位置留在 `showCelebrate()`。
  - **本轮不动任何云函数**（全在前端），所以**没有部署动作**，重新编译小程序即可。
  - 新增 `tools/check-sync.js`：**跨目录重复规则一致性自检**。项目里有几处「同一套规则必须写两遍」的地方（云函数独立打包、前端 require 不到云函数目录），脚本一次全对：① `normalizeSpell` **三处**（`utils/spell.js` / `createPoint/lib/validate.js` / `voiceCheckin`）结果一致；② `SPELL_MIN`/`SPELL_MAX`/`hasMeaningfulChar` 两端一致；③ `CHECKIN_POINTS`（首页庆祝卡片）== `POINTS.checkin`（`getRanking/lib/points.js`）。
    - 检查中曾发现一处差异：`voiceCheckin` 的 `normalize` 写的是 `String(s)`，缺 `s == null ? '' : s` 兜底。当时判为「入参恒为字符串、真实路径触发不到，不改」——**当晚抽 `lib/match.js` 时一并补上了**（见下面的 P9 修复），脚本随之删掉"已知差异"断言，改为三处全样本（含 `null`/`undefined`/数字/布尔）完全一致，并新增第 4 节「判定规则只有一处实现」的防回退断言。
  - 涉及模块：`pages/index/index.js`、`pages/index/index.wxml`、`pages/index/index.wxss`、`utils/i18n.js`、`tools/check-sync.js`（新建）、`docs/下一步功能规划与操作说明.md`。
  - 文档同步：**3.7 重写**（3.7.1 原始设计 / 3.7.2 已落地与 7 处设计差异 + 文件清单 + `check-sync.js` 说明 / 3.7.3 验收用例 **M-01~M-04**）；第 2 节 P2 表 F-07 标已落地；5 排期进度与展示脚本（新增"现场撒花 + 故意念错演示失败动效"两步）；6.1 加 M-01~M-04；6.4 加"提交前跑 check-i18n + check-sync"；第 8 节重写（标题改 10-17、注明 F-07 不需部署）；文件索引补 `tools/check-sync.js`、语言包条数改 339。
  - 本地校验：`pages/index/index.js`、`utils/i18n.js` `node --check` 通过；`check-i18n` 339/339、13 个分区全对齐；`check-sync` 全绿；三份单测回归 **25 + 81 + 84 = 190 条全绿**。
  - **本轮未提交**（含 10-16 晚的 F-06 与隐私整改改动，一并等你在自己机器上 commit & push）。

- **修复 P9：啥也没说也被判「打卡成功」（真机实测发现，P0 级判定缺陷）**
  - 现象：在打卡点范围内按「说咒语」、**什么都不说**（或只有环境噪音），几秒后停止 → 界面直接显示「打卡成功」。
  - 根因：`voiceCheckin` 的通过判定是 `sim >= 0.8 || got.includes(target) || target.includes(got)`。**识别结果为空串时 `target.includes('')` 恒为 `true`**（JS 里任何字符串都「包含」空串），于是「互为包含」这条路把空结果放过去了。顺带暴露第二个洞：**只说咒语里的一个字也算过**（`'明德精工'.includes('明')`）——「互为包含」本意是照顾「说了句话里含咒语」和「长咒语只念一段」，但没给较短一方设下限。
  - 连带影响（比"显示错了"更严重）：这条 `matched: true` 的假记录**真的写进了 `records`**，而 F-03 积分与 F-04 连续打卡/徽章都是**实时从这个集合算**的 → 白送 10 分、白算一天连续打卡、可能白发一枚徽章。
  - 改法：
    1. **判定核心抽到同目录 `cloudfunctions/voiceCheckin/lib/match.js`**（`normalize` / `similarity` / `matchSpell` / `REASON`，不 require 任何依赖）。原来这三样都内联在 `index.js` 里，而它 require 了 `wx-server-sdk` → **本地跑不起来、根本没法单测**，这类"规则写错"只能靠真机撞。同 F-03/F-04/F-05 的 `lib/*.js` 范式。
    2. 识别结果归一化后为空 → `reason = noSpeech`：**不判成功、也不写记录**，返回 `{ code: 0, matched: false, noSpeech: true }`，前端据此显示「没听清」（与「咒语没对上」分开 —— 该做的动作不一样：靠近麦克风 vs 看清咒语）。
    3. 咒语归一化后为空（老数据可能绕过 F-05 校验存进「纯标点咒语」）→ `reason = invalidSpell` 直接报错。**这条不是多余的**：两侧都为空时 `similarity` 的 `a === b` 分支会返回 **1**，不拦会误判成功。
    4. 「互为包含」加下限：**较短一方 ≥ 2 个有效字**（`MIN_CONTAIN_LEN`），一条同时堵掉空串与单字。
    5. 录音只有 44 字节（裸 wav 头、无采样点）时**跳过讯飞**，直接按「没听清」处理 —— 省一次 WebSocket 往返。
  - `normalize` 同时补上 `s == null ? '' : s` 兜底 → 现在与 `utils/spell.js`、`createPoint/lib/validate.js` **三处逐字一致**（旧版 `String(null)` 会得到字符串 `"null"`）。
  - ⚠️ 抽 `lib/match.js` 时把标点过滤表里的 **ASCII 直引号**（U+0022/U+0027）凭视觉抄成了中文弯引号（两者行为不同），被 `check-sync` 扩充后的样本逮住并修正；已在 `lib/match.js` 注释里写明"别凭视觉抄、以码点为准"。
  - 新增 `tools/test-voice-match.js`（**45 条，全部通过**：空/空白/纯标点/null 的回归、只说一个字、相似度 0.8 边界、互为包含两个方向、脏数据咒语、`normalize` 与前端一致）；`check-sync` 样本从 16 扩到 24 条并新增第 4 节防回退断言（谁把判定内联回 index.js 就会红）。
  - 涉及模块：`cloudfunctions/voiceCheckin/lib/match.js`（新建）、`cloudfunctions/voiceCheckin/index.js`、`pages/index/index.js`、`utils/i18n.js`（339 → **341**）、`tools/test-voice-match.js`（新建）、`tools/check-sync.js`、`docs/下一步功能规划与操作说明.md`。
  - 注意：`voiceCheckin` 改的是**云函数**，必须重新部署（带 `lib/` 子目录，上传回执文件数比上次多属正常）；**修复前真机留下的假记录要清掉** —— 控制台 `records` 里筛 `matched = true` 且 `similarity = 0` 删除（正常成功相似度不可能是 0），排行榜/连续打卡会自动恢复（都是实时算的）；若徽章页多解锁了，删 `user_badges` 对应记录即可。
  - 文档同步：1.3 表新增 **P9**；3.0 表加 `voiceCheckin` 第三次改造行；**新增 3.13 节**（3.13.1 现象与根因表 / 3.13.2 五处改法 / 3.13.3 改动清单 / 3.13.4 必须重新部署 / 3.13.5 脏数据清理 / 3.13.6 验收 **V-01~V-04**）；3.9.4 部署清单把 `voiceCheckin` 改成「✅ 必传（第三次）」；6.1 新增 V-01~V-04 与 `test-voice-match` 提示；第 8 节把 `voiceCheckin` 提到重传首位并加脏数据清理提醒；文件索引补 `lib/match.js`、`tools/test-voice-match.js`、语言包条数改 341。
  - 本地校验：`voiceCheckin/index.js`、`voiceCheckin/lib/match.js`、`pages/index/index.js`、`utils/i18n.js`、`tools/*.js` 全部 `node --check` 通过；`test-voice-match` **45 条全绿**；`check-i18n` **341/341**、13 个分区全对齐；`check-sync` 四节全绿（含三处 `normalize` 24 样本一致）；四份单测回归 **25 + 81 + 84 + 45 = 235 条全绿**。

#### 11:10 F-08 / F-09 / F-10 地图交互、点位列表、分享（P2 收尾）

一次做完 3.8 节的三项。**纯前端，不需要部署任何云函数**，重新编译即可。

- **F-08 地图交互**
  - `<map>` 加 `id="map"` 与 `show-location`（蓝点）；右上角浮层加「定位」按钮 → `wx.getLocation` + `setData(center, scale:16)` + `createMapContext('map').moveToLocation()`（后者只为刷蓝点，失败不影响定位，包了 try/catch）。
  - 选中点位后面板出现「导航」胶囊 → `wx.openLocation` 交给微信内置地图。⚠️ 用户点内置地图左上角返回也会走 `fail`（`errMsg` 含 `cancel`），已过滤不当错误。
  - `onMarkerTap` 的选中逻辑抽成 `selectPointAt(index)`，图钉点击与"列表回跳选中"共用。
- **F-09 点位列表页（`pages/point-list` 四件套）**
  - **`getDistance` 从 `pages/index/index.js` 抽到 `utils/geo.js`**（文档 3.8 明确要求）：`getDistance` / `NEAR_LIMIT`(500) / `formatDistance` / `hasCoords` / `attachDistance` / `groupByDistance`，并配 **`tools/test-geo.js` 48 条单测**。
  - 定位 → 算距离 → 分「附近 500 米内 / 其他点位」→ 点条目 `navigateBack` 回首页并选中（首页是 tabBar 页不能带 query，靠 `globalData.pendingPointId` 传一棒，`applyPendingPoint()` 消费后立即清空）。
  - **定位失败不阻塞列表**：照样列出全部点位，只是不显示距离、不做分组（`distance: null` 一律归「其他」，否则会全被当成"附近"）。
  - 卡片内也可直接导航（`catchtap` 与"回首页选中"区分开）；支持下拉刷新、深色、字号、中英文。
- **F-10 分享**
  - `pages/task`：卡片上加 `open-type="share"` 的「分享给好友」按钮 → `onShareAppMessage` 拿到 `from === 'button'` + `data-code`，分享**具体那条任务**（`path: '/pages/task/task?inviteCode=' + code`）；按钮加 `catchtap="noop"` 挡冒泡，否则会连带触发卡片的「复制任务码」。
  - **分享进来的任务码等登录态确定再处理**：`onLoad` 只存 `_pendingCode`，`onShow` 的 `consumePendingCode()` 才弹确认框；未登录只 toast 一次（`_inviteHinted` 防重复）且**保留任务码**，登录回来再走一遍；处理完立即清空，避免每次 onShow 重复弹。
  - `pages/ranking`：分享标题改成「我在声控打卡拿了 X 分（第 N 名）」；顺带把原先硬编码的中英文标题迁进语言包。
- **抽 geo.js 时单测逮到真 bug**：`formatDistance(null)` 返回「0 米」——`Number(null) === 0` 且 `isFinite(0)` 为真；同一个坑在 `hasCoords` 里也存在（会让「没定位」被当成赤道 `(0,0)`，给所有点位算出荒唐距离）。两处都加了显式 null/空串前置判断，并各留回归用例。
- **顺带补强 `tools/check-i18n.js`**：新增第 4 节「扫 wxml 里 `lang.<分区>.<键>` 的引用是否存在」—— wxml 写错键名不报错、只渲染空白，只有翻到那页切到那种语言才看得见；当前 14 个 wxml 全部通过。
- 涉及模块：`utils/geo.js`（新建）、`pages/point-list/`（新建四件套）、`pages/index/{index.js,index.wxml,index.wxss}`、`pages/task/{task.js,task.wxml,task.wxss}`、`pages/ranking/ranking.js`、`app.js`、`app.json`（14 页）、`utils/i18n.js`（341 → **372**，新增 `pointList` 分区 18 条）、`tools/test-geo.js`（新建）、`tools/check-i18n.js`、`docs/下一步功能规划与操作说明.md`。
- 文档同步：**3.8 重写为 3.8.1 原始设计 / 3.8.2 已落地与 6 处设计决定 / 3.8.3 验收 N-01~N-09**；第 2 节 P2 表 F-08~F-10 标已落地；§5 进度与展示脚本（新增"点导航""分享任务给评委""点位列表"三步）；3.9.4 部署清单加"本轮无云函数改动"；3.11 报错速查补 6 条（定位没反应/无蓝点/导航失败/距离全空/分享落错页/分享按钮冒泡）；6.1 加 N-01~N-09 与本地自测说明（**283 条**）；6.4 把"公共函数已抽到 utils"标为已做；第 8 节重写；文件索引补 `point-list`、`geo.js`、`test-geo.js`。
- 本地校验：7 个 JS `node --check` 通过、2 个 JSON 解析通过、14 个页面文件齐全；`test-geo` **48 条全绿**；`check-i18n` **372/372**、14 分区对齐、14 个 wxml 引用全在；`check-sync` 四节全绿；五份单测合计 **48 + 25 + 81 + 84 + 45 = 283 条全绿**；另用临时 mock 脚本（不进仓库）验证了分享路径、任务码流转、列表装饰与 pick 共 **25 条**。

#### 11:30 云函数部署状态核对（`getPoints` 重传确认）

用户口头报「`getPoints` 重新传了」，做了一次**基于本地缓存的取证核对**（不靠记忆、不打扰控制台）：

- 上传回执：开发者工具 `WeappLocalData/localstorage_efc7b5286d3888a463756fabc08d04b2.json` → 顶层 `notice.list`（**注意是 `notice.list`，不是 `notice` → `list`**）：
  - 11:29:55「上传云函数 **getPoints**」`icon=success`，`上传包大小：2.6 KB，文件数量：3`
  - 11:29:40「更新云函数 getPoints 的云调用权限」成功（说明选的是「上传并部署：云端安装依赖」，会连带下发权限配置）
- 本地目录对照：`getPoints/` 正好 3 个文件（`index.js` 4156 B + `package.json` 167 B + `config.json` 45 B = 4368 B）→ 原始 4.3 KB 压到 2.6 KB、文件数 3 对得上，**不是漏传或传错目录**；`grep` 确认本地是改造后版本（`isMine`/`isOfficial`/过滤 `hidden`，注释写明"不回传 creatorOpenid"）。
- 顺带把**整个环境的部署状态一次性核对清楚**：`localstorage_b9faed4cb7c60b89a0fb76913a569870.json` → `tcb.scfMapInEnv`（每个函数带 `modTime` = 最后上传时间），环境 `cloud1-d2gled32od1bdcb02` 共 **14 个函数，全部 `Active`**：

| 最后部署 | 云函数 |
|---|---|
| 10-17 11:29 | `getPoints`（F-05 白名单改造） |
| 10-17 00:47 | `voiceCheckin`（P9 判定修复 3.13） |
| 10-17 00:07 | `getRecords`（F-06 分页） |
| 10-16 23:56 | `login` / `friends`（隐私整改 3.12） |
| 10-16 23:19 / 23:18 | `reportPoint` / `createPoint`（F-05） |
| 10-16 18:07 | `getBadges`（F-04） |
| 10-14 23:29 / 23:04 | `getRanking` / `getPointUsers` |
| 10-14 22:24 | `createTask` / `acceptTask` / `listTasks`（F-01 加固） |
| 10-14 19:32 | `sendCode`（从未改动） |

⇒ **云端代码与仓库一致，没有任何待部署项**，验收可以不受"云函数没传"干扰地跑。

- 文档同步：`docs/下一步功能规划与操作说明.md` 的 3.0 总览表与 3.9.4 部署清单，把 7 处「🟡 待重新部署 / 待部署」全部改为「✅ 已部署 + 日期」，并注明**判定依据是 `tcb.scfMapInEnv` 的 `modTime`**（可复核，不是凭记忆填的）；3.9.4 的函数计数 13 → **14**；另修掉 3.7.2 里一条已过时的「已知差异」说明（`voiceCheckin` 的 `normalize` 缺 `null` 兜底 —— 3.13 抽 `lib/match.js` 时已补上，三处现在逐字一致，`check-sync` 也升级为 4 组检查 / 24 样本）。
- 仍未确认（需控制台看）：`reports` 集合是否已建、IDX-17/IDX-18 是否已建 —— 跑 C-05/C-06 举报用例前要先建。

## 后续计划

> 待补充：以下为基于当前进度的建议项，请按团队实际安排更新。

- [x] 首页打卡功能开发（地图 / 定位 / 录音声控打卡）
- [x] 登录体系与前端联调（微信 / 手机号验证码 / 游客）
- [x] 用户数据存储与查询（`users` / `records` / `sms_codes` 集合）
- [x] 「我的打卡记录」页面（列表 + 详情弹窗）
- [x] 设置功能（深色模式 / 字体大小 / 清除缓存）
- [x] 打卡任务系统（发布任务 / 凭任务码接受 / 任务打卡，`tasks` 集合）
- [x] 点位打卡用户展示（在地图上查看每个点位打卡成功的用户信息，`getPointUsers`）
- [x] 积分排行榜与用户积分（玩家积分榜 / 点位热度榜，`getRanking`，积分实时计算不落库）
- [x] 连续打卡与成就徽章（`getBadges` + `pages/badges`，8 枚徽章懒判定 + `voiceCheckin` 补 `dayKey`）
- [x] 用户自建打卡点位（`createPoint` + `pages/point-create` + 官方/玩家图钉区分 + `reportPoint` 举报与自动隐藏）
- [x] 隐私整改：好友模块与登录出参不下发 `openid`（`friends` 的 PK 改用好友记录 `_id` 作句柄，`login` 加 `pickUser()` 白名单）
- [ ] 接入真实短信验证码通道（腾讯云 SMS，需企业实名 + 签名审核）
- [x] 打卡记录分页加载（`getRecords` 加 `successTotal`/`hasMore` + 触底加载 + 下拉刷新 + 统计口径改服务端全量）
- [x] 打卡结果反馈动效（F-07：成功整屏撒花 + 居中结果卡「+10 分」/ 失败按钮抖动 + 顶部红色提示条 + 震动；音效待补）
- [x] 声控判定缺陷修复（P9：空识别结果不再判成功 + 单字不再判成功，判定抽到 `voiceCheckin/lib/match.js` 并配 45 条单测）
- [x] 地图交互增强（F-08：`show-location` 蓝点 + 回到我的位置 + 「导航」唤起微信内置地图）
- [x] 打卡点列表页（F-09：按距离分「附近 500 米内 / 其他」，点条目回首页选中；`getDistance` 抽到 `utils/geo.js` 并配 48 条单测）
- [x] 分享给好友（F-10：任务卡片分享带任务码、点开可自动接受；排行榜分享带「我拿了 X 分（第 N 名）」）
- [ ] 定时触发器：自动将超时任务置为 `expired`
- [ ] 云函数敏感配置外置（讯飞 APPID / APIKey / APISecret 改为环境变量并轮换）
- [ ] 界面样式统一与视觉优化

## 日志规范

- 每次提交代码时，在本文档对应日期下追加一条记录，注明提交说明、涉及模块与关键改动。
- 日期按实际开发日期填写；跨天开发请分条记录。
- 无法确定具体日期的改动，可先记录到"待归档"段落，补上日期后移入对应条目。
