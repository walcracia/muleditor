import type { Ref } from "react";
import { PanelBottom, PanelLeft } from "lucide-react";
import type { DocumentTab } from "../types";
import type { Locale } from "../lib/i18n";
import { formatLabel, text } from "../lib/i18n";

interface StatusBarProps {
  tab: DocumentTab;
  issueCount: number;
  totalIssueCount?: number;
  runtime: string;
  locale: Locale;
  showWorkspace: boolean;
  showProblems: boolean;
  onToggleWorkspace: () => void;
  onToggleProblems: () => void;
  workspaceToggleRef?: Ref<HTMLButtonElement>;
  problemsToggleRef?: Ref<HTMLButtonElement>;
}

export function StatusBar({
  tab, issueCount, totalIssueCount = issueCount, runtime, locale,
  showWorkspace, showProblems, onToggleWorkspace, onToggleProblems,
  workspaceToggleRef, problemsToggleRef
}: StatusBarProps) {
  const lineCount = tab.content.split(/\r?\n/).length;
  return (
    <div className="statusBar">
      <button
        ref={workspaceToggleRef}
        type="button"
        className="statusPanelToggle"
        aria-label={text(locale, "panel.toggleWorkspace")}
        title={text(locale, "panel.toggleWorkspace")}
        aria-expanded={showWorkspace}
        aria-controls="workspacePanel"
        onClick={onToggleWorkspace}
      >
        <PanelLeft size={13} />
        {text(locale, "panel.workspace")}
      </button>
      <button
        ref={problemsToggleRef}
        type="button"
        className="statusPanelToggle"
        aria-label={text(locale, "panel.toggleProblems")}
        title={text(locale, "panel.toggleProblems")}
        aria-expanded={showProblems}
        aria-controls="problemsPanel"
        onClick={onToggleProblems}
      >
        <PanelBottom size={13} />
        {text(locale, "panel.problems")} ({totalIssueCount})
      </button>
      <span className="statusFilePath" title={tab.path || tab.name}>{tab.path || tab.name}</span>
      <span>{tab.dirty ? text(locale, "common.modified") : text(locale, "common.saved")}</span>
      <span>{formatLabel(tab.format, locale)}</span>
      <span>
        {lineCount} {text(locale, "common.lines")}
      </span>
      <span>{issueCount ? `${issueCount} ${text(locale, "common.issues")}` : text(locale, "common.clean")}</span>
      <span>{runtime === "Tauri" ? text(locale, "common.tauri") : text(locale, "common.browser")}</span>
    </div>
  );
}
