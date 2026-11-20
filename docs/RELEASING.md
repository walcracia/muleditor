# 构建、下载与发布

本项目遵循三条持续要求：让 AI 能直接迭代源码；让不同电脑上的 AI agent 能通过仓库接续；让生成物可以下载。每次交接同时更新 `docs/HANDOFF.md` 与 `docs/design_progress.md`，记录本次实际验证、源码提交、产物位置与下一步。下载文件必须能追溯到对应源码，不能只写本机绝对路径。

## Windows 构建环境

- Windows x64、PowerShell 7、Git、Node.js 22 与 npm。
- Rust stable，使用 MSVC 工具链。
- Visual Studio Build Tools 的“使用 C++ 的桌面开发”工作负载、Windows SDK、Microsoft Edge WebView2 Runtime，参考 [Tauri Windows 前置条件](https://v2.tauri.app/start/prerequisites/#windows)。
- 构建需要访问 npm、crates.io、GitHub 等下载源。现有 `src/main.tsx` 从 jsDelivr 加载 Monaco 0.56.0，当前产物不能承诺完全离线使用。

在仓库根目录运行：

```powershell
npm ci
npm run check
npm run build
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run tauri:build -- --no-sign
```

`tauri:build` 会再次运行前端构建。默认输出为 `src-tauri/target/release/muleditor.exe` 和 `src-tauri/target/release/bundle/nsis/哞-编辑器_<版本>_x64-setup.exe`。不要使用历史残留的 `MulEditor_<版本>_x64-setup.exe`。

## 本地生成可分发文件

先完成当次构建，再运行：

```powershell
$releaseCommit = git rev-parse HEAD
pwsh -NoProfile -File scripts/package-release.ps1 -SourceCommit $releaseCommit
```

脚本读取版本与产品名，校验 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 的版本一致性，并检查 EXE 的版本与 x64 PE 类型。可用 `-ExpectedVersion 0.1.0` 显式限制版本，或用 `-ValidateOnly` 只检查这些版本（不检查二进制或生成物）。版本目前限定为稳定版 `X.Y.Z`。

如果在本机自定义了 Cargo 目标目录：

```powershell
$releaseCommit = git rev-parse HEAD
pwsh -NoProfile -File scripts/package-release.ps1 -TargetDir ..\environment\cargo-target -SourceCommit $releaseCommit
```

`-TargetDir` 指 Cargo target 根目录，其下必须有 `release/muleditor.exe` 和当前产品名的 NSIS 安装包；相对路径以仓库根目录为基准。目标目录是可选的本机配置，不要把上述目录当作其他电脑的必要条件。省略 `-SourceCommit` 只适合本地检查，此时 README 会明确标为 `local-uncommitted`，不能当作正式发布证据。

`release/github/` 产生三个分发文件：

| 文件 | 用途 |
| --- | --- |
| `MulEditor-<版本>-windows-x64-portable.zip` | 解压运行，ZIP 内只有 `哞-编辑器.exe` 与 `README.txt`；README 记录源码提交与运行条件 |
| `MulEditor-<版本>-windows-x64-setup.exe` | NSIS 安装程序 |
| `SHA256SUMS.txt` | 两个文件的 SHA-256 校验值 |

生成物不提交到 Git。正式文件通过 GitHub Release 下载，过程文件通过 Actions Artifacts 下载。目前使用 `--no-sign`，便携 EXE 与安装包均未做 Windows 代码签名。脚本只打包现有文件，不能证明文件由指定提交编译；正式流程必须从干净的指定 tag 重新构建。

## 持续验证与过程下载

当前 CI 也运行 `npm test`，再安装 Playwright Chromium 并执行 `npm run test:e2e`，验证预览与实际下载 HTML。Windows 本机已有 Edge 时可以临时设置 `$env:PLAYWRIGHT_CHANNEL = 'msedge'`，有网络代理需求时可设置 `PLAYWRIGHT_PROXY`，不要把本机代理地址提交进项目配置。

[CI 工作流](../.github/workflows/ci.yml) 在分支 push、pull request 和手动触发时运行 Windows 检查：锁定依赖安装、版本一致性、TypeScript 检查、前端构建与 Rust 测试。成功后上传 `muleditor-web-<commit>`，内容为 `dist/`，保留 30 天。这是浏览器构建，不是 Windows 安装程序，需要通过 HTTP 服务器运行。

前往 [Actions](https://github.com/walcracia/muleditor/actions)，打开对应 commit 的成功 CI run，在 Artifacts 中下载。Actions Artifacts 下载可能要求 GitHub 登录，过期后应重新构建。长期提供的桌面版本放在 [Releases](https://github.com/walcracia/muleditor/releases)，最新版本入口为 [latest](https://github.com/walcracia/muleditor/releases/latest)。

## 发布一个新版本

1. 先阅读当前 `AGENTS.md`、`docs/HANDOFF.md` 和设计文档，确认接续分支、未完成事项与最新远端状态。已有未提交改动时先妥善提交；不要强制覆盖其他电脑的工作。
2. 在迭代分支同步版本：`package.json`、`package-lock.json` 根版本及根 package、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 中本项目版本、`src-tauri/tauri.conf.json`。使用尚未发布的新版本号；不要移动或重用已发布 tag。
3. 完成本次验证，并在交接与设计文档中记录命令结果、已知问题、准备发布的版本与下一步。提交源码及文档，合入远端主分支后再次 `git fetch origin`，确认准备打 tag 的具体 commit。
4. 给这个已验证的 commit 打 tag 并推送，例如下列命令中的版本与提交必须替换为本次真实值：

   ```powershell
   git tag -a v0.1.1 <verified-commit-sha> -m "MulEditor 0.1.1"
   git push origin v0.1.1
   ```

5. [Windows Release 工作流](../.github/workflows/release.yml) 从这个 tag 全新检出，核对版本与源码 SHA，重新验证、构建 Windows x64 EXE/NSIS、打包和生成校验文件，最后创建 GitHub Release。先上传草稿，三项文件上传成功后才发布。
6. 等待工作流完成，打开实际 Release 链接，确认三个附件均可下载、校验值匹配、便携包内文件正确，并检查应用可启动。将实际 Release URL、tag、源码 SHA、验证结果与后续任务回填交接和设计文档，再提交文档更新。区分“发布源码提交”和后续“发布确认文档提交”。

发布工作流也可手动运行，输入已存在的 `vX.Y.Z` tag。若上次只留下草稿，重试会更新草稿附件再发布；若已经发布，工作流会停止，要求使用新版本，不静默替换公开文件。发布流程对同一 tag 串行执行，不取消正在上传的构建。需要仓库开启 Actions，内置 `GITHUB_TOKEN` 能获得 `contents: write`；通常无需个人 token。

如果某次迭代不发布桌面新版本，也必须在交接中写清原因，并给出本次 CI 生成物下载页与当前稳定 Release 链接。历史记录里的“通过”不能代替本次实际结果。

## 验证下载

将附件下载到同一目录，运行：

```powershell
Get-FileHash -Algorithm SHA256 .\MulEditor-0.1.0-windows-x64-portable.zip
Get-FileHash -Algorithm SHA256 .\MulEditor-0.1.0-windows-x64-setup.exe
Get-Content .\SHA256SUMS.txt
```

逐项比较文件名与哈希；示例版本需替换为实际版本。网页中的自动“Source code”ZIP 只有源码，不能替代安装包或便携包。

工作流使用经官方仓库核验的 [checkout](https://github.com/actions/checkout)、[setup-node](https://github.com/actions/setup-node)、[upload-artifact](https://github.com/actions/upload-artifact) v7 提交，并使用 [GitHub CLI Release](https://cli.github.com/manual/gh_release_create) 发布。以后升级 Action 时保留完整提交 SHA，并重新验证工作流。
