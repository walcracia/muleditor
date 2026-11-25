import type { DocumentTab } from "../types";
import type { Locale } from "../lib/i18n";
import { formatLabel, text } from "../lib/i18n";

interface StatusBarProps {
  tab: DocumentTab;
  issueCount: number;
  runtime: string;
  locale: Locale;
  status: string;
}

export function StatusBar({ tab, issueCount, runtime, locale, status }: StatusBarProps) {
  const lineCount = tab.content.split(/\r?\n/).length;
  return (
    <div className="statusBar">
      <span className="statusFilePath" title={tab.path || tab.name}>{tab.path || tab.name}</span>
      <span className="statusMessage" role="status" title={status}>{status}</span>
      <span>{tab.dirty ? text(locale, "common.modified") : text(locale, "common.saved")}</span>
      <span>{formatLabel(tab.format, locale)}</span>
      <span>
        {lineCount} {text(locale, "common.lines")}
      </span>
      <span>{issueCount ? `${issueCount} ${text(locale, "common.issues")}` : text(locale, "common.clean")}</span>
      <span>{runtime === "Tauri" ? text(locale, "common.tauri") : text(locale, "common.browser")}</span>
      <span className="statusSupportedFormats" aria-label={text(locale, "toolbar.supportedFormats")} title={text(locale, "toolbar.supportedFormats")}>
        MD · HTML · XML · YAML · JSON · SPDX
      </span>
    </div>
  );
}
