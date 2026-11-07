# MulEditor：AI agent 工作约定

本文件适用于整个仓库。目标是让任意电脑、任意 AI agent 都能依靠 GitHub 中的代码和文档继续迭代。

## 每次开始

1. 按本文件 → `README.md` → `docs/HANDOFF.md` → `docs/design_progress.md` → `docs/RELEASING.md` 的顺序阅读，再查看本次涉及的源码。本文件规定流程，README 介绍使用与启动，HANDOFF 说明当前状态，设计文档保存决策和历史，RELEASING 说明产物发布。
2. 执行 `git status --short --branch`、`git remote -v`、`git fetch origin --prune` 和 `git log -5 --oneline`，确认目录、分支、远端与基准。发现未提交更改先识别归属并保留，不擅自覆盖或清理。
3. 工作区干净时，顺序接班可在共享分支运行 `git pull --ff-only`；并行工作从最新基准创建独立的 `agent/<task>` 分支。不要在有未知本地改动时拉取、重置或切换覆盖文件。
4. 新电脑运行 `npm ci`；桌面操作需要 Windows、Rust MSVC、C++ Build Tools/SDK 和 WebView2。所有路径相对于仓库根目录，不使用上台电脑的盘符或绝对路径。
5. 在 HANDOFF 中核对当前目标和第一步；区分已完成、计划中、阻塞和未经验证。文档不明确时先用代码及提交历史核实。

## 实现约定

- 保持文档编辑工作台定位，前端编排在 `src/App.tsx`，格式能力优先扩展 `src/lib/formatAdapters.ts` 及现有分析/引用模块，桌面文件能力在 `src-tauri/src/lib.rs`。
- UI 文本同步中文/英文；保持文件内容、dirty 状态、保存行为、预览与只读比较的正确性。
- Monaco 当前固定 `0.56.0`；升级时同步 npm 依赖、锁文件和 `src/main.tsx` 中 CDN 版本，核查 Diff 组件生命周期。
- 依赖变动提交 `package-lock.json` 和相应 `Cargo.lock`；不要只改版本声明。正式发布的 npm、Cargo 和 Tauri 项目版本一致。
- 不提交 `node_modules/`、`dist/`、`src-tauri/target/`、生成的 schema、`release/`、本机 `.codex/` 状态、凭据、`.env` 或私钥。必要的脱敏验证截图放 `docs/assets/`，不要依赖未跟踪的临时输出。
- 不覆盖其他 agent 的未提交工作；并行 agent 使用独立分支/工作树，明确负责文件。合并远端变更时保留双方内容并重新验证，不使用强推、`reset --hard` 或清理命令掩盖冲突。

## 验证

基线命令从仓库根运行：

```powershell
npm ci
npm run check
npm run build
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

根据改动执行必要验证，不为纯文档改动重复无关测试。涉及界面交互时增加真实操作验证；涉及桌面、Tauri 配置或发布时运行 `npm run tauri:build -- --no-sign`，并使用 `scripts/package-release.ps1` 生成下载包。记录执行环境、命令、结果、未执行项和原因。历史截图和历史“passed”不能充当本次验证证据；失败或缺少环境不得写成通过。

## 每次结束与交接

以下三项属于每次更新的完成条件：

1. **AI 可继续迭代**：代码与依赖可安装，说明模块入口、改动原因、实际验证结果及已知限制；设计变化写入 `docs/design_progress.md`。
2. **跨电脑可接班**：刷新 `docs/HANDOFF.md` 中的当前状态、分支/基准、完成和未完成项、阻塞、下一步命令、验证证据及发布状态。代码与文档在同一组提交内推送；新电脑不应依赖聊天上下文、本地缓存或绝对路径。
3. **生成物可下载**：推送后核对 Actions 结果与下载入口，正式版本在 GitHub Release 提供安装包、便携 ZIP、校验清单和源提交信息。CI 失败须记录原因与修复步骤；未发布的产物必须明确标记，不能只写本地文件路径。

提交前检查差异、敏感信息和误纳入的构建目录。推送前再次 fetch；远端已更新时先整合并验证，禁止覆盖历史。交接中记录当前提交可用 `git rev-parse HEAD`；当文档与代码在同一提交内时，写明“包含本交接的提交”并让接班者运行 `git log -1`，不制造自引用提交哈希。

仅在验证和推送真实完成后报告完成；如有权限、网络或构建阻塞，报告已完成的本地工作、准确失败信息及下一位 agent 的恢复步骤。不要通过新建零散进度文件替代现有设计和交接入口。
