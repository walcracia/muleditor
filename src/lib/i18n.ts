import type { DocumentFormat, Severity } from "../types";

export type Locale = "zh" | "en";

const formatLabels: Record<Locale, Record<DocumentFormat, string>> = {
  zh: {
    markdown: "Markdown",
    html: "HTML",
    xml: "XML",
    yaml: "YAML",
    json: "JSON",
    "spdx-json": "SPDX JSON",
    "spdx-yaml": "SPDX YAML",
    "spdx-tag-value": "SPDX 标签/值",
    unknown: "文本"
  },
  en: {
    markdown: "Markdown",
    html: "HTML",
    xml: "XML",
    yaml: "YAML",
    json: "JSON",
    "spdx-json": "SPDX JSON",
    "spdx-yaml": "SPDX YAML",
    "spdx-tag-value": "SPDX Tag/Value",
    unknown: "Text"
  }
};

const messages = {
  zh: {
    "toolbar.newMenu": "选择新建文件格式",
    "toolbar.newFormat": "新建 {format} 文件",
    "toolbar.new": "新建",
    "toolbar.open": "打开",
    "toolbar.openFolder": "文件夹",
    "toolbar.save": "保存",
    "toolbar.saveAs": "另存为",
    "toolbar.export": "导出",
    "toolbar.editor": "编辑",
    "toolbar.editorTitle": "显示或隐藏编辑区",
    "toolbar.preview": "预览",
    "toolbar.immersive": "沉浸模式",
    "toolbar.source": "源代码模式",
    "toolbar.format": "格式化",
    "toolbar.validate": "校验",
    "toolbar.diff": "对比",
    "toolbar.outline": "大纲",
    "toolbar.outlineTitle": "显示或隐藏右侧大纲",
    "toolbar.language": "EN",
    "toolbar.languageTitle": "切换到英文界面",
    "toolbar.statusSeparator": "·",
    "toolbar.supportedFormats": "支持的格式",
    "drop.openFiles": "释放以打开文件",
    "tabs.openDocuments": "已打开文档",
    "tabs.close": "关闭",
    "preview.title": "{name} 预览",
    "preview.openInBrowser": "在内置浏览器打开",
    "preview.openInBrowserTitle": "用内置浏览器窗口打开 HTML 预览",
    "preview.mermaidError": "Mermaid 图表渲染失败",
    "preview.rendering": "正在渲染预览…",
    "preview.renderError": "预览渲染失败：{reason}",
    "preview.renderWarnings": "部分内容未能渲染：{details}",
    "status.exporting": "正在准备导出 {name}…",
    "status.exportFailed": "导出失败：{reason}",
    "diff.comparison": "文件行内容对比",
    "diff.original": "左侧基准",
    "diff.modified": "右侧当前",
    "diff.savedVersion": "{name}（已保存版本）",
    "diff.selectSource": "选择要与 {name} 对比的文件",
    "diff.originalAria": "基准文件：{name}",
    "diff.modifiedAria": "当前文件：{name}",
    "panel.workspace": "工作区",
    "panel.outline": "大纲",
    "panel.closeOutline": "关闭大纲",
    "panel.goToOutlineItem": "跳转到 {label}",
    "panel.validation": "校验",
    "panel.problems": "问题",
    "panel.search": "搜索",
    "panel.exportLog": "导出日志",
    "common.clean": "正常",
    "common.saved": "已保存",
    "common.modified": "已修改",
    "common.browser": "浏览器",
    "common.tauri": "Tauri",
    "common.files": "个文件",
    "common.lines": "行",
    "common.issues": "个问题",
    "common.noProblems": "未检测到问题",
    "common.noOutline": "无大纲",
    "common.noPreview": "无结构预览",
    "common.missing": "缺失",
    "status.ready": "就绪",
    "status.noSupportedFiles": "未选择支持的文件",
    "status.created": "已新建 {name}",
    "status.validationClean": "校验正常",
    "status.languageChanged": "界面语言已切换为中文",
    "status.opened": "已打开 {name}",
    "status.openedFiles": "已打开 {count} 个工作区文件",
    "status.saved": "已保存 {name}",
    "status.downloaded": "已下载 {name}",
    "status.exported": "已导出 {name}",
    "status.formatted": "已格式化 {name}",
    "status.validationIssues": "{count} 个校验问题",
    "status.unresolvedReference": "未解析引用：{target}",
    "status.openedReference": "已打开引用 {target}",
    "status.openedHtmlPreview": "已在内置浏览器打开 {name}",
    "status.htmlPreviewOnly": "仅 HTML 文件支持内置浏览器预览",
    "status.referencesClean": "当前文件引用正常",
    "status.referencesMissing": "当前文件有 {count} 个未解析引用",
    "status.insertedSnippet": "已插入 {format} 片段",
    "nav.edit": "编辑",
    "nav.contentType": "内容类型",
    "nav.referencesClean": "引用正常",
    "nav.referencesMissing": "{count} 个缺失",
    "nav.outline": "大纲",
    "nav.reference": "引用",
    "nav.referenceHealth": "引用健康状态",
    "nav.openReference": "打开 {target}{line}",
    "nav.unresolvedReference": "未解析 {kind}：{target}",
    "nav.goToLine": "{kind}，第 {line} 行",
    "metadata.name": "名称",
    "metadata.version": "版本",
    "metadata.dataLicense": "数据许可",
    "metadata.namespace": "命名空间",
    "metadata.creators": "创建者",
    "metadata.missing": "缺失",
    "metadata.untitled": "未命名",
    "metric.packages": "包",
    "metric.files": "文件",
    "metric.relations": "关系",
    "metric.creators": "创建者"
  },
  en: {
    "toolbar.newMenu": "Choose new file format",
    "toolbar.newFormat": "Create {format} file",
    "toolbar.new": "New",
    "toolbar.open": "Open",
    "toolbar.openFolder": "Folder",
    "toolbar.save": "Save",
    "toolbar.saveAs": "Save As",
    "toolbar.export": "Export",
    "toolbar.editor": "Edit",
    "toolbar.editorTitle": "Show or hide the editor pane",
    "toolbar.preview": "Preview",
    "toolbar.immersive": "Immersive mode",
    "toolbar.source": "Source mode",
    "toolbar.format": "Format",
    "toolbar.validate": "Validate",
    "toolbar.diff": "Diff",
    "toolbar.outline": "Outline",
    "toolbar.outlineTitle": "Show or hide the right outline pane",
    "toolbar.language": "中文",
    "toolbar.languageTitle": "Switch to Chinese UI",
    "toolbar.statusSeparator": "·",
    "toolbar.supportedFormats": "Supported formats",
    "drop.openFiles": "Drop to open files",
    "tabs.openDocuments": "Open documents",
    "tabs.close": "Close",
    "preview.title": "{name} preview",
    "preview.openInBrowser": "Open in browser",
    "preview.openInBrowserTitle": "Open HTML preview in a built-in browser window",
    "preview.mermaidError": "Mermaid diagram failed to render",
    "preview.rendering": "Rendering preview…",
    "preview.renderError": "Preview could not be rendered: {reason}",
    "preview.renderWarnings": "Some content could not be rendered: {details}",
    "status.exporting": "Preparing export for {name}…",
    "status.exportFailed": "Export failed: {reason}",
    "diff.comparison": "File line comparison",
    "diff.original": "Left source",
    "diff.modified": "Right current",
    "diff.savedVersion": "{name} (saved version)",
    "diff.selectSource": "Choose a file to compare with {name}",
    "diff.originalAria": "Source file: {name}",
    "diff.modifiedAria": "Current file: {name}",
    "panel.workspace": "Workspace",
    "panel.outline": "Outline",
    "panel.closeOutline": "Close outline",
    "panel.goToOutlineItem": "Go to {label}",
    "panel.validation": "Validation",
    "panel.problems": "Problems",
    "panel.search": "Search",
    "panel.exportLog": "Export Log",
    "common.clean": "Clean",
    "common.saved": "Saved",
    "common.modified": "Modified",
    "common.browser": "Browser",
    "common.tauri": "Tauri",
    "common.files": "files",
    "common.lines": "lines",
    "common.issues": "issues",
    "common.noProblems": "No problems detected",
    "common.noOutline": "No outline",
    "common.noPreview": "No structured preview",
    "common.missing": "missing",
    "status.ready": "Ready",
    "status.noSupportedFiles": "No supported files selected",
    "status.created": "Created {name}",
    "status.validationClean": "Validation clean",
    "status.languageChanged": "UI language switched to English",
    "status.opened": "Opened {name}",
    "status.openedFiles": "Opened {count} workspace files",
    "status.saved": "Saved {name}",
    "status.downloaded": "Downloaded {name}",
    "status.exported": "Exported {name}",
    "status.formatted": "Formatted {name}",
    "status.validationIssues": "{count} validation issues",
    "status.unresolvedReference": "Unresolved reference: {target}",
    "status.openedReference": "Opened reference {target}",
    "status.openedHtmlPreview": "Opened {name} in the built-in browser",
    "status.htmlPreviewOnly": "Built-in browser preview is available for HTML files only",
    "status.referencesClean": "Current file references are clean",
    "status.referencesMissing": "Current file has {count} unresolved references",
    "status.insertedSnippet": "Inserted {format} snippet",
    "nav.edit": "Edit",
    "nav.contentType": "Content type",
    "nav.referencesClean": "refs clean",
    "nav.referencesMissing": "{count} missing",
    "nav.outline": "Outline",
    "nav.reference": "Reference",
    "nav.referenceHealth": "Reference health",
    "nav.openReference": "Open {target}{line}",
    "nav.unresolvedReference": "Unresolved {kind}: {target}",
    "nav.goToLine": "{kind} at line {line}",
    "metadata.name": "Name",
    "metadata.version": "Version",
    "metadata.dataLicense": "Data License",
    "metadata.namespace": "Namespace",
    "metadata.creators": "Creators",
    "metadata.missing": "Missing",
    "metadata.untitled": "Untitled",
    "metric.packages": "Packages",
    "metric.files": "Files",
    "metric.relations": "Relations",
    "metric.creators": "Creators"
  }
} satisfies Record<Locale, Record<string, string>>;

