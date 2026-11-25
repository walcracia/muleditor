# MulEditor 跨电脑 AI 交接

更新时间：2026-11-25（Asia/Shanghai）。本文件保存当前状态；长期设计和历史验证保存在 [design_progress.md](design_progress.md)。

## 接班入口与三项原则

读取顺序：根目录 [AGENTS.md](../AGENTS.md) → [README.md](../README.md) → 本文件 → [设计与进度](design_progress.md) → [发布说明](RELEASING.md) → 本次涉及的源码。

1. **方便 AI 迭代**：源码、锁文件、模块入口、设计理由、验证结果一同进入仓库，让下一位 agent 可复现并修改。
2. **方便不同电脑轮流交接**：每次更新提交并推送代码及交接文档，写清基准、当前状态、未完成项和下一步；任何盘符、缓存和聊天都不是恢复工作的必要条件。
3. **生成物可以下载**：普通更新提供 Actions artifact，正式发布提供 GitHub Release、源提交、版本、安装包/便携包和 SHA-256 校验。不能以“本机已生成”代替可下载。

每次结束都检查这三项，并更新本文当前状态与设计文档中的相应记录。

## 当前交接：2026-11-25 可关闭工作区与问题面板

- 用户新要求：左侧工作区、底部问题面板可以关闭，并有重新打开入口。关闭只改变显示，保留文档、dirty 状态、编辑历史和诊断计算。
- 基准：`383f40d`（0.3.0 发布确认），集成分支 `agent/closable-panels-20261125`；组件与浏览器用例在独立工作树开发。目标版本 `0.3.1`，尚未发布；稳定下载仍为下方 0.3.0。
- 已实现：面板标题右侧 X、顶部与“大纲”同组的“工作区/问题”切换按钮、编辑区自适应与焦点恢复；支持格式/操作状态移到底栏。设计与决策见 design_progress 中 0.3.1 小节。
- 本轮验证：同一 Windows/Node/Rust 环境，`npm run check`、`npm test` 97 项、`npm run build`、Edge `npm run test:e2e` 15 组（原 13 组与新增 2 组）、版本校验通过；`cargo check --locked -j 1` 和 `cargo test --locked -j 1` 9 项通过，manifest 为 `src-tauri/Cargo.toml`。本轮依赖仅版本号变化，沿用本会话已执行的锁定 `npm ci`。
- 实测两区独立关闭/重开，编辑宽高实际增加，大纲组合全关不留空列；脏状态、源/沉浸内容保留，问题隐藏时 JSON 诊断继续更新，关闭焦点回顶部按钮。中英文 1040/1600 实际截图已核对：[关闭状态](assets/muleditor-0.3.1-panels-closed.png)、[英文最小窗口](assets/muleditor-0.3.1-panels-en-minimum.png)。保留既有大 chunk 构建提示。
- 下一步：提交推送、构建新便携版并核对云端 CI/Release 和下载。当前仅完成上述本地验证，0.3.1 尚未发布；原生及下载结果完成后回填。

## 已完成交接：2026-11-25-01 沉浸模式与源代码模式

