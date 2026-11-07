import { X } from "lucide-react";
import type { DocumentTab } from "../types";
import type { Locale } from "../lib/i18n";
import { formatLabel, text } from "../lib/i18n";

interface EditorTabsProps {
  tabs: DocumentTab[];
  activeId: string;
  locale: Locale;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function EditorTabs({ tabs, activeId, locale, onSelect, onClose }: EditorTabsProps) {
  return (
    <nav className="tabs" aria-label={text(locale, "tabs.openDocuments")}>
      {tabs.map((tab) => (
        <button type="button" key={tab.id} className={tab.id === activeId ? "tab active" : "tab"} onClick={() => onSelect(tab.id)}>
          <span className="tabName">
            {tab.name}
            {tab.dirty ? "*" : ""}
          </span>
          <span className="tabFormat">{formatLabel(tab.format, locale)}</span>
          {tabs.length > 1 ? (
            <span
              className="tabClose"
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onClose(tab.id);
                }
              }}
              title={text(locale, "tabs.close")}
            >
              <X size={13} />
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
