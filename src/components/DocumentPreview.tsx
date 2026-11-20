import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { DocumentAnalysis, DocumentTab, OutlineItem, OutlineNavigationCommand } from "../types";
import type { Locale } from "../lib/i18n";
import { text } from "../lib/i18n";
import { renderMarkdownDocument } from "../lib/markdown";
import { resolveMarkdownImage } from "../lib/markdownResources";

interface DocumentPreviewProps {
  tab: DocumentTab;
  analysis: DocumentAnalysis;
  locale: Locale;
  navigation?: OutlineNavigationCommand;
  resourceVersion?: number;
  onOpenLocalLink: (href: string) => void;
  onOpenHtmlPreview: () => void;
}

export function DocumentPreview({ tab, analysis, locale, navigation, resourceVersion = 0, onOpenLocalLink, onOpenHtmlPreview }: DocumentPreviewProps) {
  const previewRef = useRef<HTMLElement | null>(null);
  const htmlFrameRef = useRef<HTMLIFrameElement | null>(null);
  const appliedNavigationRef = useRef<number>();
  const renderKey = useMemo(() => ({}), [tab.id, tab.content, tab.path, tab.relativePath, tab.workspaceRoot, locale, resourceVersion]);
  const [markdown, setMarkdown] = useState<{
    key: object;
    tabId: string;
    html: string;
    warnings: string[];
    pending: boolean;
    error?: string;
  }>();
  const currentMarkdown = markdown?.key === renderKey ? markdown : undefined;

  useEffect(() => {
    if (tab.format !== "markdown") return;
    const controller = new AbortController();
    setMarkdown((current) => ({
      key: renderKey,
      tabId: tab.id,
      html: current?.tabId === tab.id ? current.html : "",
      warnings: [],
      pending: true
    }));
    const timer = window.setTimeout(() => {
      void renderMarkdownDocument(tab.content, {
        signal: controller.signal,
        errorLabel: text(locale, "preview.mermaidError"),
        resolveImage: (src) => resolveMarkdownImage(src, {
          sourcePath: tab.path,
          relativePath: tab.relativePath,
          workspaceRoot: tab.workspaceRoot
        })
      }).then((result) => {
        if (!controller.signal.aborted) {
          setMarkdown({ key: renderKey, tabId: tab.id, ...result, pending: false });
        }
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMarkdown({ key: renderKey, tabId: tab.id, html: "", warnings: [], pending: false,
            error: error instanceof Error ? error.message : String(error) });
        }
      });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [renderKey, tab.id, tab.content, tab.format, tab.path, tab.relativePath, tab.workspaceRoot, locale]);

  useEffect(() => {
    if (!navigation || navigation.tabId !== tab.id || appliedNavigationRef.current === navigation.id) return;

    let navigated = false;

    if (tab.format === "markdown") {
      if (!currentMarkdown || currentMarkdown.pending) return;
      const headings = Array.from(previewRef.current?.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6") ?? []);
      bindOutlineIds(headings, analysis.outline);
      navigated = scrollToOutline(previewRef.current, navigation.outlineId);
    } else if (tab.format === "html") {
      navigated = syncHtmlPreview(htmlFrameRef.current, analysis.outline, navigation.outlineId);
    } else {
      navigated = scrollToOutline(previewRef.current, navigation.outlineId);
    }

    if (navigated) appliedNavigationRef.current = navigation.id;
  }, [navigation, tab.id, tab.format, analysis.outline, currentMarkdown?.html, currentMarkdown?.pending]);

  if (tab.format === "markdown") {
    return (
      <section className="preview markdownPreviewShell" aria-busy={currentMarkdown?.pending ?? true}>
        {currentMarkdown?.error ? <p className="markdownPreviewMessage" role="alert">
          {text(locale, "preview.renderError", { reason: currentMarkdown.error })}
        </p> : null}
        {currentMarkdown?.warnings.length ? <p className="markdownPreviewMessage" role="status">
          {text(locale, "preview.renderWarnings", { details: currentMarkdown.warnings.join("; ") })}
        </p> : null}
        {!currentMarkdown?.html && !currentMarkdown?.error && currentMarkdown?.pending !== false ? (
          <p className="markdownPreviewMessage" role="status">{text(locale, "preview.rendering")}</p>
        ) : null}
        <article
          ref={previewRef}
          className="markdownBody markdownPreview"
          onClick={(event) => {
            const anchor = event.target instanceof Element ? event.target.closest("a") : null;
            const href = anchor?.getAttribute("href");
            if (!href) return;
            if (!href.startsWith("#")) {
              if (/^(?:https?:|mailto:|tel:|\/\/)/i.test(href)) return;
              event.preventDefault();
              onOpenLocalLink(href);
              return;
            }
            event.preventDefault();
            let id = href.slice(1);
            try { id = decodeURIComponent(id); } catch { /* Keep a literal malformed fragment. */ }
            const target = Array.from(previewRef.current?.querySelectorAll<HTMLElement>("[id]") ?? [])
              .find((element) => element.id === id);
            target?.scrollIntoView({ block: "start", behavior: "auto" });
          }}
          dangerouslySetInnerHTML={{ __html: currentMarkdown?.html ?? "" }}
        />
      </section>
    );
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
