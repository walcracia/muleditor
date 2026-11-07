import { useEffect, useRef } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { DocumentTab, EditorCommand } from "../types";
import { getMonacoLanguage } from "../lib/formats";
import type { Locale } from "../lib/i18n";
import { text } from "../lib/i18n";

interface EditorPaneProps {
  tab: DocumentTab;
  tabs: DocumentTab[];
  showDiff: boolean;
  diffSourceId?: string;
  locale: Locale;
  command?: EditorCommand;
  onChange: (content: string) => void;
  onDiffSourceChange: (tabId?: string) => void;
}

export function EditorPane({ tab, tabs, showDiff, diffSourceId, locale, command, onChange, onDiffSourceChange }: EditorPaneProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const diffModelsRef = useRef<MonacoEditor.IDiffEditorModel | null>(null);
  const appliedCommandRef = useRef<number>();

  function applyCommand(editor: MonacoEditor.IStandaloneCodeEditor, nextCommand: EditorCommand) {
    if (appliedCommandRef.current === nextCommand.id) return;
    appliedCommandRef.current = nextCommand.id;

    if (nextCommand.kind === "goTo") {
      const lineNumber = Math.max(1, nextCommand.line);
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({ lineNumber, column: nextCommand.column ?? 1 });
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
    if (!command || command.tabId !== tab.id || !editorRef.current || showDiff) return;
    applyCommand(editorRef.current, command);
  }, [command, showDiff, tab.id]);

  useEffect(() => {
    if (!showDiff) return;

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
      language={getMonacoLanguage(tab.format)}
      value={tab.content}
      theme="vs"
      onMount={(editor) => {
        editorRef.current = editor;
        if (command && command.tabId === tab.id) applyCommand(editor, command);
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
}
