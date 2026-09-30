# 幕间 · 可安装短剧 App

幕间是一个参考红果短剧核心路径的可运行短剧 App 演示项目。用户可以发现短剧、搜索和分类筛选、播放、点赞收藏、发表评论、分享短剧链接，并从“继续观看”恢复上次位置；离线片库允许手动保存后断网播放。“我的”页采用抖音式封面背景、圆形头像和真实片单入口，头像与背景可以直接更换。管理员可以在内容管理后台维护短剧和查看基础统计。

项目把纸面上的 Spring Boot + React + MySQL 方案落成了完整的前后端应用，并用 PWA 交付可安装的 App 体验：手机浏览器可以将幕间添加到桌面，以独立窗口打开，移动端使用底部导航，已缓存内容可以在网络不稳定时继续使用。

> **当前交付形态**：可安装 PWA，不是已经签名的 Android APK 或 iOS IPA。真正原生包需要 Capacitor/原生壳、Android/iOS SDK、签名和发布配置。

## 一眼看懂：需求完成情况

| 来源/目标 | 关键要求 | 当前状态 | 可见效果或验证 |
| --- | --- | --- | --- |
| 纸面要求 | 用户注册、登录、BCrypt、Token | 已完成 | 登录/注册弹窗支持中文用户名；接口验证密码哈希、过期 Token 和无效 Token |
| 纸面要求 | 短剧列表、详情、视频播放 | 已完成 | 精选首屏、短剧网格、播放器、视频拖动播放 |
| 纸面要求 | 点赞、收藏、防重复 | 已完成 | 播放器互动按钮；联合唯一约束和并发验收 |
| 纸面要求 | 管理员短剧 CRUD | 已完成 | “内容管理”后台、实时统计、增删改查表单 |
| 红果核心 | 精选首页、分类、搜索 | 已完成基础版 | “发现好剧”、分类标签、标题搜索；尚无个性化推荐算法 |
| 红果核心 | 热播榜单 | 已完成 | “人气榜单”按播放量排序并显示名次 |
| 红果核心 | 播放进度、回访 | 已完成 | “继续观看”、详情自动续播、播放中定期同步 |
| 红果核心 | 评论互动 | 已完成 | 播放器“剧友说”评论列表和发表评论 |
| App 化 | 移动端、安装、离线 | 已完成 PWA 演示 | 移动端底部导航、App 壳预缓存、离线片库和断网视频拖动 |
| 个人主页 | 图片裁剪、编辑昵称、收藏和观看记录 | 已完成 | 头像/背景先预览裁剪再保存；中文昵称可编辑；片单支持搜索、管理、删除确认和继续播放 |
| 幕间创新 | 降低选择疲劳 | 已完成 | “心情选剧”从当前片库随机挑选并直接打开播放器 |
| 红果差距 | 单列推荐、任意选集、预约、小窗、倍速、会员 | 未完成 | 见竞品对照与后续需求，不作为当前交付宣传 |

![发现首页实际截图](docs/screenshots/desktop-home.jpg)

| 播放与续播 | 离线片库 | 管理后台 |
| --- | --- | --- |
| ![播放器](docs/screenshots/desktop-player.jpg) | ![离线片库](docs/screenshots/offline-library.jpg) | ![管理后台](docs/screenshots/desktop-admin.jpg) |

手机端：[390px 首页](docs/screenshots/mobile-390-home.jpg) · [320px 首页](docs/screenshots/mobile-320-home.jpg) · [390px 我的](docs/screenshots/mobile-390-profile.jpg) · [320px 我的](docs/screenshots/mobile-320-profile.jpg) · [离线播放](docs/screenshots/offline-player.jpg)。[桌面个人主页](docs/screenshots/desktop-profile.jpg)展示封面、头像和片单。截图由真实浏览器验收脚本生成，文档中对应的是可运行页面。

## 页面效果

### 发现首页

- 左侧桌面导航包含：发现好剧、人气榜单、我的收藏、继续观看、我的和管理员内容管理。
- 首屏使用精选内容大图、标题、简介、分类和“立即观看”按钮，下面是 8 条演示短剧卡片。
- 卡片显示封面、分类、播放次数、喜欢数和收藏状态；鼠标悬停显示播放入口。
- 搜索框和分类标签会直接刷新真实后端数据；排序可切换“最新上架/最多播放”。

### 播放器

- 弹层播放器支持视频播放、拖动、播放计数、点赞/取消点赞和收藏/取消收藏。
- 登录用户的进度在播放中约每 15 秒及暂停、结束、关闭时同步；重新打开自动定位到上次位置。
- 分享生成 `/#watch/{id}` 直达链接；下方有离线缓存、版权演示片源说明和“剧友说”评论区。
- 游客可以查看评论；登录后可以发布最多 500 字评论。

### 继续观看和我的

