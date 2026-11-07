# MulEditor 跨电脑 AI 交接

更新时间：2026-11-07（Asia/Shanghai）。本文件保存当前状态；长期设计和历史验证保存在 [design_progress.md](design_progress.md)。

## 接班入口与三项原则

读取顺序：根目录 [AGENTS.md](../AGENTS.md) → [README.md](../README.md) → 本文件 → [设计与进度](design_progress.md) → [发布说明](RELEASING.md) → 本次涉及的源码。

1. **方便 AI 迭代**：源码、锁文件、模块入口、设计理由、验证结果一同进入仓库，让下一位 agent 可复现并修改。
2. **方便不同电脑轮流交接**：每次更新提交并推送代码及交接文档，写清基准、当前状态、未完成项和下一步；任何盘符、缓存和聊天都不是恢复工作的必要条件。
3. **生成物可以下载**：普通更新提供 Actions artifact，正式发布提供 GitHub Release、源提交、版本、安装包/便携包和 SHA-256 校验。不能以“本机已生成”代替可下载。

每次结束都检查这三项，并更新本文当前状态与设计文档中的相应记录。

## 当前交接：GitHub 迁移与可持续迭代

- 仓库：<https://github.com/walcracia/muleditor>。
- 当前项目版本：`0.1.0`。
- 当前目标：将现有完整源码和必要文档纳入 Git；建立跨电脑交接约定、CI 和可下载发布产物。
- 代码基准：包含本交接文件的提交。使用 `git log -1 --format=fuller` 和 `git rev-parse HEAD` 获取实际提交；不要把旧电脑的本地目录当基准。
- 本次改动范围：仓库初始化/同步、README、AGENTS、交接协议、设计记录、构建产物排除规则、CI 与 Windows 发布脚本；未计划更改编辑器产品行为。
- 本次本地验证已完成：锁定依赖安装、前端检查/构建、Rust 4 个测试、Windows EXE/NSIS 构建与进程启动检查通过。远端 CI 与 v0.1.0 发布尚待首次推送后确认，具体结果见文末。

