export type DocumentFormat =
  | "markdown"
  | "html"
  | "xml"
  | "yaml"
  | "json"
  | "spdx-json"
  | "spdx-yaml"
  | "spdx-tag-value"
  | "unknown";

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  id: string;
  severity: Severity;
  message: string;
  source: string;
  line?: number;
  column?: number;
}

export interface OutlineItem {
  id: string;
  label: string;
  kind: string;
  line?: number;
  value?: string;
  children?: OutlineItem[];
}

export interface SpdxSummary {
  name?: string;
  spdxVersion?: string;
  dataLicense?: string;
  documentNamespace?: string;
  creators: string[];
  packageCount: number;
  fileCount: number;
  relationshipCount: number;
  licenseRefs: string[];
}

export interface DocumentAnalysis {
  diagnostics: Diagnostic[];
  outline: OutlineItem[];
  spdxSummary?: SpdxSummary;
}

export interface DocumentTab {
  id: string;
  name: string;
  path?: string;
  relativePath?: string;
  workspaceRoot?: string;
  content: string;
  originalContent: string;
  format: DocumentFormat;
  dirty: boolean;
}

export interface DocumentPosition {
  line: number;
  column: number;
}

export interface EditorPositionHandle {
  getPosition(): DocumentPosition | undefined;
}

export interface PositionNavigationCommand extends DocumentPosition {
  id: number;
  tabId: string;
}

export interface OpenedTextFile {
  name: string;
  path?: string;
  relativePath?: string;
  workspaceRoot?: string;
  content: string;
}

export interface WorkspaceDeclaration {
  id: string;
  tabId: string;
  name: string;
  label: string;
  kind: string;
  line?: number;
}

export interface WorkspaceReference {
  id: string;
  fromTabId: string;
  label: string;
  kind: string;
  rawTarget: string;
  targetPath?: string;
  targetFragment?: string;
  line?: number;
  resolvedTabId?: string;
  resolvedLine?: number;
  status: "resolved" | "unresolved";
}

export interface FormatSnippet {
  id: string;
  label: string;
  description: string;
  text: string;
}

export interface FormatNavigationInfo {
  title: string;
  focusAreas: string[];
  declarations: WorkspaceDeclaration[];
  references: WorkspaceReference[];
  snippets: FormatSnippet[];
  diagnostics: Diagnostic[];
}

export interface WorkspaceIndex {
  byTabId: Record<string, FormatNavigationInfo>;
  references: WorkspaceReference[];
}

export interface OutlineNavigationCommand {
  id: number;
  tabId: string;
  outlineId: string;
}

export type EditorCommand =
  | {
      id: number;
      tabId: string;
      kind: "goTo";
      line: number;
      column?: number;
    }
  | {
      id: number;
      tabId: string;
      kind: "insert";
      text: string;
    }
  | {
      id: number;
      tabId: string;
      kind: "format";
      action: string;
      text?: string;
    };
