[CmdletBinding()]
param(
    [string]$TargetDir = '',
    [string]$SourceCommit = 'local-uncommitted',
    [string]$ExpectedVersion = '',
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$packageLock = Get-Content -LiteralPath (Join-Path $projectRoot 'package-lock.json') -Raw | ConvertFrom-Json -AsHashtable
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
$cargoManifest = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri/Cargo.toml') -Raw
$cargoPackage = [regex]::Match($cargoManifest, '(?ms)^\[package\]\s*\r?\n(.*?)(?=^\[|\z)').Groups[1].Value
$cargoVersion = [regex]::Match($cargoPackage, '(?m)^version\s*=\s*"([^"]+)"').Groups[1].Value
$cargoLock = Get-Content -LiteralPath (Join-Path $projectRoot 'src-tauri/Cargo.lock') -Raw
$cargoLockVersion = [regex]::Match($cargoLock, '(?ms)^\[\[package\]\]\s*\r?\nname\s*=\s*"muleditor"\s*\r?\nversion\s*=\s*"([^"]+)"').Groups[1].Value
$version = [string]$package.version

if ($version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Only stable x.y.z versions are supported: $version"
}
$versions = @($config.version, $cargoVersion, $cargoLockVersion, $packageLock.version, $packageLock.packages[''].version)
if ($versions.Where({ $_ -ne $version }).Count -gt 0) {
    throw "Version mismatch. package.json=$version; tauri=$($config.version); Cargo=$cargoVersion; Cargo.lock=$cargoLockVersion; package-lock=$($packageLock.version) / $($versions[-1])."
}
if ($ExpectedVersion -and $ExpectedVersion -ne $version) {
    throw "Expected version $ExpectedVersion does not match project version $version."
}
if ($ValidateOnly) {
    Write-Output "Version validation passed: $version"
    return
}
if ($SourceCommit -ne 'local-uncommitted' -and $SourceCommit -notmatch '^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$') {
    throw 'SourceCommit must be a full Git commit SHA, or local-uncommitted for a local package.'
}
if ($SourceCommit -eq 'local-uncommitted') {
    Write-Warning 'This local package has no source commit recorded. Pass -SourceCommit for a published release.'
}

if (-not $TargetDir) {
    $TargetDir = Join-Path $projectRoot 'src-tauri/target'
} elseif (-not [IO.Path]::IsPathRooted($TargetDir)) {
    $TargetDir = Join-Path $projectRoot $TargetDir
}
$TargetDir = [IO.Path]::GetFullPath($TargetDir)
$releaseDir = Join-Path $TargetDir 'release'
$sourceExe = Join-Path $releaseDir 'muleditor.exe'
$sourceInstaller = Join-Path $releaseDir "bundle/nsis/$($config.productName)_${version}_x64-setup.exe"
foreach ($sourceFile in @($sourceExe, $sourceInstaller)) {
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
        throw "Required build output is missing: $sourceFile. Run npm run tauri:build -- --no-sign first."
    }
}

# Use the current product name exactly; older MulEditor installers may coexist.
$exeVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($sourceExe).ProductVersion
if ($exeVersion -notmatch ('^' + [regex]::Escape($version) + '(?:\.0)?$')) {
    throw "Executable product version $exeVersion does not match $version. Rebuild before packaging."
}
$exeStream = [IO.File]::OpenRead($sourceExe)
$exeReader = [IO.BinaryReader]::new($exeStream)
try {
    $exeStream.Position = 0x3c
    $peOffset = $exeReader.ReadInt32()
    $exeStream.Position = $peOffset
    if ($exeReader.ReadUInt32() -ne 0x00004550 -or $exeReader.ReadUInt16() -ne 0x8664) {
        throw 'The portable executable must be a Windows x64 PE file.'
    }
} finally {
    $exeReader.Dispose()
    $exeStream.Dispose()
}

$outputDir = Join-Path $projectRoot 'release/github'
$null = New-Item -ItemType Directory -Path $outputDir -Force
$portableName = "MulEditor-${version}-windows-x64-portable.zip"
$installerName = "MulEditor-${version}-windows-x64-setup.exe"
$portablePath = Join-Path $outputDir $portableName
$installerPath = Join-Path $outputDir $installerName
$checksumPath = Join-Path $outputDir 'SHA256SUMS.txt'

# Only replace these three known outputs; never remove a build/output directory.
foreach ($outputFile in @($portablePath, $installerPath, $checksumPath)) {
    if (Test-Path -LiteralPath $outputFile -PathType Leaf) {
        Remove-Item -LiteralPath $outputFile
    }
}
Copy-Item -LiteralPath $sourceInstaller -Destination $installerPath

$portableReadme = @"
哞-编辑器 / MulEditor $version — Windows x64 portable

Source repository: https://github.com/walcracia/muleditor
Source commit: $SourceCommit
Release: https://github.com/walcracia/muleditor/releases/tag/v$version

将 ZIP 解压到可写目录，再运行「哞-编辑器.exe」。
需要 Microsoft Edge WebView2 Runtime。
当前 Monaco 编辑器从 cdn.jsdelivr.net 加载，使用编辑器时需要网络。
此版本未进行 Windows 代码签名。

Extract this ZIP to a writable folder and run 哞-编辑器.exe.
Microsoft Edge WebView2 Runtime is required.
The current Monaco editor loads from cdn.jsdelivr.net and requires network access.
This build is not code-signed.
"@

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($portablePath, [IO.Compression.ZipArchiveMode]::Create)
try {
    $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive, $sourceExe, "$($config.productName).exe", [IO.Compression.CompressionLevel]::Optimal
    )
    $readmeEntry = $archive.CreateEntry('README.txt')
    $readmeWriter = [IO.StreamWriter]::new($readmeEntry.Open(), [Text.UTF8Encoding]::new($false))
    try {
        $readmeWriter.Write($portableReadme)
    } finally {
        $readmeWriter.Dispose()
    }
} finally {
    $archive.Dispose()
}

$checksumLines = foreach ($assetPath in @($portablePath, $installerPath)) {
    $assetHash = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
    "$assetHash  $([IO.Path]::GetFileName($assetPath))"
}
[IO.File]::WriteAllLines($checksumPath, $checksumLines, [Text.UTF8Encoding]::new($false))
Write-Output "Release packages: $outputDir"
Get-Item -LiteralPath $portablePath, $installerPath, $checksumPath | Select-Object Name, Length
