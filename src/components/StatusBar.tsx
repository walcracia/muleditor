import type { DocumentTab } from "../types";
import type { Locale } from "../lib/i18n";
import { formatLabel, text } from "../lib/i18n";

interface StatusBarProps {
  tab: DocumentTab;
  issueCount: number;
  locale: Locale;
  status: string;
}

const statusFormats = [
  { format: "markdown", label: "MD" },
  { format: "html", label: "HTML" },
  { format: "xml", label: "XML" },
  { format: "yaml", label: "YAML" },
  { format: "json", label: "JSON" },
  { format: "spdx", label: "SPDX" }
] as const;

export function StatusBar({ tab, issueCount, locale, status }: StatusBarProps) {
  const lineCount = tab.content.split(/\r?\n/).length;
  const activeFormat = tab.format.startsWith("spdx-") ? "spdx" : tab.format;
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
      <span className="statusSupportedFormats" role="list" aria-label={text(locale, "toolbar.supportedFormats")} title={text(locale, "toolbar.supportedFormats")}>
        {statusFormats.map(({ format, label }) => (
          <span key={format} role="listitem" data-format={format}
            className={activeFormat === format ? "statusFormat active" : "statusFormat"}
            aria-current={activeFormat === format ? "true" : undefined}>
            {label}
          </span>
        ))}
      </span>
    </div>
  );
}
