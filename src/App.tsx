import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentPreview } from "./components/DocumentPreview";
import { EditorPane } from "./components/EditorPane";
import { EditorTabs } from "./components/EditorTabs";
import { FileSidebar } from "./components/FileSidebar";
import { FormatNavigationBar } from "./components/FormatNavigationBar";
import { InspectorPane } from "./components/InspectorPane";
import { ImmersiveEditor } from "./components/ImmersiveEditor";
import type { ImmersiveToolbarState } from "./components/ImmersiveEditor";
import { ProblemsPanel } from "./components/ProblemsPanel";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { analyzeDocument } from "./lib/analyze";
import { buildSmartExport, downloadTextFile } from "./lib/exporters";
import { registerBrowserMarkdownFiles } from "./lib/markdownResources";
import { getFormatAdapter } from "./lib/formatAdapters";
import {
  openDroppedPathsFromDesktop,
  listenDroppedPathsFromDesktop,
  openStartupFilesFromDesktop,
  openTextFileFromDesktop,
  openTextFolderFromDesktop,
  pickSavePath,
  saveTextFileToDesktop,
  isTauriRuntime,
  openHtmlPreviewInDesktop
} from "./lib/fileAccess";
import { detectFormat, extensionOf, isSupportedTextDocumentName } from "./lib/formats";
import { formatDocument } from "./lib/formatters";
import type { Locale } from "./lib/i18n";
import { formatLabel, text } from "./lib/i18n";
import { buildWorkspaceIndex, emptyFormatNavigation } from "./lib/workspace";
import type {
  DocumentAnalysis,
  DocumentFormat,
  DocumentTab,
  EditorCommand,
  OpenedTextFile,
  OutlineItem,
  OutlineNavigationCommand,
  WorkspaceReference
} from "./types";

const initialTab: DocumentTab = {
  id: "initial-untitled-markdown",
  name: "untitled.md",
  content: "",
  originalContent: "",
  format: "markdown",
  dirty: false
};

