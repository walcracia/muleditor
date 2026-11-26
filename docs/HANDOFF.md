# MulEditor 跨电脑 AI 交接

更新时间：2026-11-26（Asia/Shanghai）。本文件保存当前状态；长期设计和历史验证保存在 [design_progress.md](design_progress.md)。

## 接班入口与三项原则

读取顺序：根目录 [AGENTS.md](../AGENTS.md) → [README.md](../README.md) → 本文件 → [设计与进度](design_progress.md) → [发布说明](RELEASING.md) → 本次涉及的源码。

1. **方便 AI 迭代**：源码、锁文件、模块入口、设计理由、验证结果一同进入仓库，让下一位 agent 可复现并修改。
2. **方便不同电脑轮流交接**：每次更新提交并推送代码及交接文档，写清基准、当前状态、未完成项和下一步；任何盘符、缓存和聊天都不是恢复工作的必要条件。
3. **生成物可以下载**：普通更新提供 Actions artifact，正式发布提供 GitHub Release、源提交、版本、安装包/便携包和 SHA-256 校验。不能以“本机已生成”代替可下载。

每次结束都检查这三项，并更新本文当前状态与设计文档中的相应记录。

## 当前交接：2026-11-26 最近打开文件（0.3.5）

- 用户要求：增加历史入口，能重新打开曾经打开过的文件。基准 `3c0b2212492ead688cd2f2ed23f225bc29db307d`，集成分支 `agent/recent-files-20261126`，目标 0.3.5。存储模块、工具栏菜单与浏览器回归分别在独立工作树开发，主 agent 整合 App、文件访问、文档与发布。
- 设计：在“打开”旁增加下拉入口，桌面版本机保存最近 20 个成功打开/实际查看的文件路径，去重并按最近使用排序；支持移除单条和清空，不保存正文或未保存编辑，不进 Git。打开文件夹不把全部文件灌入历史，仅记录当前查看的文件。
- 重开时从磁盘重新读取；若文件已在标签中打开，直接切换并保留未保存内容。失败保留历史项并显示可恢复的错误，允许重试或移除。另存成功也记录新路径。浏览器不能凭历史路径重获本机文件权限，仍需用户重新选择文件，不冒充持久文件访问能力。
- 实现入口：`src/lib/recentFiles.ts` 负责最多 20 条 MRU、Windows 路径身份、元数据校验及容错存储；`App.tsx` 负责实际查看/打开/另存后的记录、已有标签保护及异步重开；`fileAccess.ts` 复用原有 `read_text_file`，无新增 Rust 命令。`RecentFilesMenu.tsx` / `Toolbar.tsx` / `styles.css` 提供双语、键盘、空/忙/错误状态与窄窗口布局。
- 路径边界：仅收录完整绝对路径，Windows 路径按大小写/斜杠/扩展前缀做字面去重，不解析符号链接或文件系统别名。旧命令行入口若传相对路径，本版不会记录；请用绝对路径重新打开。普通文件对话框、文件夹和系统拖放均提供绝对路径。
- 另存后保留原编辑器 id，但原路径可能不再对应该标签；重开原路径时分配独立 id，保护新路径标签中的修改和撤销记录。文件错误保存原始信息、按当前语言生成文案。存储被阻止时保留本次运行内记录，菜单持续提示无法持久化，语言偏好读取/写入也做容错。
- 本轮 Windows x64、Node 22.14.0/npm 10.9.2、Rust 1.99.1：沿用本会话已完成的 `npm ci`（未新增依赖，仅项目版本变化），类型检查、构建、108 项前端测试、Rust check/test（`--manifest-path src-tauri/Cargo.toml --locked -j 1`，9 项）及版本校验通过。保留既有大 chunk 提示。
- 首轮 4 项历史专项及完整 30 组 Edge 回归通过。复核发现另存标签 id 冲突与旧语言错误文本后修正，并增加回归；5 项专项通过。一次 31 组完整运行有 30 项通过，既有格式状态用例的 Monaco loader.js 请求因 `net::ERR_NETWORK_CHANGED` 失败，未记为通过；改用本机代理重验，未放宽断言/超时。新增存储阻止用例又发现一次状态提示被打开消息覆盖，改为菜单内持久提示后，最终完整 32 组通过（1.1 分钟），含实际下载 HTML 的离线渲染/图片/图表/字体与净化，以及 6 项历史场景。
- 浏览器桌面文件场景使用仅存在于测试的 IPC 模拟，不能冒充原生文件访问。已核对双语截图：[中文](assets/muleditor-0.3.5-recent-files-zh.png)、[英文最小窗口](assets/muleditor-0.3.5-recent-files-en-minimum.png)。静态设计扫描未报匹配，但未运行需页面解析的规则，不称为完整 UI 审计。
- 发行源 `0895d1aa1b712c1978489fd8a34e57fb81451e06` 已合入并推送 `main`，标签 v0.3.5 指向该提交。本机从该干净提交执行 `npm.cmd run tauri:build -- --no-sign` 与标准打包脚本（版本 0.3.5、源提交参数）均通过，生成 EXE/NSIS/便携 ZIP。
- 原生检查使用公开测试文件及独立 WebView2 用户目录；通过 [WEBVIEW2_USER_DATA_FOLDER](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/webview2-idl) 仅为测试进程指定目录，并核对 WebView2 子进程参数，未改用户正常配置。程序真实打开了测试文件（可访问性树读到 Native history / Initial file text.），关闭后在该隔离目录读到历史键及文件名，证明原生记录已落盘。
- **原生交互未完成**：桌面自动输入先后返回 `GetCursorPos failed: 拒绝访问。 (0x80070005)` 与 `failed to activate captured window`，无法点击/键盘打开菜单。未把 IPC 模拟或磁盘键存在冒充原生重启后重开成功。只结束本次创建的测试进程，未操作用户已运行的编辑器。恢复步骤：在可交互的 Windows 桌面，使用全新隔离用户目录启动公开夹具，退出后修改夹具正文，再不带参数启动，验证历史重开读到新内容；随后测试缺失文件重试。安装器安装本轮也未执行。
- [云端 CI](https://github.com/walcracia/muleditor/actions/runs/45801557504) 成功：锁定安装、版本/类型/构建、108 前端测试、32 Chromium 回归（55.7 秒）、9 Rust 测试通过。前端 artifact `muleditor-web-0895d1aa1b712c1978489fd8a34e57fb81451e06` 已实际下载，含 index.html 和 123 个 assets，保留至 2026-12-26 18:33 Asia/Shanghai。
- [Windows Release](https://github.com/walcracia/muleditor/actions/runs/45802548547) 成功，[v0.3.5](https://github.com/walcracia/muleditor/releases/tag/v0.3.5) 已公开。三个正式附件均已实际下载；便携包仅 README.txt 与哞-编辑器.exe，README 的完整源提交匹配。EXE FileVersion/ProductVersion 为 0.3.5，x64/PE32+/GUI 子系统，EXE 与安装器均 NotSigned；EXE SHA-256 `fb7e917e80fb1e1eeda4eeef4d9de77756a385cc868d3090c4fb5b6485cf4536`。下载版未启动，不冒充完整原生验收。
- 下载：[便携 ZIP](https://github.com/walcracia/muleditor/releases/download/v0.3.5/MulEditor-0.3.5-windows-x64-portable.zip) SHA-256 `6430103d7d3d4fbfa7cfdbf126d2891a4c4598f6915cc5fc781a200506d2c0d9`；[安装包](https://github.com/walcracia/muleditor/releases/download/v0.3.5/MulEditor-0.3.5-windows-x64-setup.exe) SHA-256 `6be8274637e545560a28ca7af5af40abac2525613479cf02694af83eeaf7a56e`，均与[校验清单](https://github.com/walcracia/muleditor/releases/download/v0.3.5/SHA256SUMS.txt)及服务端 digest 匹配。注释标签对象与 peeled 源提交均经 API 核对一致。
- 下一步：代码、自动化检查和发布已完成；原生菜单交互验收仍待可交互桌面环境补做，恢复步骤见上述限制。包含本交接的后续提交仅确认文档，运行 `git log -1` 查询。新电脑先检查 Git 状态、fetch，干净工作区 `git pull --ff-only`，首次 `npm ci`，按用户后续优先级继续；不移动 v0.3.5 或替换附件。历史从本版开始积累，既有 CDN/未签名/编辑会话不持久化边界保留。

## 已完成交接：2026-11-26 模式切换保留光标位置

- 用户反馈：源码中已编辑到 300 多行，切回沉浸模式却回到文章开头。要求切换后停留在源码光标对应内容，便于继续编辑。
- 基准 `49bc774c56da2b995ffaf23005a3b94c6be75d6c`，集成分支 `agent/mode-position-20261126` 已合入并推送 `main`，版本 0.3.4。实现与浏览器回归分别使用独立工作树；主 agent 负责整合、验证、文档与发布。
- 已实现：模式按钮点击时经 imperative ref 读取当前编辑器位置，不在每次光标移动时触发 React 更新。Monaco 只返回活动文件、当前模型且非 Diff 的光标；沉浸模式用当前源文临时解析行映射，再把节点路径转回现有模型，保留源文、dirty 和撤销历史。
- 模块：`src/App.tsx` 交换位置命令；`EditorPane.tsx` 读取光标并复用 goTo；`ImmersiveEditor.tsx` 捕获选区、应用定位、可取消的滚动；`immersiveMarkdown.ts` 保存嵌套源码行信息并提供双向映射；共享位置类型在 `src/types.ts`。长列表定位到具体项，代码定位到内容行，表格定位到行；复杂行内语法的列可能近似，公式/图表/原始节点就近定位，不承诺源码符号与可视字符逐一对应。
- 富节点异步渲染完成时可在 10 秒窗口内重新居中；指针/键盘/滚轮/触摸、选区/文档变化、换文件或隐藏会取消旧定位，避免迟到渲染打断用户。未加入持续 RAF 轮询、视图重建或源文格式化。
- 验收：长文档 300 行以后切回沉浸时目标实际进入视口；普通块、列表/代码等位置可继续编辑；仅切换的保存字节和 dirty 保持，源码修改后映射有效，多文件来回切换不串位置。
- 本轮 Windows x64、Node 22.14.0/npm 10.9.2、Rust 1.99.1：重新 `npm ci`、类型检查、构建、101 项前端测试、版本 0.3.4 校验、Rust check/test（`--manifest-path src-tauri/Cargo.toml --locked -j 1`，9 项）通过。保留既有大 chunk 提示；依赖清单未新增包。
- 首次 Edge 完整回归中 21 项既有用例通过，新增长文档脚本点击整个 `.view-lines` 时，Playwright 自动滚动使点击点移出可见区域，两组用例超时；追踪日志明确为点击重试，随后停止该运行，未把其余用例记为通过。改为聚焦真实编辑输入区后，3 项专项全部通过（12.8 秒），未改变产品逻辑、超时或断言。随后完整 26 组全部通过（58.1 秒），包含实际下载 HTML 的离线公式/图表/字体/图片、净化与快速标签切换。
- 已核对本轮截图：[源码第 345 行对应段落](assets/muleditor-0.3.4-position-paragraph.png)、[连续列表第 325 项](assets/muleditor-0.3.4-position-list.png)。源码修改后定位与继续输入、仅切换字节保真、dirty 与撤销保留、多文件隔离均由真实交互验证。
- 本轮从干净发行源执行 `npm.cmd run tauri:build -- --no-sign` 和 `scripts/package-release.ps1 -ExpectedVersion 0.3.4 -SourceCommit <发行源 SHA>` 通过；本机使用可选 Cargo target 缓存，生成 EXE/NSIS/便携 ZIP。新 EXE 传入公开渲染夹具后启动检查通过（版本 0.3.4、窗口“哞-编辑器”、Responding=True），只关闭本次测试进程。未逐项重做原生 UI 或运行安装器安装，交互验收依据为本轮真实浏览器回归。
- 发行源 `d6a15f3a71afb680a4654f5ae1fb34087f322cf9` 已合入并推送 `main`，标签 `v0.3.4` 指向该提交。[云端 CI](https://github.com/walcracia/muleditor/actions/runs/45793339170) 成功：重新锁定安装、版本/类型/构建检查、101 前端测试、26 Chromium 回归（38.3 秒）、9 Rust 测试全部通过。前端 artifact `muleditor-web-d6a15f3a71afb680a4654f5ae1fb34087f322cf9` 已实际下载，含 index.html 和 123 个 assets，保留至 2026-12-26 17:38 Asia/Shanghai。
- [Windows Release](https://github.com/walcracia/muleditor/actions/runs/45793343372) 成功，[v0.3.4](https://github.com/walcracia/muleditor/releases/tag/v0.3.4) 已公开发布。正式三个附件均已实际下载，便携包内仅 README.txt 与哞-编辑器.exe，README 的完整源提交匹配。EXE 的 FileVersion/ProductVersion 为 `0.3.4`，EXE/安装器均 `NotSigned`；EXE SHA-256 `66b806a653b12c4d0f30e8a3b1977379492b3cb71192abe7d2ae66e6fab442bb`。下载版本仅核对元数据和内容，未启动 EXE 或安装器；本机同源构建启动证据见上文。
- 下载：[便携 ZIP](https://github.com/walcracia/muleditor/releases/download/v0.3.4/MulEditor-0.3.4-windows-x64-portable.zip) SHA-256 `ad5a6367bccf078fc1527a9294346b8b3eb05ab00ebc4ac555bf708750784ce4`；[安装包](https://github.com/walcracia/muleditor/releases/download/v0.3.4/MulEditor-0.3.4-windows-x64-setup.exe) SHA-256 `85bddcde062c72f1aa098327489ee852b1c8927494a88856270440fb8b893889`，均与[校验清单](https://github.com/walcracia/muleditor/releases/download/v0.3.4/SHA256SUMS.txt)匹配。标签对象和 peeled 源提交已通过服务端 API 核对一致。
- 下一步：本轮需求、验证及发布全部完成，无阻塞。包含本交接的后续提交只确认文档，运行 `git log -1` 查询；不移动已发布标签或替换资产。新电脑先检查 `git status --short --branch` 和 fetch，干净工作区 `git pull --ff-only`，首次 `npm ci`，按用户后续需求继续。原有 Monaco CDN、未签名、会话不持久化等边界保留。

## 已完成交接：2026-11-25 格式指示去重与强化高亮

- 用户反馈：当前格式高亮不明显，独立 Markdown 文案重复；以用户红框指向的状态栏独立类型文字为删除对象。
- 基准 `674f15b`，实现分支 `agent/status-contrast-20261125` 与测试恢复分支均已合入并推送 `main`，版本 0.3.3。移除已支持类型的独立文字；右侧当前项采用高对比亮色底/深字、加粗与更大留白，悬停保留具体类型信息。未知文本仍可回退提示。
- 实现入口：`src/components/StatusBar.tsx`、`src/styles.css`；格式仍直接派生 `DocumentTab.format`，不引入额外状态。回归位于 `tests/status-format.spec.ts`，保留原有两组并增加单一指示、悬停具体类型及实际颜色对比断言。
- 本轮 Windows x64、Node 22.14.0/npm 10.9.2、Rust 1.99.1：`npm run check`、`npm run build`、97 项前端测试、版本校验通过；`cargo check` / `cargo test`（`--manifest-path src-tauri/Cargo.toml --locked -j 1`）9 项通过。依赖仅项目版本变化，沿用本会话已完成的 `npm ci`；云端重新锁定安装。
- 原有 17 组 Edge 浏览器回归通过，增强断言后的 2 组格式专项再次通过。实测六类/三个 SPDX 变体切换，保存原文和 dirty 不变；当前底色与状态栏对比至少 7:1，文字与底色至少 4.5:1，中英文 1600/1040 均可见。截图：[MD/中文](assets/muleditor-0.3.3-format-zh.png)、[JSON/英文最小窗口](assets/muleditor-0.3.3-format-en-minimum.png)。保留既有大 chunk 构建提示。
- 发行源 `c8ab7120ee49314a6beb35e4db21695cdf57ecc1` 对应标签 v0.3.3。[Windows Release](https://github.com/walcracia/muleditor/actions/runs/45585922801) 的锁定安装、前端验证、Rust 测试、原生构建和标准打包成功；[正式 Release](https://github.com/walcracia/muleditor/releases/tag/v0.3.3) 已公开。已发布标签和附件不移动、不替换。
- 三个正式附件均已实际下载。便携 ZIP 仅含 `README.txt`、`哞-编辑器.exe`，README 源提交匹配；EXE 版本 `0.3.3`、`NotSigned`、SHA-256 `46a0fcca2f62147da4ac3a3517166e7c36494395f0fed83d89eb9e5599a1a84b`。本轮未启动下载版或安装器；不能把浏览器检查或构建成功冒充完整原生 UI 验证。
- 下载：[便携 ZIP](https://github.com/walcracia/muleditor/releases/download/v0.3.3/MulEditor-0.3.3-windows-x64-portable.zip) SHA-256 `1e41f6adaa19500f913a7e42ed55e0634084af8136bfb662bff6d39ff5b7b30c`；[安装包](https://github.com/walcracia/muleditor/releases/download/v0.3.3/MulEditor-0.3.3-windows-x64-setup.exe) SHA-256 `5ff60448aaa7cb9b453c1d6efb9f69414624b5d2ced09922e21d1158811630f3`，均与[校验清单](https://github.com/walcracia/muleditor/releases/download/v0.3.3/SHA256SUMS.txt)匹配。
- 本机原生构建两次未完成：首次前端预构建退出 `-1073741819`；限制 Node 堆至 768 MiB 后明确报 `Fatal process out of memory: Zone`，退出 `-2147483645`。当时系统提交内存余量不足 1 GiB，后来降至不足 300 MiB；无本项目遗留进程可释放，未终止其他应用。不能把本地构建写成通过，正式包改用云端干净构建。
- [首次 CI](https://github.com/walcracia/muleditor/actions/runs/45585912740) 的 16 组浏览器通过，既有多格式组合用例在同页第 11 次下载（bom.spdx.yaml 保存）等待事件超时；Rust 与 artifact 因此跳过。推断与 Chromium 连续下载限制有关，恢复方案是把七种格式拆为独立用例、各用新上下文，保留全部保存/导出字节断言及源码界面断言，不加重试或放宽超时；应用源码与发行包不变。
- 测试恢复提交 `128ac22e51e37488848ee6fc97d469154d61a1ca` 的收集检查通过，共 23 组；本机专项浏览器尝试退出 `-1073740791`，同期内存不足，未记为通过。该提交与发行源的差异只有测试及文档，应用、依赖和打包脚本一致。[恢复 CI](https://github.com/walcracia/muleditor/actions/runs/45591535752) 最终成功：重新锁定安装、类型/版本/构建检查、97 项前端测试、23 组 Chromium 浏览器回归（38.4 秒）、9 项 Rust 测试全部通过。前端 artifact `muleditor-web-128ac22e51e37488848ee6fc97d469154d61a1ca` 已实际下载，含 index.html 和 123 个 assets；保留至 2026-12-25 18:09 Asia/Shanghai。
- 下一步：本轮需求与发布均已完成，无阻塞。包含本交接的提交仅确认文档，运行 `git log -1` 查询；不移动发行标签。新电脑先检查 `git status --short --branch`、fetch，干净工作区 `git pull --ff-only`，首次执行 `npm ci`，按用户下一项需求继续。需本机重新构建时先确保足够系统内存，再执行发布文档中的标准命令；既有 CDN、未签名与会话不持久化边界仍保留。

## 已完成交接：2026-11-25 状态栏简化与当前格式高亮

- 用户要求：移除 Tauri 等运行环境信息；底部文件类型列表高亮当前打开文档的格式，随活动文件同步变化。
- 基准 `f2e3f74`，分支 `agent/status-format-20261125` 已合入并推送 `main`；发行标签 `v0.3.2` 的源提交固定为 `015576a15ee2ebfdf56b3f09e4671681fb3bf70c`。本确认仅更新文档，精确提交可运行 `git log -1`，不移动标签或替换附件。
- 实现入口：`StatusBar.tsx`、`src/styles.css`，格式直接派生 `DocumentTab.format`，SPDX 三种变体归为一组；移除 App 传入的 runtime 与对应 UI 文案。开发文档中的技术栈说明保留。
- 已验证：`npm run check`、`npm run build`、97 项前端测试、版本校验，以及本轮原有 15 组和新增 2 组 Edge 浏览器回归均通过；Rust check/test（`--locked -j 1`，manifest 为 `src-tauri/Cargo.toml`）9 项通过。依赖仅项目版本变化，沿用本会话已完成的 `npm ci`；云端还会重新锁定安装。
- 实测多文件切换仅对应项高亮，SPDX 三种变体一致，状态标签不修改文件或 dirty；中英文 1600/1040 均完整显示，运行环境标识消失。截图：[MD 高亮](assets/muleditor-0.3.2-format-zh.png)、[JSON 高亮/英文最小窗口](assets/muleditor-0.3.2-format-en-minimum.png)。未知格式不误亮；未为测试引入生产后门。
- 本轮 Windows `npm.cmd run tauri:build -- --no-sign` 和 `scripts/package-release.ps1` 通过，生成本地 EXE/NSIS/便携 ZIP；未冒充已重做完整原生 UI、安装器安装或下载版启动。
- [云端 CI](https://github.com/walcracia/muleditor/actions/runs/45581326677) 成功，同一源提交锁定安装、97 前端测试、17 组 Chromium 浏览器回归、9 Rust 测试均通过。前端 artifact 已实际下载，含 index.html 和 123 个 assets；保留至 2026-12-25 17:04 Asia/Shanghai。
- [Windows Release](https://github.com/walcracia/muleditor/actions/runs/45581334356) 成功，[v0.3.2](https://github.com/walcracia/muleditor/releases/tag/v0.3.2) 已公开发布。三个附件均已实际下载；便携 ZIP 仅 README.txt 和哞-编辑器.exe，README 源提交一致。EXE 版本 `0.3.2`、`NotSigned`、SHA-256 `49e211943b9c5ebd698f37ca8542a8fe62d194dd846a19912e10fa31392e0ad8`；下载版未启动，不把本机编译或浏览器测试冒充下载版原生启动证据。
- 下载：[便携 ZIP](https://github.com/walcracia/muleditor/releases/download/v0.3.2/MulEditor-0.3.2-windows-x64-portable.zip) SHA-256 `5dcb5c5f55bd67edc6decebdbf6ee357b0088fcf81a9c4a600f5aa06caa536a7`；[安装包](https://github.com/walcracia/muleditor/releases/download/v0.3.2/MulEditor-0.3.2-windows-x64-setup.exe) SHA-256 `58546e6690e93cd91ac65c005e0d3dd9c133768749a055b15d1e0145c9dbbc7d`，均与[校验清单](https://github.com/walcracia/muleditor/releases/download/v0.3.2/SHA256SUMS.txt)匹配。
- 下一步：本轮需求、验证和发布均已完成。新电脑先检查 Git 状态、fetch；干净工作区 `git pull --ff-only`，首次安装 `npm ci`，再按用户下一项需求继续。既有源码编辑 CDN、未签名与会话不持久化等边界保留在开发文档中。

## 已完成交接：2026-11-25 可关闭工作区与问题面板

- 用户新要求：左侧工作区、底部问题面板可以关闭，并有重新打开入口。关闭只改变显示，保留文档、dirty 状态、编辑历史和诊断计算。
- 基准：`383f40d`（0.3.0 发布确认），集成分支 `agent/closable-panels-20261125` 已合入并推送 `main`；组件与浏览器用例在独立工作树开发。`v0.3.1` 的发行源提交固定为 `45578ad83b08ff733e0c1a4cfbc6a993da9217ff`；测试夹具后续修正于 `8551a8752307d70f213e3d59e63c1cc0e510787e`，应用源码和发行包不变。本确认仅更新文档，精确提交运行 `git log -1`。
- 已实现：面板标题右侧 X、顶部与“大纲”同组的“工作区/问题”切换按钮、编辑区自适应与焦点恢复；支持格式/操作状态移到底栏。设计与决策见 design_progress 中 0.3.1 小节。
- 本轮验证：同一 Windows/Node/Rust 环境，`npm run check`、`npm test` 97 项、`npm run build`、Edge `npm run test:e2e` 15 组（原 13 组与新增 2 组）、版本校验通过；`cargo check --locked -j 1` 和 `cargo test --locked -j 1` 9 项通过，manifest 为 `src-tauri/Cargo.toml`。本轮依赖仅版本号变化，沿用本会话已执行的锁定 `npm ci`。
- 实测两区独立关闭/重开，编辑宽高实际增加，大纲组合全关不留空列；脏状态、源/沉浸内容保留，问题隐藏时 JSON 诊断继续更新，关闭焦点回顶部按钮。中英文 1040/1600 实际截图已核对：[关闭状态](assets/muleditor-0.3.1-panels-closed.png)、[英文最小窗口](assets/muleditor-0.3.1-panels-en-minimum.png)。保留既有大 chunk 构建提示。
- 原生构建：从干净发行源提交执行 `npm.cmd run tauri:build -- --no-sign` 和 `scripts/package-release.ps1` 通过，生成新 EXE、NSIS 和便携 ZIP。本轮不冒充已重复安装器安装或完整原生文件操作验收；交互证据为本轮真实浏览器操作，下载版只核对内容/版本/签名/哈希。
- 首次[CI](https://github.com/walcracia/muleditor/actions/runs/45575899207) 中 14 组浏览器通过，新增 JSON 用例因模拟键入触发 Monaco 自动补齐而留下多余配对字符，保存原文断言失败。`8551a87` 仅将该非法 JSON 夹具改为不含配对符号的文本，仍完整检查隐藏期间诊断、dirty、保存原文和恢复内容；未弱化断言或改动应用实现，也未移动标签。
- 修正后的[CI](https://github.com/walcracia/muleditor/actions/runs/45576694266) 成功：锁定安装、97 前端测试、15 组 Chromium 浏览器回归、9 Rust 测试及前端 artifact。`muleditor-web-8551a8752307d70f213e3d59e63c1cc0e510787e` 保留至 2026-12-25 16:33 Asia/Shanghai。发行源与该提交的差异只有上述测试文件。
- [Windows Release](https://github.com/walcracia/muleditor/actions/runs/45575906971) 成功，正式 [v0.3.1](https://github.com/walcracia/muleditor/releases/tag/v0.3.1) 三个附件已实际下载。ZIP 仅 README.txt 与哞-编辑器.exe，README 源提交匹配；EXE 为 `0.3.1`、`NotSigned`、SHA-256 `82ff2178d8005f9c7dd80a8e5e084fbbb76644a33827f0dc886e2bad698a7e91`。
- 下载：[便携 ZIP](https://github.com/walcracia/muleditor/releases/download/v0.3.1/MulEditor-0.3.1-windows-x64-portable.zip) SHA-256 `36f13e0e39ddf0e8048ae9bbb5c1828e3fef83ba7483dd2fa3a1874e8764193b`；[安装包](https://github.com/walcracia/muleditor/releases/download/v0.3.1/MulEditor-0.3.1-windows-x64-setup.exe) SHA-256 `46828eb7457d033532b19ec5e90ec2a82b375a189ad94d773a9ffda17ed6c837`，与[校验清单](https://github.com/walcracia/muleditor/releases/download/v0.3.1/SHA256SUMS.txt)一致。
- 下一步：本轮需求及发布均已完成。新电脑先 `git status --short --branch`，再 fetch；干净工作区 `git pull --ff-only`，首次安装 `npm ci`，按用户下一项需求继续。面板显示选择仅当前运行内保留，既有 Monaco CDN、未签名与会话不持久化等边界不变。

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
