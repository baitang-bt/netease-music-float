# 网易云浮窗（NeteaseFloat）

macOS 透明置顶浮窗：跟随本机音乐软件的系统 Now Playing（网易云 / 苹果音乐 / QQ 音乐等），提供播放控制与真实声浪频谱。不替代音乐客户端，不要求再次登录。

仓库：[baitang-bt/netease-music-float](https://github.com/baitang-bt/netease-music-float)

## 要求

- macOS **14.2+**（AudioTee / Core Audio Tap）
- 已安装至少一款受支持的音乐软件
- 先在所选软件里播放一首歌，使系统「正在播放」来源匹配设置中的跟随播放器

## 本地运行

```bash
npm install
npm start
```

若 `electron` 二进制下载失败，可设置镜像后再装：

```bash
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install electron@43.1.1 --save-dev
```

静态检查与单元测试：

```bash
npm run check
```

## 权限

### 仅系统音频录制（真实频谱）

**系统设置 → 隐私与安全性 → 屏幕与系统音频录制 →「仅系统音频录制」**

把 `NeteaseFloat`（打包后）或开发时的 **Electron / Terminal / Cursor** 加进去。

### MediaRemote（曲目与控制）

经 `/usr/bin/perl` 加载自带的 `MediaRemoteAdapter.framework`（见 `native/`，BSD 许可来自 [ungive/mediaremote-adapter](https://github.com/ungive/mediaremote-adapter)）。

网易云的循环 / 随机需「辅助功能」权限；其它播放器使用系统 MediaRemote 控制。

## 功能

- 透明无边框、始终置顶；可盖住其它应用的全屏画面
- 设置中选择跟随播放器（仅列出本机已安装）
- 封面、歌名 / 歌词、歌手；上一首 / 播放暂停 / 下一首
- 真实频谱（系统音频）
- 打包版自动检查 GitHub Releases 更新

## 打包

```bash
npm run dist:mac
```

产物在 `dist/`：

- `dist/mac-arm64/NeteaseFloat.app`
- `dist/NeteaseFloat-*-arm64.dmg`
- `dist/NeteaseFloat-*-arm64-mac.zip`（自动更新使用 zip）

当前构建默认未做 Apple 开发者签名。首次打开若被 Gatekeeper 拦截，右键「打开」。

## 发布与自动更新

1. 推送代码到 GitHub
2. 打 tag 并推送，例如：

```bash
git tag v0.1.0
git push origin v0.1.0
```

3. Actions「Release」会构建并把 dmg / zip 发到 GitHub Releases
4. 已安装的打包版会在启动后（可在设置关闭）检查更新；也可托盘 / 设置里手动「检查更新」

手动触发：GitHub → Actions → Release → Run workflow。

## 说明

- 仅 macOS
- 不注入音乐进程，不上传收听记录
