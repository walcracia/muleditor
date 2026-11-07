import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  FileDown,
  FileInput,
  FilePlus2,
  FolderOpen,
  Languages,
  ListTree,
  PencilLine,
  Save,
  SplitSquareHorizontal,
  Wand2
} from "lucide-react";
import type { DocumentFormat } from "../types";
import type { Locale } from "../lib/i18n";
import { formatLabel, text } from "../lib/i18n";

interface ToolbarProps {
  activeFormat: DocumentFormat;
  locale: Locale;
  showEditor: boolean;
  showPreview: boolean;
  showDiff: boolean;
  showInspector: boolean;
  status: string;
  onNew: (format: DocumentFormat) => void;
  onOpen: () => void;
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
  const [showNewMenu, setShowNewMenu] = useState(false);
  const newFileMenuRef = useRef<HTMLDivElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const firstNewFormatRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showNewMenu) return;

    const focusFrame = window.requestAnimationFrame(() => firstNewFormatRef.current?.focus());
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!newFileMenuRef.current?.contains(event.target as Node)) {
        setShowNewMenu(false);
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowNewMenu(false);
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
    setShowNewMenu(false);
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
            onClick={() => setShowNewMenu((current) => !current)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown") return;
              event.preventDefault();
              setShowNewMenu(true);
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
      </div>
      <div className="toolbarGroup">
        <button type="button" className={props.showEditor ? "isActive" : ""} onClick={props.onToggleEditor} title={text(props.locale, "toolbar.editorTitle")}>
          <PencilLine size={16} />
          {text(props.locale, "toolbar.editor")}
        </button>
        <button type="button" className={props.showPreview ? "isActive" : ""} onClick={props.onTogglePreview} title={text(props.locale, "toolbar.preview")}>
          <Eye size={16} />
          {text(props.locale, "toolbar.preview")}
        </button>
        <button type="button" onClick={props.onFormat} title={text(props.locale, "toolbar.format")}>
          <Wand2 size={16} />
          {text(props.locale, "toolbar.format")}
        </button>
        <button type="button" onClick={props.onValidate} title={text(props.locale, "toolbar.validate")}>
          <CheckCircle2 size={16} />
          {text(props.locale, "toolbar.validate")}
        </button>
        <button type="button" className={props.showDiff ? "isActive" : ""} onClick={props.onToggleDiff} title={text(props.locale, "toolbar.diff")}>
          <SplitSquareHorizontal size={16} />
          {text(props.locale, "toolbar.diff")}
        </button>
        <button
          type="button"
          className={props.showInspector ? "isActive" : ""}
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
      <div className="formatRail" aria-label={text(props.locale, "toolbar.supportedFormats")}>
        {["MD", "HTML", "XML", "YAML", "JSON", "SPDX"].map((label) => (
          <span key={label} className={labelMatchesFormat(label, props.activeFormat) ? "formatChip active" : "formatChip"}>
            {label}
          </span>
        ))}
      </div>
      <div className="toolbarStatus" title={props.status}>
        {formatLabel(props.activeFormat, props.locale)} {text(props.locale, "toolbar.statusSeparator")} {props.status}
      </div>
    </header>
  );
}

function labelMatchesFormat(label: string, format: DocumentFormat): boolean {
  return (
    (label === "MD" && format === "markdown") ||
    (label === "HTML" && format === "html") ||
    (label === "XML" && format === "xml") ||
    (label === "YAML" && format === "yaml") ||
    (label === "JSON" && format === "json") ||
    (label === "SPDX" && format.startsWith("spdx"))
  );
}
