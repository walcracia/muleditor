import { FileCode2, FolderOpen, X } from "lucide-react";
import type { DocumentTab } from "../types";
import type { Locale } from "../lib/i18n";
import { formatLabel, text } from "../lib/i18n";

interface FileSidebarProps {
  tabs: DocumentTab[];
  activeId: string;
  locale: Locale;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function FileSidebar({ tabs, activeId, locale, onSelect, onClose }: FileSidebarProps) {
  const workspaceRoot = tabs.find((tab) => tab.workspaceRoot)?.workspaceRoot;

  return (
    <aside id="workspacePanel" className="sidebar" aria-label={text(locale, "panel.workspace")}>
      <div className="panelHeader">
        <span className="panelHeaderTitle">
          <FolderOpen size={15} />
          {text(locale, "panel.workspace")}
        </span>
        <button
          type="button"
          className="panelCloseButton"
          onClick={onClose}
          title={text(locale, "panel.closeWorkspace")}
          aria-label={text(locale, "panel.closeWorkspace")}
        >
          <X size={14} />
        </button>
      </div>
      {workspaceRoot ? (
        <div className="workspaceSummary" title={workspaceRoot}>
          <span>{workspaceRoot}</span>
          <strong>
            {tabs.filter((tab) => tab.workspaceRoot === workspaceRoot).length} {text(locale, "common.files")}
          </strong>
        </div>
      ) : null}
      <div className="fileTree">
        {tabs.map((tab) => (
          <button
            type="button"
            className={tab.id === activeId ? "fileRow active" : "fileRow"}
            key={tab.id}
            onClick={() => onSelect(tab.id)}
          >
            <FileCode2 size={15} />
            <span className="fileMain">
              <span className="fileName">
                {tab.name}
                {tab.dirty ? "*" : ""}
              </span>
              <span className="fileMeta">{tab.relativePath || formatLabel(tab.format, locale)}</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