export function text(locale: Locale, key: keyof (typeof messages)["en"], values?: Record<string, string | number>): string {
  const template = messages[locale][key] ?? messages.en[key] ?? key;
  return values
    ? Object.entries(values).reduce((result, [name, value]) => result.replace(new RegExp(`\\{${name}\\}`, "g"), String(value)), template)
    : template;
}

export function formatLabel(format: DocumentFormat, locale: Locale): string {
  return formatLabels[locale][format] ?? formatLabels.en[format];
}

const severityLabels: Record<Locale, Record<Severity, string>> = {
  zh: {
    error: "错误",
    warning: "警告",
    info: "信息"
  },
  en: {
    error: "ERROR",
    warning: "WARNING",
    info: "INFO"
  }
};

const diagnosticSources: Record<Locale, Record<string, string>> = {
  zh: {
    Workspace: "工作区",
    HTML: "HTML",
    XML: "XML",
    YAML: "YAML",
    JSON: "JSON",
    SPDX: "SPDX"
  },
  en: {
    Workspace: "Workspace",
    HTML: "HTML",
    XML: "XML",
    YAML: "YAML",
    JSON: "JSON",
    SPDX: "SPDX"
  }
};

const referenceKindLabels: Record<Locale, Record<string, string>> = {
  zh: {
    image: "图片",
    link: "链接",
    asset: "资源",
    schema: "Schema",
    dtd: "DTD",
    include: "include",
    alias: "别名",
    reference: "引用",
    relationship: "关系",
    "$ref": "$ref"
  },
  en: {
    image: "image",
    link: "link",
    asset: "asset",
    schema: "schema",
    dtd: "DTD",
    include: "include",
    alias: "alias",
    reference: "reference",
    relationship: "relationship",
    "$ref": "$ref"
  }
};

