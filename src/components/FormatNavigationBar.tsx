import type { ReactNode } from "react";
import {
  AlertTriangle,
  Anchor,
  Bold,
  Braces,
  Code,
  FileCode2,
  FileJson,
  FileSymlink,
  FunctionSquare,
  GitBranch,
  Hash,
  Heading1,
  Heading2,
  Image,
  Italic,
  KeyRound,
  Link,
  List,
  ListOrdered,
  ListTree,
  Maximize2,
  Mic,
  Minus,
  Package,
  Pencil,
  Redo2,
  Smile,
  SquareCode,
  SquareCheckBig,
  Strikethrough,
  Table,
  Target,
  TextQuote,
  Undo2,
  UploadCloud
} from "lucide-react";
import type { DocumentFormat, DocumentTab, FormatNavigationInfo, WorkspaceReference } from "../types";
import type { Locale } from "../lib/i18n";
import { formatLabel, text } from "../lib/i18n";
import type { ImmersiveToolbarState } from "./ImmersiveEditor";

interface FormatNavigationBarProps {
  tab: DocumentTab;
  info: FormatNavigationInfo;
  locale: Locale;
  onGoToLine: (tabId: string, line: number) => void;
  onOpenReference: (reference: WorkspaceReference) => void;
  onInsertSnippet: (text: string) => void;
  onMarkdownAction: (action: string, snippet?: string) => void;
  immersiveState?: ImmersiveToolbarState;
  readOnly?: boolean;
  onReferenceHealth: (unresolvedCount: number) => void;
}

interface FormatToolAction {
  id: string;
  label: string;
  title: string;
  text?: string;
  icon?: ReactNode;
  strong?: boolean;
  disabled?: boolean;
}

interface FormatToolGroup {
  id: string;
  actions: FormatToolAction[];
}

export function FormatNavigationBar({
  tab,
  info,
  locale,
  onGoToLine,
  onOpenReference,
  onInsertSnippet,
  onMarkdownAction,
  immersiveState,
  readOnly = false,
  onReferenceHealth
}: FormatNavigationBarProps) {
  const actionGroups = toolActionGroupsForFormat(tab.format, locale).map((group) => ({
    ...group,
    actions: group.actions.map((action) => ({
      ...action,
      disabled: readOnly || (action.id === "md-undo" ? !immersiveState?.canUndo && !!immersiveState
        : action.id === "md-redo" ? !immersiveState?.canRedo && !!immersiveState : action.disabled)
    }))
  }));
  const declarations = info.declarations.filter((item) => item.line).slice(0, 2);
  const references = info.references.slice(0, 3);
  const unresolvedCount = info.references.filter((reference) => reference.status === "unresolved").length;

  return (
    <div className="formatNavLine" aria-label={`${formatLabel(tab.format, locale)} ${text(locale, "nav.edit")}`}>
      <div className="formatActionScroll">
        {actionGroups.map((group, index) => (
          <FragmentGroup key={group.id} withDivider={index > 0}>
            {group.actions.map((action) => (
              <button
                type="button"
                className={`${actionClassName(action)}${immersiveState?.activeActions.includes(action.id) ? " active" : ""}`}
                key={action.id}
                aria-label={action.title}
                title={action.title}
                disabled={action.disabled}
                aria-pressed={immersiveState && ["md-heading", "md-bold", "md-italic", "md-strike", "md-list", "md-ordered", "md-task", "md-quote", "md-inline-code"].includes(action.id)
                  ? immersiveState.activeActions.includes(action.id) : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => tab.format === "markdown" ? onMarkdownAction(action.id, action.text) : action.text && onInsertSnippet(action.text)}
              >
                {action.icon}
                {action.label ? <span>{action.label}</span> : null}
              </button>
            ))}
          </FragmentGroup>
        ))}
      </div>

      <span className="formatToolDivider" />

      <div className="formatToolGroup references" aria-label={text(locale, "nav.reference")}>
        {references.map((reference) => (
          <button
            type="button"
            className={reference.status === "resolved" ? "formatToolButton reference" : "formatToolButton reference unresolved"}
            key={reference.id}
            title={referenceTitle(reference, locale)}
            onClick={() => onOpenReference(reference)}
          >
            <FileSymlink size={16} />
            <span>{reference.rawTarget}</span>
          </button>
        ))}
        {!references.length
          ? declarations.map((declaration) => (
              <button
                type="button"
                className="formatToolButton outline"
                key={declaration.id}
                title={text(locale, "nav.goToLine", { kind: declaration.kind, line: declaration.line ?? 1 })}
                onClick={() => onGoToLine(tab.id, declaration.line ?? 1)}
              >
                <ListTree size={16} />
                <span>{declaration.label}</span>
              </button>
            ))
          : null}
      </div>

      <span className="formatToolDivider" />

      <div className="formatToolGroup utility">
        <button
          type="button"
          className={unresolvedCount ? "formatToolButton iconOnly health warning" : "formatToolButton iconOnly health"}
          title={`${text(locale, "nav.referenceHealth")}: ${unresolvedCount ? text(locale, "nav.referencesMissing", { count: unresolvedCount }) : text(locale, "nav.referencesClean")}`}
          onClick={() => onReferenceHealth(unresolvedCount)}
        >
          {unresolvedCount ? <AlertTriangle size={17} /> : <Target size={17} />}
          {unresolvedCount ? <span className="toolbarBadge">{unresolvedCount}</span> : null}
        </button>
      </div>
    </div>
  );
}

