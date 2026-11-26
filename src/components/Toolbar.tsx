import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, Ref } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Code2,
  Download,
  Eye,
  FileDown,
  FileInput,
  FilePlus2,
  FolderOpen,
  Languages,
  ListTree,
  PanelBottom,
  PanelLeft,
  PencilLine,
  Save,
  SplitSquareHorizontal,
  Wand2
} from "lucide-react";
import type { DocumentFormat } from "../types";
import type { Locale } from "../lib/i18n";
import { formatLabel, text } from "../lib/i18n";
import type { RecentFile } from "../lib/recentFiles";
import { RecentFilesMenu } from "./RecentFilesMenu";

interface ToolbarProps {
  activeFormat: DocumentFormat;
  locale: Locale;
  showEditor: boolean;
  showPreview: boolean;
  showDiff: boolean;
  showInspector: boolean;
  showWorkspace: boolean;
  showProblems: boolean;
  totalIssueCount: number;
  workspaceToggleRef?: Ref<HTMLButtonElement>;
  problemsToggleRef?: Ref<HTMLButtonElement>;
  markdownMode: "immersive" | "source";
  onMarkdownModeChange: (mode: "immersive" | "source") => void;
  onNew: (format: DocumentFormat) => void;
  onOpen: () => void;
  recentFiles: RecentFile[];
  recentFilesAvailable: boolean;
  historyStorageFailed?: boolean;
  openingRecentPath?: string;
  recentFileError?: { path: string; message: string };
  onOpenRecent: (file: RecentFile) => Promise<boolean> | boolean;
  onRemoveRecent: (path: string) => void;
  onClearRecent: () => void;
  onOpenFolder: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onFormat: () => void;
  onValidate: () => void;
  onToggleEditor: () => void;
  onTogglePreview: () => void;
  onToggleDiff: () => void;
  onToggleInspector: () => void;
  onToggleWorkspace: () => void;
  onToggleProblems: () => void;
  onToggleLocale: () => void;
}

const newFileFormats: Array<{ format: DocumentFormat; extension: string }> = [
  { format: "markdown", extension: ".md" },
  { format: "html", extension: ".html" },
  { format: "xml", extension: ".xml" },
  { format: "yaml", extension: ".yaml" },
  { format: "json", extension: ".json" },
  { format: "spdx-json", extension: ".spdx.json" },
  { format: "spdx-yaml", extension: ".spdx.yaml" },
  { format: "spdx-tag-value", extension: ".spdx" }
];

