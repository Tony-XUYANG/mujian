# 幕间 · 可安装短剧 App

Java 21 + Spring Boot 3.5.6 + React 19 + TypeScript + Vite + MySQL 8.4。项目和独立数据库均保存在 `E:\mujian`。

## 立即运行

双击 `start.cmd`，打开 http://127.0.0.1:8080 。已打包的版本只需要 Java，本机 MySQL 已准备完毕。启动脚本不安装系统服务，数据库仅监听本机 3307，Web 服务仅监听本机 8080。

| 身份 | 用户名 | 密码 |
|---|---|---|
| 普通用户 | demo | Demo123! |
| 管理员 | admin | Admin123! |

在登录弹窗展开“快速体验演示账号”也可以填充账号。管理员登录后，左侧出现“内容管理”。

## 已实现

- 注册、BCrypt 密码哈希、8 小时 JWT 登录，管理员与普通用户权限隔离。
- 首页精选、分类、标题搜索、最新/播放量排序、视频播放、人气榜单。
- 点赞/取消、收藏/取消、个人收藏，支持重复请求，数据库联合唯一约束兜底。
- 后台真实统计、短剧新增、编辑、查询、删除；删除通过外键级联清理互动。
- 移动端布局、加载与空状态、登录过期提示、表单校验、错误反馈。
- PWA 安装清单、Service Worker、移动端底部导航、个人中心、继续观看、观看进度同步、剧友评论、分享、离线缓存和“心情选剧”。
- 8 条示例内容、本地封面及可拖动播放的 MP4 示例片源。

每部短剧对应一个视频。标题、简介是虚构演示文案，8 条内容共用 Sintel 预告片用于验证播放；不是完整商业短剧内容库。当前交付是可安装 PWA，不是已经签名的 Android/iOS 原生包。未包含分集、付费、推荐算法、视频上传/转码。

## 交付文档

`docs/01-纸面需求.md`：用户提供的原始需求基线。

`docs/02-红果竞品分析.md`：公开资料分析、能力映射和幕间创新点。

`docs/03-当前产品需求.md`、`docs/04-当前技术架构.md`：当前可运行版本的产品与技术说明。

`docs/05-增强后总需求.md`、`docs/06-增强后总技术架构.md`：覆盖红果核心体验、PWA App 形态和后续演进的总版本说明。

## 结构与开发

`backend/` 为 Java 后端，`frontend/` 为 React 前端，`scripts/` 为构建、启动和验收脚本，`.runtime/` 为本地 MySQL、数据及日志。

后端使用 Controller + Repository 分层，JdbcTemplate 的参数化 SQL 与数据库约束处理数据。四张表为 `user`、`drama`、`user_favorite`、`user_like`，建表 SQL 位于 `backend/src/main/resources/schema.sql`。在原始设计上补充了角色、分类、时间字段和外键。

开发时：启动数据库后在 backend 执行 `mvn spring-boot:run`；在 frontend 执行 `npm ci`、`npm run dev`。Vite 代理 `/api` 到后端，生产构建由 Spring Boot 同源提供，无需开放任意跨域。

重新打包：双击 `build.cmd`。数据库默认 URL 为 `jdbc:mysql://127.0.0.1:3307/mujian`，用户 `mujian`。可通过 `DB_URL`、`DB_USER`、`DB_PASSWORD`、`JWT_SECRET`、`ADMIN_PASSWORD`、`DEMO_PASSWORD`、`SEED_DEMO` 覆盖配置。交付配置只用于本地演示；对外部署应替换演示密码和签名密钥，关闭示例初始化，并使用 HTTPS。现有账号的密码不会因重启而重置。

## 验收与演示

启动后执行 `node scripts/verify.mjs`。覆盖注册、重复注册、登录、过期和无效 token、管理员授权、CRUD、重复/并发互动、重新登录后的持久化、级联清理、视频 Range 请求和首页访问。脚本会创建独立验收账号，临时短剧在结束时删除。

建议演示顺序：
1. 浏览首页，搜索和切换分类，打开视频并播放。
2. 注册账号，点赞收藏；刷新，再打开“我的收藏”。
3. 退出并以管理员登录，新增短剧、编辑标题，回首页看到修改。
4. 删除新建记录，确认用户端同步移除。
5. 简述数据库唯一约束、后端权限校验和 AI 辅助开发流程。

## AI Coding 过程说明

先确定四表模型、单视频范围及权限规则；再按后端接口、前端交互、真实数据库联通、验收与交付推进。Codex 编写实现、运行构建并验证接口。应结合实际验证结果介绍过程，不声称未经进行的人工逐行审核或线上部署。

## API

- `POST /api/auth/register`、`POST /api/auth/login`，返回 token 与安全用户字段。
- `GET /api/auth/me`；`GET /api/dramas?q=&category=&sort=latest|popular`；`GET /api/dramas/{id}`。
- `POST /api/dramas/{id}/view`：每次打开播放器首次播放计数一次，不代表去重用户数。
- `PUT/DELETE /api/dramas/{id}/like`、`PUT/DELETE /api/dramas/{id}/favorite`。
- `GET /api/me/favorites`；`GET /api/admin/stats`。
- `GET/POST /api/admin/dramas`、`PUT/DELETE /api/admin/dramas/{id}`。
- JSON 错误格式 `{ "message": "可读错误信息" }`，使用 400/401/403/404/409 等状态码。

列表最多返回 200 条，适合本次演示范围；JWT 保存在 sessionStorage，退出时清除。后台资源支持 http/https 地址或 `/media/` 本地路径。

## 素材

封面来自 Unsplash，原始图片编号见 `ASSETS.md`。示例视频：Sintel Trailer，© Blender Foundation，CC BY 3.0，https://www.sintel.org ，下载来源 https://media.w3.org/2010/05/sintel/trailer.mp4 。播放器保留署名。封面与示例视频已保存本地。
