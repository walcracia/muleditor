# 哞-编辑器 Design And Progress

Last updated: 2026-11-26 Asia/Shanghai

## AI 迭代、多电脑交接与下载发布（长期设计约束）

以下三条来自项目所有者的要求，适用于每一次更新，必须同时落实在设计、交接和实际交付中：

1. **方便 AI 迭代代码。** GitHub 仓库 `https://github.com/walcracia/muleditor` 是共享源码与文档入口。提交完整源码、依赖锁文件、构建脚本和必要设计资产。根 `AGENTS.md` 是所有 AI agent 的工作规范；新增或变更功能时同步记录设计原因、改动入口和验证证据。
2. **支持不同电脑上的 AI agent 轮流接手。** 所有必要上下文必须进 Git；不能依赖聊天记录、个人记忆、特定盘符、本机缓存或未推送的提交。接手顺序为 `AGENTS.md` → `README.md` → `docs/HANDOFF.md` → 本文档 → `docs/RELEASING.md`。交接必须说明当前分支/基线、已完成项、实际验证命令与结果、未验证项/阻塞、按优先级排列的下一步、产物与下载位置。交接文档与代码同一批提交，确认推送后才算远程交接完成。
3. **生成物可下载。** 正式 Windows 交付包含版本化 NSIS 安装包、便携 ZIP 和 SHA-256 清单，发布到 GitHub Releases；每个发布标签能追溯到源码提交。CI 的网页构建产物和 Windows 包提供 Actions artifact 下载，需注明保留时间；Release 是长期下载入口。不能只给出某台电脑的本地 EXE 路径。

### 统一仓库与架构入口

- `src/App.tsx`：工作台状态、文档生命周期、命令编排。
- `src/components/`：编辑器、预览、工具栏、导航栏、侧栏等界面组件。
- `src/lib/formatAdapters.ts`：格式能力入口；`formats.ts`、`formatAnalyzers.ts`、`workspaceExtractors.ts`、`spdx.ts` 等实现各格式能力。
- `src/lib/fileAccess.ts` / `exporters.ts`：浏览器与桌面文件操作、导出。
- `src-tauri/src/lib.rs`：Rust 文件、文件夹、预览和桌面命令，含单元测试。
- `package-lock.json` / `src-tauri/Cargo.lock`：必须提交并使用的依赖锁文件。Node 主版本见 `.nvmrc`。
- `.github/workflows/`：CI 与标签发布；`scripts/package-release.ps1`：本机和 CI 共用的标准包生成器。

源码内使用相对路径。`node_modules/`、`dist/`、`src-tauri/target/`、`src-tauri/gen/schemas/`、`.codex/`、`release/` 与个人凭据不入 Git；文档引用的小型截图保留。旧进度中的 `E:`/`D:` 路径、PID、临时镜像、哈希与验证结果仅是历史记录，不是新电脑的安装前提或当前版本证明。

### 每次迭代的完成条件

- 开始前查看 Git 状态和远端最新提交；有未提交工作先保护它，使用独立任务分支。多电脑同时开发使用不同分支/PR，禁止盲目覆盖、重置或强推共享历史。
- 使用 `npm ci` 恢复前端依赖；执行 `npm run check`、`npm run build`，原生路径执行 `cargo test --locked --manifest-path src-tauri/Cargo.toml`。涉及交互时另做针对性的界面验证，涉及打包时验证实际包内容、版本和哈希。
- 无法执行的检查写明原因。历史测试与缓存产物不能冒充当次通过；不能把一次成功构建解释成界面功能已全面验证。
- 同步更新本文档的设计/进度，以及 `docs/HANDOFF.md` 的当前状态和下一步。提交后推送代码、文档与分支，记录可解析的提交/标签、CI/Release 链接及遗留问题。
- 每次共享更新由 CI 提供可下载构建；正式版本递增 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 中的自身版本与 `src-tauri/tauri.conf.json`，创建新 `vX.Y.Z` 标签。已发布标签和资产保持不变；修复发布新版本。

### 当前产品与发布边界

- 已实现的 local-first 指文档编辑和保存以本地为中心。Monaco 当前仍从 jsDelivr CDN 加载，不能承诺完全离线；详见 `src/main.tsx`。
- Windows x64 是当前验证和发布目标，macOS/Linux 原生依赖与安装包尚未验证。
- 当前安装包未签名；便携 EXE 仍需要系统 WebView2。语法/结构检查不等于完整 JSON Schema、XSD 或 SPDX 语义验证。
- 具体的最新构建状态、下一步和下载指针以 `docs/HANDOFF.md` 为准；发布操作见 `docs/RELEASING.md`。

## Context Recovery Protocol

When context is compressed or a new session starts, follow the reading order above, beginning with root AGENTS.md.
This is the project-level design and progress entrypoint. Keep future design changes, implementation decisions, and test results here instead of creating module-specific progress files. Keep the current operational handoff in docs/HANDOFF.md.

Current project state:
- Workspace: the cloned repository root (no required drive letter or sibling environment directory)
- Product form: local-first desktop editor
- Tech choice: Tauri + React + Vite + Monaco Editor
- Primary formats: Markdown, HTML, XML, YAML, JSON, SPDX
- Visual concept asset: `docs/assets/muleditor-workbench-concept.png`

## Product Positioning

哞-编辑器 is a local-first structured document workbench for people who edit technical documentation, configuration files, package metadata, and compliance artifacts.

The product should not become a general IDE. It should feel like a focused editor for document and configuration workflows:
- open local files and folders
- edit multiple files in tabs
- preview or inspect structured content
- validate syntax and schema rules
- format files consistently
- export or save in predictable ways
- compare changes before writing output

## Supported Formats

### Markdown

Core behavior:
- source editing through Monaco
- live preview
- Mermaid fenced diagram rendering with localized error fallback
- document outline from headings
- front matter detection
- export to HTML

Later advanced behavior:
- table editing helper
- broken link and image reference checks
- PDF export after print/export pipeline is added

### HTML

Core behavior:
- syntax highlighting
- live preview in a sandboxed pane
- DOM outline
- formatting

Later advanced behavior:
- resource reference checks
- clean HTML export
- accessibility hints

### XML

Core behavior:
- syntax highlighting
- parsing errors in Problems panel
- tree outline
- formatting

Later advanced behavior:
- XPath search
- XSD/DTD validation
- node-focused inspector

### YAML

Core behavior:
- syntax highlighting
- parsing errors in Problems panel
- path outline
- formatting

Later advanced behavior:
- JSON Schema validation
- duplicate key detection
- configuration templates

### JSON

Core behavior:
- syntax highlighting
- parsing errors in Problems panel
- tree outline
- formatting

Later advanced behavior:
- JSON Schema validation
- JSONPath search
- minify / prettify export options

### SPDX

SPDX support should cover practical software bill of materials workflows.

Initial scope:
- support `.spdx`, `.spdx.json`, and `.spdx.yaml` detection
- treat SPDX JSON as JSON plus SPDX profile metadata
- treat SPDX YAML as YAML plus SPDX profile metadata
- provide a metadata summary panel for document name, SPDX version, data license, packages, files, relationships, and creators when parsable

Later advanced behavior:
- SPDX 2.3 validation
- SPDX 3.x profile awareness
- package/license relationship graph
- license expression validation
- export normalized SPDX JSON/YAML

## Primary Interface

The first app surface is a desktop workbench:
- top toolbar: open, save, export, preview, format, validate, diff
- left sidebar: project/file tree and recent files
- center: Monaco editor with tabs
- right sidebar: outline, schema/profile summary, document metadata
- bottom panel: Problems, Search, Export log

Interaction principles:
- preserve editor density; avoid marketing-page layout
- use split panes and stable panel widths
- keep status visible for file path, dirty state, detected format, cursor position, and validation state
- make all core controls code-native and keyboard-accessible

## Architecture Design

### Desktop Shell

Use Tauri for filesystem access and desktop packaging.

Rust responsibilities:
- open file dialog
- save file dialog
- read file contents
- write file contents
- basic filesystem metadata
- future: folder tree traversal, recent workspace persistence

Frontend responsibilities:
- app shell and layout
- Monaco editor model lifecycle
- format detection
- preview rendering
- parse/validate orchestration
- problems and outline state

### Frontend Stack

Use React + Vite for the UI.

Key libraries:
- `@monaco-editor/react` for editor integration
- `@tauri-apps/api` for desktop IPC
- `markdown-it` plus anchor/footnote/task-list plugins for Markdown parsing and navigation
- KaTeX and highlight.js for formulas and preview code highlighting
- DOMPurify for Markdown HTML/SVG purification
- `prettier` plus parser plugins for formatting
- `yaml` for YAML parsing

XML parsing and SPDX validation will start with lightweight local parsing. Heavier validation can be added behind feature modules once the shell is stable.

### State Model

Main state entities:
- `DocumentTab`: id, path, name, content, originalContent, format, dirty, diagnostics
- `DocumentFormat`: markdown, html, xml, yaml, json, spdx-json, spdx-yaml, spdx-tag-value, unknown
- `Diagnostic`: severity, message, line, column, source
- `OutlineItem`: label, path, kind, line, children
- `ExportTask`: source tab, target format, destination, status, log

## Implementation Plan

Phase 1: project bootstrap
- create React + Vite app
- add Tauri source tree and configuration
- install Monaco, Tauri API, Markdown, YAML, and formatting dependencies
- create baseline app shell

Phase 2: editor workbench
- implement split layout
- implement tab state
- implement sample seed documents for all supported formats
- integrate Monaco
- implement format detection

Phase 3: local file operations
- add Tauri commands for opening and saving files
- wire toolbar open/save/save as actions
- keep dirty state accurate

Phase 4: format intelligence
- Markdown preview and outline
- HTML preview and DOM-ish outline
- JSON/YAML parsing, formatting, and outline
- XML parse error detection and outline
- SPDX profile summary for JSON/YAML SPDX files

Phase 5: verification
- run TypeScript/build checks
- run Tauri frontend build
- use browser verification for the local UI
- record test results here

## Implementation Notes

Current implementation files:
- `package.json`: npm scripts and frontend/Tauri dependencies
- `src/App.tsx`: workbench state and command orchestration
- `src/components/*`: toolbar, file sidebar, tabs, editor, preview, inspector, problems, status bar
- `src/lib/formats.ts`: format detection and Monaco language mapping
- `src/lib/analyze.ts`: Markdown, HTML, XML, YAML, JSON, and SPDX analysis
- `src/lib/formatters.ts`: format actions
- `src/lib/exporters.ts`: browser/Tauri export payloads
- `src/lib/fileAccess.ts`: Tauri dialog and Rust command bridge
- `src-tauri/*`: Tauri v2 shell, config, capabilities, and read/write commands

Known implementation boundary:
- Browser fallback supports opening through a hidden file input and saving/exporting through browser downloads.
- Tauri runtime path supports native open/save dialogs plus Rust `read_text_file` and `write_text_file` commands.
- Full Tauri desktop build now works on this machine after installing Rustup and using a local mirror for Tauri bundler tools.

## Progress Log

### 2026-11-26 模式切换保留编辑位置（0.3.4）

源码编辑到文档后部时，切回沉浸模式应显示光标对应的段落或特殊节点，避免重新从文章开头寻找。两种模式以同一文档的源码位置交换定位信息，使用已有源码块映射；不以两种视图的滚动百分比推测位置。反向切换也应回到对应源码，定位仅改变选区/视口，不修改文档、dirty 状态或已有撤销记录。空行和不可直接编辑的原始/图表节点可定位到相邻或所属块。

实现通过两个编辑器的 imperative ref 在按钮点击时读取位置，避免高频光标事件驱动应用重渲染。嵌套列表/表格/代码保留 token 行范围；定位用当前源文的临时语法树转移节点路径到现有编辑模型，不用历史 sourceId 行号直接推断，也不重建现有编辑状态。复杂行内语法的列位置近似，特殊节点按块定位。可视布局完成后居中，富节点异步渲染在有界窗口内补一次定位；用户操作或文档/选区/标签/模式改变后停止旧定位。

验收使用 400 行以上文档、真实 Monaco 光标跳转及沉浸视口检查；覆盖重复段落、CRLF、源码插入行、400 项连续列表、代码、多文件位置隔离、编辑与跨模式撤销。新增 4 项映射单测；本轮类型/构建、101 前端测试、版本校验及 9 Rust 测试通过。首轮浏览器脚本误点长滚动容器导致超时，改为聚焦真实输入区后 3 项专项通过，随后完整 26 组 Edge 回归通过（58.1 秒）。原生构建和下载结果继续回填 HANDOFF。

### 2026-11-25 格式指示去重与强化高亮（0.3.3）

根据用户试用截图，0.3.2 的格式高亮与状态栏底色过近，且独立的 Markdown 文案与右侧 MD 重复。本轮删除已支持类型的独立格式文字，只由格式列表表示当前类型；具体名称及 SPDX 子类型保留在当前项悬停提示中。未知文本无对应列表项时保留文本类型提示。

当前项改为亮色实底、深色 800 字重、白色边框与 21px 高度，增加水平留白。它与深色状态栏形成明显的亮度区别，文字也有足够对比；不改变类型识别、只读属性或文档内容。