- “继续观看”按最近观看时间展示历史，卡片显示进度百分比，点击后从保存位置播放，可单条移除。
- 顶栏下载入口打开离线片库；断网重启后，已缓存视频仍可播放和拖动，可按条目移除。
- “我的”展示账号、在线/离线状态、抖音式封面背景和圆形头像；支持更换头像/背景，收藏和观看记录用两个 Tab 展示，短剧卡片可直接打开播放器。
- 更换图片时可拖动、缩放及调整位置，确认后保存；取消不会上传。昵称支持中文编辑，收藏和历史可搜索、逐条管理，失败后可重试。
- 手机端导航固定在底部，内容区为单列/双列自适应布局，播放器按钮会自动换行。

### 管理后台

- 管理员登录后出现“内容管理”入口。
- 顶部显示在架短剧、注册用户、累计播放和用户收藏四项实时数据库统计。
- 表格支持标题搜索、查看、编辑和删除；新增/编辑表单校验分类与资源地址。
- 删除短剧后，前台列表和对应点赞、收藏、历史、评论关系同步清理。

## 功能清单

### 用户端

- 注册、登录、退出登录、8 小时 JWT 会话；用户名支持中文、字母、数字和下划线，注册校验与失败提示使用中文。
- 首页精选、分类筛选、标题搜索、最新/热门排序。
- 人气榜单、短剧详情、视频播放和 Range 拖动。
- 点赞/取消点赞、收藏/取消收藏、我的收藏。
- 观看历史、观看进度同步、继续观看、删除历史。
- 查看评论、发表评论、分享、离线缓存。
- 心情选剧、安装幕间 App、在线/离线状态提示。
- 个人主页头像/背景图片上传，服务端限制图片类型、尺寸和 5MB 大小。
- 图片裁剪预览、资料昵称编辑、片单搜索和带确认的移除操作；网络和上传错误显示中文原因。

### 管理端

- 管理员角色隔离和普通用户 403 拒绝。
- 短剧数量、用户数量、播放量、收藏量统计。
- 短剧新增、编辑、删除、查询。
- `http/https` 或安全 `/media/` 资源地址校验。

### 安全和数据规则

- 密码使用 BCrypt，不保存明文。
- JWT 使用配置化密钥和 8 小时过期时间。
- 用户名唯一；点赞、收藏、观看历史使用联合唯一约束。
- 外键级联清理，避免删除短剧后残留互动数据。
- 所有 SQL 使用 JdbcTemplate 参数绑定。
- 接口统一返回可读 JSON 错误，覆盖 400/401/403/404/409。

## 技术栈与目录

| 层 | 技术 | 目录 |
| --- | --- | --- |
| 前端 | React 19、TypeScript、Vite、Lucide | `frontend/src` |
| App 体验 | Web App Manifest、Service Worker、Cache Storage | `frontend/public`、`frontend/index.html` |
| 后端 | Java 21、Spring Boot 3.5.6、Spring Security | `backend/src/main/java` |
| 数据库 | MySQL 8.4、JdbcTemplate、参数化 SQL | `backend/src/main/resources/schema.sql` |
| 验收 | Linux/Windows 构建脚本、HTTP、Service Worker 与浏览器验收 | `scripts` |
| 文档 | 产品需求、竞品分析、技术架构和实现映射 | `docs` |

核心后端文件：

- `AuthController.java`：注册、登录和当前用户。
- `DramaController.java`：短剧列表、详情、播放量、点赞和收藏。
- `EngagementController.java`：观看历史、进度和评论。
- `AdminController.java`：后台统计和短剧 CRUD。
- `ProfileMediaController.java`：登录用户头像和主页背景图片上传、缩放与静态资源回显。
- `DramaRepository.java`：短剧查询和互动统计 SQL。
- `SecurityConfig.java`：JWT、BCrypt、角色权限和错误响应。

核心数据表：

| 表 | 用途 |
| --- | --- |
| `user` | 用户、密码哈希、昵称、角色 |
| `user_profile` | 用户头像和主页背景地址，与用户一对一关联 |
| `drama` | 标题、封面、简介、视频地址、分类和播放量 |
| `user_favorite` | 用户收藏关系，联合唯一 |
| `user_like` | 用户点赞关系，联合唯一 |
| `watch_history` | 用户观看进度和最近观看时间，联合唯一 |
| `drama_comment` | 短剧评论和评论用户 |

## 运行项目

项目路径：`E:\mujian`

### Linux / WSL

需要 Node.js 20+、Java 21、Maven 3.9+ 和已启动的 MySQL 8；默认数据库地址是 `127.0.0.1:3307/mujian`。先创建数据库和有建表权限的用户（可通过 `DB_URL`、`DB_USER`、`DB_PASSWORD` 覆盖默认值），然后运行：

```bash
cd /mnt/e/mujian
bash scripts/build.sh
bash scripts/start.sh
```