- 授权范围：Markdown 的编辑/预览改为均可直接编辑的沉浸模式与源代码模式；HTML 保持源码及预览，XML/YAML/JSON/SPDX 保持源码及结构视图。保留 React、Monaco、多格式架构及统一 Markdown 导出管线。
- 基准：`b3a7d776729b5ad95c9baf6c7468520aaf0479f4`；集成分支 `agent/immersive-20261125` 已合入 `main` 并推送；发布 `v0.3.0` 的源提交固定为 `14d3be6be1563f243c3093f697c56801a486c6e8`。包含本确认的后续提交只更新文档，可运行 `git log -1` 查询。
- 已实现：ProseMirror 可视编辑、源块保真、语义工具栏、模式同步和特殊节点编辑；Markdown 默认沉浸，两种模式都可编辑。普通标题/列表/引用/任务/表格直接操作；公式/图表/图片有表单；脚注编辑对应定义。仅切换不改源文、不置 dirty。
- 验收重点：无编辑切换不改字节、不置 dirty；局部修改不丢 Front Matter、脚注、图表及原始 HTML；源码与沉浸内容同步；另存和离线 HTML 导出保留公式、图表、图片与样式。
- 当前验证：Windows x64、Node 22.14.0/npm 10.9.2、Rust 1.99.1；`npm ci`、版本校验、`npm run check`、`npm run build`、97 个前端测试通过。Edge 的最终 `npm run test:e2e` 13 组全部通过，覆盖实际下载 HTML 离线公式/字体/图表/图片及净化、模式同步、真实选区、工具栏、列表、任务、表格、撤销/重做和迟到 Monaco 加载；额外快速 Home/Shift+End 连续 8 次通过。`cargo check --locked` 通过；Rust test 首次内存分配失败，串行 `cargo test --locked -j 1` 后 9 项通过。Cargo manifest 均为 `src-tauri/Cargo.toml`。
- 视觉证据：本轮实际生产构建的[中文 1600px](assets/muleditor-0.3.0-immersive-zh.png)、[英文 1040px](assets/muleditor-0.3.0-immersive-en-minimum.png)；两种语言 1040/1600 均检查，窄窗口工具栏横向滚动，模式和右侧大纲不裁切。
- 原生：`npm.cmd run tauri:build -- --no-sign`、`scripts/package-release.ps1` 通过，生成 EXE/NSIS/便携 ZIP；本机自编同源 EXE 启动成功，原生 WebView2 显示默认沉浸模式、源码入口和工作台，打开文件对话框可显示。完整安装器安装及全原生文件编辑/保存流程未逐项重测。下载版仅检查包内容、哈希、版本与签名，不把自编启动冒充下载版启动。
- 云端 [CI](https://github.com/walcracia/muleditor/actions/runs/45571804007) 成功：97 前端测试、13 组 Chromium 浏览器回归、9 Rust 测试。前端 artifact 已实际下载，含 index.html 和 123 个 assets；保留至 2026-12-25 15:58 Asia/Shanghai。
- [Windows Release](https://github.com/walcracia/muleditor/actions/runs/45572106053) 成功，`v0.3.0` 已公开发布，三个附件均实际下载；ZIP 只有 README.txt 与哞-编辑器.exe，README 的源提交匹配。下载 EXE 版本 `0.3.0`、`NotSigned`、SHA-256 `5ee2296890a9b2f2e5ad5e6e406c01ee4d07cecd6c51233814eef8b14010af0e`。
- 下载：[便携 ZIP](https://github.com/walcracia/muleditor/releases/download/v0.3.0/MulEditor-0.3.0-windows-x64-portable.zip) SHA-256 `0f7cc6896daf89b6a26e8f84a1342d5452f8ba4dd154d69d915a4fa4e022c901`；[安装包](https://github.com/walcracia/muleditor/releases/download/v0.3.0/MulEditor-0.3.0-windows-x64-setup.exe) SHA-256 `b941ad28e7d269ba3d87e1cbd48a4cf61eac3d16ebad03dfbcfab38da261ccb1`，均与[清单](https://github.com/walcracia/muleditor/releases/download/v0.3.0/SHA256SUMS.txt)匹配。
- 下一步：沉浸编辑迭代和发布已完成。先检查 Git 状态、fetch/pull 最新 main，再按用户后续需求迭代；当前稳定下载为 [v0.3.0](https://github.com/walcracia/muleditor/releases/tag/v0.3.0)。
- 保真边界：只规范化真实修改的顶层块；复杂 HTML/未知语法保留原文节点；源码变更/格式化会重建相应沉浸撤销历史。GFM 表格不提供合并单元格或持久列宽。跨标签切换保留内容与已有模式；跨非 Markdown 标签保留沉浸历史。
- 模块入口：`src/components/ImmersiveEditor.tsx`、`src/lib/immersiveMarkdown.ts`、`src/immersive.css`；模式/文档生命周期仍在 `src/App.tsx`，Monaco 在 `EditorPane.tsx`；预览/特殊节点及 HTML 导出仍共用 `src/lib/markdown.ts`。

## 历史交接：2026-11-20 Markdown 统一渲染与导出

- 用户范围：保留 React、Monaco、多格式架构，补公式、预览代码高亮、脚注、标题锚点、本地图片、HTML 净化，并统一预览和导出以保留图表/样式。
- 当前分支 `main`；功能分支已整合并推送。三个子任务在独立 worktree/分支实施，合并前不共享未提交源码。
- 当前发布 `v0.2.0`，源码固定为 `86ee229e150fbb65034b1297087acebd083a1a1d`；随后包含本交接的提交仅确认文档，不移动标签或替换已发布资产。
- 当前状态：本地与云端检查全部通过；65 个前端测试、9 个 Rust 测试、3 组浏览器回归和 Windows EXE/NSIS 构建通过。三个 Release 附件已实际下载，两个包的哈希与清单匹配，ZIP 来源提交和 EXE 版本/签名已核验。
- 下一步：迁移/本轮功能均已完成。接班先 `git status --short --branch`，工作区干净后 `git fetch origin --prune`、`git pull --ff-only`；新环境 `npm ci`，按用户下一项需求创建独立分支。此处候选事项不自动替代用户优先级。
- 模块：`markdown.ts` 统一渲染和同步标题/脚注锚点解析；`markdownSanitize.ts` 净化用户 HTML 与生成的公式/SVG；`markdownResources.ts` 对接 Rust/浏览器 File；`exporters.ts`、`markdownExportStyles.ts` 生成自包含 HTML，`src/markdown.css` 同时用于预览/导出。
- 本次覆盖：KaTeX 四种分隔符和 math fence、代码高亮/未知语言回退、脚注/返回链接、中文/重复/Setext 标题、Front Matter 行号、Mermaid/HTML 净化、本地图片/字体离线内联、预览隐藏导出、快速切换、链接不离开工作台及 JSON 导出。
- 本次边界：完整安装器安装过程和全格式桌面 UI 尚未逐项回归。Monaco 保留原 CDN 加载方式，应用编辑区仍需访问 jsDelivr；导出 HTML 可离线查看。
- 原生验证：新 EXE 从启动参数打开测试 Markdown，窗口标题/版本正确且响应正常；真实 WebView2 窗口中观察到 Monaco 源码、公式、代码高亮、Mermaid 图、脚注和本地图片元素，引用诊断正常。只关闭了本次创建的测试进程。
- 资源限制：本地图片只接受相对路径，支持 `../` 和中文/空格/编码文件名，每图 10 MiB；导出图片合计 50 MiB，远程图片需允许浏览器跨源读取，读取/解码 10 秒超时；SVG 外部依赖、未支持的媒体和缺图会明确阻止导出。
- 浏览器不同导入根互相隔离，同名根重新导入替换映射；普通多选保留图片，同名图片以最后选择为准。图片由预览检查，不匹配文本标签误报。
- 安全依赖：直接渲染使用锁定 DOMPurify；非破坏性修复已消除高危告警，现有 Monaco/Mermaid 嵌套依赖仍有 1 中危/3 低危告警，未强制降级 Monaco 或升级 Mermaid 主版本。

### 本次验证与下载证据（2026-11-20）

- 环境：Windows x64，Node `22.14.0`、npm `10.9.2`、Rust `1.99.1`；本地浏览器为 Edge，云端浏览器为 Playwright Chromium。
- `npm ci`、`npm run check`、`npm test`、`npm run build`、`cargo check --locked`、`cargo test --locked`、`npm run tauri:build -- --no-sign`：均通过（Cargo manifest 为 `src-tauri/Cargo.toml`；本机 target-dir 缓存是可选配置）。保留已有 chunk 大小警告。
- 浏览器 `npm run test:e2e`：3 组通过；下载 HTML 离线加载公式/字体/图表/本地图片，检查源 HTML 净化、快速切换、预览隐藏导出、链接保留工作台、1040×680 单栏阅读和 JSON 导出。代理机器的本地服务检测由配置中的 NO_PROXY 保证直连。
- [云端 CI](https://github.com/walcracia/muleditor/actions/runs/44686314724)：成功，覆盖锁定安装、版本/类型检查、65 个前端测试、3 组 Chromium 回归、Rust 测试及前端 artifact。
- [Windows 发布构建](https://github.com/walcracia/muleditor/actions/runs/44686352750)：成功，从上述标签重新构建并发布 Windows x64 安装包、便携 ZIP 和 SHA-256 清单。
- 前端 artifact `muleditor-web-86ee229e150fbb65034b1297087acebd083a1a1d` 保留 30 天，当前到期 2026-12-20 14:18 Asia/Shanghai；Windows artifact 同样保留 30 天。长期下载请使用下面的 Release。
- [v0.2.0 Release](https://github.com/walcracia/muleditor/releases/tag/v0.2.0) 三个附件已实际下载；ZIP 内只有 `README.txt`、`哞-编辑器.exe`，README 中的源提交与标签一致。下载版 EXE 版本 `0.2.0`、`NotSigned`，SHA-256 `54b1f9086b93ee4339b2c0f4f97afd8da07d846aecfc2ceaffe3d501d7d07eec`。
- 下载版只做哈希、包内容及版本/签名的只读核验；原生启动与渲染验证使用本机同源构建完成，未运行安装器安装。本次确认只更新文档，使用 `[skip ci]` 复用同源成功检查与下载产物。

| 下载 | 已核验 SHA-256 |
| --- | --- |
| [便携 ZIP](https://github.com/walcracia/muleditor/releases/download/v0.2.0/MulEditor-0.2.0-windows-x64-portable.zip) | `d4add1bdd74ff9e55fe6704a2ce662afe9adcf6c229afaae8ce1476d56ec7259` |
| [安装包](https://github.com/walcracia/muleditor/releases/download/v0.2.0/MulEditor-0.2.0-windows-x64-setup.exe) | `36476dbb4cc618a99f3b37dd0ec81c48c5a9f04925670c12dd713569b06d3691` |
| [校验清单](https://github.com/walcracia/muleditor/releases/download/v0.2.0/SHA256SUMS.txt) | `821c709dbad73043d6acfb8940a3f02e72c376b4a0028e07d994dc5466c92d7f` |

## 上一次交接：2026-11-07 GitHub 迁移

- 仓库：<https://github.com/walcracia/muleditor>。
- 当前项目版本：`0.1.0`。
- 当前目标：首次 GitHub 迁移、云端验证和可下载发布已完成。后续先同步本仓库，再按用户的新需求发起迭代。
- 代码基准：包含本交接文件的提交。使用 `git log -1 --format=fuller` 和 `git rev-parse HEAD` 获取实际提交；不要把旧电脑的本地目录当基准。
- 本次改动范围：仓库初始化/同步、README、AGENTS、交接协议、设计记录、构建产物排除规则、CI 与 Windows 发布脚本；未计划更改编辑器产品行为。
- 本次验证与发布状态：本地检查、云端 CI、Windows Release 全部通过；三个 Release 附件已实际下载，哈希匹配，便携程序启动通过。详细证据见文末。

接班时先核对最新提交、[Actions](https://github.com/walcracia/muleditor/actions) 与 [v0.1.0 Release](https://github.com/walcracia/muleditor/releases/tag/v0.1.0)。第一步执行 `git status --short --branch`，确认工作区干净后 `git fetch origin --prune`、`git pull --ff-only`；新电脑 `git clone` 后按下述命令恢复依赖。当前没有未完成的迁移工作；候选功能需遵循用户的下一项优先级。

## 源码当前状态

- 技术：Tauri 2 + React 18 + TypeScript + Vite + Monaco `0.56.0`；Markdown 使用 ProseMirror 沉浸模型及 markdown-it + KaTeX + highlight.js + DOMPurify 共享渲染，保留 npm/Cargo 锁文件。
- 新启动只有空 `untitled.md`；首次打开/新建实际文档会替换未编辑的占位标签。
- 支持 Markdown/Mermaid 预览、HTML 预览、JSON/YAML/XML/SPDX 基础分析、各格式导航与片段、跨文件引用索引、中英文界面。
- 支持打开文件/目录、保存、导出、桌面启动文件参数和拖放；浏览器模式以文件选择及下载实现可用回退。
- Diff 可比较已保存版本或其他打开文件；两侧只读，保留空白差异，使用 Monaco advanced diff 与实验性的 moved-block 显示。原文顺序不改变。
- Rust 现有 9 个单元测试，新增图片路径、类型/签名、超限与 SVG 图片用法测试，本次均通过。

| 任务类型 | 主要入口 |
| --- | --- |
| 状态、文档标签与动作 | `src/App.tsx`、`src/types.ts` |
| 编辑/比较与模型生命周期 | `src/components/EditorPane.tsx` |
| Markdown 沉浸编辑与源块保真 | `src/components/ImmersiveEditor.tsx`、`src/lib/immersiveMarkdown.ts`、`src/immersive.css` |
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
- 已有持续运行的 Markdown 预览/HTML 导出和 JSON 导出 Playwright 回归；其他格式与完整桌面 UI 按改动范围补验证。历史截图不证明本次行为。
- 原生目录导入当前最多 1000 个文件、每个文件最多 5 MiB；工作区会话尚未持久化，目前只持久化界面语言。

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

## 历史验证与发布记录：2026-11-07 v0.1.0

- 日期：2026-11-07（Asia/Shanghai）；Windows x64，Node `22.14.0`、npm `10.9.2`、Rust/Cargo `1.99.1`。
- `npm ci --prefer-offline --no-audit --no-fund`：通过；`npm run check`、`npm run build`：通过，保留已有大于 500 kB 的 chunk 警告。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --target-dir ../environment/cargo-target`：4 个测试通过。`--target-dir` 是本机缓存选项，新电脑可省略。
- `npm run tauri:build -- --no-sign`：通过，重新生成 Windows x64 EXE 与 NSIS；本次构建临时指定本机 `CARGO_TARGET_DIR`，不依赖历史 EXE。
- 新 EXE 启动检查：进程运行、有原生窗口句柄、`Responding = True`，产品版本 `0.1.0`，`NotSigned`。只关闭了本次启动的测试进程，没有操作用户已运行的应用。本次没有重做完整界面回归。
- 工作流 YAML 解析、版本校验、打包脚本和 ZIP 双文件内容/EXE 一致性：通过；上传候选文件未检出常见 token/私钥模式，依赖和缓存目录已排除。
- 已推送源码：`6e663c9456ed22a986e2e824ce6db2b0fcb5acff`（标签 `v0.1.0`）。后续发布确认只修改文档，源码和发布标签不变。
- 云端 [CI #42384077811](https://github.com/walcracia/muleditor/actions/runs/42384077811)：已成功，包含全新依赖安装、版本检查、前端检查/构建与 Rust 测试。
- 前端产物：`muleditor-web-6e663c9456ed22a986e2e824ce6db2b0fcb5acff`，下载入口为上述 CI 的 Artifacts（需登录）；保留 30 天，当前到期时间 2026-12-07 23:01 Asia/Shanghai。前端产物需 HTTP 服务器运行。
- [Windows Release #42384087359](https://github.com/walcracia/muleditor/actions/runs/42384087359)：已成功，在全新 Windows 环境从 `v0.1.0` 构建并公开发布。Windows Actions 备份产物保留 30 天；长期入口为下表的 Release。
- 已实际下载 [正式 Release](https://github.com/walcracia/muleditor/releases/tag/v0.1.0) 的全部三个附件，两个程序包与 `SHA256SUMS.txt` 完全匹配。ZIP 仅包含 `README.txt` 和 `哞-编辑器.exe`；README 的源提交与标签一致。
- 下载版程序启动验证：窗口标题 `哞-编辑器`、窗口句柄非零、进程响应正常、版本 `0.1.0`、签名 `NotSigned`。EXE SHA-256：`690538427136b68311f22e4b789b1b9fe01705f298fd2680812892f998e13055`。未运行安装器安装流程，也未重做完整 UI 回归。
- CI 前端 artifact 也已实际下载，含 `index.html` 与 65 个 assets 文件。正式包的校验值对应云端构建，不能拿历史或本机另一次构建的二进制哈希替代。
- 本确认提交仅更新文档，使用 `[skip ci]` 避免重复编译；所关联的源提交、已通过的 CI 与可下载 Release 均为上述版本。源码、配置或依赖改动仍按正常 CI/发布流程验证。
- Git 交接：`main` 已推送，包含本交接的提交为最新文档确认提交；本地没有未提交的源码工作。获取精确确认提交运行 `git log -1`；正式发布源提交固定为 `6e663c9456ed22a986e2e824ce6db2b0fcb5acff`。

| 可下载附件 | 已下载验证的 SHA-256 |
| --- | --- |
| [便携 ZIP](https://github.com/walcracia/muleditor/releases/download/v0.1.0/MulEditor-0.1.0-windows-x64-portable.zip) | `2f50da432bae363c3833eaca2df62caee607bbe336286c3a32dbfff92de501d3` |
| [Windows 安装包](https://github.com/walcracia/muleditor/releases/download/v0.1.0/MulEditor-0.1.0-windows-x64-setup.exe) | `7b902fdaf3c7f5011d0b736a152a34b2d1fa448b1989a0f1e1ea0b1fd76db0e7` |
| [SHA256SUMS.txt](https://github.com/walcracia/muleditor/releases/download/v0.1.0/SHA256SUMS.txt) | `ddf1aebf869c74d5ec0e683ab9654a9b0bb50aadd191a85ab52bc0c3d4db0803` |