接班时先核对最新提交、[Actions](https://github.com/walcracia/muleditor/actions) 与 [Releases](https://github.com/walcracia/muleditor/releases)。若迁移仍未完成，先完成推送、CI 和产物链接记录；不要直接开始下一个功能。

## 源码当前状态

- 技术：Tauri 2 + React 18 + TypeScript + Vite + Monaco `0.56.0`，npm 与 Cargo 锁文件均为复现依赖所需源码。
- 新启动只有空 `untitled.md`；首次打开/新建实际文档会替换未编辑的占位标签。
- 支持 Markdown/Mermaid 预览、HTML 预览、JSON/YAML/XML/SPDX 基础分析、各格式导航与片段、跨文件引用索引、中英文界面。
- 支持打开文件/目录、保存、导出、桌面启动文件参数和拖放；浏览器模式以文件选择及下载实现可用回退。
- Diff 可比较已保存版本或其他打开文件；两侧只读，保留空白差异，使用 Monaco advanced diff 与实验性的 moved-block 显示。原文顺序不改变。
- Rust 现有 4 个单元测试覆盖递归读目录、启动路径、拖放路径及 HTML 预览 base href。是否在本次运行通过必须看下方当次验证记录。

| 任务类型 | 主要入口 |
| --- | --- |
| 状态、文档标签与动作 | `src/App.tsx`、`src/types.ts` |
| 编辑/比较与模型生命周期 | `src/components/EditorPane.tsx` |
| 各格式扩展 | `src/lib/formatAdapters.ts`、`formatAnalyzers.ts`、`workspaceExtractors.ts` |
| 工作区引用索引 | `src/lib/workspace.ts` |
| Markdown 与 Mermaid | `src/lib/markdown.ts`、`mermaid.ts`、`src/components/DocumentPreview.tsx` |
| 文件桥接与导出 | `src/lib/fileAccess.ts`、`exporters.ts`、`src-tauri/src/lib.rs` |
| UI 与语言 | `src/components/`、`src/styles.css`、`src/lib/i18n.ts` |
| 构建与发布 | `package.json`、`src-tauri/tauri.conf.json`、`scripts/package-release.ps1`、`.github/workflows/` |

## 新电脑恢复与轮流工作

新环境：

```powershell
git clone https://github.com/walcracia/muleditor.git
cd muleditor
git status --short --branch
git log -5 --oneline
npm ci
npm run check
npm run build
```

Windows 桌面还需 Rust stable MSVC、C++ Build Tools/Windows SDK 和 WebView2。前端开发端口 `6400`，生产预览端口 `6401`；Tauri 配置应与 npm 脚本保持一致。

已有 checkout：先 `git status --short --branch` 查看未提交改动，再 `git fetch origin --prune`。工作区干净且继续共享分支时用 `git pull --ff-only`。若需恢复未合并工作，直接从交接中记录的分支继续；若从主线发起新任务，使用独立的 `agent/<task>` 分支。

并行电脑各用独立分支，通过 PR 或审查后合并。拉取失败先检查远端新增提交，整合后重跑必要验证；不强推、不覆盖其他 agent 的工作。尚未完结也应推送可恢复的工作分支，并在本文准确记录状态。

## 验证与下载流程

```powershell
npm run check
npm run build
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri:build -- --no-sign
$sourceCommit = git rev-parse HEAD
pwsh -NoProfile -File ./scripts/package-release.ps1 -SourceCommit $sourceCommit
```

只涉及文档时检查命令、路径和链接即可；涉及前端/桌面时按范围运行检查，并记录未执行项。UI 验证至少覆盖受影响操作，必要时检查 `1040×680` 最小桌面尺寸；浏览器验证不能替代原生文件对话框和桌面包验证。

普通 push/PR：在 [Actions](https://github.com/walcracia/muleditor/actions) 中查看对应提交，成功后在 Artifacts 下载前端构建结果。记录运行 URL、提交 SHA、产物名称和保留期；过期后须重新构建或使用 Release。前端 artifact 不包含 Windows 桌面程序。

正式发布：同步 npm、Cargo、Tauri 项目版本，提交并推送后创建全新 `v{version}` tag。tag 触发发布工作流；确认 [Release](https://github.com/walcracia/muleditor/releases) 的 Assets 包含安装包、便携 ZIP 和 `SHA256SUMS.txt`，下载核对后在本文记录最终链接。发布版本应能追溯到 tag 的提交，不移动已发布 tag。

发布脚本将包写入 `release/github/`，`-ValidateOnly` 仅检查项目版本一致性；实际包需要另外检查 ZIP 内容并使用 `Get-FileHash` 与清单比对。正式发布使用干净提交的构建，`-SourceCommit` 应是该提交的完整 SHA。不传来源参数时脚本记录 `local-uncommitted`，这种包不能当作正式、可追溯的发布结果。

本地 `release/`、`dist/`、`src-tauri/target/` 是生成物目录，不进 Git；正式下载包通过 Release 共享。不要使用工作区中不同日期的旧 EXE/ZIP 充当当前源码的构建结果。历史 `design_progress.md` 中的本地镜像、绝对路径及产物哈希只描述当时环境。

## 已知限制与后续候选任务

- Monaco 从 `src/main.tsx` 配置的 jsDelivr CDN 加载；完全离线编辑尚未解决。后续可评估本地打包 Monaco 与 worker，再验证桌面及 Diff 行为。
- JSON Schema、XSD/DTD 和完整 SPDX 语义校验尚非已完成能力。基础解析与引用提示不能代替完整标准校验。
- 目前下载目标为 Windows x64；macOS/Linux 原生包尚未验证。
- 当前包未签名；发布时须如实说明签名状态。
- 历史构建有 Monaco/Mermaid 相关的 chunk 大小警告。优化包体时避免破坏 worker、预览和模型释放。
- 尚无完整、可持续运行的自动 UI 回归集；历史 Playwright 截图是历史证据，不证明本次行为。

迁移完成后，下个 agent 先复现基线、核对当前 UI 和下载包，再根据用户下一项需求选择任务；上述候选任务没有自动替代用户优先级。

## 每次交接模板

复制并填写以下结构，用新状态替换“当前交接”及当次验证记录；长期决策写入设计文档，必要历史保留在进度日志。

```text
更新时间（含时区）：
目标 / 用户已授权范围：
分支 / PR / 基准 SHA：
交接提交：包含本交接的提交（或准确的已推送 SHA）
完成内容 / 关键文件 / 设计理由：
未完成项 / 已知问题 / 阻塞：
下一步第一条命令及预期结果：
环境：OS、Node/npm、Rust/Cargo、必要桌面依赖
本次验证：命令、结果、实际行为证据；未执行项及原因
CI：运行 URL、对应 SHA、结论
产物：版本、平台、源提交、构建方式、签名状态
下载：Release / Actions URL、文件名、SHA-256、保留期（如适用）
Git 状态：已推送分支；未提交内容及归属（如有）
三项检查：AI 可复现 / 跨电脑可接班 / 产物可下载
```

## 本次验证与发布记录

- 日期：2026-11-07（Asia/Shanghai）；Windows x64，Node `22.14.0`、npm `10.9.2`、Rust/Cargo `1.99.1`。
- `npm ci --prefer-offline --no-audit --no-fund`：通过；`npm run check`、`npm run build`：通过，保留已有大于 500 kB 的 chunk 警告。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --target-dir ../environment/cargo-target`：4 个测试通过。`--target-dir` 是本机缓存选项，新电脑可省略。
- `npm run tauri:build -- --no-sign`：通过，重新生成 Windows x64 EXE 与 NSIS；本次构建临时指定本机 `CARGO_TARGET_DIR`，不依赖历史 EXE。
- 新 EXE 启动检查：进程运行、有原生窗口句柄、`Responding = True`，产品版本 `0.1.0`，`NotSigned`。只关闭了本次启动的测试进程，没有操作用户已运行的应用。本次没有重做完整界面回归。
- 工作流 YAML 解析、版本校验、打包脚本和 ZIP 双文件内容/EXE 一致性：通过；上传候选文件未检出常见 token/私钥模式，依赖和缓存目录已排除。
- 首次推送后的远端 CI、Release、下载校验与最终源码 SHA：发布完成后由确认提交补充。此处仍待补充时，不能声称远端验证和发布已经成功。