export function Toolbar(props: ToolbarProps) {
  const [fileMenu, setFileMenu] = useState<"new" | "recent">();
  const showNewMenu = fileMenu === "new";
  const showRecentMenu = fileMenu === "recent";
  const newFileMenuRef = useRef<HTMLDivElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const firstNewFormatRef = useRef<HTMLButtonElement>(null);
  const recentButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showNewMenu) return;

    const focusFrame = window.requestAnimationFrame(() => firstNewFormatRef.current?.focus());
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!newFileMenuRef.current?.contains(event.target as Node)) {
        setFileMenu(undefined);
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFileMenu(undefined);
      newButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showNewMenu]);

  function handleNewFormat(format: DocumentFormat) {
    setFileMenu(undefined);
    props.onNew(format);
    newButtonRef.current?.focus();
  }

  function handleNewMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = currentIndex;

    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (event.key === "ArrowDown") nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    if (event.key === "ArrowUp") nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;

    event.preventDefault();
    items[nextIndex]?.focus();
  }

  return (
    <header className="toolbar">
      <div className="toolbarFileActions" ref={newFileMenuRef}>
        <div className="toolbarGroup">
          <button
            ref={newButtonRef}
            type="button"
            className={showNewMenu ? "isActive" : ""}
            aria-haspopup="menu"
            aria-expanded={showNewMenu}
            aria-label={text(props.locale, "toolbar.newMenu")}
            onClick={() => setFileMenu((current) => current === "new" ? undefined : "new")}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown") return;
              event.preventDefault();
              setFileMenu("new");
            }}
            title={text(props.locale, "toolbar.newMenu")}
          >
            <FilePlus2 size={16} />
            {text(props.locale, "toolbar.new")}
            <ChevronDown size={13} />
          </button>
          <button type="button" onClick={props.onOpen} title={text(props.locale, "toolbar.open")}>
            <FileInput size={16} />
            {text(props.locale, "toolbar.open")}
          </button>
          <button ref={recentButtonRef} type="button" className={showRecentMenu ? "recentFilesToggle isActive" : "recentFilesToggle"}
            aria-label={text(props.locale, "history.title")} title={text(props.locale, "history.title")}
            aria-haspopup="menu" aria-expanded={showRecentMenu} aria-controls={showRecentMenu ? "recentFilesMenu" : undefined}
            onClick={() => setFileMenu((current) => current === "recent" ? undefined : "recent")}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown") return;
              event.preventDefault();
              setFileMenu("recent");
            }}>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          <button type="button" onClick={props.onOpenFolder} title={text(props.locale, "toolbar.openFolder")}>
            <FolderOpen size={16} />
            {text(props.locale, "toolbar.openFolder")}
          </button>
          <button type="button" onClick={props.onSave} title={text(props.locale, "toolbar.save")}>
            <Save size={16} />
            {text(props.locale, "toolbar.save")}
          </button>
          <button type="button" onClick={props.onSaveAs} title={text(props.locale, "toolbar.saveAs")}>
            <FileDown size={16} />
            {text(props.locale, "toolbar.saveAs")}
          </button>
          <button type="button" onClick={props.onExport} title={text(props.locale, "toolbar.export")}>
            <Download size={16} />
            {text(props.locale, "toolbar.export")}
          </button>
        </div>
        {showNewMenu ? (
          <div
            className="newFileMenu"
            role="menu"
            aria-label={text(props.locale, "toolbar.newMenu")}
            onKeyDown={handleNewMenuKeyDown}
          >
            {newFileFormats.map(({ format, extension }, index) => {
              const label = formatLabel(format, props.locale);
              return (
                <button
                  ref={index === 0 ? firstNewFormatRef : undefined}
                  key={format}
                  type="button"
                  role="menuitem"
                  title={text(props.locale, "toolbar.newFormat", { format: label })}
                  onClick={() => handleNewFormat(format)}
                >
                  <span>{label}</span>
                  <span className="newFileExtension">{extension}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {showRecentMenu ? <RecentFilesMenu locale={props.locale} files={props.recentFiles} available={props.recentFilesAvailable} storageFailed={props.historyStorageFailed}
          openingPath={props.openingRecentPath} error={props.recentFileError} triggerRef={recentButtonRef}
          onOpen={props.onOpenRecent} onRemove={props.onRemoveRecent} onClear={props.onClearRecent}
          onClose={() => setFileMenu(undefined)} /> : null}
      </div>
      <div className="toolbarGroup">
        {props.activeFormat === "markdown" ? (
          <>
            <button type="button" className={props.markdownMode === "immersive" && !props.showDiff ? "isActive" : ""}
              aria-pressed={props.markdownMode === "immersive" && !props.showDiff}
              onClick={() => props.onMarkdownModeChange("immersive")} title={text(props.locale, "toolbar.immersive")}>
              <PencilLine size={16} />
              {text(props.locale, "toolbar.immersive")}
            </button>
            <button type="button" className={props.markdownMode === "source" && !props.showDiff ? "isActive" : ""}
              aria-pressed={props.markdownMode === "source" && !props.showDiff}
              onClick={() => props.onMarkdownModeChange("source")} title={text(props.locale, "toolbar.source")}>
              <Code2 size={16} />
              {text(props.locale, "toolbar.source")}
            </button>
          </>
        ) : (
          <>
        <button type="button" className={props.showEditor ? "isActive" : ""} onClick={props.onToggleEditor} title={text(props.locale, "toolbar.editorTitle")}>
          <PencilLine size={16} />
          {text(props.locale, "toolbar.editor")}
        </button>
        <button type="button" className={props.showPreview ? "isActive" : ""} onClick={props.onTogglePreview} title={text(props.locale, "toolbar.preview")}>
          <Eye size={16} />
          {text(props.locale, "toolbar.preview")}
        </button>
          </>
        )}
        <button type="button" className="toolbarUtilityButton" onClick={props.onFormat} aria-label={text(props.locale, "toolbar.format")} title={text(props.locale, "toolbar.format")}>
          <Wand2 size={16} />
          <span>{text(props.locale, "toolbar.format")}</span>
        </button>
        <button type="button" className="toolbarUtilityButton" onClick={props.onValidate} aria-label={text(props.locale, "toolbar.validate")} title={text(props.locale, "toolbar.validate")}>
          <CheckCircle2 size={16} />
          <span>{text(props.locale, "toolbar.validate")}</span>
        </button>
        <button type="button" className={props.showDiff ? "toolbarUtilityButton isActive" : "toolbarUtilityButton"} onClick={props.onToggleDiff} aria-label={text(props.locale, "toolbar.diff")} title={text(props.locale, "toolbar.diff")}>
          <SplitSquareHorizontal size={16} />
          <span>{text(props.locale, "toolbar.diff")}</span>
        </button>
      </div>
      <div className="toolbarGroup layoutToolbarGroup">
        <button
          ref={props.workspaceToggleRef}
          type="button"
          className={props.showWorkspace ? "isActive" : ""}
          aria-label={text(props.locale, "panel.toggleWorkspace")}
          title={text(props.locale, "panel.toggleWorkspace")}
          aria-expanded={props.showWorkspace}
          aria-controls="workspacePanel"
          onClick={props.onToggleWorkspace}
        >
          <PanelLeft size={16} />
          {text(props.locale, "panel.workspace")}
        </button>
        <button
          ref={props.problemsToggleRef}
          type="button"
          className={props.showProblems ? "isActive" : ""}
          aria-label={text(props.locale, "panel.toggleProblems")}
          title={text(props.locale, "panel.toggleProblems")}
          aria-expanded={props.showProblems}
          aria-controls="problemsPanel"
          onClick={props.onToggleProblems}
        >
          <PanelBottom size={16} />
          {text(props.locale, "panel.problems")}
          <span className="toolbarPanelCount">{props.totalIssueCount}</span>
        </button>
        <button
          type="button"
          className={props.showInspector ? "isActive" : ""}
          aria-pressed={props.showInspector}
          aria-expanded={props.showInspector}
          aria-controls="outlinePanel"
          onClick={props.onToggleInspector}
          title={text(props.locale, "toolbar.outlineTitle")}
        >
          <ListTree size={16} />
          {text(props.locale, "toolbar.outline")}
        </button>
      </div>
      <div className="toolbarGroup compact">
        <button type="button" onClick={props.onToggleLocale} title={text(props.locale, "toolbar.languageTitle")}>
          <Languages size={16} />
          {text(props.locale, "toolbar.language")}
        </button>
      </div>
    </header>
  );
}
