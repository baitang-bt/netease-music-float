# 重新编译 MediaRemoteAdapter（可选）

本仓库已包含预编译的 `native/MediaRemoteAdapter.framework`（arm64）与 `mediaremote-adapter.pl`。

若需从上游重建：

```bash
git clone https://github.com/ungive/mediaremote-adapter.git /tmp/mediaremote-adapter
cd /tmp/mediaremote-adapter
# 需要 cmake；或用仓库 scripts / 手动 clang 链接 src/adapter/*.m
```

许可见同目录 `MEDIAREMOTE_ADAPTER_LICENSE`（BSD 3-Clause）。
