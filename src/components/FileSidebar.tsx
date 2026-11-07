import { FileCode2, FolderOpen } from "lucide-react";
import type { DocumentTab } from "../types";
import type { Locale } from "../lib/i18n";
import { formatLabel, text } from "../lib/i18n";

interface FileSidebarProps {
  tabs: DocumentTab[];
  activeId: string;
  locale: Locale;
  onSelect: (id: string) => void;
}

export function FileSidebar({ tabs, activeId, locale, onSelect }: FileSidebarProps) {
  const workspaceRoot = tabs.find((tab) => tab.workspaceRoot)?.workspaceRoot;

  return (
    <aside className="sidebar">
      <div className="panelHeader">
        <FolderOpen size={15} />
        {text(locale, "panel.workspace")}
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