启动后访问 [http://127.0.0.1:8080](http://127.0.0.1:8080)，验收可运行 `node scripts/verify.mjs` 和 `node scripts/verify-sw.mjs`。WSL 与 Windows 默认可能不共享 `127.0.0.1` 网络；若 MySQL 在 Windows 侧，需按实际网络设置 `DB_URL`。Linux 脚本不自动安装或启动 MySQL。

### Windows 本地演示

双击 `start.cmd`，或在 PowerShell 执行：

```powershell
cd E:\mujian
.\scripts\start.ps1
```

然后打开 [http://127.0.0.1:8080](http://127.0.0.1:8080)。首次构建或修改前端后执行：

```powershell
.\scripts\build.ps1
.\scripts\start.ps1
```

### 演示账号

| 身份 | 用户名 | 密码 | 可演示内容 |
| --- | --- | --- | --- |
| 普通用户 | `demo` | `Demo123!` | 点赞、收藏、评论、继续观看 |
| 管理员 | `admin` | `Admin123!` | 普通用户能力 + 内容管理 |

账号和本地数据库密码只用于演示。部署到公网前必须替换密码、JWT 密钥，关闭示例初始化并使用 HTTPS。

## 推荐演示流程

1. 打开首页，展示精选首屏、短剧网格、分类和“心情选剧”。
2. 搜索“雨停”或切换“悬疑”，打开播放器并播放几秒。
3. 以 `demo` 登录，点击点赞、收藏，发布一句评论，暂停视频。
4. 打开“继续观看”，展示进度百分比；打开“我的”，预览裁剪头像与背景、编辑昵称、搜索和管理片单，在收藏和观看记录之间切换并继续播放。
5. 回到发现页，展示榜单和收藏列表；在播放器点“离线缓存”，再打开离线片库。
6. 退出后以 `admin` 登录，打开“内容管理”，展示实时统计和 CRUD 表单。
7. 新增或编辑短剧，回到发现页确认内容同步；删除测试记录后确认前台消失。
8. 介绍数据库联合唯一约束、权限校验、PWA 方案和 Codex 的分块开发流程。

## 验收证据

执行：

```bash
cd /mnt/e/mujian
bash scripts/build.sh
bash scripts/start.sh
node scripts/verify.mjs
node scripts/verify-sw.mjs
# 有 Chromium/Edge 与 Playwright 时：node scripts/verify-ui.mjs
# 个人主页专项：node scripts/verify-profile.mjs
```

当前自动 HTTP 验收结果：**36 checks passed**；新增个人主页专项 **11 组检查通过**。Service Worker 缓存/Range 检查和真实浏览器流程均通过，详细记录见 [本轮验收记录](docs/08-本轮验收记录.md)，实际页面截图见 `docs/screenshots/`。图片调整过程见[手机裁剪预览](docs/screenshots/mobile-profile-crop.jpg)。

覆盖范围包括：

- 数据库真实连接、公开内容列表和前端首页。
- 错误密码、弱密码、重复注册、无效/过期 Token。
- 管理员登录、普通用户 403、管理员新增/编辑/删除。
- 不安全资源地址拒绝、点赞/收藏重复和并发幂等。
- 重新登录后的数据持久化、收藏列表和级联清理。
- 视频 Range 拖动播放。
- 匿名查看评论、登录发表评论、详情续播数据和观看历史删除。
- PWA manifest、App 壳资源清单、Service Worker、离线媒体 Range 和浏览器端断网流程。

构建验证：

- `npm run build`：通过。
- Linux `mvn -B -ntp package`：通过；当前无 Java 单元测试，接口行为由 HTTP 验收覆盖。
- 本轮提交文件的 `git diff --check`：通过。

## 文档导航

| 文件 | 内容 |
| --- | --- |
| `docs/01-纸面需求.md` | 用户提供的原始需求和 Codex 协作要求 |
| `docs/02-红果竞品分析.md` | 红果公开能力拆解、幕间映射和差异化 |
| `docs/03-当前产品需求.md` | 当前版本角色、页面、规则和验收 |
| `docs/04-当前技术架构.md` | 当前后端、前端、数据库和 PWA 架构 |
| `docs/05-增强后总需求.md` | 竞品核心能力 + 幕间创新后的总 PRD |
| `docs/06-增强后总技术架构.md` | 总体架构、演进、原生 App 路线和运维 |
| `docs/07-需求实现映射与演示效果.md` | 一眼查看需求、代码位置、页面效果和验收证据 |
| `docs/08-本轮验收记录.md` | 本轮改进、验证结果、截图和运行环境 |

## 当前边界

当前 8 条短剧标题和简介是演示文案，共用 Sintel Trailer 片源。播放器会显示 Sintel/Blender Foundation/CC BY 3.0 署名；不能把当前内容描述成完整商业短剧版权库。

当前没有伪装完成以下能力：分集和全集连播、追更日历、复杂推荐算法、视频上传/转码、广告、会员付费、弹幕、消息推送、完整审核后台、Android APK 和 iOS IPA。它们已经在总需求和技术架构文档中列为后续阶段。

## 素材与版权

封面来源和编号见 `ASSETS.md`。示例视频为 Sintel Trailer，© Blender Foundation，CC BY 3.0，来源：[sintel.org](https://www.sintel.org) 和 [W3C media](https://media.w3.org/2010/05/sintel/trailer.mp4)。

## GitHub

仓库已经设置为公开：

[Tony-XUYANG/mujian](https://github.com/Tony-XUYANG/mujian)
