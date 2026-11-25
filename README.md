# 哞-编辑器 / MulEditor

本地文件优先的多格式文档编辑器，使用 Tauri 2、React、TypeScript、Vite 和 Monaco。支持 Markdown、HTML、XML、YAML、JSON 和 SPDX 文档的编辑、预览、格式化、基础诊断、目录导航及只读文件比较。

Markdown 支持 KaTeX 公式（`$...$`、`$$...$$`、`\(...\)`、`\[...\]` 及 `math` 代码块）、预览代码高亮、脚注、标题锚点与 Mermaid。标题大纲和链接共用语法解析，重复标题生成独立锚点；原始 HTML 经过净化。

Markdown 默认打开**沉浸模式**：直接在排版后的文档中编写，使用功能栏修改选中文字或插入节点，也可在行首输入 `# `、`- `、`1. `、`> ` 等建立结构。列表回车续项、空项回车退出；表格可直接编辑单元格。公式、图表、图片等节点提供内容或属性编辑入口。

点击**源代码模式**使用 Monaco 编辑 Markdown 原文。两个模式共用一份文档，切换本身不会改写内容或标记为已修改；真实编辑时保留未修改块的原始写法，复杂扩展片段保留原文并提供局部编辑。HTML 继续使用源码编辑与渲染预览；XML、YAML、JSON、SPDX 继续使用源码编辑与结构化查看。

本地图片使用相对于 Markdown 文件的路径；桌面模式直接读取，浏览器模式请导入包含文档和图片的文件夹，或同时选择文档及图片。每张图最大 10 MiB。浏览器不能读取未选择的本机文件；同名目录重新导入会替换该目录的文件映射。

导出的 HTML 复用完整渲染流程，内嵌图片、图表、代码样式和 KaTeX 字体，可独立离线查看；隐藏预览也能导出。缺失、损坏、超限或无法内联的图片会明确阻止导出，便于修正后重试。