function FragmentGroup({ children, withDivider }: { children: ReactNode; withDivider: boolean }) {
  return (
    <>
      {withDivider ? <span className="formatToolDivider" /> : null}
      <div className="formatToolGroup">{children}</div>
    </>
  );
}

function actionClassName(action: FormatToolAction): string {
  const names = ["formatToolButton"];
  if (!action.label) names.push("iconOnly");
  if (action.strong) names.push("strong");
  if (action.disabled) names.push("disabled");
  return names.join(" ");
}

function referenceTitle(reference: WorkspaceReference, locale: Locale): string {
  if (reference.status === "resolved") {
    const line = reference.resolvedLine ? `:${reference.resolvedLine}` : "";
    return text(locale, "nav.openReference", { target: reference.rawTarget, line });
  }
  return text(locale, "nav.unresolvedReference", { kind: reference.kind, target: reference.rawTarget });
}

function toolActionGroupsForFormat(format: DocumentFormat, locale: Locale): FormatToolGroup[] {
  switch (format) {
    case "markdown":
      return [
        group("md-style", [
          tool("md-emoji", "", local(locale, "插入表情", "Insert emoji"), ":smile:", <Smile size={17} />),
          tool("md-heading", "", local(locale, "插入标题", "Insert heading"), "# ", <Heading1 size={17} />),
          tool("md-bold", "", local(locale, "加粗", "Bold"), "**bold**", <Bold size={17} />, true),
          tool("md-italic", "", local(locale, "斜体", "Italic"), "_italic_", <Italic size={17} />),
          tool("md-strike", "", local(locale, "删除线", "Strikethrough"), "~~strikethrough~~", <Strikethrough size={17} />),
          tool("md-link", "", local(locale, "插入链接", "Insert link"), "[label](./document.md#section)", <Link size={17} />)
        ]),
        group("md-list", [
          tool("md-list", "", local(locale, "插入无序列表", "Insert unordered list"), "\n- item", <List size={17} />),
          tool("md-ordered", "", local(locale, "插入有序列表", "Insert ordered list"), "\n1. item", <ListOrdered size={17} />),
          tool("md-task", "", local(locale, "插入任务项", "Insert task item"), "\n- [ ] task", <SquareCheckBig size={17} />)
        ]),
        group("md-block", [
          tool("md-quote", "", local(locale, "插入引用", "Insert quote"), "\n> quote", <TextQuote size={17} />),
          tool("md-hr", "", local(locale, "插入分隔线", "Insert horizontal rule"), "\n---\n", <Minus size={17} />),
          tool("md-code", "", local(locale, "插入代码块", "Insert code block"), "\n```txt\n\n```", <SquareCode size={17} />),
          tool("md-inline-code", "", local(locale, "插入行内代码", "Insert inline code"), "`code`", <Code size={17} />),
          tool("md-math", "", local(locale, "插入公式", "Insert equation"), "\n$$\nx^2\n$$\n", <FunctionSquare size={17} />),
          tool("md-mermaid", "", local(locale, "插入图表", "Insert diagram"), "\n```mermaid\nflowchart LR\n  A --> B\n```\n", <GitBranch size={17} />),
          tool("md-footnote", "", local(locale, "插入脚注", "Insert footnote"), "[^note]\n\n[^note]: note\n", <Anchor size={17} />)
        ]),
        group("md-media", [
          tool("md-upload", "", local(locale, "插入图片", "Insert image"), "![alt](./image.png)", <UploadCloud size={17} />),
          tool("md-audio", "", local(locale, "插入音频链接", "Insert audio link"), "[audio](./audio.mp3)", <Mic size={17} />),
          tool("md-table", "", local(locale, "插入表格", "Insert table"), "\n| Name | Value |\n| --- | --- |\n| item | value |\n", <Table size={17} />)
        ]),
        group("md-history", [
          tool("md-undo", "", local(locale, "撤销", "Undo"), undefined, <Undo2 size={17} />),
          tool("md-redo", "", local(locale, "重做", "Redo"), undefined, <Redo2 size={17} />),
          tool("md-expand", "", local(locale, "扩展视图", "Expand view"), undefined, <Maximize2 size={17} />, false, true)
        ])
      ];
    case "html":
      return [
        group("html-structure", [
          tool("html-section", local(locale, "区块", "Section"), local(locale, "插入 section", "Insert section"), '\n<section id="section-id">\n  <h2>Section title</h2>\n</section>\n', <Heading2 size={17} />),
          tool("html-h1", "H", local(locale, "插入 H1", "Insert H1"), "<h1>Title</h1>", <Heading1 size={17} />),
          tool("html-id", "id", local(locale, "插入锚点 ID", "Insert anchor id"), ' id="section-id"', <Anchor size={17} />)
        ]),
        group("html-assets", [
          tool("html-link", local(locale, "链接", "Link"), local(locale, "插入链接", "Insert link"), '<a href="#section-id">Section</a>', <Link size={17} />),
          tool("html-img", local(locale, "图片", "Image"), local(locale, "插入图片", "Insert image"), '<img src="./image.png" alt="">', <Image size={17} />),
          tool("html-table", local(locale, "表格", "Table"), local(locale, "插入表格", "Insert table"), "\n<table>\n  <tr><th>Name</th><th>Value</th></tr>\n</table>\n", <Table size={17} />),
          tool("html-code", "", local(locale, "插入代码元素", "Insert code element"), "<code>code</code>", <Code size={17} />)
        ])
      ];
    case "xml":
      return [
        group("xml-core", [
          tool("xml-element", local(locale, "元素", "Element"), local(locale, "插入 XML 元素", "Insert XML element"), '\n<item id="item-id">\n  <name>Item</name>\n</item>\n', <FileCode2 size={17} />),
          tool("xml-attr", local(locale, "属性", "Attr"), local(locale, "插入属性", "Insert attribute"), ' name="value"', <KeyRound size={17} />),
          tool("xml-id", "ID", local(locale, "插入 ID", "Insert ID"), ' id="item-id"', <Hash size={17} />)
        ]),
        group("xml-reference", [
          tool("xml-schema", "Schema", local(locale, "插入 Schema 引用", "Insert schema reference"), ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="./schema.xsd"', <FileSymlink size={17} />),
          tool("xml-include", "XInc", local(locale, "插入 XInclude", "Insert XInclude"), '\n<xi:include href="./shared.xml" xmlns:xi="http://www.w3.org/2001/XInclude" />\n', <Link size={17} />)
        ])
      ];
    case "yaml":
      return [
        group("yaml-core", [
          tool("yaml-key", local(locale, "键", "Key"), local(locale, "插入键值", "Insert key value"), "\nkey: value", <KeyRound size={17} />),
          tool("yaml-list", local(locale, "列表", "List"), local(locale, "插入列表项", "Insert list item"), "\n- id: item\n  name: Item\n", <List size={17} />),
          tool("yaml-map", "{}", local(locale, "插入映射", "Insert mapping"), "\nobject:\n  key: value\n", <Braces size={17} />)
        ]),
        group("yaml-reference", [
          tool("yaml-anchor", local(locale, "锚点", "Anchor"), local(locale, "插入锚点", "Insert anchor"), "\nshared: &shared\n  enabled: true\nconsumer:\n  <<: *shared\n", <Anchor size={17} />),
          tool("yaml-ref", "$ref", local(locale, "插入跨文件引用", "Insert cross-file reference"), "$ref: ./schema.yaml#/definitions/Item", <FileSymlink size={17} />)
        ])
      ];
    case "json":
      return [
        group("json-core", [
          tool("json-object", "{}", local(locale, "插入对象", "Insert object"), '{\n  "key": "value"\n}', <Braces size={17} />),
          tool("json-array", "[]", local(locale, "插入数组", "Insert array"), '"items": [\n  {\n    "id": "item"\n  }\n]', <List size={17} />),
          tool("json-key", local(locale, "键", "Key"), local(locale, "插入键", "Insert key"), '"key": "value"', <KeyRound size={17} />)
        ]),
        group("json-reference", [
          tool("json-ref", "$ref", local(locale, "插入 JSON Schema 引用", "Insert JSON Schema reference"), '{\n  "$ref": "./schema.json#/definitions/Item"\n}', <FileSymlink size={17} />),
          tool("json-id", "$id", local(locale, "插入 Schema ID", "Insert schema ID"), '"$id": "https://example.local/schema.json"', <FileJson size={17} />)
        ])
      ];
    case "spdx-json":
    case "spdx-yaml":
    case "spdx-tag-value":
      return [
        group("spdx-entities", [
          tool("spdx-package", local(locale, "包", "Package"), local(locale, "插入 SPDX 包", "Insert SPDX package"), spdxPackageSnippet(format), <Package size={17} />),
          tool("spdx-file", local(locale, "文件", "File"), local(locale, "插入 SPDX 文件", "Insert SPDX file"), spdxFileSnippet(format), <FileCode2 size={17} />),
          tool("spdx-relation", local(locale, "关系", "Relation"), local(locale, "插入 SPDX 关系", "Insert SPDX relationship"), spdxRelationSnippet(format), <GitBranch size={17} />)
        ]),
        group("spdx-license", [
          tool("spdx-license", local(locale, "许可", "License"), local(locale, "插入许可证表达式", "Insert license expression"), '"licenseConcluded": "NOASSERTION"', <KeyRound size={17} />)
        ])
      ];
    default:
      return [group("text", [tool("text-note", local(locale, "文本", "Text"), local(locale, "插入文本标记", "Insert text marker"), "\n# Note\n", <Pencil size={17} />)])];
  }
}

function group(id: string, actions: FormatToolAction[]): FormatToolGroup {
  return { id, actions };
}

function tool(id: string, label: string, title: string, textValue?: string, icon?: ReactNode, strong?: boolean, disabled?: boolean): FormatToolAction {
  return { id, label, title, text: textValue, icon, strong, disabled };
}

function local(locale: Locale, zh: string, en: string): string {
  return locale === "zh" ? zh : en;
}

function spdxPackageSnippet(format: DocumentFormat): string {
  if (format === "spdx-tag-value") {
    return "\nPackageName: package-name\nPackageSPDXID: SPDXRef-Package-package-name\nPackageDownloadLocation: NOASSERTION\nPackageLicenseConcluded: NOASSERTION\n";
  }
  if (format === "spdx-yaml") {
    return "\n- name: package-name\n  SPDXID: SPDXRef-Package-package-name\n  downloadLocation: NOASSERTION\n  licenseConcluded: NOASSERTION\n";
  }
  return '{\n  "name": "package-name",\n  "SPDXID": "SPDXRef-Package-package-name",\n  "downloadLocation": "NOASSERTION",\n  "licenseConcluded": "NOASSERTION"\n}';
}

function spdxFileSnippet(format: DocumentFormat): string {
  if (format === "spdx-tag-value") {
    return "\nFileName: ./src/file\nSPDXID: SPDXRef-File-src-file\nFileChecksum: SHA1: \nLicenseConcluded: NOASSERTION\n";
  }
  if (format === "spdx-yaml") {
    return "\n- fileName: ./src/file\n  SPDXID: SPDXRef-File-src-file\n  checksums: []\n  licenseConcluded: NOASSERTION\n";
  }
  return '{\n  "fileName": "./src/file",\n  "SPDXID": "SPDXRef-File-src-file",\n  "checksums": [],\n  "licenseConcluded": "NOASSERTION"\n}';
}

function spdxRelationSnippet(format: DocumentFormat): string {
  if (format === "spdx-tag-value") {
    return "\nRelationship: SPDXRef-DOCUMENT DESCRIBES SPDXRef-Package-package-name\n";
  }
  if (format === "spdx-yaml") {
    return "\n- spdxElementId: SPDXRef-DOCUMENT\n  relationshipType: DESCRIBES\n  relatedSpdxElement: SPDXRef-Package-package-name\n";
  }
  return '{\n  "spdxElementId": "SPDXRef-DOCUMENT",\n  "relationshipType": "DESCRIBES",\n  "relatedSpdxElement": "SPDXRef-Package-package-name"\n}';
}
