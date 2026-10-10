# Sealos迁移与资源配置

2026-10-10：目标为用户确认的北京工作空间 private team（namespace：`ns-ebuettxj`）。`mujian-db` 数据库已运行，应用已从默认 nginx 变更为通过构建检查的幕间镜像。已修复上传卷权限问题，应用恢复运行，Pod 就绪且新 Pod 重启次数为0，MySQL 连接成功。Sealos 已生成 HTTPS 入口 `https://anthapjdimpo.sealosbja.site`，通过公网入口完成21项部署只读检查和6项前端文件哈希核对；原腾讯云入口继续保留。

## 推荐测试资源

| 组件 | CPU | 内存 | 存储 | 网络 |
| --- | --- | --- | --- | --- |
| 幕间应用 | 1核 | 2GiB | 上传图片持久卷10GiB | 8080端口，平台HTTPS入口 |
| MySQL 8.4 | 1核 | 2GiB | 数据持久卷10GiB | 仅工作空间内网 |

应用一个副本。当前定时发布任务、文件存储和迁移尚未设计为多副本部署，不能直接增加副本作为扩容方案。上述为演示与小规模测试配置，未经过并发压测，实际计费以平台确认为准。

## 当前已提交配置

- 应用：2核、4GiB、1副本，镜像 `ghcr.io/tony-xuyang/mujian:92a2eb2416d8d3e7607cd1bf19ddcfd17ceb5ba0`，容器及服务端口均为8080。
- 数据库：`apecloud-mysql`，版本 `ac-mysql-8.0.30-1`，1核、2GiB、10GiB，仅内网访问。连接目标为 `mujian-db-mysql.ns-ebuettxj.svc:3306/mujian`。
- 上传存储：10GiB，挂载 `/data/uploads`。已补充非 root 运行权限与 `fsGroup=10001`，实际验证进程 UID/GID 为10001、上传目录为 `0:10001`、权限为2775且应用可写。
- 环境变量已核对，未保留占位符；JDBC 含 `createDatabaseIfNotExist=true`，本轮使用 `SEED_DEMO=true` 初始化新环境演示数据。原站点的用户、订单和上传文件尚未迁移。
- 网络：容器和服务端口为8080，Sealos Ingress 已绑定 `anthapjdimpo.sealosbja.site` 和 `wildcard-cert`，公网入口使用 HTTPS。平台代理上传限制32MiB、读写超时300秒；数据库仍仅内网访问。

## 容器和配置

根目录Dockerfile在Linux中编译React和Spring Boot，运行Java21并使用UID/GID10001。GitHub工作流 container.yml 仅手动启动；通过独立MySQL和21项只读检查后，才将带完整提交号的镜像发布至GHCR。须确认包可被平台拉取后再部署，不使用未验证的latest标签。

应用设置：DB_URL、DB_USER、DB_PASSWORD、JWT_SECRET、SEED_DEMO=false。BIND_ADDRESS=0.0.0.0、PORT=8080、UPLOAD_DIR=/data/uploads由镜像设置。数据库密码和JWT由平台Secret注入，不放进仓库或公开截图。首次用新库演示时才能启用SEED_DEMO=true，并另设独立随机ADMIN_PASSWORD及DEMO_PASSWORD；完整迁移现有库时不初始化演示数据。

挂载持久卷到/data/uploads，确保UID/GID10001可写；可使用平台支持的fsGroup或初始化容器处理权限，不能把上传目录留在容器临时层。内网MySQL需要utf8mb4和MySQL8.4兼容的排序规则。

### 当前存储权限修复方案

`deploy/fix-sealos-upload-permissions.sh` 使用工作空间 Kubeconfig，只修改 `ns-ebuettxj` 中 `mujian` StatefulSet 的运行权限：运行 UID/GID10001、`runAsNonRoot=true`、`fsGroup=10001`、`fsGroupChangePolicy=OnRootMismatch`、默认 seccomp，禁止容器提权并移除额外 capabilities。补丁位于 `deploy/sealos-upload-security-context.json`，使用 strategic merge 保留现有容器镜像、环境变量和挂载。先核对镜像和挂载路径，再进行服务器 dry-run；等待滚动更新后检查应用仍以非 root 运行且上传目录可写。旧版本 Pod 陷入 CrashLoopBackOff 且没有加载新版本时，仅重建应用 Pod，保留其 PVC 和数据库。

本次已通过平台私密连接配置实际应用上述补丁，并重建未加载补丁的旧 Pod；Pod 启动、非 root 身份、卷可写、数据库健康均已验证。配置文件只存本地忽略目录，不提交仓库或粘贴到聊天。日后平台表单变更可能重新生成 Pod 配置，变更后须再次检查 `securityContext`。公网入口、HTTPS、登录交易、上传持久化及原站数据迁移仍需单独验收。

## 数据迁移与切换

1. 新环境资源、镜像拉取权限和HTTPS入口确认后，短暂停止原站点写入并生成数据库、表指纹和上传文件一致性备份。
2. 通过认证私密传输导入新MySQL及图片持久卷，比较每张表及文件指纹。不得把备份上传公开GitHub或开放原MySQL端口。
3. 新应用连接迁移数据库，关闭演示初始化；验证健康、首页、资源版本、短剧、视频Range、头像/商品图片、规格库存和登录交易。
4. 使用可信HTTPS网址验证无证书告警、无混合内容、Service Worker和缓存；数据库仍使用内网。
5. 验收成功后公布新网址，原站点保留回退；避免两个入口长期同时写入不同库。原站点用户本地登录/缓存不会自动转移到新域名，需重新登录并下载缓存。

平台子域名由 Sealos 应用入口生成，工作空间邀请不是应用访问地址。当前已验证证书入口和应用响应；平台子域名是否适合长期运营、是否有备案要求及带宽/账单限制，应以平台条款和实际部署地区为准。现阶段展示数据为新环境演示库，原站点用户、订单和上传文件尚未迁移，不应把两个入口同时作为写入生产站点。