代码与交接的统一入口：[walcracia/muleditor](https://github.com/walcracia/muleditor)。任何电脑和 AI agent 都从仓库中的版本、设计与交接记录恢复工作。

## 下载与使用

前往 [GitHub Releases](https://github.com/walcracia/muleditor/releases) 下载已发布版本，在对应版本的 Assets 中选择：

当前已验证版本：[v0.3.0](https://github.com/walcracia/muleditor/releases/tag/v0.3.0)（[便携 ZIP](https://github.com/walcracia/muleditor/releases/download/v0.3.0/MulEditor-0.3.0-windows-x64-portable.zip) · [安装包](https://github.com/walcracia/muleditor/releases/download/v0.3.0/MulEditor-0.3.0-windows-x64-setup.exe) · [校验清单](https://github.com/walcracia/muleditor/releases/download/v0.3.0/SHA256SUMS.txt)）。

- `MulEditor-{version}-windows-x64-setup.exe`：Windows x64 安装包。
- `MulEditor-{version}-windows-x64-portable.zip`：解压后运行的便携包。
- `SHA256SUMS.txt`：产物 SHA-256 校验值。

使用 PowerShell 的 `Get-FileHash <下载文件> -Algorithm SHA256` 与清单比对。便携程序需要系统具备 WebView2 Runtime。当前桌面包不签名；其他系统的桌面包暂未提供。Monaco 源代码编辑区目前从 jsDelivr CDN 加载，需要能访问该 CDN；Markdown 沉浸编辑组件随应用打包，整套应用完全离线运行仍是待办事项。

每次推送的前端构建结果也可从 [Actions](https://github.com/walcracia/muleditor/actions) 对应成功运行的 Artifacts 下载。Actions 产物有保留期，通常需要登录 GitHub；长期下载和 Windows 桌面程序请使用 Releases。源码可通过仓库的 Code → Download ZIP 获取，AI 接续开发应使用 Git clone，以保留分支和提交历史。

## 三项长期约定

1. **方便 AI 迭代**：保留可安装的依赖锁文件、清晰的模块入口、执行命令、设计决策和真实验证结果。变更代码时同步必要文档。
2. **方便不同电脑的 AI agent 交接**：每次交接先提交并推送代码和文档；记录分支、基准提交、完成范围、未完成项、阻塞及下一步。不依赖某台电脑的绝对路径、聊天记录或缓存。
3. **生成物可下载**：每次更新提供可下载的 CI 构建产物；正式版本使用 Git tag 和 GitHub Release，附版本、源提交、构建说明及校验值。源码与二进制分开管理，禁止仅把生成物留在本地。

这三项约定同时约束 [AGENTS.md](AGENTS.md)、[设计与进度](docs/design_progress.md) 和 [交接记录](docs/HANDOFF.md)。

## 新电脑开始开发

按 `AGENTS.md` → `README.md` → `docs/HANDOFF.md` → `docs/design_progress.md` → `docs/RELEASING.md` 的顺序阅读；以最新提交中的现行说明为准，历史日志仅作背景。

前端需要 Git、Node.js 22 LTS 和 npm。Windows 桌面开发还需要 Rust stable 的 MSVC 工具链、Visual Studio Build Tools 的“使用 C++ 的桌面开发”及 Windows SDK、WebView2 Runtime。首次打包需要联网下载 Tauri/NSIS 工具；不要依赖旧电脑的本地下载镜像。

```powershell
git clone https://github.com/walcracia/muleditor.git
cd muleditor
git switch -c agent/my-task
npm ci
npm run check
npm run build
npm test
```

仅调试前端：

```powershell
npm run dev
```

打开 `http://127.0.0.1:6400`。浏览器模式使用文件选择和下载实现文件操作；桌面模式使用原生文件对话框和 Rust 文件访问命令。

调试与验证 Windows 桌面：

```powershell
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri:dev
```

构建发布包：

```powershell
npm run tauri:build -- --no-sign
$sourceCommit = git rev-parse HEAD
pwsh -NoProfile -File ./scripts/package-release.ps1 -SourceCommit $sourceCommit
```

产物进入 `release/github/`；该目录不进 Git。正式发布前确保工作区干净、二进制来自该提交，并按 [交接文档](docs/HANDOFF.md) 检查构建结果和版本来源。只有前端环境的电脑可以进行前端迭代，但必须交代尚未执行的桌面检查。

## 代码入口

| 路径 | 用途 |
| --- | --- |
| `src/App.tsx` | 文档标签、工作台状态与命令编排 |
| `src/components/` | 编辑器、Diff、预览、工具栏及侧栏 |
| `src/components/ImmersiveEditor.tsx`、`src/lib/immersiveMarkdown.ts`、`src/immersive.css` | Markdown 沉浸编辑、原文保留、特殊节点与编辑样式 |
| `src/lib/formatAdapters.ts` | 各格式的分析、引用、导航和片段入口 |
| `src/lib/formatAnalyzers.ts`、`workspaceExtractors.ts` | 格式诊断、目录及跨文件引用提取 |
| `src/lib/fileAccess.ts`、`exporters.ts` | 桌面文件桥接、浏览器下载与导出 |
| `src/lib/i18n.ts` | 中文/英文界面文本 |
| `src/main.tsx` | React 启动与 Monaco 运行时版本 |
| `src/lib/markdown.ts`、`markdownSanitize.ts`、`mermaid.ts` | Markdown 标题/脚注解析、统一渲染、HTML/SVG 净化和图表 |
| `src/lib/markdownResources.ts`、`markdownExportStyles.ts`、`src/markdown.css` | 图片解析、自包含导出字体和共享阅读样式 |
| `src-tauri/src/lib.rs` | 文件/文件夹读取、保存、启动参数、拖放与 HTML 预览窗口 |
| `src-tauri/tauri.conf.json` | 桌面窗口、版本、端口和打包配置 |
| `.github/workflows/`、`scripts/` | 持续验证、下载产物与发布流程 |

当前能力与已知限制以 [HANDOFF](docs/HANDOFF.md) 为准。JSON Schema、XSD/DTD 与完整 SPDX 语义校验不应被描述为已经实现。

## 更新与发布

在独立分支完成改动并验证，同步设计记录和交接文档后提交推送。并行 agent 各用自己的分支，合并前检查远端变化，禁止强推覆盖其他电脑的成果。结束时提供提交/PR 链接、验证结果和下载入口。

普通 push/PR 由 CI 生成下载产物；正式版本在更新 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 和 `src-tauri/tauri.conf.json` 中的项目版本后，创建新的 `v{version}` tag 并推送。发布工作流会构建 Windows 安装包、便携 ZIP 和校验清单。不要移动已发布 tag 或悄悄替换同版本资产；修复应使用新版本。发布状态与下载链接须回填交接文档。
