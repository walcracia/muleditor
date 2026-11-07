import { useEffect, useRef } from "react";
import { marked } from "marked";
import { ExternalLink } from "lucide-react";
import type { DocumentAnalysis, DocumentTab, OutlineItem, OutlineNavigationCommand } from "../types";
import type { Locale } from "../lib/i18n";
import { text } from "../lib/i18n";
import { stripFrontMatter } from "../lib/markdown";
import { renderMermaidBlocks } from "../lib/mermaid";

interface DocumentPreviewProps {
  tab: DocumentTab;
  analysis: DocumentAnalysis;
  locale: Locale;
  navigation?: OutlineNavigationCommand;
  onOpenHtmlPreview: () => void;
}

export function DocumentPreview({ tab, analysis, locale, navigation, onOpenHtmlPreview }: DocumentPreviewProps) {
  const previewRef = useRef<HTMLElement | null>(null);
  const htmlFrameRef = useRef<HTMLIFrameElement | null>(null);
  const appliedNavigationRef = useRef<number>();

  useEffect(() => {
    if (!navigation || navigation.tabId !== tab.id || appliedNavigationRef.current === navigation.id) return;

    let navigated = false;

    if (tab.format === "markdown") {
      const headings = Array.from(previewRef.current?.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6") ?? []);
      bindOutlineIds(headings, analysis.outline);
      navigated = scrollToOutline(previewRef.current, navigation.outlineId);
    } else if (tab.format === "html") {
      navigated = syncHtmlPreview(htmlFrameRef.current, analysis.outline, navigation.outlineId);
    } else {
      navigated = scrollToOutline(previewRef.current, navigation.outlineId);
    }

    if (navigated) appliedNavigationRef.current = navigation.id;
  }, [navigation?.id, tab.id]);

  useEffect(() => {
    const preview = previewRef.current;
    if (tab.format !== "markdown" || !preview) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void renderMermaidBlocks(preview, {
        errorLabel: text(locale, "preview.mermaidError"),
        signal: controller.signal
      });
    }, 160);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locale, tab.content, tab.format, tab.id]);

  if (tab.format === "markdown") {
    const html = marked.parse(stripFrontMatter(tab.content), { async: false }) as string;
    return <article ref={previewRef} className="preview markdownPreview" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  if (tab.format === "html") {
    return (
      <section className="preview htmlPreviewShell">
        <div className="htmlPreviewToolbar">
          <span>{text(locale, "preview.title", { name: tab.name })}</span>
          <button type="button" onClick={onOpenHtmlPreview} title={text(locale, "preview.openInBrowserTitle")}>
            <ExternalLink size={14} />
            {text(locale, "preview.openInBrowser")}
          </button>
        </div>
        <iframe
          ref={htmlFrameRef}
          className="htmlPreviewFrame"
          title={text(locale, "preview.title", { name: tab.name })}
          sandbox="allow-same-origin"
          srcDoc={tab.content}
          onLoad={() => {
            const pendingNavigation = navigation?.tabId === tab.id && appliedNavigationRef.current !== navigation.id ? navigation : undefined;
            const navigated = syncHtmlPreview(htmlFrameRef.current, analysis.outline, pendingNavigation?.outlineId);
            if (navigated && pendingNavigation) appliedNavigationRef.current = pendingNavigation.id;
          }}
        />
      </section>
    );
  }

  return (
    <section ref={previewRef} className="preview structuredPreview">
      {analysis.spdxSummary ? (
        <div className="summaryGrid">
          <Metric label={text(locale, "metric.packages")} value={analysis.spdxSummary.packageCount} />
          <Metric label={text(locale, "metric.files")} value={analysis.spdxSummary.fileCount} />
          <Metric label={text(locale, "metric.relations")} value={analysis.spdxSummary.relationshipCount} />
          <Metric label={text(locale, "metric.creators")} value={analysis.spdxSummary.creators.length} />
        </div>
      ) : null}
      <TreeList items={analysis.outline} locale={locale} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{value}</span>
      <small>{label}</small>
    </div>
  );
}

function TreeList({ items, locale }: { items: OutlineItem[]; locale: Locale }) {
  if (!items.length) {
    return <div className="emptyState">{text(locale, "common.noPreview")}</div>;
  }

  return (
    <ul className="treeList">
      {items.slice(0, 80).map((item) => (
        <li key={item.id}>
          <div className="treeItem" data-outline-id={item.id}>
            <span className="treeKind">{item.kind}</span>
            <span className="treeLabel">{item.label}</span>
            {item.value ? <span className="treeValue">{item.value}</span> : null}
          </div>
          {item.children?.length ? <TreeList items={item.children} locale={locale} /> : null}
        </li>
      ))}
    </ul>
  );
}

function bindOutlineIds(elements: HTMLElement[], items: OutlineItem[]) {
  elements.forEach((element, index) => {
    const item = items[index];
    if (item) element.dataset.outlineId = item.id;
  });
}

function scrollToOutline(root: ParentNode | null, outlineId: string): boolean {
  if (!root) return false;
  const target = Array.from(root.querySelectorAll<HTMLElement>("[data-outline-id]")).find(
    (element) => element.dataset.outlineId === outlineId
  );
  if (!target) return false;
  target.scrollIntoView({ block: "center", behavior: "auto" });
  return true;
}

function syncHtmlPreview(frame: HTMLIFrameElement | null, items: OutlineItem[], outlineId?: string): boolean {
  const document = frame?.contentDocument;
  if (!document) return false;
  const elements = Array.from(document.querySelectorAll<HTMLElement>("title,h1,h2,h3,h4,h5,h6,main,section,article,nav,header,footer"));
  bindOutlineIds(elements, items);
  return outlineId ? scrollToOutline(document, outlineId) : false;
}
