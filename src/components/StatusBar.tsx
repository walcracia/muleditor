import type { DocumentTab } from "../types";
import type { Locale } from "../lib/i18n";
import { formatLabel, text } from "../lib/i18n";

interface StatusBarProps {
  tab: DocumentTab;
  issueCount: number;
  runtime: string;
  locale: Locale;
}

export function StatusBar({ tab, issueCount, runtime, locale }: StatusBarProps) {
  const lineCount = tab.content.split(/\r?\n/).length;
  return (
    <div className="statusBar">
      <span>{tab.path || tab.name}</span>
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
