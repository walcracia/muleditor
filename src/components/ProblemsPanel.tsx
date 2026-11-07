import { AlertCircle, Info, Search } from "lucide-react";
import type { Diagnostic, DocumentTab } from "../types";
import type { Locale } from "../lib/i18n";
import { diagnosticMessage, diagnosticSourceLabel, severityLabel, text } from "../lib/i18n";

interface ProblemsPanelProps {
  diagnosticsByTab: Array<{ tab: DocumentTab; diagnostics: Diagnostic[] }>;
  locale: Locale;
}

export function ProblemsPanel({ diagnosticsByTab, locale }: ProblemsPanelProps) {
  const rows = diagnosticsByTab.flatMap(({ tab, diagnostics }) => diagnostics.map((diagnostic) => ({ tab, diagnostic })));

  return (
    <footer className="bottomPanel">
      <div className="bottomTabs">
        <button type="button" className="active">
          <AlertCircle size={14} />
          {text(locale, "panel.problems")}
          <span>{rows.length}</span>
        </button>
        <button type="button">
          <Search size={14} />
          {text(locale, "panel.search")}
        </button>
        <button type="button">
          <Info size={14} />
          {text(locale, "panel.exportLog")}
        </button>
      </div>
      <div className="problemRows">
        {rows.length ? (
          rows.map(({ tab, diagnostic }) => (
            <div className={`problemRow ${diagnostic.severity}`} key={`${tab.id}-${diagnostic.id}`}>
              <span className="problemSeverity">{severityLabel(diagnostic.severity, locale)}</span>
              <span className="problemMessage">{diagnosticMessage(diagnostic.message, locale)}</span>
              <span className="problemSource">{diagnosticSourceLabel(diagnostic.source, locale)}</span>
              <span className="problemFile">
                {tab.name}
                {diagnostic.line ? `:${diagnostic.line}` : ""}
              </span>
            </div>
          ))
        ) : (
          <div className="problemEmpty">{text(locale, "common.noProblems")}</div>
        )}
      </div>
    </footer>
  );
}
