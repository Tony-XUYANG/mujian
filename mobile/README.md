# 幕间 Android APK

该目录是幕间网页 App 的 Android 封装工程。APK 使用 HTTPS 线上站点作为入口，安装后可以直接使用现有登录、短剧、离线缓存和商城功能。

## 已构建安装包

可直接下载并安装当前真机验收包：[mujian-debug.apk](releases/mujian-debug.apk)。这是 debug 包，适合测试和演示，不代表正式应用商店发布包。

## 构建

在 Linux/WSL 中执行：

```bash
cd /mnt/e/mujian/mobile
npm install
npx cap add android
npm run android:sync
npm run android:build:debug
```

生成文件：

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

这是用于真机验收的 debug APK。安装时需要允许手机安装来自当前文件管理器或浏览器的应用。正式发布前还需要配置 Android 签名密钥并构建 release APK。

## 手机安装

将 APK 传到 Android 手机后点击文件安装。若系统提示“允许安装未知应用”，只为当前使用的文件管理器或浏览器开启该权限；安装完成后可以关闭。首次启动需要网络，因为应用入口是 `https://anthapjdimpo.sealosbja.site`。