export function severityLabel(severity: Severity, locale: Locale): string {
  return severityLabels[locale][severity] ?? severityLabels.en[severity] ?? severity;
}

export function diagnosticSourceLabel(source: string, locale: Locale): string {
  return diagnosticSources[locale][source] ?? source;
}

export function diagnosticMessage(message: string, locale: Locale): string {
  if (locale === "en") return message;

  if (message === "Document is empty") return "文档为空";
  if (message === "XML parse error") return "XML 解析错误";
  if (message === "JSON parse error") return "JSON 解析错误";
  if (message === "YAML parse error") return "YAML 解析错误";

  const unresolved = /^Unresolved (.+?) reference: (.+)$/.exec(message);
  if (unresolved) {
    return `未解析${referenceKindLabel(unresolved[1], locale)}引用：${unresolved[2]}`;
  }

  const [firstLine] = message.split(/\r?\n/);
  const parserLocation = /^(.*) at line (\d+), column (\d+):?\s*$/.exec(firstLine);
  if (parserLocation) {
    const [, rawPrefix, line, column] = parserLocation;
    const prefix = yamlParserMessagePrefix(rawPrefix);
    const detail = message.slice(firstLine.length).trim();
    const suffix = detail ? `：${detail}` : "";
    return `${prefix}（第 ${line} 行，第 ${column} 列）${suffix}`;
  }

  const jsonPosition = /^(.+) in JSON at position (\d+)$/.exec(message);
  if (jsonPosition) {
    return `JSON 解析错误：${jsonPosition[1]}（位置 ${jsonPosition[2]}）`;
  }

  return message;
}

function referenceKindLabel(kind: string, locale: Locale): string {
  return referenceKindLabels[locale][kind] ?? kind;
}

function yamlParserMessagePrefix(prefix: string): string {
  switch (prefix) {
    case "A block sequence may not be used as an implicit map key":
      return "块序列不能作为隐式映射键使用";
    case "Implicit keys need to be on a single line":
      return "隐式键必须位于单行";
    case "Implicit map keys need to be followed by map values":
      return "隐式映射键后必须跟随映射值";
    case "Unexpected block-seq-ind on same line with key":
      return "键所在行出现了意外的块序列";
    case "Nested mappings are not allowed in compact mappings":
      return "紧凑映射中不允许嵌套映射";
    case "Map keys must be unique":
      return "映射键必须唯一";
    default:
      return prefix;
  }
}
