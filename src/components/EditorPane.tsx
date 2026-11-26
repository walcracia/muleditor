import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { DocumentTab, EditorCommand, EditorPositionHandle } from "../types";
import { getMonacoLanguage } from "../lib/formats";
import type { Locale } from "../lib/i18n";
import { text } from "../lib/i18n";

interface EditorPaneProps {
  tab: DocumentTab;
  tabs: DocumentTab[];
  showDiff: boolean;
  diffSourceId?: string;
  locale: Locale;
  active?: boolean;
  command?: EditorCommand;
  onChange: (content: string) => void;
  onDiffSourceChange: (tabId?: string) => void;
}

export const EditorPane = forwardRef<EditorPositionHandle, EditorPaneProps>(function EditorPane({ tab, tabs, showDiff, diffSourceId, locale, active = true, command, onChange, onDiffSourceChange }, ref) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const diffModelsRef = useRef<MonacoEditor.IDiffEditorModel | null>(null);
  const appliedCommandRef = useRef<number>();
  const latestPropsRef = useRef({ active, tabId: tab.id, command, showDiff });
  latestPropsRef.current = { active, tabId: tab.id, command, showDiff };

  useImperativeHandle(ref, () => ({
    getPosition() {
      const latest = latestPropsRef.current;
      const editor = editorRef.current;
      if (!latest.active || latest.showDiff || editor?.getModel()?.uri.toString() !== `muleditor://document/${latest.tabId}`) return undefined;
      const position = editor.getPosition();
      return position ? { line: position.lineNumber, column: position.column } : undefined;
    }
  }), []);

  function applyCommand(editor: MonacoEditor.IStandaloneCodeEditor, nextCommand: EditorCommand) {
    if (appliedCommandRef.current === nextCommand.id) return;
    if (editor.getModel()?.uri.toString() !== `muleditor://document/${nextCommand.tabId}`) return;
    appliedCommandRef.current = nextCommand.id;

    if (nextCommand.kind === "goTo") {
      const lineNumber = Math.max(1, nextCommand.line);
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({ lineNumber, column: nextCommand.column ?? 1 });
      editor.focus();
      return;
    }

    if (nextCommand.kind === "format") {
      if (nextCommand.action === "md-undo" || nextCommand.action === "md-redo") {
        editor.trigger("format-navigation", nextCommand.action === "md-undo" ? "undo" : "redo", null);
        editor.focus();
        return;
      }
      const model = editor.getModel();
      const selection = editor.getSelection();
      if (!model || !selection) return;
      const selected = model.getValueInRange(selection);
      const wrappers: Record<string, [string, string, string]> = {
        "md-bold": ["**", "**", "bold"],
        "md-italic": ["_", "_", "italic"],
        "md-strike": ["~~", "~~", "strikethrough"],
        "md-inline-code": ["`", "`", "code"],
        "md-link": ["[", "](./document.md#section)", "label"],
        "md-upload": ["![", "](./image.png)", "alt"]
      };
      const wrapper = wrappers[nextCommand.action];
      let range: MonacoEditor.IIdentifiedSingleEditOperation["range"] = selection;
      let replacement = nextCommand.text ?? "";
      if (wrapper) {
        replacement = `${wrapper[0]}${selected || wrapper[2]}${wrapper[1]}`;
      } else {
        const prefixes: Record<string, string> = {
          "md-heading": "# ", "md-list": "- ", "md-ordered": "1. ", "md-task": "- [ ] ", "md-quote": "> "
        };
        const prefix = prefixes[nextCommand.action];
        if (prefix) {
          range = { startLineNumber: selection.startLineNumber, startColumn: 1,
            endLineNumber: selection.endLineNumber, endColumn: model.getLineMaxColumn(selection.endLineNumber) };
          replacement = model.getValueInRange(range).split(/\r?\n/).map((line) => `${prefix}${line}`).join(model.getEOL());
        }
      }
      if (!replacement) return;
      editor.pushUndoStop();
      editor.executeEdits("format-navigation", [{ range, text: replacement, forceMoveMarkers: true }]);
      editor.pushUndoStop();
      editor.focus();
      return;
    }

    const position = editor.getPosition() ?? { lineNumber: editor.getModel()?.getLineCount() ?? 1, column: 1 };
    editor.executeEdits("format-navigation", [
      {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        },
        text: nextCommand.text,
        forceMoveMarkers: true
      }
    ]);
    editor.focus();
  }

  useEffect(() => {
    if (!active || !command || command.tabId !== tab.id || !editorRef.current || showDiff) return;
    applyCommand(editorRef.current, command);
  }, [active, command, showDiff, tab.id]);

  useEffect(() => {
    if (!showDiff) return;
    editorRef.current = null;

    return () => {
      const models = diffModelsRef.current;
      diffModelsRef.current = null;
      if (!models) return;

      queueMicrotask(() => {
        if (!models.original.isDisposed()) models.original.dispose();
        if (models.modified !== models.original && !models.modified.isDisposed()) models.modified.dispose();
      });
    };
  }, [showDiff]);

  if (showDiff) {
    const sourceTab = tabs.find((item) => item.id === diffSourceId && item.id !== tab.id);
    const activeLabel = tab.relativePath ?? tab.name;
    const sourceLabel = sourceTab?.relativePath ?? sourceTab?.name ?? text(locale, "diff.savedVersion", { name: activeLabel });

    return (
      <section className="diffShell" aria-label={text(locale, "diff.comparison")}>
        <div className="diffSourceBar">
          <label className="diffSourceField">
            <span>{text(locale, "diff.original")}</span>
            <select
              aria-label={text(locale, "diff.selectSource", { name: activeLabel })}
              value={sourceTab?.id ?? ""}
              onChange={(event) => onDiffSourceChange(event.target.value || undefined)}
            >
              <option value="">{text(locale, "diff.savedVersion", { name: activeLabel })}</option>
              {tabs
                .filter((item) => item.id !== tab.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.relativePath ?? item.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="diffCurrentFile" title={activeLabel}>
            <span>{text(locale, "diff.modified")}</span>
            <strong>{activeLabel}</strong>
          </div>
        </div>
        <DiffEditor
          className="monacoHost"
          wrapperProps={{ className: "diffEditorHost" }}
          keepCurrentOriginalModel
          keepCurrentModifiedModel
          originalLanguage={getMonacoLanguage(sourceTab?.format ?? tab.format)}
          modifiedLanguage={getMonacoLanguage(tab.format)}
          original={sourceTab?.content ?? tab.originalContent}
          modified={tab.content}
          theme="vs"
          onMount={(editor) => {
            diffModelsRef.current = editor.getModel();
          }}
          options={{
            automaticLayout: true,
            diffAlgorithm: "advanced",
            domReadOnly: true,
            experimental: { showMoves: true },
            ignoreTrimWhitespace: false,
            minimap: { enabled: false },
            modifiedAriaLabel: text(locale, "diff.modifiedAria", { name: activeLabel }),
            originalEditable: false,
            originalAriaLabel: text(locale, "diff.originalAria", { name: sourceLabel }),
            readOnly: true,
            renderSideBySide: true,
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineHeight: 21,
            useInlineViewWhenSpaceIsLimited: false,
            wordWrap: "on"
          }}
        />
      </section>
    );
  }

  return (
    <Editor
      className="monacoHost"
      path={`muleditor://document/${tab.id}`}
      language={getMonacoLanguage(tab.format)}
      value={tab.content}
      theme="vs"
      onMount={(editor) => {
        editorRef.current = editor;
        // Monaco may finish loading after the user changed tabs or returned to immersive mode.
        const latest = latestPropsRef.current;
        if (latest.active && !latest.showDiff && latest.command?.tabId === latest.tabId) applyCommand(editor, latest.command);
      }}
      onChange={(value) => onChange(value ?? "")}
      options={{
        automaticLayout: true,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineHeight: 21,
        tabSize: 2,
        wordWrap: "on",
        renderWhitespace: "selection"
      }}
    />
  );
});
