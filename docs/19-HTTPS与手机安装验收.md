# HTTPS 与手机安装验收

当前状态（2026-10-10）：Sealos 公网入口已提供可信 HTTPS，域名为 `anthapjdimpo.sealosbja.site`；应用已具备可见的 PWA 安装引导和需用户确认的更新流程。功能实现与边界见[安装与更新体验](21-PWA安装与更新体验.md)。Android/iPhone 真机安装表仍待用户用实际设备填写，不能用桌面手机视口代替。

2026-10-08 的“暂无域名、HTTP测试”是历史记录；当前以 Sealos HTTPS 入口和[迁移配置](20-Sealos迁移与资源配置.md)为准。

## 先完成候选版云端更新

在已认证的腾讯云 Ubuntu 终端按[部署文档](14-Ubuntu测试服务器部署.md#首版候选包的接续升级)执行包外 SHA256 校验和 `apply-release-ubuntu.sh`。使用发布页提供的完整源码提交，不能填旧版提交。确认应用和数据库健康，执行只读部署检查；再以虚拟信息验证登录、播放、素材复用、选款、模拟购买和取消返库。

运行隔离恢复脚本核对备份。记录快照目录、源码版本、JS/CSS 文件名、检查结果。服务器重启后确认 `mujian`、`mysql`、`nginx` 和备份定时器正常，再重跑健康和只读检查。升级脚本的自动回退只恢复 JAR，不替代数据库恢复。

## 域名与证书

域名办理适用的备案，并将 A 记录解析到 `106.54.37.247`。若没有可用 IPv6 服务，勿设置 AAAA 记录。云防火墙与系统防火墙需要允许 80/443；应用8080和数据库端口保持仅本机访问。

以下是未来在服务器执行的步骤，先把示例域名和邮箱改为自己可用的值：

```bash
task_domain='app.example.com'
task_email='you@example.com'
getent ahostsv4 "$task_domain"
sudo cp -a /etc/nginx/sites-available/mujian /etc/nginx/sites-available/mujian.before-https
sudo sed -i "s/server_name .*/server_name $task_domain;/" /etc/nginx/sites-available/mujian
sudo nginx -t
sudo systemctl reload nginx
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx --redirect -d "$task_domain" --email "$task_email" --agree-tos --non-interactive
sudo nginx -t
sudo systemctl status certbot.timer --no-pager
sudo certbot renew --dry-run
```

解析结果必须先核对为目标服务器，证书申请失败应先排查DNS、80端口和域名状态。以上使用Certbot管理现有Nginx配置；包内 `nginx-https.conf` 是可选模板，勿再覆盖Certbot已生成的配置。若选择模板，须先取得对应证书并将 `__DOMAIN__` 全部替换，证书不存在时 `nginx -t` 会失败。

从本地Ubuntu执行：

```bash
curl --fail --head "http://$task_domain/"
curl --fail --head "https://$task_domain/"
APP_URL="https://$task_domain" node scripts/verify-deployment.mjs
```

HTTP应重定向至同一域名HTTPS；HTTPS不能使用 `-k` 跳过证书校验。浏览器应无证书告警，`window.isSecureContext` 为true，应用资源和视频均可加载。证书dry-run只验证续期流程，不代表已观察到定时任务真实触发。

## 真机验收记录

先用移动网络打开HTTPS网址；安装后也从桌面图标独立打开。Android使用支持PWA安装的浏览器，iPhone使用Safari「分享 → 添加到主屏幕」。iOS离线缓存和存储回收以实测结果为准。

| 项目 | Android结果 | iPhone结果 |
| --- | --- | --- |
| 型号、系统、浏览器版本 | 待填写 | 待填写 |
| HTTPS打开，无证书/混合内容告警 | 待验 | 待验 |
| 安装到桌面，图标名称正确，独立窗口打开 | 待验 | 待验 |
| 中文注册/登录，关闭重开行为与产品会话策略一致 | 待验 | 待验 |
| 分集播放、拖动、倍速、关闭重开续播 | 待验 | 待验 |
| 头像/背景、商品图片选择裁剪和上传 | 待验 | 待验 |
| 商品选款、购物车、模拟下单/取消 | 待验 | 待验 |
| 主动缓存，断网打开离线片库和播放拖动 | 待验 | 待验 |
| 恢复网络后可正常继续使用 | 待验 | 待验 |
| 版本更新后旧视频缓存保留 | 待验 | 待验 |

记录测试日期、截图和失败复现步骤。PWA仍是Web App，不交付APK/IPA；没有真机结果时保留“候选版”状态。支付物流继续明确标记模拟。完成云端、恢复、重启和两类手机验收后，才更新[首版交付状态](18-首版冻结范围与交付验收.md)。
