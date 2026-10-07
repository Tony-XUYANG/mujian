# Ubuntu 测试服务器部署

适用配置：Ubuntu 24.04、2 核 4GB、至少 50GB SSD。服务器运行 Java 21、MySQL 8 和 Nginx；前后端在本地 Linux 构建，部署包仅含已打包 JAR、安装脚本、systemd 与 Nginx 配置，不含开发者数据库、上传图片或本机账号凭据。

## 本次部署结果（2026-10-07）

测试地址：[首页](http://106.54.37.247/#home)、[商城](http://106.54.37.247/#mall)。腾讯云上海实例 `mujian-test`，实际购买为锐驰型2核4GB、50GB SSD，控制台标示200Mbps峰值、不限流量；峰值不是持续独享带宽保证。系统为Ubuntu Server 24.04.4 LTS。

部署包SHA256为 `639a8b1b1e4cc99516114019a0c9be1bdfc9d769d416357246cb1dde2191d61a`，应用源码版本为 `98b7d460529244e21d2a40369b6e599efb20fdca`。Java/MySQL/Nginx均已启动，数据库健康检查通过，公开首页、8部演示短剧、5件商品及视频Range可用。本轮没有调整云防火墙、开放数据库或改变SSH登录凭据。后续发布包会包含HTTP订单结算兼容修复。

Linux只读部署检查21项通过，真实浏览器确认远端规格换款与价格/库存同步。未执行批量注册、写订单、压测或主机重启；不要把此前本机业务检查计为云端检查。实例当前无域名/HTTPS，PWA安全上下文、桌面安装和离线须在可信HTTPS完成后再验。

![公网首页](screenshots/deployment/remote-home.jpg)

## 构建与上传

```bash
cd /mnt/e/mujian
MAVEN_REPO_LOCAL=/mnt/c/Users/Administrator/.m2/repository bash scripts/build.sh
bash scripts/package-release.sh
```

上传 `.runtime/deploy/mujian-release.tar.gz` 到服务器 Ubuntu 用户的家目录。可以使用腾讯云免密终端的文件管理器，也可以在已配置 SSH 登录时使用 scp。不要发送服务器密码、私钥或 API 密钥到聊天中。

在一台新 Ubuntu 24.04 测试服务器中执行：

```bash
tar -xzf mujian-release.tar.gz
cd mujian-release
sudo bash install-ubuntu.sh 你的公网IP或已备案域名
```

安装脚本校验部署包内的 SHA256，安装官方 Ubuntu 仓库的依赖，生成随机数据库密码、JWT 密钥及初始演示账号密码，建立独立数据库，配置低权限系统用户和开机自动启动。约 4GB 内存中，Java 最大堆 768MB、MySQL 缓冲池 512MB；数据库与应用端口均只监听本机，Nginx 负责入口。

首次管理员账号为 `admin`，演示账号为 `demo`。随机密码保存在服务器的 `/etc/mujian/first-login.txt`，仅 root 可读；应用环境为 `/etc/mujian/app.env`，权限 600。不要把文件提交 GitHub、截图或输出到公开日志。当前保留演示短剧与商城数据，支付、物流为模拟。测试服务器有自己的数据库，不复制本地历史测试用户。

## 网络与 HTTPS

腾讯云防火墙按需要允许网站 80/443；SSH 22 尽量限定自己的来源地址，不开放 MySQL 3306/3307 或后端 8080。部署脚本不调整腾讯云防火墙或修改 SSH 登录方式。

中国内地通过域名公开提供网站服务按要求办理备案。初期可以通过 SSH 转发进行私有验证，不以改端口、绕过平台拦截的方式规避备案。IP HTTP 仅用于测试，不用于真实账号密码或个人收货信息；可信 HTTPS 是 PWA 安装和离线能力的前提。拥有已备案且解析到服务器的域名后，再配置受信任证书及自动续期。

## 验证与运维

```bash
curl --fail http://127.0.0.1:8080/api/health
curl --fail -H 'Host: 你的公网IP或域名' http://127.0.0.1/api/health
systemctl status mujian nginx mysql --no-pager
journalctl -u mujian -n 60 --no-pager
```

从本地 Linux 对云端执行不写数据的验收：

```bash
cd /mnt/e/mujian
APP_URL=http://106.54.37.247 node scripts/verify-deployment.mjs
```

脚本仅GET公开页面/接口并验证匿名权限，不提交密码、注册账号、创建订单或修改库存；只检查响应资源，不等同于实测PWA安装或离线。手机先关Wi-Fi使用移动网络，从首页播放演示视频，再进入商城和多规格商品切换颜色/容量，观察加载、播放和排版。注册登录及订单链路应使用虚拟测试数据、专用密码，并在可信HTTPS环境中另行验收。

本次套餐为200Mbps峰值，实际速度取决于线路和共享资源；不能据此承诺并发播放人数。多人播放视频时再按实测接入对象存储/CDN，本轮不购买、配置或上传商业视频。

升级前备份数据库和 `/var/lib/mujian/uploads`。上传新包后重复安装流程会保留环境密码、数据库和上传文件，并记录上一个 JAR 的符号链接。仅回退 JAR 不等于数据库迁移回退，变更 schema 前须先备份。不在共享生产环境运行会批量注册用户和创建测试数据的本地验收脚本。

当前版本不改数据库结构时，可由管理员在服务器上回退上一个JAR：

```bash
sudo test -L /opt/mujian/previous.jar
sudo ln -sfn "$(sudo readlink /opt/mujian/previous.jar)" /opt/mujian/current.jar
sudo systemctl restart mujian
curl --fail http://127.0.0.1:8080/api/health
```

如果上一版本不存在，不执行回退。应用启动需一段时间，重启后稍候再检查健康；保留数据库/上传文件备份，用恢复演练确认备份有效。当前没有承诺自动备份、恢复演练或主机重启测试已经完成。