export function App() {
  const [tabs, setTabs] = useState<DocumentTab[]>(() => [initialTab]);
  const [activeId, setActiveId] = useState(initialTab.id);
  const [locale, setLocale] = useState<Locale>(() => initialLocale());
  const [showEditor, setShowEditor] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const [diffSourceId, setDiffSourceId] = useState<string>();
  const [showInspector, setShowInspector] = useState(true);
  const [showWorkspace, setShowWorkspace] = useState(true);
  const [showProblems, setShowProblems] = useState(true);
  const [isDragActive, setIsDragActive] = useState(false);
  const [markdownResourceVersion, setMarkdownResourceVersion] = useState(0);
  const [status, setStatus] = useState(() => text(initialLocale(), "status.ready"));
  const [editorCommand, setEditorCommand] = useState<EditorCommand>();
  const [previewNavigation, setPreviewNavigation] = useState<OutlineNavigationCommand>();
  const [markdownModes, setMarkdownModes] = useState<Record<string, "immersive" | "source">>({});
  const [immersiveCommand, setImmersiveCommand] = useState<{ id: number; tabId: string; action: string }>();
  const [immersiveState, setImmersiveState] = useState<ImmersiveToolbarState>({ activeActions: [], canUndo: false, canRedo: false });
  const [sourceLoaded, setSourceLoaded] = useState(false);
  const commandSerial = useRef(0);
  const lastMarkdownId = useRef(initialTab.id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceToggleRef = useRef<HTMLButtonElement>(null);
  const problemsToggleRef = useRef<HTMLButtonElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const startupFilesLoadedRef = useRef(false);
  const dragDepthRef = useRef(0);
  const runtime = isTauriRuntime() ? "Tauri" : "Browser";

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const baseAnalyses = useMemo(
    () => tabs.map((tab) => ({ tab, analysis: analyzeDocument(tab.format, tab.content) })),
    [tabs]
  );
  const workspaceIndex = useMemo(() => buildWorkspaceIndex(tabs), [tabs]);
  const analyses = useMemo(
    () =>
      baseAnalyses.map(({ tab, analysis }) => ({
        tab,
        analysis: mergeWorkspaceDiagnostics(analysis, workspaceIndex.byTabId[tab.id]?.diagnostics ?? [])
      })),
    [baseAnalyses, workspaceIndex]
  );
  const activeAnalysis = analyses.find((entry) => entry.tab.id === activeTab.id)?.analysis ?? analyzeDocument(activeTab.format, activeTab.content);
  const activeFormatNav = workspaceIndex.byTabId[activeTab.id] ?? emptyFormatNavigation(activeTab.format);
  const isMarkdown = activeTab.format === "markdown";
  if (isMarkdown) lastMarkdownId.current = activeTab.id;
  const immersiveTab = isMarkdown ? activeTab : tabs.find((tab) => tab.id === lastMarkdownId.current && tab.format === "markdown");
  const markdownMode = markdownModes[activeTab.id] ?? "immersive";
  const showImmersive = isMarkdown && markdownMode === "immersive" && !showDiff;
  const showSourcePane = isMarkdown ? markdownMode === "source" || showDiff : showEditor;
  const showDocumentPreview = !isMarkdown && showPreview && !showDiff;
  const editorSplitClass = showSourcePane && showDocumentPreview ? "editorSplit withPreview" : !showSourcePane && showDocumentPreview ? "editorSplit previewOnly" : "editorSplit";

  useEffect(() => {
    if (showSourcePane) setSourceLoaded(true);
  }, [showSourcePane]);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    localStorage.setItem("muleditor.locale", locale);
  }, [locale]);

  useEffect(() => {
    if (diffSourceId && (!showDiff || diffSourceId === activeTab.id || !tabs.some((tab) => tab.id === diffSourceId))) {
      setDiffSourceId(undefined);
    }
  }, [activeTab.id, diffSourceId, showDiff, tabs]);

  useEffect(() => {
    if (!isTauriRuntime() || startupFilesLoadedRef.current) return;
    startupFilesLoadedRef.current = true;

    openStartupFilesFromDesktop()
      .then((files) => {
        if (!files.length) return;
        replaceOpenedFiles(files);
      })
      .catch((error) => setStatus(errorMessage(error)));
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    listenDroppedPathsFromDesktop({
      onActiveChange: (active) => setIsDragActive(active),
      onDrop: async (paths) => {
        try {
          await openDroppedPaths(paths);
        } catch (error) {
          setStatus(errorMessage(error));
        }
      }
    })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }

        unlisten = nextUnlisten;
      })
      .catch((error) => setStatus(errorMessage(error)));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [locale]);

  function upsertOpenedFile(file: OpenedTextFile) {
    upsertOpenedFiles([file]);
  }

  function replaceOpenedFiles(files: OpenedTextFile[]) {
    if (!files.length) return;
    const nextTabs = files.map(openedFileToTab);

    setTabs(nextTabs);
    setActiveId(nextTabs[0].id);
    setShowDiff(false);
    setDiffSourceId(undefined);
    setStatus(files.length === 1 ? text(locale, "status.opened", { name: files[0].name }) : text(locale, "status.openedFiles", { count: files.length }));
  }

  function upsertOpenedFiles(files: OpenedTextFile[]) {
    if (!files.length) return;
    const nextTabs = files.map(openedFileToTab);
    const nextActiveId = nextTabs[nextTabs.length - 1].id;

    setTabs((current) => {
      const merged = isUntouchedInitialWorkspace(current) ? [] : [...current];
      for (const tab of nextTabs) {
        const existingIndex = merged.findIndex((item) => item.id === tab.id || (tab.path && item.path === tab.path));
        if (existingIndex < 0) {
          merged.push(tab);
        } else {
          merged[existingIndex] = tab;
        }
      }
      return merged;
    });
    setActiveId(nextActiveId);
    setDiffSourceId(undefined);
    setStatus(files.length === 1 ? text(locale, "status.opened", { name: files[0].name }) : text(locale, "status.openedFiles", { count: files.length }));
  }

  function handleNew(format: DocumentFormat) {
    const adapter = getFormatAdapter(format);
    const existingTabs = isUntouchedInitialWorkspace(tabs) ? [] : tabs;
    const name = uniqueUntitledName(adapter.defaultName, existingTabs);
    const content = adapter.defaultContent();
    const tab: DocumentTab = {
      id: `new-${Date.now()}-${existingTabs.length}`,
      name,
      content,
      originalContent: "",
      format: adapter.format,
      dirty: true
    };

    setTabs((current) => (isUntouchedInitialWorkspace(current) ? [tab] : [...current, tab]));
    setActiveId(tab.id);
    setShowDiff(false);
    setDiffSourceId(undefined);
    setStatus(text(locale, "status.created", { name }));
  }

  function openedFileToTab(file: OpenedTextFile): DocumentTab {
    const format = detectFormat(file.name, file.content);
    const id = file.path || file.relativePath || `${file.name}-${Date.now()}`;
    return {
      id,
      name: file.name,
      path: file.path,
      relativePath: file.relativePath,
      workspaceRoot: file.workspaceRoot,
      content: file.content,
      originalContent: file.content,
      format,
      dirty: false
    };
  }

  async function handleOpen() {
    if (isTauriRuntime()) {
      try {
        const file = await openTextFileFromDesktop();
        if (file) upsertOpenedFile(file);
      } catch (error) {
        setStatus(errorMessage(error));
      }
      return;
    }

    fileInputRef.current?.click();
  }

  async function handleOpenFolder() {
    if (isTauriRuntime()) {
      try {
        const files = await openTextFolderFromDesktop();
        upsertOpenedFiles(files);
        if (!files.length) setStatus(text(locale, "status.noSupportedFiles"));
      } catch (error) {
        setStatus(errorMessage(error));
      }
      return;
    }

    folderInputRef.current?.click();
  }

  async function handleBrowserFile(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await upsertBrowserFiles(files);
  }

  async function handleBrowserFolder(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await upsertBrowserFiles(files, true);
  }

  async function upsertBrowserFiles(files: File[], fromFolder = false) {
    if (!files.length) return;
    registerBrowserMarkdownFiles(files);
    setMarkdownResourceVersion((version) => version + 1);
    const supportedFiles = files.filter((file) => isSupportedTextDocumentName(file.name));
    if (!supportedFiles.length) {
      setStatus(text(locale, "status.noSupportedFiles"));
      return;
    }

    const openedFiles = await Promise.all(
      supportedFiles.map(async (file) => ({
        name: file.name,
        relativePath: fromFolder ? file.webkitRelativePath || file.name : file.name,
        workspaceRoot: fromFolder ? browserWorkspaceRoot(file.webkitRelativePath) : undefined,
        content: await file.text()
      }))
    );
    upsertOpenedFiles(openedFiles);
  }

  async function openDroppedPaths(paths: string[]) {
    if (!paths.length) return;

    const files = await openDroppedPathsFromDesktop(paths);
    upsertOpenedFiles(files);
    if (!files.length) setStatus(text(locale, "status.noSupportedFiles"));
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);

    if (isTauriRuntime()) return;

    const files = Array.from(event.dataTransfer.files ?? []);
    try {
      await upsertBrowserFiles(files);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  }

  function updateActiveContent(content: string) {
    updateTabContent(activeTab.id, content);
  }

  function updateTabContent(tabId: string, content: string) {
    setTabs((current) => {
      if (!current.some((tab) => tab.id === tabId && tab.content !== content)) return current;
      return current.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              content,
              dirty: content !== tab.originalContent,
              format: detectFormat(tab.name, content)
            }
          : tab
      );
    });
  }

  async function handleSave() {
    if (!activeTab.path || !isTauriRuntime()) {
      await handleSaveAs();
      return;
    }

    try {
      await saveTextFileToDesktop(activeTab.path, activeTab.content);
      markSaved(activeTab.id, activeTab.path);
      setStatus(text(locale, "status.saved", { name: activeTab.name }));
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function handleSaveAs() {
    if (!isTauriRuntime()) {
      downloadTextFile({
        name: activeTab.name,
        content: activeTab.content,
        mimeType: "text/plain"
      });
      markSaved(activeTab.id);
      setStatus(text(locale, "status.downloaded", { name: activeTab.name }));
      return;
    }

    try {
      const path = await pickSavePath(activeTab.path || activeTab.name);
      if (!path) return;
      await saveTextFileToDesktop(path, activeTab.content);
      markSaved(activeTab.id, path);
      setStatus(text(locale, "status.saved", { name: fileNameFromPath(path) }));
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  async function handleExport() {
    try {
      setStatus(text(locale, "status.exporting", { name: activeTab.name }));
      const payload = await buildSmartExport(activeTab, {
        lang: locale === "zh" ? "zh-CN" : "en",
        errorLabel: text(locale, "preview.mermaidError")
      });

      if (isTauriRuntime()) {
        const path = await pickSavePath(payload.name);
        if (!path) {
          setStatus(text(locale, "status.ready"));
          return;
        }
        await saveTextFileToDesktop(path, payload.content);
      } else {
        downloadTextFile(payload);
      }

      setStatus(text(locale, "status.exported", { name: payload.name }));
    } catch (error) {
      setStatus(text(locale, "status.exportFailed", { reason: errorMessage(error) }));
    }
  }

  async function handleFormat() {
    try {
      const formatted = await formatDocument(activeTab.format, activeTab.content);
      updateActiveContent(formatted);
      setStatus(text(locale, "status.formatted", { name: activeTab.name }));
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function handleValidate() {
    const issueCount = activeAnalysis.diagnostics.length;
    setStatus(issueCount ? text(locale, "status.validationIssues", { count: issueCount }) : text(locale, "status.validationClean"));
  }

  async function handleOpenHtmlPreview() {
    if (activeTab.format !== "html") {
      setStatus(text(locale, "status.htmlPreviewOnly"));
      return;
    }

    try {
      if (isTauriRuntime()) {
        await openHtmlPreviewInDesktop(activeTab.name, activeTab.content, activeTab.path);
      } else {
        openHtmlPreviewInBrowser(activeTab.name, activeTab.content);
      }
      setStatus(text(locale, "status.openedHtmlPreview", { name: activeTab.name }));
    } catch (error) {
      setStatus(errorMessage(error));
    }
  }

  function handleGoToLine(tabId: string, line: number) {
    setActiveId(tabId);
    setShowEditor(true);
    setShowDiff(false);
    setMarkdownModes((current) => ({ ...current, [tabId]: "source" }));
    setEditorCommand({ id: Date.now(), tabId, kind: "goTo", line });
  }

  function handleSelectOutlineItem(item: OutlineItem) {
    const commandId = Date.now();

    if (item.line && !showImmersive && (showSourcePane || showDiff)) {
      setShowDiff(false);
      setEditorCommand({ id: commandId, tabId: activeTab.id, kind: "goTo", line: item.line });
    }

    if (showPreview || showImmersive) {
      setPreviewNavigation({ id: commandId, tabId: activeTab.id, outlineId: item.id });
    }
  }

  function handleOpenReference(reference: WorkspaceReference, preferredMode: "immersive" | "source" = "source") {
    if (!reference.resolvedTabId) {
      setStatus(text(locale, "status.unresolvedReference", { target: reference.rawTarget }));
      return;
    }

    setActiveId(reference.resolvedTabId);
    setShowEditor(true);
    setShowDiff(false);
    const targetId = reference.resolvedTabId;
    setMarkdownModes((current) => ({ ...current, [targetId]: preferredMode }));
    if (preferredMode === "immersive") {
      const targetOutline = analyses.find(({ tab }) => tab.id === targetId)?.analysis.outline;
      const item = targetOutline?.find((entry) => entry.line === reference.resolvedLine) ?? targetOutline?.[0];
      if (item) setPreviewNavigation({ id: ++commandSerial.current, tabId: targetId, outlineId: item.id });
    }
    setEditorCommand({
      id: Date.now(),
      tabId: reference.resolvedTabId,
      kind: "goTo",
      line: reference.resolvedLine ?? 1
    });
    setStatus(text(locale, "status.openedReference", { target: reference.rawTarget }));
  }

  function handleOpenPreviewLink(href: string) {
    const normalize = (value: string) => {
      try { return decodeURI(value); } catch { return value; }
    };
    const reference = activeFormatNav.references.find((item) => normalize(item.rawTarget) === normalize(href));
    if (reference) handleOpenReference(reference, "immersive");
    else setStatus(text(locale, "status.unresolvedReference", { target: href }));
  }

  function handleInsertSnippet(snippetText: string) {
    setShowEditor(true);
    setShowDiff(false);
    setEditorCommand({ id: Date.now(), tabId: activeTab.id, kind: "insert", text: snippetText });
    setStatus(text(locale, "status.insertedSnippet", { format: formatLabel(activeTab.format, locale) }));
  }

  function handleMarkdownModeChange(mode: "immersive" | "source") {
    setMarkdownModes((current) => ({ ...current, [activeTab.id]: mode }));
    setShowDiff(false);
  }

  function handleMarkdownAction(action: string, snippet?: string) {
    if (showDiff) return;
    const id = ++commandSerial.current;
    if (showImmersive) {
      setImmersiveCommand({ id, tabId: activeTab.id, action });
    } else {
      setEditorCommand({ id, tabId: activeTab.id, kind: "format", action, text: snippet });
    }
  }

  function handleReferenceHealth(unresolvedCount: number) {
    setStatus(unresolvedCount ? text(locale, "status.referencesMissing", { count: unresolvedCount }) : text(locale, "status.referencesClean"));
  }

  function handleToggleLocale() {
    setLocale((current) => {
      const next = current === "zh" ? "en" : "zh";
      setStatus(text(next, "status.languageChanged"));
      return next;
    });
  }

  function handleToggleEditor() {
    setShowEditor((current) => {
      const next = !current;
      if (!next) {
        setShowPreview(true);
        setShowDiff(false);
      }
      return next;
    });
  }

  function handleTogglePreview() {
    setShowPreview((current) => {
      const next = !current;
      if (!next) {
        setShowEditor(true);
      } else {
        setShowDiff(false);
      }
      return next;
    });
  }

  function handleToggleDiff() {
    setShowDiff((current) => {
      const next = !current;
      if (next) {
        setShowEditor(true);
      }
      return next;
    });
  }

  function handleClose(id: string) {
    if (tabs.length <= 1) return;
    const index = tabs.findIndex((tab) => tab.id === id);
    const nextTabs = tabs.filter((tab) => tab.id !== id);
    setTabs(nextTabs);
    if (diffSourceId === id) setDiffSourceId(undefined);
    if (activeId === id) {
      setActiveId(nextTabs[Math.max(0, index - 1)].id);
    }
  }

  function markSaved(id: string, path?: string) {
    setTabs((current) =>
      current.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              path: path || tab.path,
              name: path ? fileNameFromPath(path) : tab.name,
              originalContent: tab.content,
              dirty: false
            }
          : tab
      )
    );
  }

  return (
    <div
      className={`appShell${isDragActive ? " dragActive" : ""}${showProblems ? "" : " problemsClosed"}`}
      lang={locale === "zh" ? "zh-CN" : "en"}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragActive ? (
        <div className="dropOverlay" aria-hidden="true">
          <div className="dropOverlayPanel">{text(locale, "drop.openFiles")}</div>
        </div>
      ) : null}
      <Toolbar
        activeFormat={activeTab.format}
        locale={locale}
        showEditor={showEditor}
        showPreview={showPreview}
        showDiff={showDiff}
        showInspector={showInspector}
        showWorkspace={showWorkspace}
        showProblems={showProblems}
        totalIssueCount={analyses.reduce((total, { analysis }) => total + analysis.diagnostics.length, 0)}
        onToggleWorkspace={() => setShowWorkspace((visible) => !visible)}
        onToggleProblems={() => setShowProblems((visible) => !visible)}
        workspaceToggleRef={workspaceToggleRef}
        problemsToggleRef={problemsToggleRef}
        markdownMode={markdownMode}
        onMarkdownModeChange={handleMarkdownModeChange}
        onNew={handleNew}
        onOpen={handleOpen}
        onOpenFolder={handleOpenFolder}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExport={handleExport}
        onFormat={handleFormat}
        onValidate={handleValidate}
        onToggleEditor={handleToggleEditor}
        onTogglePreview={handleTogglePreview}
        onToggleDiff={handleToggleDiff}
        onToggleInspector={() => setShowInspector((value) => !value)}
        onToggleLocale={handleToggleLocale}
      />

      <main className={`workbench${showInspector ? "" : " inspectorClosed"}${showWorkspace ? "" : " workspaceClosed"}`}>
        {showWorkspace ? <FileSidebar tabs={tabs} activeId={activeTab.id} locale={locale} onSelect={setActiveId}
          onClose={() => { setShowWorkspace(false); workspaceToggleRef.current?.focus(); }} /> : null}
        <section className="editorRegion">
          <EditorTabs tabs={tabs} activeId={activeTab.id} locale={locale} onSelect={setActiveId} onClose={handleClose} />
          <FormatNavigationBar
            tab={activeTab}
            info={activeFormatNav}
            locale={locale}
            onGoToLine={handleGoToLine}
            onOpenReference={handleOpenReference}
            onInsertSnippet={handleInsertSnippet}
            onMarkdownAction={handleMarkdownAction}
            immersiveState={showImmersive ? immersiveState : undefined}
            readOnly={showDiff}
            onReferenceHealth={handleReferenceHealth}
          />
          <div className={editorSplitClass}>
            {immersiveTab ? (
              <div className="editorSurface" hidden={!showImmersive}>
                <ImmersiveEditor
                  tab={immersiveTab}
                  locale={locale}
                  active={showImmersive}
                  resourceVersion={markdownResourceVersion}
                  command={immersiveCommand?.tabId === immersiveTab.id ? immersiveCommand : undefined}
                  navigation={previewNavigation}
                  onChange={(content) => updateTabContent(immersiveTab.id, content)}
                  onOpenLocalLink={handleOpenPreviewLink}
                  onStateChange={setImmersiveState}
                />
              </div>
            ) : null}
            {sourceLoaded || showSourcePane ? (
              <div className="editorSurface" hidden={!showSourcePane}>
                <EditorPane
                  tab={activeTab}
                  tabs={tabs}
                  active={showSourcePane}
                  showDiff={showDiff}
                  diffSourceId={diffSourceId}
                  locale={locale}
                  command={editorCommand}
                  onChange={updateActiveContent}
                  onDiffSourceChange={setDiffSourceId}
                />
              </div>
            ) : null}
            {showDocumentPreview ? (
              <DocumentPreview
                tab={activeTab}
                analysis={activeAnalysis}
                locale={locale}
                navigation={previewNavigation}
                resourceVersion={markdownResourceVersion}
                onOpenLocalLink={handleOpenPreviewLink}
                onOpenHtmlPreview={handleOpenHtmlPreview}
              />
            ) : null}
          </div>
        </section>
        {showInspector ? (
          <InspectorPane
            analysis={activeAnalysis}
            locale={locale}
            onClose={() => setShowInspector(false)}
            onSelectOutlineItem={handleSelectOutlineItem}
          />
        ) : null}
      </main>

      {showProblems ? <ProblemsPanel diagnosticsByTab={analyses.map(({ tab, analysis }) => ({ tab, diagnostics: analysis.diagnostics }))} locale={locale}
        onClose={() => { setShowProblems(false); problemsToggleRef.current?.focus(); }} /> : null}
      <StatusBar tab={activeTab} issueCount={activeAnalysis.diagnostics.length} runtime={runtime} locale={locale} status={status} />
      <input id="fileInput" ref={fileInputRef} className="hiddenInput" type="file" multiple onChange={handleBrowserFile} />
      <input id="folderInput" ref={folderInputRef} className="hiddenInput" type="file" multiple onChange={handleBrowserFolder} />
    </div>
  );
}

function initialLocale(): Locale {
  if (typeof localStorage === "undefined") return "zh";
  return localStorage.getItem("muleditor.locale") === "en" ? "en" : "zh";
}

function isUntouchedInitialWorkspace(tabs: DocumentTab[]): boolean {
  if (tabs.length !== 1) return false;
  const [tab] = tabs;
  return tab.id === initialTab.id && !tab.path && !tab.relativePath && tab.content === "" && tab.originalContent === "" && !tab.dirty;
}

function mergeWorkspaceDiagnostics(analysis: DocumentAnalysis, diagnostics: DocumentAnalysis["diagnostics"]): DocumentAnalysis {
  return {
    ...analysis,
    diagnostics: [...analysis.diagnostics, ...diagnostics]
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function browserWorkspaceRoot(relativePath: string): string | undefined {
  return relativePath.includes("/") ? relativePath.split("/")[0] : undefined;
}

function hasDraggedFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || "untitled.txt";
}

function uniqueUntitledName(defaultName: string, tabs: DocumentTab[]): string {
  const existingNames = new Set(tabs.map((tab) => tab.name.toLowerCase()));
  if (!existingNames.has(defaultName.toLowerCase())) return defaultName;

  const extension = extensionOf(defaultName);
  const baseName = extension ? defaultName.slice(0, -extension.length) : defaultName;
  let index = 2;
  let candidate = `${baseName}-${index}${extension}`;

  while (existingNames.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${baseName}-${index}${extension}`;
  }

  return candidate;
}

function openHtmlPreviewInBrowser(name: string, content: string) {
  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const previewWindow = window.open(url, "_blank");

  if (!previewWindow) {
    URL.revokeObjectURL(url);
    throw new Error(`Failed to open ${name} preview`);
  }

  previewWindow.focus();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