本轮类型检查、构建、97 项前端测试、版本校验、Rust check/test（9 项，`--locked -j 1`）和 17 组 Edge 浏览器回归通过。增强原有两组格式用例后再次通过，验证独立类型文字消失、六类/三个 SPDX 变体只亮一个当前项、悬停具体名称、保存原文保持、中英文 1040/1600 可见；实际颜色要求当前底色对状态栏至少 7:1、文字对底色至少 4.5:1。保留既有大 chunk 提示。

本机后续打包受系统内存不足影响，前端预构建进程异常退出，降低 Node 堆后仍明确报 Zone 内存不足；云端从发行源 `c8ab7120ee49314a6beb35e4db21695cdf57ecc1` 干净构建、打包并发布 0.3.3 成功。首次 CI 的既有多格式组合用例在同一页面第 11 次下载超时，其他 16 组通过；将七个格式的保存/导出验收拆为独立上下文，保留原断言、无重试与超时放宽，共 23 组。

发布确认：测试及交接修正 `128ac22e51e37488848ee6fc97d469154d61a1ca` 的[最终 CI](https://github.com/walcracia/muleditor/actions/runs/45591535752) 成功，97 前端、23 浏览器和 9 Rust 全通过；应用源码、依赖和打包脚本与发行源完全一致。[v0.3.3](https://github.com/walcracia/muleditor/releases/tag/v0.3.3) 三个附件及前端 artifact 已实际下载，源提交、版本、包内容、签名状态及哈希均已核对；下载版未启动，不冒充完整原生 UI 验证。完整失败与恢复证据、下载指针见 HANDOFF。

### 2026-11-25 状态栏简化与当前格式高亮（0.3.2）

用户要求不在产品界面展示 Tauri 等实现信息，并高亮当前打开文件的类型。移除状态栏运行环境字段及传入的 runtime 属性；技术栈和构建要求仍保留在开发文档。

底部六个格式标签改为只读状态项，沿用 `DocumentTab.format` 派生当前项，不引入第二份状态或改变文件类型。切换标签或内容检测结果变化时同步更新；Markdown 对应 MD，SPDX JSON/YAML/Tag-Value 均对应 SPDX，未知文本不误亮其他格式。通过颜色、字重、边框及 `aria-current` 同时表达当前状态，未选类型维持低强调。

本轮版本 0.3.2：类型检查、构建、97 项前端测试、原有 15 组与新增 2 组 Edge 浏览器回归、Rust check/test（9 项，`--locked -j 1`）及版本校验通过。真实检查八个文件覆盖六类与三个 SPDX 变体，双语/双尺寸截图验证高亮、内容保持、只读状态和运行环境标识移除。下载和云端证据完成后回填 HANDOFF；保留既有大 chunk 提示。

发布确认：源提交 `015576a15ee2ebfdf56b3f09e4671681fb3bf70c` 的 CI（97 前端、17 浏览器、9 Rust）及 Windows Release 均成功；[v0.3.2](https://github.com/walcracia/muleditor/releases/tag/v0.3.2) 三个附件已下载核对版本、签名、源提交与哈希，证据见 HANDOFF。本确认不修改已发布标签和二进制资产。

### 2026-11-25 工作区与问题面板可关闭（0.3.1）

用户在试用 0.3.0 后补充：左侧工作区和底部问题区都可以关闭。本轮仅增加布局可见性控制，不关闭文件、不改文档、保存状态或诊断数据。

- 工作区标题与问题面板标题右侧各增加关闭按钮，与现有大纲关闭按钮一致。
- 顶部同一组提供“工作区 / 问题 / 大纲”入口，支持再次打开，也能直接切换。关闭后焦点返回对应入口；`aria-expanded`、`aria-controls` 及中英文提示同步。
- 左侧关闭后编辑区扩宽，底部关闭后编辑区增高；与大纲显示组合使用，1040px/1600px 下均不保留空白网格。面板隐藏期间诊断继续计算，再打开显示最新结果。
- 按用户补充意见，支持格式标签与操作反馈移至底部状态栏，顶部集中操作和布局按钮。窄窗口格式化/校验/对比保留图标及完整可访问名称；显示选择仅在当前运行中保留，不新增会话持久化。

版本 `0.3.1`：类型检查、97 项前端测试、构建、15 组 Edge 浏览器回归、版本校验、Rust check/test（9 项，`-j 1`）通过。实测独立关闭/重开、实际面积增长、大纲组合、dirty/内容保持、隐藏期间诊断和双语 1040/1600 布局。源码与下载结果完成后记入 `HANDOFF.md`，`v0.3.0` 的标签与附件保持不变。

发布确认：`v0.3.1` 由源提交 `45578ad83b08ff733e0c1a4cfbc6a993da9217ff` 在 Windows Release 全新构建并成功发布，三个附件已下载核对版本、签名、源提交和哈希。首轮云端 JSON 夹具触发自动补齐后，测试专用修正 `8551a87` 的 CI 全部通过（97/15/9），应用代码未变化；失败原因、修正和两次 CI 指针均保留在 HANDOFF，不改动或替换发布标签与资产。

### 2026-11-25-01 Markdown 沉浸模式与源代码模式

用户已确认本轮范围：Markdown 用可直接编辑的沉浸模式与 Monaco 源代码模式替代“编辑/预览”两块只读/可写分工。HTML 继续源码编辑及渲染预览；XML、YAML、JSON、SPDX 继续源码编辑及结构化查看，不把结构视图称为所见即所得编辑。

设计与验收约束：

- 保留 React、Monaco、多格式工作台；Markdown 默认沉浸，两个模式互斥显示，按文档保存模式选择。两种视图共同更新 `DocumentTab.content`，dirty、保存、另存为及导出仍由 App 管理。
- 沉浸编辑使用 ProseMirror 的文档、选区、事务、输入规则和撤销历史。普通文字、标题、引用、列表、任务项、表格直接编辑；工具栏针对当前选区或节点执行操作。输入标题/列表等上下文会转换结构，Enter 延续/退出列表。
- `immersiveMarkdown.ts` 从现有 Markdown 解析配置建立可编辑模型，保存原始块及分隔内容。打开与仅切换模式不序列化；真实修改时只规范化改动的块。Front Matter、引用定义、原始 HTML 和未支持的扩展保留原文，不静默丢弃。
- 公式、Mermaid、图片等特殊节点复用 `markdown.ts` 的渲染和净化流程，并提供节点内容/属性编辑入口。HTML 导出继续从权威 Markdown 源文调用完整共享管线，不从编辑 DOM 拼接，保证离线图片、字体、图表与样式。
- 只读比较保持只读。源码模式继续提供 Monaco 语法编辑、原有格式化、诊断和导航；其他格式的显示开关不变。中文/英文文案同步。

实现入口：`ImmersiveEditor.tsx` 管理 ProseMirror 生命周期、按标签缓存、语义命令、特殊节点、共享脚注渲染和节点表单；`immersiveMarkdown.ts` 复用 `tokenizeMarkdown` 建模，按顶层源块保存原文；`App.tsx` 管理模式与绑定文档的回调。源码编辑延迟挂载，加载完成时核对最新标签和可见模式，避免抢焦点或消费错误命令。比较仍只读。

本轮解决的交互边界包括：源内容回传不重建模型、跨非 Markdown 标签保留撤销、插入原子块后仍可继续输入、已有脚注编辑其真实定义、多处定义不重复显示脚注、另存目录后重新解析图片，以及 Home/Shift+End 在聚焦后的快速选区。公式、图表和图片均通过共享管线渲染；源码模式隐藏沉浸区时仍可完整导出。

保真范围：未改动的顶层块逐字保留，编辑列表/表格内的内容会规范化该整个顶层块；复杂 HTML/未知扩展保留为原文节点并提供局部编辑。源码修改或格式化后重新导入相应 Markdown 模型，会重建该文档的沉浸撤销历史。GFM 表格提供单元格、行列操作，不提供不能保存到 Markdown 的合并单元格/持久列宽。Monaco CDN、未签名 Windows 包、无会话持久化等既有限制仍适用。

版本 `0.3.0`。本轮已执行 `npm ci`、版本校验、类型检查、前端构建和 97 个前端测试；最终 Edge 浏览器回归 13 组全部通过，真实下载的 HTML 离线保留公式/字体/图表/图片与样式，净化、选区工具栏、上下文结构和源码同步均检查。快速 Home/Shift+End 连续 8 次通过；中英文 1040/1600 实际截图核查通过，证据见 `HANDOFF.md`。Rust check 通过；test 首次在本机内存紧张时分配失败，改用 `-j 1` 后 9 项全部通过，未改动 Rust 业务代码。构建仍有既有大 chunk 提示。桌面/发布状态以交接中的本轮记录为准。

发布确认：源提交 `14d3be6be1563f243c3093f697c56801a486c6e8` 的 CI 与 Windows Release 均成功，[v0.3.0](https://github.com/walcracia/muleditor/releases/tag/v0.3.0) 三个附件已实际下载并核对哈希、版本、签名与源提交；本地同源 EXE 启动通过。详细证据和边界见 HANDOFF，本确认不移动标签或替换资产。

### 2026-11-20 Markdown 统一渲染与自包含导出

- 保留 React、Monaco、多格式工作台、原生文件操作和只读 Diff；Markdown 语法层切到 markdown-it，接入 KaTeX、代码高亮、脚注和稳定的标题锚点。
- 标题提取、预览、工作区 Markdown 引用共用解析器，覆盖重复标题、Setext 标题、代码围栏及 Front Matter 行号偏移。编辑、预览和导出均不改写文档原文。
- 渲染器提供统一的异步 `renderMarkdownDocument`；先净化用户 HTML，再渲染公式、图表与图片，最后净化输出。切换标签或连续编辑取消过期任务。
- 通过受限的 Rust 图片读取命令和浏览器已导入文件映射解析相对图片，生成 data URI；不扩大 Tauri asset 协议访问范围。读取限制、缺失图片和导出错误应可见。
- 导出独立调用同一渲染管线，包含 Mermaid SVG、KaTeX、脚注、代码高亮、共享样式、内联图片与 WOFF2 字体。图片不能内联时明确失败，不生成静默缺图的文件。
- 渲染/净化/资源/导出/导航共 65 个前端测试通过，Rust 9 个测试通过；3 组真实 Edge 浏览器回归通过，覆盖下载 HTML 离线显示、快速切换、最小窗口、预览链接和 JSON 导出。`npm ci`、类型检查和生产构建通过。
- 导出图片通过签名与实际解码检查，读取/解码有超时，阻止伪图片和截断图片悄悄进入交付物；原生保存取消恢复状态。
- 截图：`docs/assets/markdown-rendering-0.2.0.png`、`docs/assets/markdown-minimum-window-0.2.0.png`。版本为 `0.2.0`；云端检查和发布结果在完成后写入 HANDOFF。
- 发布已确认：[CI](https://github.com/walcracia/muleditor/actions/runs/44686314724) 与 [Windows Release](https://github.com/walcracia/muleditor/actions/runs/44686352750) 均成功；[v0.2.0](https://github.com/walcracia/muleditor/releases/tag/v0.2.0) 三个附件实际下载校验通过。发布源提交 `86ee229e150fbb65034b1297087acebd083a1a1d`；源码与后续确认文档提交分开记录，精确下载哈希及接班第一步见 HANDOFF。

### 2026-11-07 GitHub 与多电脑 AI 交接基础设施

- 将共享仓库设为 `https://github.com/walcracia/muleditor`，保留完整源码、npm/Cargo 锁文件及 12 张历史设计/验证图；排除依赖、编译缓存、本地工具和发布二进制。
- 新增 README、根 AGENTS、`docs/HANDOFF.md`、`docs/RELEASING.md`；把 AI 可迭代、跨电脑可接班、生成物可下载三条原则写成每次更新的完成条件。
- 增加 Windows CI、标签发布与共用打包脚本，版本与源提交校验、便携包 README 来源、SHA-256、30 天 Actions 产物、长期 Release 下载均进入持续流程。
- 本次 `npm ci`、TypeScript 检查、生产构建通过（保留既有 chunk 大小警告）；Rust 4 个测试通过；重新构建 x64 EXE/NSIS，通过版本/PE/启动进程检查。没有重新执行完整 UI 回归，历史截图仅保留作历史证据。
- 首次推送已完成，发布源提交 `6e663c9456ed22a986e2e824ce6db2b0fcb5acff`，标签 `v0.1.0`；[基础 CI](https://github.com/walcracia/muleditor/actions/runs/42384077811) 与 [Windows Release](https://github.com/walcracia/muleditor/actions/runs/42384087359) 在全新 Windows 环境全部通过。
- [v0.1.0 正式下载](https://github.com/walcracia/muleditor/releases/tag/v0.1.0) 的安装包、便携 ZIP、SHA-256 清单已实际下载核对；ZIP 内双文件与源提交通过校验，下载版应用以正确窗口标题、版本和正常响应启动。源码、文档和下载链路均已落实。
- 精确下载链接/哈希、CI 产物到期时间和下一步记录在 `docs/HANDOFF.md`。发布源提交与确认文档提交分开记录；本次纯文档确认复用已验证源码产物，不重新构建或移动既有标签。

### 2026-06-10 Repackage Windows EXE

Plan:
- Rebuild the current frontend and Tauri release executable.
- Reuse the local Tauri bundler tools mirror for WiX/NSIS downloads.
- Build unsigned Windows artifacts with `npm run tauri:build -- --no-sign`.
- Smoke test the generated release executable.
- Record final artifact paths and hashes here.

Completed:
- Rebuilt current frontend and Tauri release application on Windows.
- Reused the local Tauri bundler tools mirror at `127.0.0.1:8765` during packaging.
- Built unsigned artifacts with `npm run tauri:build -- --no-sign`.
- Copied convenient release artifacts to:
  - `release/MulEditor.exe`
  - `release/MulEditor_0.1.0_x64-setup.exe`

Verification results:
- `npm run tauri:build -- --no-sign`: passed.
- Release executable smoke test: passed. `release/MulEditor.exe` started with window title `MulEditor` and responded before being closed.
- PE subsystem check: `Subsystem = 2`, `Windows GUI`.
- Bundle artifact hashes:
  - `release/MulEditor.exe`: SHA256 `54EB36B728CE2A2B1B9E6B070D1BD4E72E73272CD6003DBB1E498A41B999734F`
  - `release/MulEditor_0.1.0_x64-setup.exe`: SHA256 `195FA3E64C6BE9306639E5ED9365353DDB7F0D34C227103755254B23414937D2`
  - `src-tauri/target/release/muleditor.exe`: SHA256 `54EB36B728CE2A2B1B9E6B070D1BD4E72E73272CD6003DBB1E498A41B999734F`
  - `src-tauri/target/release/bundle/msi/MulEditor_0.1.0_x64_en-US.msi`: SHA256 `E8CF82537FFFA1EB8B7FBC2FFCAE8D64FF334DEF2294E4C646F37E5F2B027D27`

### 2026-06-09

Completed:
- Confirmed empty workspace.
- Chose React + Vite over Vue because the editor workbench benefits from componentized panes, state modules, and ecosystem fit with Monaco.
- Confirmed Node.js and npm are available.
- Found Rust toolchain is not installed in the current shell, so full Tauri desktop build may be blocked until Rust is installed. Frontend and Tauri source can still be created.
- Generated and saved UI concept reference at `docs/assets/muleditor-workbench-concept.png`.
- Created this project-level design/progress document.
- Bootstrapped React + Vite + Tauri source structure.
- Implemented first usable workbench with toolbar, file sidebar, tabs, Monaco editor, preview, inspector, Problems panel, and status bar.
- Implemented detection and baseline handling for Markdown, HTML, XML, YAML, JSON, SPDX JSON, SPDX YAML, and SPDX tag-value.
- Implemented Markdown preview with front matter stripping.
- Implemented HTML sandbox preview.
- Implemented JSON/YAML/XML/SPDX outlines and diagnostics.
- Implemented SPDX metadata summary for parsable SPDX JSON/YAML/tag-value inputs.
- Implemented browser fallback open/save/export and Tauri native command bridge.
- Fixed recursive tree layout so outline children render vertically instead of squeezing into one grid row.
- Added responsive desktop behavior: below 1360px, the preview pane is hidden to preserve editor width.

Verification results:
- `npm install`: passed, 0 vulnerabilities.
- `npm run check`: passed.
- `npm run build`: passed.
- `npm run tauri:build`: blocked because `cargo` is not installed: `program not found`.
- In-app Browser verification at `http://127.0.0.1:5173/`: passed for initial load, toolbar presence, sample tabs, Monaco visibility, Markdown preview, JSON Format/Validate/Diff path, SPDX inspector, SPDX metrics, and Problems panel.
- Browser default viewport 1280x720: editor remains readable, no horizontal viewport overflow; preview DOM is present but visually hidden by responsive CSS.
- Browser desktop viewport 1440x900: editor, preview, inspector, and bottom panel are visible with no horizontal overflow.

Verification assets:
- Concept reference: `docs/assets/muleditor-workbench-concept.png`
- Browser screenshot before responsive/tree fix: `docs/assets/muleditor-browser-verification.png`
- Browser screenshot after fix: `docs/assets/muleditor-browser-verification-desktop.png`

Next:
- Add deeper SPDX validation once a target SPDX version/profile is chosen.
- Add schema validation modules for JSON/YAML/XML.
- Add real folder tree traversal and recent workspace persistence in Tauri.

### 2026-06-09 Multi-file Format Navigation

Design:
- Add a format-specific editing/navigation rail below document tabs. It must change per active format instead of showing one generic toolbar.
- The rail should support practical advanced edit workflows for each current format:
  - Markdown: headings, front matter, links, images.
  - HTML: DOM sections, anchors, assets, forms.
  - XML: element tree, IDs, schema references, XInclude-style links.
  - YAML: paths, anchors, aliases, `$ref`, include-style references.
  - JSON: JSON paths, `$ref`, schema IDs, arrays.
  - SPDX: document IDs, packages, files, relationships, license references.
- Add workspace import by folder so multiple files of the same format can be opened together.
- Build a workspace reference index across open tabs so file-like references can jump to the referenced tab when that target is imported.
- Treat unresolved local references as workspace diagnostics instead of silently ignoring them.
- Keep implementation heuristic and local-first for now; full XSD/JSON Schema/SPDX semantic validation remains a later module.

Implementation plan:
- Extend `DocumentTab` and `OpenedTextFile` with `relativePath` and `workspaceRoot`.
- Add native folder selection and recursive supported-text-file reading in Tauri.
- Add browser folder import through a hidden `webkitdirectory` input.
- Add a `workspace` helper module to collect declarations, references, snippets, and diagnostics for Markdown, HTML, XML, YAML, JSON, and SPDX.
- Add a `FormatNavigationBar` component that can jump to lines, open referenced tabs, and insert format snippets into Monaco.
- Verify with TypeScript/build checks after implementation.

Completed:
- Added `Folder` command to the top toolbar.
- Browser runtime now exposes separate single/multiple-file input and folder input.
- Tauri runtime now supports recursive folder import through `read_text_folder`.
- Supported import extensions now include `.xsd` and `.dtd` as XML-family documents.
- Opened tabs now preserve `relativePath` and `workspaceRoot` so same-name/same-format files from a folder can be distinguished.
- Added a format-specific edit/navigation rail under tabs.
- Added per-format focus areas and insert snippets:
  - Markdown: front matter, table, link.
  - HTML: section, asset reference, anchor.
  - XML: element, schema attributes, XInclude-style reference.
  - YAML: anchors/aliases, `$ref`, sequence item.
  - JSON: `$ref`, array, `$id`.
  - SPDX JSON/YAML/tag-value: package, file, relationship.
- Added workspace reference extraction for Markdown links, HTML asset/link attributes, XML schema/DTD/XInclude-style links, YAML `$ref`/aliases/includes, JSON `$ref`-style fields, and SPDX relationships.
- Added cross-tab reference navigation when a target file or fragment can be resolved from the open workspace.
- Added workspace diagnostics for unresolved local references.
- Added sample cross-file references:
  - Markdown and YAML reference `profile.json#/limits`.
  - XML references `manifest.xsd`.
  - SPDX relationships resolve to SPDX IDs.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- `cargo check`: passed after adding the Tauri folder command.
- `cargo test`: passed, including `read_text_folder_recurses_supported_documents`.
- Browser/IAB tool was unavailable in this turn, so local UI verification used headless Chrome through DevTools Protocol.
- Browser verification at `http://127.0.0.1:5173/`: passed for initial render, `Folder` toolbar command presence, Markdown reference listing, YAML `profile.json#/limits` reference jump to `profile.json`, SPDX relationship references, SPDX-specific snippets, clean reference health, and no horizontal overflow at 1440x900.
- Verification screenshot: `docs/assets/muleditor-format-nav-verification.png`

### 2026-06-09 Toolbar Visual Style And Locale Switch

Design:
- User requested the format navigation bar to look closer to common editor toolbars from the supplied references:
  - compact icon/short-label buttons
  - grouped controls with vertical dividers
  - Markdown-style `H1`, `H2`, `B`, italic, code, list, link, image, horizontal-rule controls
  - an edit/preview mode row and content type affordance similar to the second reference
- Add a Chinese/English UI switch. It should cover app chrome, toolbar labels, panel headers, status text, format names, and format-specific edit toolbar labels.

Implementation plan:
- Replace `FormatNavigationBar` visual structure with a two-row toolbar:
  - mode row: active format edit mode, preview toggle, content type.
  - tool strip: per-format edit action buttons, then reference buttons, outline buttons, and reference health.
- Keep the existing cross-file reference navigation behavior.
- Add a lightweight `i18n` helper with `zh` and `en` strings.
- Thread `locale` through app chrome components instead of hardcoding English labels.
- Add a language toggle to the top toolbar.
- Verify build, desktop browser layout, language switching, and reference navigation after the restyle.

Completed:
- Reworked `FormatNavigationBar` into a two-row editor toolbar matching the supplied references:
  - first row: active format edit tab, preview tab, content type control.
  - second row: compact icon/short-label editing buttons with separators and reference/navigation actions.
- Markdown toolbar now uses reference-like controls: emoji, `H1`, `H2`, `B`, italic, strike, link, list, ordered list, task, quote, code, image, horizontal rule.
- Added format-specific toolbar button sets for HTML, XML, YAML, JSON, SPDX JSON/YAML/tag-value.
- Preserved cross-file reference jump behavior in the new toolbar.
- Added `src/lib/i18n.ts` with Chinese and English UI strings.
- Added top-toolbar language toggle; locale is persisted in `localStorage`.
- Localized major app chrome:
  - top toolbar
  - format navigation row
  - workspace panel
  - tabs format labels
  - preview empty states and SPDX metrics
  - inspector headers and SPDX metadata labels
  - Problems/Search/Export Log tabs
  - status bar
  - operation status messages

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- Browser/IAB tool was unavailable in this turn, so local UI verification used headless Chrome through DevTools Protocol.
- Browser verification at `http://127.0.0.1:5173/`: passed for Chinese default UI, English toggle, Markdown toolbar button layout, YAML `profile.json#/limits` reference jump to `profile.json`, reference health display, and no horizontal overflow at 1440x900.
- Verification screenshots:
  - Chinese: `docs/assets/muleditor-toolbar-locale-verification-zh.png`
  - English: `docs/assets/muleditor-toolbar-locale-verification.png`

### 2026-06-09 Desktop Packaging

Completed:
- Installed Rustup through `winget install --id Rustlang.Rustup -e --accept-package-agreements --accept-source-agreements`.
- Confirmed toolchain:
  - `cargo 1.96.0`
  - `rustc 1.96.0`
  - `tauri-cli 2.11.2`
- Generated Tauri app icon assets under `src-tauri/icons/`.
- Updated `src-tauri/tauri.conf.json`:
  - changed identifier from `com.muleditor.app` to `com.muleditor.desktop`
  - added explicit bundle icon list including `icons/icon.ico`
- Built release executable:
  - `src-tauri/target/release/muleditor.exe`
- Generated Windows installers:
  - `src-tauri/target/release/bundle/msi/MulEditor_0.1.0_x64_en-US.msi`
  - `src-tauri/target/release/bundle/nsis/MulEditor_0.1.0_x64-setup.exe`
- Generated portable zip:
  - `release/MulEditor-0.1.0-windows-x64-portable.zip`
  - rebuilt after final MSI/NSIS packaging so it contains the final `muleditor.exe`

Packaging notes:
- `winget install --id WiXToolset.WiXToolset` required administrator permission and was not used.
- `winget install --id NSIS.NSIS` was cancelled by the system-side installer flow and was not used.
- Tauri's built-in GitHub downloader timed out for WiX/NSIS tools, so a local temporary HTTP mirror was used through `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR_TEMPLATE`.
- Local mirror inputs were stored under `.codex/tauri-tools/mirror/` for this packaging run.
- The temporary server on `127.0.0.1:8765` was stopped after packaging.
- Installers were built with `--no-sign`; they are unsigned.

Verification results:
- `npm run tauri:build -- --no-sign`: passed and produced both MSI and NSIS bundles.
- Release executable smoke test: passed. `muleditor.exe` started, showed window title `MulEditor`, and responded before the test process was closed.
- Bundle artifact hashes:
  - `src-tauri/target/release/muleditor.exe`: SHA256 `99958CC1A08CF40577306BCCA8F1AA339DE16F7D503AEF54D00C9A5D82657BDF`
  - `src-tauri/target/release/bundle/msi/MulEditor_0.1.0_x64_en-US.msi`: SHA256 `7A8624F984ACDD3F0F670B8CB8B45D73622EFEAA5504965819EB1C172CA11E1F`
  - `src-tauri/target/release/bundle/nsis/MulEditor_0.1.0_x64-setup.exe`: SHA256 `DD1E62D86B0F6DBE204A0C995A2FD0CD6046B7B59A606805D1B640D7AFB49AF4`
  - `release/MulEditor-0.1.0-windows-x64-portable.zip`: SHA256 `B338C71F4CB0A873C37789332BDEB94D542A8E5769996DE12FA6C4768EC05BF3`

Next packaging improvements:
- Add code signing before distributing installers externally.
- Decide whether to keep both MSI and NSIS or standardize on one Windows installer type.
- Consider configuring manual chunks for Monaco if installer size or frontend bundle warnings matter.

### 2026-06-09 Hide Console Window

Completed:
- Added `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` to `src-tauri/src/main.rs`.
- Rebuilt MSI, NSIS, release EXE, and portable ZIP.
- Updated portable README to mention the Windows GUI subsystem.

Behavior:
- Release builds use Windows GUI subsystem and should not show a CMD/console window on normal double-click, installer launch, Start Menu launch, or portable EXE launch.
- Development mode still runs through the developer terminal when using `npm run tauri:dev`; that is expected and useful for logs.
- If a user launches the app through a custom `.bat` or `.cmd` wrapper, that wrapper can still show a console window. Use the EXE directly or a Windows shortcut to avoid that.

Verification results:
- PE header check on `src-tauri/target/release/muleditor.exe`: `Subsystem = 2`, `Windows GUI`.
- Portable EXE smoke test: passed. `MulEditor.exe` started, showed window title `MulEditor`, and responded before the test process was closed.

### 2026-06-09 Single-row Toolbar And Full UI Locale

Design:
- User clarified that all visible interface text must support Chinese/English switching.
- The format navigation bar should follow the second supplied compact single-row toolbar reference instead of the previous two-row edit/preview/content-type header.
- The Problems panel rows must localize severity, source labels, and known diagnostic messages such as unresolved workspace references and YAML parser errors.

Implementation plan:
- Add display-layer diagnostic localization helpers in `src/lib/i18n.ts`.
- Update `ProblemsPanel` so diagnostic severity/source/message are rendered through i18n.
- Replace the two-row `FormatNavigationBar` markup with one compact icon/short-label row grouped by dividers.
- Resize editor layout CSS from a 78px nav band to a single toolbar-height band.
- Run TypeScript/build checks and browser-rendered verification after the edits.

Completed:
- Replaced the previous two-row format navigation component with a compact single-row toolbar.
- Markdown toolbar now follows the supplied icon/short-label pattern: emoji, heading, bold, italic, strike, link, list, task, quote/send, rule, code, upload/media, table, and utility icons grouped by dividers.
- HTML, XML, YAML, JSON, and SPDX still receive format-specific edit actions in the same single-row toolbar model.
- Preserved cross-file reference navigation and unresolved-reference health signaling in the single-row layout.
- Added diagnostic display localization helpers:
  - severity labels: `ERROR/WARNING/INFO` and `错误/警告/信息`
  - source labels such as `Workspace` and `工作区`
  - unresolved workspace references
  - common JSON/XML/YAML parse messages, including multi-line YAML parser context.
- Updated Problems panel rows to render localized diagnostic severity, message, and source.
- Localized additional interface text in tab aria labels, close titles, supported-format rail labels, and HTML preview titles.
- Reduced the editor navigation band from 78px to 44px.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- In-app Browser verification at `http://127.0.0.1:5173/`: passed.
- Verified Chinese UI default after reset: top toolbar, bottom tabs, app language attribute, and single-row format toolbar.
- Verified English toggle: top toolbar and bottom tabs switch to English.
- Verified Problems row localization:
  - English diagnostic row keeps parser/source messages in English.
  - Chinese diagnostic row translates severity, workspace source, unresolved `$ref` reference, and multi-line YAML parser messages.
- Verified toolbar structure:
  - `.formatNavLine` count is 1.
  - old `.formatNavShell` count is 0.
  - toolbar measured 44px high in the browser.
- Verified no horizontal viewport overflow at the default 1280x720 browser viewport.
- Browser session was reset to Chinese and clean sample documents after temporary diagnostic checks.

### 2026-06-10 New Document And Built-in HTML Preview

Design:
- Add a first-class New action to the top toolbar, placed with file operations before Open.
- New documents should follow the currently active format so users can quickly create Markdown, HTML, XML, YAML, JSON, or SPDX files without losing the format-specific editing context.
- HTML preview should keep the embedded side preview, but add an explicit action that opens the current HTML document in a dedicated Tauri WebView window.
- Desktop HTML preview should support a local-file base path when the tab has a filesystem path, so relative images, stylesheets, scripts, and links resolve more like a real browser preview.
- Browser development mode should keep a fallback using a Blob-backed tab so the same UI flow can still be validated without Tauri.

Implementation plan:
- Add localized toolbar/status/preview strings for New and Open in built-in browser.
- Add format-aware new-document templates and unique untitled names in `App.tsx`.
- Add an HTML preview action button in `DocumentPreview`.
- Add a Tauri command that writes the current HTML to a temporary preview file, injects a local base URL when possible, and opens that file in a new built-in WebView window.
- Run TypeScript/build/Rust checks and rendered browser validation after implementation.

Completed:
- Added a localized New button before Open in the top file-operation toolbar.
- New documents now use the active tab's format and receive format-aware starter templates for Markdown, HTML, XML, YAML, JSON, SPDX JSON, SPDX YAML, and SPDX tag-value.
- New untitled filenames are de-duplicated, including compound SPDX extensions such as `.spdx.json`.
- Added a localized HTML preview toolbar with an "open in built-in browser" action.
- Added `open_html_preview_window` Tauri command:
  - writes current HTML into the OS temp directory under `muleditor-html-preview`
  - injects a `<base href="file://.../">` tag when the source tab has a local path and the document does not already define a base tag
  - opens the temp HTML in a dedicated Tauri WebView window
  - uses nanosecond labels for repeated preview-window opens
- Browser dev mode keeps a Blob-backed fallback for preview opening.
- Synced updated release artifacts to `release/`.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- `cargo fmt --manifest-path src-tauri\Cargo.toml --check`: passed.
- `cargo check --manifest-path src-tauri\Cargo.toml`: passed.
- `cargo test --manifest-path src-tauri\Cargo.toml`: passed with 2 tests.
- `npm run tauri:build -- --no-sign`: passed and rebuilt release EXE, MSI, and NSIS bundles.
- In-app Browser verification:
  - Port `5173` was occupied by another local app, so MulEditor was verified on fixed port `4273`.
  - Verified app identity, New button presence, Chinese toolbar text, and editor tab creation.
  - Verified HTML preview DOM renders a preview toolbar and localized built-in browser button.
  - The Browser runtime blocked the actual preview-open click because it triggers a popup/new page; no workaround was attempted.
  - Browser screenshot capture later timed out, so final visual screenshot evidence was not collected in this run.
- Release artifact hashes:
  - `release/MulEditor.exe`: SHA256 `B41A00603AD22028CE44DE49CF3758FE394BFF59933472D1D91BB2BA8DE1B50B`
  - `release/MulEditor_0.1.0_x64-setup.exe`: SHA256 `30A7FBA1729F3B407FFFBC642088FEEEDCDFB9620006E833A888A86DE4C3FB9F`
  - `release/MulEditor-0.1.0-windows-x64-portable.zip`: SHA256 `9FB4A43CC03547F50FD0112754DA8D808240DD1749382727C712DEFDD7169D55`
  - `src-tauri/target/release/bundle/msi/MulEditor_0.1.0_x64_en-US.msi`: SHA256 `24843AAFAE25427556C9EE8756EC0108512B0154CA6B5DAF038F39A0F7D53BA8`

### 2026-06-10 Format Adapter Architecture

Decision:
- Keep the product as one integrated editor/workbench instead of splitting it into multiple standalone editors.
- Internally split format-specific capabilities into adapter modules so each format can evolve independently while sharing workspace import, tabs, cross-file references, diagnostics, search, preview, export, and locale infrastructure.

Design:
- Add a `FormatAdapter` registry with one adapter per supported format.
- Each adapter owns:
  - display label and default new-file name
  - default new-document template
  - document analysis entrypoint
  - workspace declarations and references extraction
  - navigation focus areas
  - reusable snippets
- The shared workbench owns:
  - opened file tabs
  - folder/workspace indexing
  - reference resolution across tabs/files
  - merged diagnostics
  - visible editor/preview/inspector/problem panels
- Keep UI-heavy icon toolbar rendering out of the first adapter slice. The current `FormatNavigationBar` stays responsible for compact icon groups, while snippets/focus/reference data move behind adapters. A later slice can introduce a pure toolbar-action descriptor model with icon IDs.

Migration plan:
- Extract analyzer implementations from `analyze.ts` into `formatAnalyzers.ts`.
- Extract declaration/reference collectors from `workspace.ts` into `workspaceExtractors.ts`.
- Create `formatAdapters.ts` to register all current formats and provide safe fallback behavior for unknown text.
- Update `analyzeDocument`, workspace index building, empty navigation state, and new-document creation to use `getFormatAdapter(format)`.
- Preserve existing UI behavior and cross-file reference behavior during the refactor.
- Validate with TypeScript/build checks and a rendered app smoke test.

Completed:
- Added `src/lib/formatAdapters.ts` as the first adapter registry.
- Added `src/lib/formatAnalyzers.ts` and moved the previous per-format analyzer implementations behind adapter-owned `analyze` functions.
- Replaced `src/lib/analyze.ts` with a thin `getFormatAdapter(format).analyze(content)` entrypoint.
- Added `src/lib/workspaceExtractors.ts` and moved declaration/reference extraction logic out of `workspace.ts`.
- Rewrote `src/lib/workspace.ts` so workspace indexing asks each adapter for:
  - declarations
  - references
  - focus areas
  - snippets
  - navigation title labels
- Updated `App.tsx` new-document creation to use adapter-owned default names and templates.
- Preserved the current compact icon toolbar in `FormatNavigationBar`; UI toolbar action descriptors remain a later migration slice.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- In-app Browser verification at `http://127.0.0.1:4273/`: passed for app identity, Chinese toolbar text, New button, single-row format navigation, new Markdown tab creation, YAML reference button visibility, HTML preview toolbar visibility, and no console errors.
- Browser screenshot evidence was captured for the HTML editing state after the refactor.
- Cross-file jump click verification was attempted in Browser, but Browser automation timed out while resolving the `.tabs` locator. The DOM still showed the YAML reference button `profile.json#/limits`, so resolver-visible reference extraction remained present, but click interaction should be retested later if the Browser runtime is stable.

### 2026-06-10 Port Range And Utility Button Feedback

Design:
- Use only ports in the `6400-6499` range for local dev/preview validation.
- Set the primary Vite dev server to `127.0.0.1:6400`.
- Set the Vite preview server to `127.0.0.1:6401`.
- Set Tauri `devUrl` to `http://127.0.0.1:6400`.
- The highlighted utility buttons should no longer feel inert:
  - target icon: reference health. Click shows localized reference health status.
  - pencil icon: edit focus. Click hides preview when open and reports edit mode.
  - ellipsis icon: more snippets/actions. Click opens a small localized menu using adapter snippets.
- Keep all newly visible strings localized in Chinese and English.

Implementation plan:
- Update `package.json` scripts and `src-tauri/tauri.conf.json` dev URL.
- Add i18n keys for edit focus, reference health, snippets menu, and empty snippet state.
- Add callbacks from `FormatNavigationBar` to `App.tsx` for reference-health and edit-focus actions.
- Add a lightweight "more snippets" menu inside `FormatNavigationBar`.
- Run TypeScript/build checks and verify via Browser on port `6400`.

Completed:
- Updated `package.json`:
  - `npm run dev` uses `127.0.0.1:6400` with `--strictPort`.
  - `npm run preview` uses `127.0.0.1:6401` with `--strictPort`.
- Updated Tauri `devUrl` to `http://127.0.0.1:6400`.
- Added localized status/menu strings for reference health, edit focus, and more snippets.
- Updated the utility buttons in `FormatNavigationBar`:
  - target icon now reports reference health in the status area.
  - pencil icon now switches to edit-focused view by hiding preview and clearing diff.
  - ellipsis icon now opens a snippet menu backed by the active format adapter.
- Added menu styling for the more-snippets popup.

Button meanings:
- Eye: toggle preview pane.
- Target / warning target: reference health for the current file.
- Pencil: edit-focused view.
- Ellipsis: more snippets/actions for the current file format.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- In-app Browser verification at `http://127.0.0.1:6400/`: passed.
  - Page identity: `MulEditor`.
  - Utility button titles: `预览`, `引用健康状态: 引用正常`, `编辑`, `更多片段`.
  - Target click changed status to `当前文件引用正常`.
  - Pencil click hid preview and changed status to `已进入编辑视图：release-notes.md`.
  - Ellipsis click opened the snippet menu.
  - First snippet insertion closed the menu and changed status to `已插入 Markdown 片段`.
  - Browser console had no error/warn logs.
- `npm run tauri:build -- --no-sign`: passed and rebuilt release EXE, MSI, and NSIS bundles.
- Synced updated NSIS installer and portable ZIP to `release/`.
- `release/MulEditor.exe` could not be overwritten because process `32492` was running from that exact file. The rebuilt standalone EXE is available at `src-tauri/target/release/muleditor.exe`; close the running app before syncing it to `release/MulEditor.exe`.
- Artifact hashes:
  - `src-tauri/target/release/muleditor.exe`: SHA256 `27C2B4C7B776CA56D168A5340FCE2630DF779BD940A40773095958743A3DC992`
  - `release/MulEditor.exe`: SHA256 `B41A00603AD22028CE44DE49CF3758FE394BFF59933472D1D91BB2BA8DE1B50B` (old locked copy)
  - `release/MulEditor_0.1.0_x64-setup.exe`: SHA256 `CDF74417DE3C3E8CC7E47ACA13ABB5475D7A89E5C2892BFF83DFCD35F7E08423`
  - `release/MulEditor-0.1.0-windows-x64-portable.zip`: SHA256 `64757DBF67E7258913A69549D0A18C4A55EE11C23B47887B3A57E1DF002E0751`
  - `src-tauri/target/release/bundle/msi/MulEditor_0.1.0_x64_en-US.msi`: SHA256 `671320120C5AC9B102132F0BD6C741C0BB88F963D5C22E181D6D77795CB541D0`

### 2026-06-10 Remove Redundant More Utility Button

Design:
- Remove the ellipsis / more utility button from the format navigation bar.
- The format-specific node and snippet actions already live in the left format action groups, so a second snippets menu duplicates the main editing surface.
- Keep the right utility group limited to explicit view and status controls:
  - Eye: preview toggle.
  - Target / warning target: reference health status.
  - Pencil: edit-focused view.
- Remove menu-only styles and unused localization keys after the UI surface is removed.

Implementation plan:
- Delete the ellipsis button, menu state, menu popup, and menu click dispatcher from `FormatNavigationBar`.
- Wire the pencil button directly to `onFocusEdit`.
- Remove `.formatMoreMenu` and `.formatMoreEmpty` styles.
- Remove unused `nav.more*` localization keys.
- Run checks and verify the app on port `6400`.

Completed:
- Removed the ellipsis / more button from the format navigation utility group.
- Removed the duplicated snippets popup state and markup.
- Wired the pencil utility button directly to edit-focused view.
- Removed menu-only CSS and unused `nav.more*` localization keys.
- Kept format-specific node/snippet actions in the left format action groups.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- In-app Browser verification at `http://127.0.0.1:6400/`: passed.
  - Utility button count is now 3.
  - Utility titles are `预览`, `引用健康状态: 引用正常`, and `编辑`.
  - No `更多片段` / `More snippets` button or `.formatMoreMenu` node is present.
  - Clicking the edit button hides the preview pane.
  - Browser console had no error/warn logs.
- `npm run tauri:build -- --no-sign`: passed and rebuilt release EXE, MSI, and NSIS bundles.

Release artifact status:
- Updated `release/MulEditor.exe`.
- Updated `release/MulEditor_0.1.0_x64-setup.exe`.
- Updated `release/MulEditor-0.1.0-windows-x64-portable/MulEditor.exe`.
- Could not overwrite `release/MulEditor-0.1.0-windows-x64-portable.zip` because that zip file is locked by another process.
- Created `release/MulEditor-0.1.0-windows-x64-portable-updated.zip` as the current portable zip.

Artifact hashes:
- `src-tauri/target/release/muleditor.exe`: SHA256 `879D0D571A1284DECA1B04F15FB08DA59885857A3550CBE33D4916C124096F31`
- `release/MulEditor.exe`: SHA256 `879D0D571A1284DECA1B04F15FB08DA59885857A3550CBE33D4916C124096F31`
- `release/MulEditor_0.1.0_x64-setup.exe`: SHA256 `99813E53275B5C68ACFD1F45F76147BF1DF147DD5DA427DBB0E22C0A4D432282`
- `release/MulEditor-0.1.0-windows-x64-portable/MulEditor.exe`: SHA256 `879D0D571A1284DECA1B04F15FB08DA59885857A3550CBE33D4916C124096F31`
- `release/MulEditor-0.1.0-windows-x64-portable-updated.zip`: SHA256 `345D5B694C51546089BAA494D3AFA623107FB0C157B5DBF5ADCDBEF1B3A75994`
- `release/MulEditor-0.1.0-windows-x64-portable.zip`: SHA256 `64757DBF67E7258913A69549D0A18C4A55EE11C23B47887B3A57E1DF002E0751` (old locked zip)
- `src-tauri/target/release/bundle/msi/MulEditor_0.1.0_x64_en-US.msi`: SHA256 `72F75A7ABC28AED50214D5CB612C7C4B004DC303D8A25AA035C16203E11D8415`

### 2026-06-10 Remove Duplicate Preview And Edit Utility Buttons

Design:
- Keep preview control only in the top global toolbar.
- Remove the local eye button from the format navigation bar because it toggles the same `showPreview` state as the top preview button.
- Remove the local pencil edit button because closing preview already enters the same edit-focused layout.
- Keep the format navigation utility group only for reference health, which still has a distinct per-file diagnostic meaning.
- Remove now-unused edit-focus callback and localization keys.

Implementation plan:
- Remove `showPreview`, `onTogglePreview`, and `onFocusEdit` props from `FormatNavigationBar`.
- Remove the local preview and edit buttons from `FormatNavigationBar`.
- Remove `handleFocusEdit` and obsolete i18n keys that were only used by the deleted edit button.
- Keep top toolbar preview behavior unchanged.
- Run checks, verify the visible toolbar on port `6400`, and rebuild release artifacts.

Completed:
- Removed the format navigation local preview button.
- Removed the format navigation local edit button.
- Removed `showPreview`, `onTogglePreview`, and `onFocusEdit` from `FormatNavigationBar`.
- Removed the obsolete `handleFocusEdit` callback from `App.tsx`.
- Removed unused `status.editFocus` and `nav.preview` localization keys.
- Kept the top toolbar preview button as the single preview/edit-layout toggle.
- Kept the format navigation utility group limited to reference health.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- In-app Browser verification at `http://127.0.0.1:6400/`: passed.
  - There is exactly one visible preview button, the top toolbar `预览` button.
  - The format navigation utility group has exactly one button: `引用健康状态: 引用正常`.
  - No local `预览` or `编辑` button exists in the format navigation utility group.
  - Clicking the top preview button changes the editor layout from `editorSplit withPreview` to `editorSplit`.
  - Browser console had no error/warn logs.
- `npm run tauri:build -- --no-sign`: passed and rebuilt release EXE, MSI, and NSIS bundles.

Release artifact status:
- Updated `release/MulEditor_0.1.0_x64-setup.exe`.
- Updated `release/MulEditor-0.1.0-windows-x64-portable/MulEditor.exe`.
- Updated `release/MulEditor-0.1.0-windows-x64-portable-updated.zip`.
- Could not overwrite `release/MulEditor.exe` because it is currently running as process `43228`.
- The current standalone EXE is available at `src-tauri/target/release/muleditor.exe`.

Artifact hashes:
- `src-tauri/target/release/muleditor.exe`: SHA256 `B1DF2060050BC78BBC16FE9E7AEC361AE77B4AC9E3142B7816D8C53BD45E57CF`
- `release/MulEditor.exe`: SHA256 `879D0D571A1284DECA1B04F15FB08DA59885857A3550CBE33D4916C124096F31` (old locked running copy)
- `release/MulEditor_0.1.0_x64-setup.exe`: SHA256 `8F5F42B8A2026A1897530D6A41B3BB65C3497EFDCFCF6D207A6245680E9333D5`
- `release/MulEditor-0.1.0-windows-x64-portable/MulEditor.exe`: SHA256 `B1DF2060050BC78BBC16FE9E7AEC361AE77B4AC9E3142B7816D8C53BD45E57CF`
- `release/MulEditor-0.1.0-windows-x64-portable-updated.zip`: SHA256 `62A8F470A0D2BB2395E5A3FD2A67D85F0A183F5EB21D48B58D9A2C30D8385D9F`
- `src-tauri/target/release/bundle/msi/MulEditor_0.1.0_x64_en-US.msi`: SHA256 `E8A1CFF8BACDCA7183E3266E2653A0F72F916A4FDA2C4DC729031EA72C1F8607`

### 2026-06-10 Rename Product To 哞-编辑器

Design:
- Rename the user-facing app/product brand from `MulEditor` to `哞-编辑器`.
- Update visible labels, browser/window titles, preview window title, sample workspace content, and Tauri bundle product name.
- Keep internal technical identifiers stable where changing them would add risk without user-facing benefit:
  - npm package name remains `muleditor`.
  - Rust crate/binary names remain `muleditor`.
  - Tauri identifier remains `com.muleditor.desktop`.
  - localStorage/temp directory keys remain `muleditor.*` for migration stability.

Implementation plan:
- Update `index.html`, `src-tauri/tauri.conf.json`, toolbar brand text, preview window title, capability descriptions, and user-facing error text.
- Update sample documents and adapter snippets that show the old brand.
- Run checks, verify title/brand on port `6400`, rebuild release artifacts, and sync unlocked release files.

Completed:
- Updated browser title, toolbar brand, Tauri product name, main window title, preview window title, capability descriptions, and user-facing runtime error text to `哞-编辑器`.
- Updated sample Markdown/JSON/XML/SPDX content and default SPDX creator snippets to use `哞-编辑器`.
- Kept internal package/crate names, app identifier, localStorage keys, and temp directory names as `muleditor` for compatibility.
- Changed Tauri bundle target from `all` to `nsis` because WiX MSI generation corrupts the Chinese product name in `main.wxs`.
- Added Chinese-named release artifacts alongside the older locked `MulEditor` artifacts.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- In-app Browser verification at `http://127.0.0.1:6400/`: passed.
  - `document.title` is `哞-编辑器`.
  - Toolbar brand is `哞-编辑器`.
  - Sample Markdown preview heading is `哞-编辑器 Alpha Notes`.
  - Page body no longer contains `MulEditor`.
  - Browser console had no error/warn logs.
- `npm run tauri:build -- --no-sign`: passed after switching bundle target to `nsis`.
- `npm run tauri:build -- --no-sign` with MSI enabled failed before this target change because WiX generated mojibake such as `鍝?缂栬緫鍣?` in `src-tauri/target/release/wix/x64/main.wxs`.

Release artifact status:
- Created `release/哞-编辑器.exe`.
- Created `release/哞-编辑器_0.1.0_x64-setup.exe`.
- Created `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`.
- Created `release/哞-编辑器-0.1.0-windows-x64-portable.zip`.
- `release/哞-编辑器.exe` has Windows version metadata `ProductName = 哞-编辑器` and `FileDescription = 哞-编辑器`.
- Older `release/MulEditor.exe` remains because it is currently running as process `43228`.

Artifact hashes:
- `src-tauri/target/release/muleditor.exe`: SHA256 `B71076343D1FFD9FCB407F498E3DDECD007E414C28FCA12023C03F45B39A5814`
- `release/哞-编辑器.exe`: SHA256 `B71076343D1FFD9FCB407F498E3DDECD007E414C28FCA12023C03F45B39A5814`
- `release/哞-编辑器_0.1.0_x64-setup.exe`: SHA256 `88BC99397C40C127BE6373EB6C74D7865881ED46771526EB0908EFE2A7E89CC6`
- `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`: SHA256 `B71076343D1FFD9FCB407F498E3DDECD007E414C28FCA12023C03F45B39A5814`
- `release/哞-编辑器-0.1.0-windows-x64-portable.zip`: SHA256 `1C9F6EEE7BEFEC350750DC927D2EEC9F2E418C405B3FB2337B42261EC0105D95`

### 2026-07-09 Windows Open With Startup Files

Design:
- Fix Windows "Open with" behavior so command-line file paths passed to the EXE are opened on startup.
- If startup arguments contain supported files, replace the demo tabs with those files.
- If startup arguments contain folders, import supported files from those folders using the existing recursive folder reader.
- If there are no startup file/folder arguments, keep the demo workspace behavior unchanged.
- Keep this path separate from manual toolbar Open/Open Folder flows.

Implementation plan:
- Add a Tauri command that reads `std::env::args_os()` and converts supported file/folder arguments into `OpenedTextFile` records.
- Reuse the same supported-extension filter and folder collection logic used by manual folder import.
- Add a frontend file-access helper for the startup command.
- In `App`, run the startup import once in Tauri runtime and replace demo tabs when files are provided.
- Validate with a release EXE launched with a sample file path argument.

Completed:
- Added backend command `read_startup_files`.
- Added shared backend helper `read_startup_paths` so startup-file parsing is testable.
- Reused `collect_text_files`, `is_supported_document`, and `OpenedTextFile` for startup folder/file arguments.
- Added frontend helper `openStartupFilesFromDesktop`.
- Added a one-time startup import effect in `App`.
- When startup files are present, the app now replaces demo tabs with those files and activates the first startup file.
- No startup files keeps the demo workspace unchanged.

Verification results:
- `cargo test`: passed. 3 tests passed, including `read_startup_paths_opens_supported_file_argument`.
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- `npm run tauri:build -- --no-sign`: passed.
- Release EXE startup-argument smoke test: passed. `src-tauri/target/release/muleditor.exe` launched with a temporary `.md` file path present in the process command line.

Release artifact status:
- Updated `release/哞-编辑器.exe`.
- Updated `release/哞-编辑器_0.1.0_x64-setup.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable.zip`.
- Older `MulEditor.*` artifacts remain as historical files and should not be used for this fix.

Artifact hashes:
- `src-tauri/target/release/muleditor.exe`: SHA256 `8B02B3C90F34F1944FACDD0E2A21BD08DCD0CF80A6C915ADF989462CB59E1D0F`
- `release/哞-编辑器.exe`: SHA256 `8B02B3C90F34F1944FACDD0E2A21BD08DCD0CF80A6C915ADF989462CB59E1D0F`
- `release/哞-编辑器_0.1.0_x64-setup.exe`: SHA256 `C5180D2CE34C863AE2720D446D6251792A6FF2FFCCA5578CFA79CE4D1641CA77`
- `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`: SHA256 `8B02B3C90F34F1944FACDD0E2A21BD08DCD0CF80A6C915ADF989462CB59E1D0F`
- `release/哞-编辑器-0.1.0-windows-x64-portable.zip`: SHA256 `CEE766B8DE06A60C66951AB6B3EEB91CA8E3E8F28DD59846D07267CFF073457F`

### 2026-07-09 Remove Duplicate In-App Brand Block

Design:
- Remove the in-app toolbar brand block because the Windows title bar already shows the application name.
- Keep the native window title and sidebar/workspace labels unchanged.
- Let the top operation toolbar start from the left edge of the toolbar instead of after the duplicate brand area.

Implementation plan:
- Remove the `brand` block from `Toolbar`.
- Remove unused brand icon import.
- Remove obsolete `.brand` CSS rules.
- Verify that toolbar action buttons move left and no duplicate in-app brand remains.

Completed:
- Removed the in-app toolbar brand block from `Toolbar`.
- Removed the unused `Braces` import from `Toolbar`.
- Removed obsolete `.brand` CSS rules from `src/styles.css`.
- Left the Windows native title bar name unchanged.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- In-app Browser verification at `http://127.0.0.1:6400/`: passed.
  - `.brand` count is `0`.
  - First toolbar button is `新建`.
  - First toolbar button starts about `13px` from the toolbar left edge.
  - Browser console had no error/warn logs.
- `npm run tauri:build -- --no-sign`: passed.

Release artifact status:
- Updated `release/哞-编辑器_0.1.0_x64-setup.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable.zip`.
- Could not overwrite `release/哞-编辑器.exe` because it is currently running as process `21448`.
- The current standalone EXE is available at `src-tauri/target/release/muleditor.exe`.

Artifact hashes:
- `src-tauri/target/release/muleditor.exe`: SHA256 `8539141B286BC86B89C2DFC8B966DA3076B8170F467F88DEB1BFF02F1AAE8B0A`
- `release/哞-编辑器.exe`: SHA256 `8B02B3C90F34F1944FACDD0E2A21BD08DCD0CF80A6C915ADF989462CB59E1D0F` (old locked running copy)
- `release/哞-编辑器_0.1.0_x64-setup.exe`: SHA256 `5DE9C658E3487F09DA49750CE403BC1FDC9ED04AFB3B37A994830EDF7AFD8F3E`
- `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`: SHA256 `8539141B286BC86B89C2DFC8B966DA3076B8170F467F88DEB1BFF02F1AAE8B0A`
- `release/哞-编辑器-0.1.0-windows-x64-portable.zip`: SHA256 `7C04216AF945B75A5D70B070B8E63CFC6757EDFC0E29CE44D7DE9EECFAA109F9`

### 2026-07-09 JSON Array Primitive Preview Values

Design:
- JSON/YAML structured previews must show scalar values for primitive array items, not only their index.
- Example: `features: ["preview", "format"]` should render `[0] preview` and `[1] format` in both the main preview tree and the right outline.
- Object and nested-array rows should keep the existing compact tree behavior.
- `null` array items should be labeled with kind `null`, not JavaScript's generic `object`.

Implementation plan:
- Normalize structured outline kind detection through a helper.
- Add primitive preview values to array item outline nodes.
- Render `OutlineItem.value` in the inspector outline when present.
- Verify with the sample `profile.json` array preview.

Completed:
- Added scalar `value` previews for array items generated by `outlineValue`.
- Added `valueKind` so arrays, `null`, and primitive JSON/YAML values use consistent kind labels.
- Updated the inspector outline to render `OutlineItem.value` when a structured row has a scalar value.
- Added overflow handling for `.outlineValue` so long values do not break the right panel layout.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- Vite SSR component verification: passed.
  - `features[0..3]` generated `preview`, `format`, `validate`, and `export` values.
  - Both `DocumentPreview` and `InspectorPane` static markup contained all four array values.
  - Mixed primitive array items rendered as `null`, `false`, and `0` with correct kind labels.
- In-app Browser verification was attempted, but the Browser webview did not attach in this session.
- First normal `npm run tauri:build -- --no-sign` could not replace `src-tauri/target/release/muleditor.exe` because that exe was already running as process `31404`.
- Retried packaging with a temporary Cargo target directory: passed.

Release artifact status:
- Updated `release/哞-编辑器.exe`.
- Updated `release/哞-编辑器_0.1.0_x64-setup.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable.zip`.
- `src-tauri/target/release/muleditor.exe` remains the old running copy until process `31404` is closed.

Artifact hashes:
- `C:/Users/waternie/AppData/Local/Temp/muleditor-tauri-target-json-array/release/muleditor.exe`: SHA256 `2183502AD22BB99564AAE0015FFE72BAFAE87D66BB04FBE125B7EEDACC4D44F9`
- `release/哞-编辑器.exe`: SHA256 `2183502AD22BB99564AAE0015FFE72BAFAE87D66BB04FBE125B7EEDACC4D44F9`
- `release/哞-编辑器_0.1.0_x64-setup.exe`: SHA256 `66121E807E1C056A9387518BD80AE9CAC96B3B06480C2F8FD8765D70297C5876`
- `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`: SHA256 `2183502AD22BB99564AAE0015FFE72BAFAE87D66BB04FBE125B7EEDACC4D44F9`
- `release/哞-编辑器-0.1.0-windows-x64-portable.zip`: SHA256 `6E7A8C1D418A0302E528FF04BC0B1EB294C58BB39039E60ED36F20586E1CE781`

### 2026-07-09 Closable Outline Pane

Design:
- The right outline/validation inspector pane should be closable to give more space to editor and preview.
- Closing the pane must remove its grid column, not leave an empty 304px area.
- Users need a clear way to reopen the pane from the top toolbar.
- All new visible text must support Chinese and English UI.

Implementation plan:
- Add `showInspector` state in `App`.
- Add a top toolbar toggle button labeled `大纲` / `Outline`.
- Add a close icon button in the inspector outline header.
- Add a collapsed workbench layout class that switches from three columns to two columns.
- Verify close and reopen behavior in the rendered app.

Completed:
- Added `showInspector` state in `App`.
- Added a toolbar `大纲` / `Outline` toggle button.
- Added a close icon button in the inspector outline header.
- Conditionally removed the inspector pane from the DOM when closed.
- Added `.workbench.inspectorClosed` so the editor/preview area expands into the freed space.
- Added Chinese and English strings for the new toolbar and close actions.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- In-app Browser verification at `http://127.0.0.1:6400/`: passed.
  - Initial layout had toolbar button `大纲`, `.inspector` present, and three workbench columns.
  - Clicking the inspector close button removed `.inspector` and changed the workbench class to `workbench inspectorClosed`.
  - Closed layout computed columns were `244px 1036px`, confirming no empty inspector column remained.
  - Clicking the toolbar `大纲` button restored `.inspector` and the three-column workbench layout.
  - Browser console had no error/warn logs.
- `npm run tauri:build -- --no-sign`: passed.

Release artifact status:
- Updated `release/哞-编辑器.exe`.
- Updated `release/哞-编辑器_0.1.0_x64-setup.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable.zip`.

Artifact hashes:
- `src-tauri/target/release/muleditor.exe`: SHA256 `F681473573B25C8CEB2B732ECB736E617D185834E4154B1DD8BF660437DEAFB4`
- `release/哞-编辑器.exe`: SHA256 `F681473573B25C8CEB2B732ECB736E617D185834E4154B1DD8BF660437DEAFB4`
- `release/哞-编辑器_0.1.0_x64-setup.exe`: SHA256 `20057AA36B88CF6E345BDA1275296FA88CEE1DBC93CE8DAF6F804B4521136980`
- `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`: SHA256 `F681473573B25C8CEB2B732ECB736E617D185834E4154B1DD8BF660437DEAFB4`
- `release/哞-编辑器-0.1.0-windows-x64-portable.zip`: SHA256 `5844BA27348C4B26872F7DB46C5EE96C0DCA376B0B377206D756260BC1A58F87`

### 2026-07-10 Drag And Drop File Open

Design:
- Dragging supported files into the editor window should open them automatically.
- Dragging multiple supported files should import all supported files.
- Dragging a folder in Tauri should reuse folder collection behavior so cross-file references still work.
- Browser/dev mode should support HTML5 file drops even though browser drops cannot provide real filesystem paths.
- Dropping unsupported files should not navigate the webview away from the app.
- A minimal drag overlay should indicate that the app is ready to open dropped files.

Implementation plan:
- Add a Tauri command for dropped file/folder paths and reuse `read_startup_paths`.
- Add frontend helpers for Tauri drag/drop event listening and dropped path reading.
- Add app-level drag/drop handlers for browser mode.
- Add drag active state and localized overlay text.
- Verify TypeScript, Rust tests, rendered browser drag/drop behavior, and Tauri packaging.

Completed:
- Added backend command `read_dropped_paths`.
- Reused `read_startup_paths` so dropped files and folders share the same supported-format filtering and folder recursion as startup open.
- Sorted path-import results by relative path for deterministic dropped folder tab order.
- Added frontend helpers `openDroppedPathsFromDesktop` and `listenDroppedPathsFromDesktop`.
- Added Tauri native drag/drop event handling through the current webview.
- Added browser-mode HTML5 file drop fallback.
- Added a localized drag overlay: `释放以打开文件` / `Drop to open files`.
- Prevented dropped files from navigating the webview away from the app.

Verification results:
- `npm run check`: passed.
- `cargo test`: passed. 4 tests passed, including `read_dropped_paths_opens_folder_and_ignores_unsupported_files`.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- `npm run tauri:build -- --no-sign`: passed.
- Automated real mouse drag/drop UI verification was not run because this session has no available Browser control script or Playwright dependency. The Tauri path-read behavior is covered by Rust tests, and the frontend drag/drop code is covered by TypeScript/build checks.

Release artifact status:
- Updated `release/哞-编辑器.exe`.
- Updated `release/哞-编辑器_0.1.0_x64-setup.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable.zip`.

Artifact hashes:
- `src-tauri/target/release/muleditor.exe`: SHA256 `52E813A1201F02D9629237CD819AAAACA2AB28267073A8245714E4EE60246C05`
- `release/哞-编辑器.exe`: SHA256 `52E813A1201F02D9629237CD819AAAACA2AB28267073A8245714E4EE60246C05`
- `release/哞-编辑器_0.1.0_x64-setup.exe`: SHA256 `0E6C03B7A58344C36B42EB802DD57A2FF5207CB6F48486B038D25F6589FA232C`
- `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`: SHA256 `52E813A1201F02D9629237CD819AAAACA2AB28267073A8245714E4EE60246C05`
- `release/哞-编辑器-0.1.0-windows-x64-portable.zip`: SHA256 `493303F78BA7DEE41EF7FD450BBBEDDDFA82A99C7998E3AB56C85E0EAA328373`

### 2026-07-10 Toggle Editor Pane

Design:
- The editor pane should be hideable like the outline pane for preview-only reading.
- The top toolbar should expose an `编辑` / `Edit` toggle.
- Hiding the editor must keep preview visible and disable diff mode.
- If preview is turned off while the editor is hidden, the app should restore the editor so the work area never becomes blank.
- Diff mode requires the editor pane, so enabling diff should restore the editor.
- Preview-only mode should render the preview full width without the split border.

Implementation plan:
- Add `showEditor` state in `App`.
- Add toolbar props and button for the editor pane.
- Centralize preview/editor/diff toggle handlers to keep valid view states.
- Conditionally render `EditorPane` and `DocumentPreview`.
- Add editor split layout classes for preview-only and split modes.
- Verify TypeScript, build, and packaging.

Completed:
- Added `showEditor` state in `App`.
- Added toolbar `编辑` / `Edit` toggle button.
- Added state guards:
  - Hiding editor forces preview on and diff off.
  - Hiding preview while editor is hidden restores editor.
  - Enabling diff restores editor.
  - Go-to-line, reference open, and snippet insertion restore editor so navigation/edit actions have a visible target.
- Conditionally render `EditorPane` and preview instead of leaving an empty grid column.
- Added `.editorSplit.previewOnly` for full-width preview without the split border.
- Updated the responsive rule so small-width layouts only hide preview in split mode, not preview-only mode.
- Added Chinese and English strings for the new editor toggle.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still warns that the Monaco-heavy bundle is larger than 500 kB.
- `npm run tauri:build -- --no-sign`: passed.
- Automated rendered interaction verification was not run in this session because Browser/Playwright automation is unavailable.

Release artifact status:
- Could not overwrite `release/哞-编辑器.exe` because it is currently running as process `32940`.
- Updated `release/哞-编辑器_0.1.0_x64-setup.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable.zip`.
- The current standalone build is available at `src-tauri/target/release/muleditor.exe`.

Artifact hashes:
- `src-tauri/target/release/muleditor.exe`: SHA256 `D7B6C9D0D1B0368DE75D59AC0F07052338B6A14BFCFF50E6D86D60127484D889`
- `release/哞-编辑器.exe`: SHA256 `52E813A1201F02D9629237CD819AAAACA2AB28267073A8245714E4EE60246C05` (old locked running copy)
- `release/哞-编辑器_0.1.0_x64-setup.exe`: SHA256 `8C72F1845CAACD8A49124C397C4CA8BA1D799ACC62215A35C4EF1E684B579F5C`
- `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`: SHA256 `D7B6C9D0D1B0368DE75D59AC0F07052338B6A14BFCFF50E6D86D60127484D889`
- `release/哞-编辑器-0.1.0-windows-x64-portable.zip`: SHA256 `3E63DBE4595678BF12D0085DBD1414AE66FDD3AF2434F8A1C36327FE1ED21CFF`

### 2026-07-20 Outline Synchronized Navigation

Design:
- Clicking an outline item should navigate the active document instead of acting as a read-only label.
- The editor should reveal the corresponding source line and place the cursor there when the editor pane is visible.
- The document preview should scroll the corresponding rendered heading, HTML element, or structured tree row into view when preview is visible.
- Hidden panes must remain hidden; outline navigation should only drive panes that are currently visible.
- If diff mode is active and an outline item has a source line, navigation should leave diff mode so the editable Monaco pane can show that line.
- Markdown, HTML, XML, YAML, JSON, and SPDX outline nodes need stable source-line metadata and preview anchor IDs.
- Outline rows should have button semantics, keyboard support, hover/focus feedback, and localized action text.

Implementation plan:
- Preserve existing outline IDs and add source-line metadata in the format analyzers.
- Use YAML parsed-node ranges for JSON/YAML line mapping and source opening-tag offsets for HTML/XML line mapping.
- Add an outline selection callback from `InspectorPane` to `App`.
- Reuse the existing Monaco go-to command for editor navigation.
- Add a separate preview navigation command and map outline IDs to rendered preview nodes.
- Verify TypeScript, production build, and rendered outline-to-editor/preview interaction on port 6400-6499.

Success criteria:
- Clicking a Markdown heading centers its source line in Monaco and its rendered heading in preview.
- Clicking representative HTML, XML, YAML, JSON, and SPDX nodes navigates to the correct source line and preview row.
- Repeated clicks and nested outline items work without changing pane visibility.
- Chinese and English outline action labels are available.

Completed:
- Added source-line metadata for HTML and XML outline nodes by mapping parsed elements to source opening-tag positions.
- Added source-line metadata for JSON and YAML nodes from YAML parsed-node ranges and a line counter, including nested objects and array items.
- Added source-line mappings for SPDX summary nodes and kept the existing structured outline IDs.
- Changed inspector outline rows into keyboard-accessible buttons with localized navigation titles and hover/focus feedback.
- Added an outline selection handler that sends a Monaco go-to command only when the editor is visible and a preview navigation command only when preview is enabled.
- Added preview anchors for rendered Markdown headings, HTML iframe nodes, and structured preview tree rows.
- Added one-time preview command consumption so later content edits do not repeatedly scroll back to the previous outline target.
- Hardened Monaco command delivery so a pending navigation is applied when the editor mounts after leaving diff mode.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still reports the existing Monaco-heavy bundle warning above 500 kB.
- In-app Browser verification at `http://127.0.0.1:6400/`: passed at a 1600x1000 desktop viewport.
  - Markdown `Next checkpoint`: editor line 16 and rendered H2 anchor `md-15`.
  - JSON nested `maxOpenTabs`: editor line 5 and preview anchor `json-2-0`.
  - JSON array item `[3]`: editor line 3 and preview anchor `json-1-3`.
  - YAML nested export command: editor line 7 and preview anchor `yaml-2-1-1`.
  - XML nested YAML format element: editor line 6 and preview anchor `xml-root-3`.
  - HTML H1: editor line 8 and iframe preview anchor `html-2`.
  - SPDX relationship summary: editor line 20 and preview anchor `spdx-relationships`.
  - Preview-only mode kept the editor hidden while navigating to `spdx-packages`.
  - Chinese and English titles rendered as `跳转到 1 packages` and `Go to 1 packages`.
  - Browser console contained no warnings or errors.
- Release EXE/installer artifacts were not rebuilt during the feature implementation; they were rebuilt and synchronized on 2026-07-21 after the packaging request.

Packaging results (2026-07-21):
- `npm run tauri:build -- --no-sign`: passed.
- Updated `release/哞-编辑器.exe`.
- Updated `release/哞-编辑器_0.1.0_x64-setup.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable.zip`.
- Standalone EXE SHA256: `5441BBB09B694B0CDB1BEA5DDBECF2231BA535AD20C0512E82DD9AA6C209C8CA`.
- NSIS installer SHA256: `9B14BF5676E72641A1D3CC1C22A9794C74146065E88ED5760F0AC0CCAD5D3F26`.
- Portable ZIP SHA256: `A9388302544B0F41567F0CA31777026D59CF8E31BC4A3B1B1F745864058C88D1`.

### 2026-07-23 New File Format Dropdown

Design:
- Replace the immediate `New` action with a dropdown that requires an explicit file-format choice.
- Offer Markdown, HTML, XML, YAML, JSON, SPDX JSON, SPDX YAML, and SPDX tag/value.
- Create the new document from the selected format adapter so its starter content, format metadata, and default extension do not depend on the active tab.
- Keep the menu compact and aligned below the existing `New` control.
- Support mouse selection, keyboard focus, Escape dismissal, outside-click dismissal, and Chinese/English interface text.
- Keep the format rail as a status display; it is not the new-file selector.

Implementation plan:
- Change the new-document callback to accept a `DocumentFormat`.
- Add an anchored format menu to the toolbar and route each item to the existing format adapter.
- Add localized accessible labels and focused/hover menu styling.
- Verify type checking, production build, and rendered interactions on a port in the 6400-6499 range.

Success criteria:
- Clicking `New` / `新建` opens all eight supported format choices.
- Selecting a choice creates a tab with the correct template, format, and default file extension regardless of the active tab.
- The menu closes after selection, on Escape, and when clicking outside it.
- The menu remains usable in both Chinese and English.

Completed:
- Changed the new-document callback to require an explicit `DocumentFormat`.
- Added an anchored `New` / `新建` menu with all eight supported format choices and their default extensions.
- Reused the existing format adapters for starter content, format metadata, and default file names.
- Added automatic first-item focus, Arrow Up/Down, Home/End, Escape, selection, and outside-click behavior.
- Added localized accessible menu labels and clarified SPDX tag/value as `SPDX 标签/值` / `SPDX Tag/Value`.
- Kept the menu above the workbench while leaving the existing drag-and-drop overlay above the toolbar.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still reports the existing Monaco-heavy bundle warning above 500 kB.
- Rendered interaction verification at `http://127.0.0.1:6400/`: passed.
  - The Chinese menu displayed all eight formats and extensions.
  - Selecting JSON while Markdown was active created `untitled.json` with JSON content and metadata.
  - The menu closed on Escape and when the language button was clicked outside it.
  - The English menu displayed distinct SPDX JSON, SPDX YAML, and SPDX Tag/Value choices.
  - Selecting SPDX YAML created `bom.spdx.yaml` with the SPDX YAML template.
  - Arrow Down opened the menu, focused Markdown, and moved focus to HTML on the next press.
  - Visual inspection of `output/playwright/new-file-menu.png` found no clipping, overlap, or truncated menu text.
- Browser console contained no application runtime errors; the only error was the existing missing `/favicon.ico` request.
- Release EXE and installer artifacts were not rebuilt during the initial source-only feature request; they were rebuilt after the packaging request below.

Packaging results (2026-07-23):
- `npm run tauri:build -- --no-sign`: passed.
- Updated `release/哞-编辑器.exe`.
- Updated `release/哞-编辑器_0.1.0_x64-setup.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`.
- Rebuilt `release/哞-编辑器-0.1.0-windows-x64-portable.zip`.
- Verified that the source, standalone, and portable EXE copies have identical SHA256 hashes.
- Verified that the portable ZIP contains `README.txt` and the latest `哞-编辑器.exe`.
- Standalone EXE SHA256: `1FF13ECBC30F2049CE6A69C6C38F082ABEF2B46A8B24D7BA56A20E8FE3783DF7`.
- NSIS installer SHA256: `DFA41AFE498283C58525CD07C32189A8244AD151A0C7A5C7D896B658D3EED8BD`.
- Portable ZIP SHA256: `B62775BF9E1AC89D37C40FD94DB8D5E19FB8A05700546F91DC79C4F312906664`.

### 2026-08-10 Mermaid Markdown Preview

Design:
- Render fenced `mermaid` blocks in the Markdown preview while leaving all other fenced code blocks unchanged.
- Load Mermaid only when a Markdown preview contains a Mermaid block so the normal editor startup path does not eagerly load the diagram engine.
- Keep Mermaid at `securityLevel: strict`, cancel stale asynchronous work during live editing or tab changes, and debounce rapid content updates.
- If Mermaid syntax is invalid, show a localized inline error with the original source instead of breaking the entire preview.
- Keep wide diagrams inside the preview pane with responsive SVG sizing and horizontal overflow support.

Completed:
- Added `mermaid@11.16.1` as a local application dependency.
- Added a Markdown post-render pass that reads Marked's escaped Mermaid code through `textContent`, renders it to SVG, and replaces only `code.language-mermaid` blocks.
- Added one-time Mermaid initialization, lazy module loading, unique render IDs, abort-aware stale render protection, and a 160 ms live-edit debounce.
- Added Chinese and English Mermaid error labels plus diagram and error-state styling.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed; Vite still reports the existing large-chunk warning.
- Playwright CLI verification at `http://127.0.0.1:6400/` with a 1600x1000 viewport: passed.
  - The representative Chinese `sequenceDiagram` rendered as one SVG and no longer left a `code.language-mermaid` node.
  - Participant and message `<br/>` line breaks, Chinese text, URL query strings, and nested braces rendered successfully.
  - A regular TypeScript fenced block remained a normal code block.
  - Invalid Mermaid syntax produced one localized inline error, preserved the source, and caused no console error or unhandled rejection.
  - Switching from the invalid document back to the valid document rendered the current SVG without retaining the prior error state.
- Visual verification asset: `output/playwright/mermaid-sequence-rendered.png`.
- Release EXE and installer artifacts were not rebuilt for this source-only fix.

### 2026-08-10 Mermaid Desktop Packaging

Plan:
- Rebuild the current Tauri Windows application and unsigned NSIS installer with the Mermaid preview changes.
- Synchronize the standalone EXE, NSIS installer, portable folder, and portable ZIP under `release/`.
- Correct the portable README so it names the current Chinese executable.
- Verify executable identity, PE subsystem, startup responsiveness, hashes, and portable ZIP contents.

Completed:
- `npm run tauri:build -- --no-sign` rebuilt the current x64 Windows GUI executable and the configured NSIS installer.
- Updated `release/哞-编辑器.exe` and `release/哞-编辑器_0.1.0_x64-setup.exe`.
- Updated `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`.
- Corrected the portable README from the obsolete `MulEditor.exe` name to `哞-编辑器.exe` and added Mermaid preview to the feature list.
- Rebuilt the flat two-file `release/哞-编辑器-0.1.0-windows-x64-portable.zip`.

Verification results:
- Tauri release and NSIS packaging: passed. Vite still reports the existing large-chunk warning.
- Standalone smoke test: passed with window title `哞-编辑器`, a nonzero window handle, and `Responding = True`; the test process was closed afterward.
- Main executable PE headers: x64 `Machine = 0x8664`, PE32+ `0x020B`, `Subsystem = 2` (Windows GUI).
- Version metadata: `ProductName = 哞-编辑器`, `FileDescription = 哞-编辑器`, version `0.1.0`.
- Source, standalone, portable-folder, and ZIP-contained EXE SHA256: `17A992E66C10BFE8838B18F38DF190F84E268C81CEB92601A920C9512122EC34`.
- Source and release NSIS installer SHA256: `796C80CC5B51863331D123B04AA79281233E1D78A214B7C4FBA57FC66809E178`.
- Portable ZIP SHA256: `E831F5EB71E95D4B0774B43E26E27371D44207A08C563A9C45B39A8D6B1AF046`.
- Portable ZIP contains exactly `README.txt` and `哞-编辑器.exe`; its README and executable match the portable folder copies.
- Installer signature status is `NotSigned`, as expected from `--no-sign`.

- Historical English `MulEditor*` artifacts and the old MSI were left untouched and are not part of this release.

### 2026-08-10 Open File Line Comparison

Design:
- Keep the existing Diff mode and its current-file saved-version comparison.
- When Diff mode is active, add an explicit left-side source selector containing the active file's saved version and every other open file.
- Keep the active file on the right side; switching the selector compares the two current in-memory contents line by line without modifying either file.
- Show both file names above the Monaco diff panes and use each file's own syntax language when formats differ.
- Treat whitespace changes as meaningful line-content changes and keep comparison read-only.
- If the selected source file is closed or becomes the active file, fall back to the active file's saved version instead of retaining an invalid selection.

Implementation plan:
- Track the selected comparison source tab in `App` and pass open tabs plus the selection callback to `EditorPane`.
- Add the comparison source bar around the existing Monaco `DiffEditor` rather than adding a second diff implementation.
- Add Chinese and English source labels plus compact responsive styling.
- Verify saved-version comparison, cross-file selection, different-format syntax, tab switching, source close fallback, and normal editor restoration.

Success criteria:
- Diff mode can select any other open file as the left source while the active file remains on the right.
- Inserted, deleted, changed, and whitespace-only line differences are visible through Monaco's line diff.
- Closing or activating the selected source never leaves a blank or stale comparison.
- Exiting Diff mode restores the editable current file without changing either file's content.

Completed:
- Added `diffSourceId` state in `App` while keeping the active file as the fixed right side of the comparison.
- Added a native source selector above Monaco's existing `DiffEditor`; the first option remains the current file's saved version and every other open tab is available after it.
- Passed each side's own format language, current in-memory content, file-specific accessibility label, and read-only line-diff options to Monaco.
- Added automatic fallback when the selected source is closed or becomes active, and reset the source when Diff mode is closed.
- Added compact responsive comparison-bar styling and Chinese/English interface text.
- Worked around the `@monaco-editor/react 4.7.0` DiffEditor cleanup order by keeping both models until the widget is disposed, then releasing them in a guarded microtask. This prevents both the Monaco unload error and repeated-toggle model leaks.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still reports the existing chunks-over-500-kB warning.
- Playwright CLI verification at `http://127.0.0.1:6400/`: passed.
  - Selected another open Markdown file and observed inserted, deleted, changed, and whitespace-only line differences; the representative comparison produced 16 Monaco diff decorations.
  - Both sides remained read-only and exposed file-specific accessible editor labels.
  - Activating the selected source and closing the selected source both fell back to the active file's saved version.
  - Closing and reopening Diff mode reset the selector, restored the normal editor, and preserved the file content and saved state.
  - Five consecutive Diff off/on cycles produced no Monaco cleanup error and no stale content.
  - Chinese and English labels passed, and a 1040x680 viewport had no page-level horizontal overflow.
- Browser console contained no application runtime errors; the only error was the existing missing `/favicon.ico` request.
- Visual verification asset: `output/playwright/open-file-line-comparison.png`.

Packaging results:
- `npm run tauri:build -- --no-sign`: passed and rebuilt the x64 Windows GUI executable and configured NSIS installer with the line-comparison feature.
- Updated `release/哞-编辑器.exe`, `release/哞-编辑器_0.1.0_x64-setup.exe`, and `release/哞-编辑器-0.1.0-windows-x64-portable/哞-编辑器.exe`.
- Updated the portable README feature list and rebuilt the flat two-file `release/哞-编辑器-0.1.0-windows-x64-portable.zip`.
- Source, standalone, portable-folder, and ZIP-contained EXE SHA256: `7615038D9E2BAEF6F6F2DA7821499ECD34E5A688979F1DA037AE7605236CE84F`.
- Source and release NSIS installer SHA256: `D88887A20A49BD06E3A2EEA6884093D5A7E9BAEFC72B2DC99653B196376D66BE`.
- Portable ZIP SHA256: `9DF18799F00B3701EC91CD86C60C6A1E4581BD9DBBF1DAA51BF4F78E7DAD1ED4`.
- Portable ZIP contains exactly `README.txt` and `哞-编辑器.exe`, both matching the portable folder copies.
- PE and startup smoke test passed: x64 `0x8664`, PE32+ `0x020B`, Windows GUI subsystem `2`, product metadata `哞-编辑器 0.1.0`, responsive window title `哞-编辑器`.
- Installer signature status is `NotSigned`, as expected from `--no-sign`.

### 2026-08-10 Clean Startup And Formatting Icons

Design:
- Remove all bundled sample documents from the application startup state.
- Preserve the existing non-empty-tab invariant with one empty, unsaved-path `untitled.md` placeholder instead of adding a broad nullable-workspace state.
- Replace the untouched placeholder when the user creates or manually opens the first real document, while preserving it if the user has edited it.
- Make Markdown formatting controls visually consistent by replacing ambiguous text glyphs and the incorrect paper-plane quote icon with semantic Lucide icons.
- Keep the existing button order, snippets, tooltips, grouping, and keyboard behavior unchanged.

Completed:
- Replaced the seven-document `sampleDocuments` startup state with one empty `untitled.md` placeholder and removed the obsolete sample-data module.
- Added a strict untouched-placeholder check so the first Open or New action replaces it instead of leaving an extra blank tab.
- Replaced the Markdown `H/B/I/S/<>` text glyphs with `Heading1`, `Bold`, `Italic`, `Strikethrough`, `SquareCode`, and `Code` SVG icons.
- Replaced the incorrect `Send` quote icon with `TextQuote` and added explicit accessible labels to formatting actions.
- Kept all existing snippets, action order, groups, titles, and disabled history controls unchanged.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still reports the existing chunks-over-500-kB warning.
- Playwright CLI verification at 1600x1000 and 1040x680: passed.
  - Cold start contained only an empty `untitled.md`; all historical demo names and content were absent.
  - All 19 Markdown action buttons used visible 17x17 Lucide SVGs inside their button bounds; no raw `<>` text or `Send` icon remained.
  - Opening `package.json` and `tsconfig.json` replaced the placeholder and produced exactly two tabs; New JSON likewise replaced the placeholder with one `untitled.json` tab.
  - Comparing `package.json` with active `tsconfig.json` produced 123 Monaco diff decorations with two read-only sides.
  - The 1040x680 layout had no page-level horizontal overflow and kept the reference-health control visible.
- Browser console contained no application runtime errors after the full regression.
- Production bundle search found no sample-document-specific content.
- Visual verification asset: `output/playwright/clean-start-toolbar-icons.png`.

Packaging results:
- `npm run tauri:build -- --no-sign`: passed and rebuilt the x64 Windows GUI executable and configured NSIS installer.
- Updated the standalone EXE, NSIS installer, portable-folder EXE, portable README, and flat two-file portable ZIP under `release/`.
- Source, standalone, portable-folder, and ZIP-contained EXE SHA256: `EA3D14DB968CF686D828F05D4198EDDFB66C2AFC55600522DAED63639603BC7D`.
- Source and release NSIS installer SHA256: `9F40B3AA495147C4B4E6C0A672221A3D67D07DDD89F4EB14F088646492B1D841`.
- Portable ZIP SHA256: `621D8DBE8EF46CB4937944C6580028E3679020C975A5069C0819CC95849CB22E`.
- Portable ZIP contains exactly `README.txt` and the current `哞-编辑器.exe`.
- PE and startup smoke test passed: x64 `0x8664`, PE32+ `0x020B`, Windows GUI subsystem `2`, responsive window title `哞-编辑器`.
- Installer signature status is `NotSigned`, as expected from `--no-sign`.

### 2026-08-10 Scrollable Workspace File List

Design:
- Keep the workspace title and optional folder summary visible while only the file list scrolls vertically.
- Preserve the current sidebar width, file-row appearance, selection behavior, and workbench layout.
- Use the existing constrained-height chain rather than introducing JavaScript size calculations.

Completed:
- Made the sidebar a vertical flex container with clipped outer overflow so the file list can shrink within the workbench height.
- Kept the workspace header and optional folder summary fixed while `.fileTree` consumes the remaining height and scrolls vertically.
- Prevented horizontal file-list overflow, reserved stable scrollbar space, and truncated long relative paths with an ellipsis.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still reports the existing chunks-over-500-kB warning.
- Playwright CLI verification at 1040x680 with 13 existing project files: passed.
  - `.fileTree` used `overflow-y: auto`; its `scrollHeight` exceeded its `clientHeight`, and mouse-wheel input reached the maximum scroll position.
  - The final `tsconfig.json` row became fully visible and could be clicked; the sidebar row, editor tab, status bar, and Monaco editor all switched to that file.
  - The workspace header stayed at the same screen position, long paths stayed clipped, and the page itself gained no horizontal or vertical scroll.
- Browser console contained no application runtime errors; the only error was the existing missing `/favicon.ico` request.
- Visual verification asset: `output/playwright/sidebar-file-list-scroll.png`.

Packaging status:
- `npm run tauri:build -- --no-sign`: passed and rebuilt the x64 Windows GUI executable and configured NSIS installer.
- Updated the NSIS installer, portable-folder executable, portable README, and flat two-file portable ZIP under `release/`.
- Latest source, portable-folder, and ZIP-contained EXE SHA256: `CA21AC3237160DE18A981FD920A777E64C0D5A2959B08B92F41A23F7FE1D2329`.
- Source and release NSIS installer SHA256: `0C74BD88E6487DBD50F7B8B2B642F8431DF71B21D67D4008EB359FE68C09AA1A`.
- Portable ZIP SHA256: `0957B2562DDA2983E517B25C36917451127021A1867E86132C4554ECCD5724FE` and contains exactly `README.txt` plus `哞-编辑器.exe`.
- PE, metadata, and hidden startup smoke tests passed: x64 `0x8664`, PE32+ `0x020B`, Windows GUI subsystem `2`, product version `0.1.0`, responsive window title `哞-编辑器`.
- Installer signature status is `NotSigned`, as expected from `--no-sign`.
- Final standalone synchronization is pending because `release/哞-编辑器.exe` is currently running as PID `31956`; it was intentionally not terminated to protect possible unsaved work.

### 2026-08-10 Moved-Block-Aware Diff Alignment

Design:
- Keep Monaco's advanced line diff and side-by-side layout as the source of truth for unchanged-line alignment.
- Enable moved-block detection so sufficiently distinctive content that changes position is presented as a move rather than unrelated deletion and insertion regions.
- Preserve the original line order and text on both sides; do not sort structured files or invent matches for ambiguous repeated single lines.
- Keep comparison read-only and retain whitespace-sensitive differences.

Implementation plan:
- Enable Monaco's side-by-side move detection through the existing DiffEditor options.
- Verify a representative three-or-more-line moved block, ordinary insertions and edits, cross-file source selection, repeated Diff toggles, and minimum-window layout.
- Rebuild and verify the Windows executable, NSIS installer, and portable bundle.

Success criteria:
- A relocated multi-line block is detected and visually linked as moved content while unchanged surrounding lines stay aligned.
- Ordinary added, deleted, and modified lines remain visible and correctly paired.
- Comparing files never changes either document, and exiting Diff restores the normal editor without Monaco lifecycle errors.

Completed:
- Enabled Monaco's experimental moved-block rendering while retaining the advanced side-by-side line-diff algorithm, whitespace-sensitive comparison, and read-only documents.
- Kept both documents in their original order; the comparison does not sort structured data or rewrite either file to manufacture matches.
- Upgraded and exactly pinned `monaco-editor` to `0.56.0`, configured `@monaco-editor/react` to load that same runtime version, and switched TypeScript to Vite-compatible `Bundler` module resolution.
- Retained the guarded post-widget model cleanup. Monaco 0.56.0 now handles canceled asynchronous diff computations without leaking an unhandled `Canceled` rejection.

Verification results:
- `npm run check`: passed.
- `npm run build`: passed. Vite still reports the existing chunks-over-500-kB warning.
- Production-preview Playwright CLI verification at 1600x1000 and 1040x680: passed.
  - A distinctive six-line relocated block produced one original move marker, one modified move marker, and one visible connector between them.
  - Three unchanged anchor lines before and around the move had a measured left/right vertical offset of exactly zero pixels.
  - Ordinary line and character insertions, deletions, and replacements remained highlighted; both editors remained read-only.
  - Browser performance entries confirmed that the loader, editor, workers, languages, and contributions all came from `monaco-editor@0.56.0`, with no 0.55.1 resource retained.
  - Twenty rapid Diff off/on cycles completed with one current DiffEditor, one moved-block connector, and zero captured `unhandledrejection` events.
  - At 1040x680 the comparison remained side by side, both panes had nonzero dimensions, and neither the page nor the Diff shell had horizontal overflow.
- Browser console contained no application runtime error; the only error was the existing missing `/favicon.ico` request.
- Visual verification asset: `output/playwright/diff-moved-block-alignment.png`.

Packaging results:
- `npm run tauri:build -- --no-sign`: passed and rebuilt the x64 Windows GUI executable plus the configured NSIS installer.
- Synchronized the current standalone EXE, installer, portable-folder EXE, and updated README; rebuilt the flat two-file portable ZIP.
- Source, standalone, portable-folder, and ZIP-contained EXE SHA256: `D8FA79BE6386B9E52C850591DBC53DDE69A5F7646CEBA8E84C948262399769EF`.
- Source and release NSIS installer SHA256: `AA802D6C35D7EA55203469DC802E477822689B658D36D73464810B2F6D43752F`.
- Portable ZIP SHA256: `E9BD75498F1E4A12C396E8C8D0A8D8ECA09FF4F8892A348C1365D4408F6DFBA5`.
- Portable ZIP contains exactly `README.txt` and `哞-编辑器.exe`; both hashes match their portable-folder copies.
- PE and metadata verification passed: x64 `Machine = 0x8664`, PE32+ `0x020B`, Windows GUI `Subsystem = 2`, product/file description `哞-编辑器`, version `0.1.0`.
- Hidden desktop startup smoke test passed with window title `哞-编辑器`, a nonzero window handle, and `Responding = True`; the exact spawned process was closed afterward.
- Executable and installer signature status is `NotSigned`, as expected from `--no-sign`.
