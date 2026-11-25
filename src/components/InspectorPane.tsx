import { AlertTriangle, Boxes, GitBranch, ListTree, X } from "lucide-react";
import type { DocumentAnalysis, OutlineItem } from "../types";
import type { Locale } from "../lib/i18n";
import { text } from "../lib/i18n";

interface InspectorPaneProps {
  analysis: DocumentAnalysis;
  locale: Locale;
  onClose: () => void;
  onSelectOutlineItem: (item: OutlineItem) => void;
}

export function InspectorPane({ analysis, locale, onClose, onSelectOutlineItem }: InspectorPaneProps) {
  return (
    <aside id="outlinePanel" className="inspector" aria-label={text(locale, "panel.outline")}>
      <section className="inspectorSection">
        <div className="panelHeader inspectorTopHeader">
          <span className="panelHeaderTitle">
            <ListTree size={15} />
            {text(locale, "panel.outline")}
          </span>
          <button type="button" className="panelCloseButton" onClick={onClose} title={text(locale, "panel.closeOutline")}>
            <X size={14} />
          </button>
        </div>
        <OutlineList items={analysis.outline} depth={0} locale={locale} onSelect={onSelectOutlineItem} />
      </section>

      {analysis.spdxSummary ? (
        <section className="inspectorSection">
          <div className="panelHeader">
            <Boxes size={15} />
            SPDX
          </div>
          <dl className="metadata">
            <dt>{text(locale, "metadata.name")}</dt>
            <dd>{analysis.spdxSummary.name || text(locale, "metadata.untitled")}</dd>
            <dt>{text(locale, "metadata.version")}</dt>
            <dd>{analysis.spdxSummary.spdxVersion || text(locale, "metadata.missing")}</dd>
            <dt>{text(locale, "metadata.dataLicense")}</dt>
            <dd>{analysis.spdxSummary.dataLicense || text(locale, "metadata.missing")}</dd>
            <dt>{text(locale, "metadata.namespace")}</dt>
            <dd>{analysis.spdxSummary.documentNamespace || text(locale, "metadata.missing")}</dd>
            <dt>{text(locale, "metadata.creators")}</dt>
            <dd>{analysis.spdxSummary.creators.join(", ") || text(locale, "metadata.missing")}</dd>
          </dl>
        </section>
      ) : null}

      <section className="inspectorSection">
        <div className="panelHeader">
          <GitBranch size={15} />
          {text(locale, "panel.validation")}
        </div>
        <div className="validationBadge">
          {analysis.diagnostics.length ? <AlertTriangle size={15} /> : null}
          {analysis.diagnostics.length ? `${analysis.diagnostics.length} ${text(locale, "common.issues")}` : text(locale, "common.clean")}
        </div>
      </section>
    </aside>
  );
}

function OutlineList({
  items,
  depth,
  locale,
  onSelect
}: {
  items: OutlineItem[];
  depth: number;
  locale: Locale;
  onSelect: (item: OutlineItem) => void;
}) {
  if (!items.length) {
    return <div className="emptyState compact">{text(locale, "common.noOutline")}</div>;
  }

  return (
    <ul className="outlineList">
      {items.slice(0, 100).map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="outlineItem"
            onClick={() => onSelect(item)}
            title={text(locale, "panel.goToOutlineItem", { label: item.label })}
          >
            <span className="outlineKind">{item.kind}</span>
            <span className="outlineLabel">{item.label}</span>
            {item.value ? <span className="outlineValue">{item.value}</span> : item.line ? <span className="outlineLine">:{item.line}</span> : null}
          </button>
          {item.children?.length && depth < 2 ? (
            <OutlineList items={item.children} depth={depth + 1} locale={locale} onSelect={onSelect} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
