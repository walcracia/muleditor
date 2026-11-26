import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorState, TextSelection, type Command, type SelectionBookmark } from "prosemirror-state";
import { EditorView, Decoration, DecorationSet, type NodeView } from "prosemirror-view";
import { Plugin } from "prosemirror-state";
import { baseKeymap, chainCommands, setBlockType, toggleMark, wrapIn, lift, exitCode } from "prosemirror-commands";
import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { inputRules, wrappingInputRule, textblockTypeInputRule, undoInputRule } from "prosemirror-inputrules";
import { wrapInList, splitListItem, sinkListItem, liftListItem } from "prosemirror-schema-list";
import { tableEditing, goToNextCell, addRowAfter, addColumnAfter, deleteRow, deleteColumn, deleteTable } from "prosemirror-tables";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import type { DocumentTab, EditorPositionHandle, OutlineNavigationCommand, PositionNavigationCommand } from "../types";
import type { Locale } from "../lib/i18n";
import { immersiveSchema as schema, parseImmersiveMarkdown, isSafeImmersiveLink, immersivePositionAtSource, sourcePositionAtImmersive } from "../lib/immersiveMarkdown";
import { extractMarkdownAnchors, extractMarkdownHeadings, renderMarkdownDocument } from "../lib/markdown";
import { resolveMarkdownImage } from "../lib/markdownResources";
import "prosemirror-view/style/prosemirror.css";
import "../immersive.css";

export interface ImmersiveToolbarState {
  activeActions: string[];
  canUndo: boolean;
  canRedo: boolean;
}

export interface ImmersiveEditorProps {
  tab: DocumentTab;
  locale: Locale;
  resourceVersion: number;
  active?: boolean;
  command?: { id: number; action: string };
  navigation?: OutlineNavigationCommand;
  positionNavigation?: PositionNavigationCommand;
  onChange: (source: string) => void;
  onOpenLocalLink?: (target: string) => void;
  onStateChange?: (state: ImmersiveToolbarState) => void;
}

type Session = ReturnType<typeof parseImmersiveMarkdown>;
interface CachedDocument { state: EditorState; session: Session; source: string; scroll: number; }
type FormKind = "link" | "image" | "math" | "mermaid" | "raw" | "footnote" | "emoji";
interface EditForm {
  kind: FormKind;
  tabId: string;
  bookmark: SelectionBookmark;
  doc: ProseMirrorNode;
  position?: number;
  node?: ProseMirrorNode;
  source: string;
  label: string;
  href: string;
}

const labels = {
  zh: { editor: "沉浸编辑器", edit: "编辑", math: "公式", mermaid: "图表", image: "图片", raw: "原始内容", footnote: "脚注", link: "链接", emoji: "表情", source: "源码", address: "地址", label: "文字 / 替代文本", apply: "应用", cancel: "取消", insert: "插入", loading: "正在渲染…", failed: "内容无法渲染", row: "添加行", column: "添加列", deleteRow: "删除行", deleteColumn: "删除列", deleteTable: "删除表格", table: "表格操作", follow: "Ctrl / ⌘ + 点击打开链接", metadata: "文档元数据", definitions: "脚注与引用定义" },
  en: { editor: "Immersive editor", edit: "Edit", math: "math", mermaid: "diagram", image: "image", raw: "raw content", footnote: "footnote", link: "link", emoji: "emoji", source: "source", address: "address", label: "Text / alternative text", apply: "Apply", cancel: "Cancel", insert: "Insert", loading: "Rendering…", failed: "Content could not be rendered", row: "Add row", column: "Add column", deleteRow: "Delete row", deleteColumn: "Delete column", deleteTable: "Delete table", table: "Table actions", follow: "Ctrl / ⌘ + click to open link", metadata: "Document metadata", definitions: "Footnotes and reference definitions" }
};

export const ImmersiveEditor = forwardRef<EditorPositionHandle, ImmersiveEditorProps>(function ImmersiveEditor(props, ref) {
  const current = useRef(props);
  current.current = props;
  const mount = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const documents = useRef(new Map<string, CachedDocument>());
  const shownTab = useRef<string>();
  const atoms = useRef(new Set<RichNodeView>());
  const lastCommand = useRef<number>();
  const lastNavigation = useRef<number>();
  const lastPositionNavigation = useRef<number>();
  const positionReveal = useRef<(() => void)>();
  const lastSummary = useRef("");
  const syncRef = useRef<() => void>(() => {});
  const openFormRef = useRef<(kind: FormKind, node?: ProseMirrorNode, position?: number) => void>(() => {});
  const executeRef = useRef<(action: string) => void>(() => {});
  const [form, setForm] = useState<EditForm>();
  const [error, setError] = useState("");
  const [inTable, setInTable] = useState(false);
  const words = labels[props.locale];

  useImperativeHandle(ref, () => ({ getPosition() {
    const view = viewRef.current;
    const tab = current.current.tab;
    if (!view || current.current.active === false || shownTab.current !== tab.id) return;
    const source = documents.current.get(tab.id)?.source ?? tab.content;
    return sourcePositionAtImmersive(source, view.state.doc, view.state.selection.head);
  } }), []);

  function publishState(view: EditorView) {
    const state = view.state;
    const actions: string[] = [];
    for (const [name, mark] of [["bold", "strong"], ["italic", "em"], ["strike", "strike"], ["inline-code", "code"], ["link", "link"]]) {
      if (markActive(state, mark)) actions.push(`md-${name}`);
    }
    for (const [name, type] of [["heading", "heading"], ["quote", "blockquote"], ["code", "code_block"], ["list", "bullet_list"], ["ordered", "ordered_list"]]) {
      if (ancestor(state, type)) actions.push(`md-${name}`);
    }
    if (ancestor(state, "list_item")?.node.attrs.checked != null) actions.push("md-task");
    const table = Boolean(ancestor(state, "table"));
    if (table) actions.push("md-table");
    const summary = { activeActions: actions, canUndo: undo(state), canRedo: redo(state) };
    const key = JSON.stringify(summary);
    if (key !== lastSummary.current) {
      lastSummary.current = key;
      current.current.onStateChange?.(summary);
    }
    setInTable((previous) => previous === table ? previous : table);
  }

  function followLink(href: string) {
    const view = viewRef.current;
    if (!view || current.current.active === false || !isSafeImmersiveLink(href)) return;
    if (href.startsWith("#")) {
      let id = href.slice(1);
      try { id = decodeURIComponent(id); } catch { /* Preserve a literal fragment. */ }
      const target = Array.from(view.dom.querySelectorAll<HTMLElement>("[id]")).find((element) => element.id === id);
      const body = target?.closest<HTMLElement>(".immersiveInlineFootnoteBody");
      if (body) body.hidden = false;
      target?.scrollIntoView({ block: "center" });
    } else if (/^https?:\/\//i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else if (!/^[a-z][a-z\d+.-]*:/i.test(href) && !href.startsWith("//")) {
      current.current.onOpenLocalLink?.(href);
    }
  }

  useEffect(() => {
    if (!mount.current) return;
    let destroyed = false;
    const context = () => current.current;
    const entry = () => documents.current.get(shownTab.current ?? "");
    const getSource = () => entry()?.source ?? context().tab.content;
    const documentRender = new SharedDocumentRender(context, getSource);
    const open = (kind: FormKind, node?: ProseMirrorNode, position?: number) => {
      const view = viewRef.current;
      if (!view || context().active === false) return;
      if (kind === "footnote" && node) {
        if (String(node.attrs.source).startsWith("^[")) {
          open("raw", node, position);
          return;
        }
        let definition: { node: ProseMirrorNode; position: number } | undefined;
        view.state.doc.descendants((candidate, pos) => {
          if (candidate.type.name === "raw_block" && footnoteLabels(candidate.attrs.source).has(node.attrs.label)) definition = { node: candidate, position: pos };
        });
        if (definition) open("raw", definition.node, definition.position);
        else setError(context().locale === "zh" ? "请在源代码模式编辑此脚注定义。" : "Edit this footnote definition in source mode.");
        return;
      }
      const selected = view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, " ");
      const link = view.state.storedMarks?.find((mark) => mark.type === schema.marks.link) ?? view.state.selection.$from.marks().find((mark) => mark.type === schema.marks.link);
      setForm({
        kind, tabId: context().tab.id, bookmark: view.state.selection.getBookmark(), doc: view.state.doc, position, node,
        source: node ? (kind === "raw" || node.type.name === "inline_math" || node.type.name.startsWith("raw_") ? node.attrs.source ?? "" : node.textContent) : kind === "mermaid" ? "flowchart LR\n  A --> B" : kind === "math" ? "x^2 + y^2 = z^2" : kind === "footnote" ? "" : kind === "emoji" ? "😊" : "",
        label: node?.type.name === "image" ? node.attrs.alt ?? "" : node?.type.name === "footnote_ref" ? node.attrs.label ?? "" : kind === "footnote" ? `note-${Date.now().toString(36)}` : selected,
        href: node?.type.name === "image" ? node.attrs.src ?? "" : link?.attrs.href ?? ""
      });
    };
    openFormRef.current = open;

    const plugins = () => [
      history(),
      new Plugin({ appendTransaction: (_transactions, _previous, state) => {
        if (state.doc.lastChild?.type === schema.nodes.paragraph) return null;
        return state.tr.insert(state.doc.content.size, schema.nodes.paragraph.create({ ephemeral: true }));
      } }),
      inputRules({ rules: [
        textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (match) => ({ level: match[1].length })),
        wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),
        wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, (match) => ({ order: Number(match[1]) })),
        wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),
        textblockTypeInputRule(/^```([a-z\d_+-]*)\s$/, schema.nodes.code_block, (match) => ({ language: match[1] || "text" }))
      ] }),
      keymap({
        "Mod-z": undo, "Shift-Mod-z": redo, "Mod-y": redo,
        "Mod-b": toggleMark(schema.marks.strong), "Mod-i": toggleMark(schema.marks.em),
        "Mod-Shift-x": toggleMark(schema.marks.strike), "Mod-`": toggleMark(schema.marks.code),
        "Mod-k": () => { open("link"); return true; },
        Home: moveLineBoundary(-1, false), "Shift-Home": moveLineBoundary(-1, true),
        End: moveLineBoundary(1, false), "Shift-End": moveLineBoundary(1, true),
        "Mod-Home": moveDocumentBoundary(-1, false), "Mod-Shift-Home": moveDocumentBoundary(-1, true),
        "Mod-End": moveDocumentBoundary(1, false), "Mod-Shift-End": moveDocumentBoundary(1, true),
        "Mod-Enter": exitCode,
        Backspace: undoInputRule,
        Enter: chainCommands(fenceOnEnter, continueList, baseKeymap.Enter),
        Tab: (state, dispatch, view) => {
          if (ancestor(state, "table")) {
            if (goToNextCell(1)(state, dispatch)) return true;
            if (addRowAfter(state, dispatch) && view) return goToNextCell(1)(view.state, dispatch);
            return true;
          }
          return sinkListItem(schema.nodes.list_item)(state, dispatch);
        },
        "Shift-Tab": (state, dispatch) => ancestor(state, "table") ? goToNextCell(-1)(state, dispatch) : liftListItem(schema.nodes.list_item)(state, dispatch)
      }),
      keymap(baseKeymap), tableEditing(), dropCursor(), gapCursor(),
      headingDecorations(getSource), syntaxDecorations(context)
    ];

    const createEntry = (source: string): CachedDocument => {
      const session = parseImmersiveMarkdown(source);
      return { session, source, scroll: 0, state: EditorState.create({ schema, doc: session.doc, plugins: plugins() }) };
    };
    const initial = createEntry(context().tab.content);
    documents.current.set(context().tab.id, initial);
    shownTab.current = context().tab.id;

    const nodeViews: Record<string, (node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined) => NodeView> = {};
    for (const name of ["math_block", "mermaid_block", "image", "inline_math", "footnote_ref", "raw_inline", "raw_block"]) {
      nodeViews[name] = (node, view, getPos) => {
        const instance = new RichNodeView(node, view, getPos, context, getSource, documentRender, open, () => atoms.current.delete(instance), () => positionReveal.current?.());
        atoms.current.add(instance);
        return instance;
      };
    }
    nodeViews.list_item = (node, view, getPos) => new TaskItemView(node, view, getPos, context);
    const view = new EditorView(mount.current, {
      state: initial.state,
      nodeViews,
      attributes: { class: "markdownBody immersiveDocument", role: "textbox", "aria-multiline": "true", "aria-label": labels[context().locale].editor },
      editable: () => context().active !== false,
      dispatchTransaction(transaction) {
        if (destroyed) return;
        // A late composition/input event from a previous tab must never reach
        // the new tab's onChange callback before its state is installed.
        if (shownTab.current !== context().tab.id) return;
        const currentEntry = entry();
        if (!currentEntry) return;
        const next = view.state.apply(transaction);
        if (transaction.docChanged) {
          try {
            currentEntry.source = currentEntry.session.serialize(next.doc);
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
            return;
          }
        }
        currentEntry.state = next;
        view.updateState(next);
        if (transaction.docChanged) {
          setError("");
          context().onChange(currentEntry.source);
          for (const atom of atoms.current) if (atom.dependsOnDocument) atom.refresh();
        }
        publishState(view);
      },
      handleDOMEvents: {
        compositionend: () => { window.setTimeout(() => syncRef.current(), 0); return false; },
        click: (_view, event) => {
          const anchor = event.target instanceof Element ? event.target.closest("a") : null;
          if (!anchor) return false;
          event.preventDefault();
          if (event.ctrlKey || event.metaKey) followLink(anchor.getAttribute("href") ?? "");
          return true;
        }
      },
      handlePaste(_view, event) {
        // Paste as text/Markdown, never run or import untrusted pasted HTML.
        const source = event.clipboardData?.getData("text/plain");
        if (!source) return false;
        event.preventDefault();
        if (/\n/.test(source)) {
          const parsed = parseImmersiveMarkdown(source);
          _view.dispatch(_view.state.tr.replaceSelection(parsed.doc.slice(0)).scrollIntoView());
        } else _view.dispatch(_view.state.tr.insertText(source).scrollIntoView());
        return true;
      }
    });
    viewRef.current = view;
    syncRef.current = () => {
      if (destroyed) return;
      // An echo of our own source must not refresh the view between native
      // caret movement and the browser's pending selectionchange event.
      if (view.dom.getAttribute("contenteditable") !== String(context().active !== false) || view.dom.getAttribute("aria-label") !== labels[context().locale].editor) {
        view.setProps({ editable: () => context().active !== false, attributes: { class: "markdownBody immersiveDocument", role: "textbox", "aria-multiline": "true", "aria-label": labels[context().locale].editor } });
      }
      const tab = context().tab;
      if (context().active === false) {
        documentRender.clear();
        for (const atom of atoms.current) atom.pause();
        return;
      }
      if (view.composing && shownTab.current === tab.id) return;
      const previousId = shownTab.current;
      if (previousId) {
        const previous = documents.current.get(previousId);
        if (previous) previous.scroll = shell.current?.scrollTop ?? 0;
      }
      let nextEntry = documents.current.get(tab.id);
      if (!nextEntry || nextEntry.source !== tab.content) {
        documentRender.clear();
        const oldAnchor = nextEntry?.state.selection.anchor ?? 1;
        nextEntry = createEntry(tab.content);
        nextEntry.state = nextEntry.state.apply(nextEntry.state.tr.setSelection(TextSelection.near(nextEntry.state.doc.resolve(Math.min(oldAnchor, nextEntry.state.doc.content.size)))));
        documents.current.set(tab.id, nextEntry);
      }
      shownTab.current = tab.id;
      if (previousId !== tab.id) documentRender.clear();
      if (view.state !== nextEntry.state) view.updateState(nextEntry.state);
      if (previousId !== tab.id) {
        setForm(undefined);
        setError("");
        lastSummary.current = "";
        if (shell.current) shell.current.scrollTop = nextEntry.scroll;
      }
      while (documents.current.size > 24) {
        const first = documents.current.keys().next().value as string;
        if (first === tab.id) break;
        documents.current.delete(first);
      }
      publishState(view);
    };
    executeRef.current = (action) => {
      if (context().active === false || view.composing) return;
      const name = action.replace(/^md-/, "");
      const dispatch = view.dispatch.bind(view);
      const run = (command: Command) => command(view.state, dispatch, view);
      switch (name) {
        case "bold": run(toggleMark(schema.marks.strong)); break;
        case "italic": run(toggleMark(schema.marks.em)); break;
        case "strike": run(toggleMark(schema.marks.strike)); break;
        case "inline-code": run(toggleMark(schema.marks.code)); break;
        case "heading": run(setBlockType(ancestor(view.state, "heading")?.node.attrs.level === 1 ? schema.nodes.paragraph : schema.nodes.heading, { level: 1 })); break;
        case "quote": run(ancestor(view.state, "blockquote") ? lift : wrapIn(schema.nodes.blockquote)); break;
        case "list": case "ordered": case "task": toggleList(view, name); break;
        case "code": run(setBlockType(ancestor(view.state, "code_block") ? schema.nodes.paragraph : schema.nodes.code_block, { language: "text" })); break;
        case "hr": insertNode(view, schema.nodes.horizontal_rule.create()); break;
        case "table": insertNode(view, createTable()); break;
        case "undo": run(undo); break;
        case "redo": run(redo); break;
        case "upload": open("image"); return;
        case "link": case "audio": open("link"); return;
        case "math": open("math"); return;
        case "mermaid": open("mermaid"); return;
        case "footnote": open("footnote"); return;
        case "emoji": open("emoji"); return;
      }
      view.focus();
      publishState(view);
    };
    publishState(view);
    return () => {
      destroyed = true;
      documentRender.clear();
      view.destroy();
      viewRef.current = undefined;
      documents.current.clear();
      atoms.current.clear();
    };
  }, []);

  useEffect(() => { syncRef.current(); }, [props.tab.id, props.tab.content, props.active]);
  useEffect(() => {
    const command = props.positionNavigation;
    if (!command || props.active === false || command.tabId !== props.tab.id || lastPositionNavigation.current === command.id) return;
    syncRef.current();
    const view = viewRef.current;
    if (!view || shownTab.current !== command.tabId) return;
    lastPositionNavigation.current = command.id;
    const position = immersivePositionAtSource(props.tab.content, view.state.doc, command);
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(position))).setMeta("addToHistory", false));
    const selection = view.state.selection;
    const document = view.state.doc;
    const expires = performance.now() + 10_000;
    let frame = 0;
    let cancelled = false;
    const reveal = () => {
      if (cancelled || performance.now() > expires || current.current.active === false || current.current.tab.id !== command.tabId || view.state.doc !== document || !view.state.selection.eq(selection)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (cancelled || current.current.active === false || current.current.tab.id !== command.tabId) return;
        const container = shell.current;
        if (!container) return;
        const coordinates = view.coordsAtPos(selection.head);
        container.scrollTop += coordinates.top - container.getBoundingClientRect().top - container.clientHeight / 2;
      });
    };
    const cancel = () => { cancelled = true; cancelAnimationFrame(frame); };
    positionReveal.current = reveal;
    const container = shell.current;
    for (const event of ["pointerdown", "keydown", "wheel", "touchstart"]) container?.addEventListener(event, cancel, { passive: true });
    view.focus();
    reveal();
    return () => {
      cancel();
      positionReveal.current = undefined;
      for (const event of ["pointerdown", "keydown", "wheel", "touchstart"]) container?.removeEventListener(event, cancel);
    };
  }, [props.positionNavigation, props.active, props.tab.id]);
  useEffect(() => {
    if (props.active === false) return;
    syncRef.current();
    for (const node of atoms.current) node.refresh();
  }, [props.locale, props.resourceVersion, props.active, props.tab.id, props.tab.path, props.tab.relativePath, props.tab.workspaceRoot]);
  useEffect(() => {
    if (!props.command) return;
    if (props.active === false) { lastCommand.current = props.command.id; return; }
    if (lastCommand.current === props.command.id) return;
    lastCommand.current = props.command.id;
    executeRef.current(props.command.action);
  }, [props.command, props.active]);
  useEffect(() => {
    if (props.active === false && props.navigation) { lastNavigation.current = props.navigation.id; return; }
    if (!props.navigation || props.active === false || props.navigation.tabId !== props.tab.id || lastNavigation.current === props.navigation.id) return;
    const view = viewRef.current;
    const node = Array.from(view?.dom.querySelectorAll<HTMLElement>("[id]") ?? []).find((element) => element.id === props.navigation!.outlineId);
    if (node) { node.scrollIntoView({ block: "center" }); lastNavigation.current = props.navigation.id; }
  }, [props.navigation, props.active, props.tab.id, props.tab.content]);
  useEffect(() => { if (form) shell.current?.querySelector<HTMLElement>(".immersiveInsertForm input, .immersiveInsertForm textarea")?.focus(); }, [form?.kind, form?.position]);

  function submitForm(event: React.FormEvent) {
    event.preventDefault();
    const view = viewRef.current;
    if (!form || !view || props.active === false || form.tabId !== props.tab.id) return;
    try {
      if (view.state.doc !== form.doc) throw new Error(props.locale === "zh" ? "内容已变化，请重新选择。" : "Content changed. Select it again.");
      let transaction = view.state.tr.setSelection(form.bookmark.resolve(view.state.doc));
      const position = form.position;
      const existing = position != null ? view.state.doc.nodeAt(position) : undefined;
      if (form.node && (!existing || !existing.eq(form.node))) throw new Error(props.locale === "zh" ? "内容已变化，请重新选择。" : "Content changed. Select it again.");
      if (form.kind === "link") {
        if (!isSafeImmersiveLink(form.href) || /^file:/i.test(form.href.replace(/[\u0000-\u0020]/g, ""))) throw new Error(props.locale === "zh" ? "不支持此链接地址。" : "This link address is not supported.");
        if (form.href.trim()) {
          const mark = schema.marks.link.create({ href: form.href.trim() });
          if (transaction.selection.empty) transaction = transaction.replaceSelectionWith(schema.text(form.label || form.href, [mark]), false);
          else transaction = transaction.addMark(transaction.selection.from, transaction.selection.to, mark);
        } else transaction = transaction.removeMark(transaction.selection.from, transaction.selection.to, schema.marks.link);
      } else if (form.kind === "emoji") transaction = transaction.insertText(form.source);
      else {
        let node: ProseMirrorNode;
        if (form.kind === "image") {
          if (!form.href.trim()) return;
          node = schema.nodes.image.create({ ...(existing?.attrs ?? {}), src: form.href.trim(), alt: form.label, title: existing?.attrs.title ?? null });
        } else if (form.kind === "math") node = existing?.type.name === "inline_math"
          ? schema.nodes.inline_math.create({ ...existing.attrs, source: form.source })
          : schema.nodes.math_block.create({ ...(existing?.attrs ?? {}), delimiter: existing?.attrs.delimiter ?? "$$" }, form.source ? schema.text(form.source) : undefined);
        else if (form.kind === "mermaid") node = schema.nodes.mermaid_block.create(existing?.attrs, form.source ? schema.text(form.source) : undefined);
        else if (form.kind === "footnote") {
          if (!/^[^\s\[\]]+$/.test(form.label.trim())) throw new Error(props.locale === "zh" ? "脚注标识不能包含空格或方括号。" : "Footnote labels cannot contain spaces or square brackets.");
          node = schema.nodes.footnote_ref.create({ ...(existing?.attrs ?? {}), label: form.label.trim(), source: `[^${form.label.trim()}]` });
        }
        else node = existing!.type.create({ ...existing!.attrs, source: form.source });
        transaction = position != null ? transaction.replaceWith(position, position + existing!.nodeSize, node) : transaction.replaceSelectionWith(node);
        if (form.kind === "footnote" && position == null) {
          const body = (form.source || (props.locale === "zh" ? "脚注内容" : "Footnote text")).replace(/\r\n?/g, "\n").replace(/\n/g, "\n    ");
          const definition = schema.nodes.raw_block.create({ source: `[^${form.label.trim()}]: ${body}`, kind: "definitions" });
          transaction = transaction.insert(transaction.doc.content.size, definition);
        }
      }
      view.dispatch(transaction.scrollIntoView());
      setForm(undefined);
      setError("");
      view.focus();
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }

  return <section ref={shell} className="immersiveEditorShell" aria-hidden={props.active === false || undefined}>
    {form && form.tabId === props.tab.id && props.active !== false ? <form className="immersiveInsertForm" aria-label={`${words.edit} ${words[form.kind]}`} onSubmit={submitForm} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); setForm(undefined); viewRef.current?.focus(); }
    }}>
      <strong>{`${form.position == null ? words.insert : words.edit} ${words[form.kind]}`}</strong>
      {["link", "image"].includes(form.kind) ? <>
        <label>{`${words[form.kind]}${props.locale === "en" ? " " : ""}${words.address}`}<input value={form.href} onChange={(event) => setForm({ ...form, href: event.target.value })} required={form.kind === "image"} /></label>
        <label>{words.label}<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label>
      </> : <>
        {form.kind === "footnote" ? <label>{props.locale === "zh" ? "脚注标识" : "Footnote label"}<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} required /></label> : null}
        <label>{`${words[form.kind]}${props.locale === "en" ? " " : ""}${words.source}`}<textarea value={form.source} rows={form.kind === "emoji" ? 1 : 4} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label>
      </>}
      <div className="immersiveFormActions"><button type="submit">{words.apply}</button><button type="button" onClick={() => { setForm(undefined); viewRef.current?.focus(); }}>{words.cancel}</button></div>
    </form> : null}
    {error ? <p role="alert" className="immersiveError">{error}</p> : null}
    {inTable && props.active !== false ? <div className="immersiveTableTools" aria-label={words.table}>
      {[[words.row, addRowAfter], [words.column, addColumnAfter], [words.deleteRow, deleteRow], [words.deleteColumn, deleteColumn], [words.deleteTable, deleteTable]].map(([label, command]) => <button key={String(label)} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
        const view = viewRef.current;
        if (view) { (command as Command)(view.state, view.dispatch, view); view.focus(); }
      }}>{String(label)}</button>)}
    </div> : null}
    <div ref={mount} className="immersiveEditorMount" />
  </section>;
});

function ancestor(state: EditorState, name: string): { node: ProseMirrorNode; pos: number } | undefined {
  for (let depth = state.selection.$from.depth; depth > 0; depth--) {
    const node = state.selection.$from.node(depth);
    if (node.type.name === name) return { node, pos: state.selection.$from.before(depth) };
  }
}

function markActive(state: EditorState, name: string): boolean {
  const type = schema.marks[name];
  return Boolean(type && (state.selection.empty ? type.isInSet(state.storedMarks ?? state.selection.$from.marks()) : state.doc.rangeHasMark(state.selection.from, state.selection.to, type)));
}

function insertNode(view: EditorView, node: ProseMirrorNode) {
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
}

function toggleList(view: EditorView, kind: string) {
  const list = ancestor(view.state, "bullet_list") ?? ancestor(view.state, "ordered_list");
  const type = kind === "ordered" ? schema.nodes.ordered_list : schema.nodes.bullet_list;
  const item = ancestor(view.state, "list_item");
  if (list?.node.type === type && (kind === "task" ? item?.node.attrs.checked != null : item?.node.attrs.checked == null)) {
    liftListItem(schema.nodes.list_item)(view.state, view.dispatch);
    return;
  }
  if (list) view.dispatch(view.state.tr.setNodeMarkup(list.pos, type, { ...list.node.attrs, order: 1 }));
  else if (!wrapInList(type)(view.state, view.dispatch)) return;
  let transaction = view.state.tr;
  view.state.doc.nodesBetween(view.state.selection.from, view.state.selection.to, (node, position) => {
    if (node.type === schema.nodes.list_item) transaction = transaction.setNodeMarkup(position, undefined, { ...node.attrs, checked: kind === "task" ? false : null });
  });
  if (transaction.docChanged) view.dispatch(transaction);
}

const continueList: Command = (state, dispatch) => splitListItem(schema.nodes.list_item)(state, dispatch ? (transaction) => {
  const selected = transaction.selection.$from;
  for (let depth = selected.depth; depth > 0; depth--) {
    const node = selected.node(depth);
    if (node.type === schema.nodes.list_item && node.attrs.checked != null) {
      transaction.setNodeMarkup(selected.before(depth), undefined, { ...node.attrs, checked: false });
      break;
    }
  }
  dispatch(transaction);
} : undefined);

const fenceOnEnter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const match = $from.parent.type === schema.nodes.paragraph && $from.parent.textContent.match(/^```([a-z\d_+-]*)$/i);
  if (!empty || !match || $from.parentOffset !== $from.parent.content.size) return false;
  if (dispatch) dispatch(state.tr.delete($from.start(), $from.end()).setBlockType($from.before(), $from.before(), schema.nodes.code_block, { language: match[1] || "text" }).scrollIntoView());
  return true;
};

function createTable(): ProseMirrorNode {
  const row = (header: boolean) => schema.nodes.table_row.create(null, Array.from({ length: 2 }, () => (header ? schema.nodes.table_header : schema.nodes.table_cell).createAndFill()!));
  return schema.nodes.table.create(null, [row(true), row(false)]);
}

function headingDecorations(source: () => string): Plugin {
  let lastDoc: ProseMirrorNode | undefined;
  let cached = DecorationSet.empty;
  return new Plugin({ props: { decorations(state) {
    if (state.doc === lastDoc) return cached;
    lastDoc = state.doc;
    const headings = extractMarkdownHeadings(source());
    const decorations: Decoration[] = [];
    let index = 0;
    state.doc.descendants((node, position) => {
      if (node.type.name === "heading") {
        const heading = headings[index++];
        if (heading) decorations.push(Decoration.node(position, position + node.nodeSize, { id: heading.id, "data-outline-id": heading.id }));
      }
    });
    cached = DecorationSet.create(state.doc, decorations);
    return cached;
  } } });
}

function syntaxDecorations(context: () => ImmersiveEditorProps): Plugin<DecorationSet> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const plugin: Plugin<DecorationSet> = new Plugin<DecorationSet>({
    state: { init: () => DecorationSet.empty, apply: (transaction, previous) => transaction.getMeta("immersiveSyntax") ?? previous.map(transaction.mapping, transaction.doc) },
    props: { decorations: (state) => plugin.getState(state) },
    view(view) {
      const refresh = () => {
        if (timer) clearTimeout(timer);
        controller?.abort();
        if (context().active === false) return;
        const blocks: { node: ProseMirrorNode; position: number }[] = [];
        view.state.doc.descendants((node, position) => { if (node.type.name === "code_block") blocks.push({ node, position }); });
        if (!blocks.length && !plugin.getState(view.state)?.find().length) return;
        const current = new AbortController();
        controller = current;
        timer = setTimeout(async () => {
          const doc = view.state.doc;
          const decorations: Decoration[] = [];
          try {
            for (const { node, position } of blocks) {
              const language = String(node.attrs.language || "text").replace(/[^a-z\d_+-]/gi, "");
              const fence = "`".repeat(Math.max(3, ...Array.from(node.textContent.matchAll(/`+/g), (match) => match[0].length + 1)));
              const rendered = await renderMarkdownDocument(`${fence}${language}\n${node.textContent}\n${fence}`, { signal: current.signal });
              if (current.signal.aborted || view.state.doc !== doc) return;
              const root = document.createElement("div");
              root.innerHTML = rendered.html;
              const code = root.querySelector("pre > code");
              if (!code) continue;
              for (const token of code.querySelectorAll("span[class]")) {
                const range = document.createRange();
                range.setStart(code, 0);
                range.setEndBefore(token);
                const from = position + 1 + range.toString().length;
                const to = from + (token.textContent?.length ?? 0);
                if (to > from && to <= position + node.nodeSize - 1) decorations.push(Decoration.inline(from, to, { class: token.className }));
              }
            }
            if (!current.signal.aborted && view.state.doc === doc && nativeSelectionIsCurrent(view)) view.dispatch(view.state.tr.setMeta("immersiveSyntax", DecorationSet.create(doc, decorations)).setMeta("addToHistory", false));
          } catch { /* Source remains editable if syntax highlighting fails. */ }
        }, 120);
      };
      refresh();
      return { update: (next, previous) => { if (next.state.doc !== previous.doc) refresh(); }, destroy: () => { if (timer) clearTimeout(timer); controller?.abort(); } };
    }
  });
  return plugin;
}

function nativeSelectionIsCurrent(view: EditorView): boolean {
  if (view.composing) return false;
  if (!view.hasFocus()) return true;
  const selection = view.dom.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode) return true;
  try {
    return view.posAtDOM(selection.anchorNode, selection.anchorOffset) === view.state.selection.anchor &&
      view.posAtDOM(selection.focusNode, selection.focusOffset) === view.state.selection.head;
  } catch { return false; }
}

// Commit Home/End movement immediately. Otherwise the view's recent-focus
// recovery can mistake a fast native Home for a browser caret reset before
// selectionchange reaches the document state (for example Home → Shift+End).
function moveLineBoundary(side: -1 | 1, extend: boolean): Command {
  return (state, dispatch, view) => {
    if (!(state.selection instanceof TextSelection) || !view) return false;
    let anchor = extend ? state.selection.anchor : side < 0 ? state.selection.$head.start() : state.selection.$head.end();
    let head = side < 0 ? state.selection.$head.start() : state.selection.$head.end();
    const native = view.dom.ownerDocument.getSelection();
    if (native && typeof native.modify === "function") {
      try {
        native.modify(extend ? "extend" : "move", side < 0 ? "backward" : "forward", "lineboundary");
        if (native.anchorNode && native.focusNode) {
          anchor = view.posAtDOM(native.anchorNode, native.anchorOffset);
          head = view.posAtDOM(native.focusNode, native.focusOffset);
        }
      } catch { /* Use textblock boundaries on browsers without a mapped DOM range. */ }
    }
    if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, anchor, head)).scrollIntoView());
    return true;
  };
}

function moveDocumentBoundary(side: -1 | 1, extend: boolean): Command {
  return (state, dispatch) => {
    const target = TextSelection.findFrom(state.doc.resolve(side < 0 ? 0 : state.doc.content.size), side < 0 ? 1 : -1, true);
    if (!target) return false;
    const boundary = target.head;
    if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, extend ? state.selection.anchor : boundary, boundary)).scrollIntoView());
    return true;
  };
}

/** One complete document render shared by all reference/definition node views. */
class SharedDocumentRender {
  private cached?: { key: string; source: string; controller: AbortController; promise: ReturnType<typeof renderMarkdownDocument> };
  constructor(private context: () => ImmersiveEditorProps, private source: () => string) {}
  render() {
    const props = this.context();
    const source = this.source();
    const key = JSON.stringify([props.tab.id, props.tab.path, props.tab.relativePath, props.tab.workspaceRoot, props.locale, props.resourceVersion]);
    if (this.cached?.key === key && this.cached.source === source) return this.cached.promise;
    this.clear();
    const controller = new AbortController();
    const promise = renderMarkdownDocument(source, {
      signal: controller.signal,
      errorLabel: props.locale === "zh" ? "图表渲染失败" : "Unable to render diagram",
      resolveImage: (src) => resolveMarkdownImage(src, { sourcePath: props.tab.path, relativePath: props.tab.relativePath, workspaceRoot: props.tab.workspaceRoot })
    });
    this.cached = { key, source, controller, promise };
    return promise;
  }
  clear() { this.cached?.controller.abort(); this.cached = undefined; }
}

function footnoteLabels(source: unknown): Set<string> {
  return new Set(Array.from(String(source ?? "").matchAll(/^ {0,3}\[\^([^\]\s]+)\]:/gm), (match) => match[1]));
}

class RichNodeView implements NodeView {
  dom: HTMLElement;
  private preview: HTMLElement;
  private button: HTMLButtonElement;
  private controller?: AbortController;
  private disposed = false;
  constructor(private node: ProseMirrorNode, private view: EditorView, private getPos: () => number | undefined, private context: () => ImmersiveEditorProps, private source: () => string, private documentRender: SharedDocumentRender, private open: (kind: FormKind, node?: ProseMirrorNode, position?: number) => void, private remove: () => void, private onRender: () => void) {
    this.dom = document.createElement(node.isBlock ? "div" : "span");
    this.dom.className = `immersiveNodeView immersiveNode-${node.type.name}`;
    this.dom.contentEditable = "false";
    this.preview = document.createElement(node.isBlock ? "div" : "span");
    this.preview.className = "immersiveNodePreview";
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "immersiveNodeEdit";
    this.button.addEventListener("click", (event) => { event.preventDefault(); this.edit(); });
    this.dom.addEventListener("dblclick", (event) => { event.preventDefault(); this.edit(); });
    this.dom.append(this.preview, this.button);
    void this.refresh();
  }
  get dependsOnDocument() { return this.node.type.name === "footnote_ref" || (this.node.type.name === "raw_block" && this.node.attrs.kind === "definitions"); }
  private kind(): FormKind { return this.node.type.name === "image" ? "image" : this.node.type.name.includes("math") ? "math" : this.node.type.name === "mermaid_block" ? "mermaid" : this.node.type.name === "footnote_ref" ? "footnote" : "raw"; }
  private edit() { if (!this.disposed && this.context().active !== false) this.open(this.kind(), this.node, this.getPos()); }
  async refresh() {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const props = this.context();
    const words = labels[props.locale];
    this.button.textContent = `${words.edit} ${words[this.kind()]}`;
    this.button.setAttribute("aria-label", `${words.edit} ${words[this.kind()]}`);
    const node = this.node;
    const documentSource = this.source();
    let source = node.attrs.source ?? node.textContent;
    if (node.type.name === "image") source = `<img src="${escapeAttribute(String(node.attrs.src ?? ""))}" alt="${escapeAttribute(String(node.attrs.alt ?? ""))}">`;
    else if (node.type.name === "inline_math") source = `${node.attrs.delimiter === "\\(" ? "\\(" : "$"}${source}${node.attrs.delimiter === "\\(" ? "\\)" : "$"}`;
    else if (node.type.name === "math_block") source = `$$\n${node.textContent}\n$$`;
    else if (node.type.name === "mermaid_block") source = `\`\`\`mermaid\n${node.textContent}\n\`\`\``;
    else if (this.dependsOnDocument) source = documentSource;
    try {
      const rendered = await (this.dependsOnDocument ? this.documentRender.render() : renderMarkdownDocument(source, {
        signal: controller.signal,
        errorLabel: props.locale === "zh" ? "图表渲染失败" : "Unable to render diagram",
        resolveImage: (src) => resolveMarkdownImage(src, { sourcePath: props.tab.path, relativePath: props.tab.relativePath, workspaceRoot: props.tab.workspaceRoot })
      }));
      if (controller.signal.aborted || this.disposed || this.context().tab.id !== props.tab.id || (this.dependsOnDocument && documentSource !== this.source())) return;
      this.dom.classList.remove("immersiveNodeError");
      const root = document.createElement("div");
      root.innerHTML = rendered.html;
      if (node.type.name === "image") this.preview.innerHTML = root.querySelector("img")?.outerHTML ?? "";
      else if (node.type.name === "footnote_ref") {
        const position = this.getPos() ?? 0;
        let previous = 0;
        this.view.state.doc.nodesBetween(0, position, (candidate) => { if (candidate.type.name === "footnote_ref" && candidate.attrs.label === node.attrs.label) previous++; });
        const ref = extractMarkdownAnchors(documentSource).filter((anchor) => anchor.kind === "footnote-ref" && anchor.text === `[^${node.attrs.label}]`)[previous];
        const target = Array.from(root.querySelectorAll<HTMLElement>("[id]")).find((element) => element.id === ref?.id);
        this.preview.innerHTML = target?.outerHTML ?? "";
        if (!target) this.preview.textContent = node.attrs.source || `[^${node.attrs.label}]`;
        if (String(node.attrs.source).startsWith("^[") && ref) {
          const body = Array.from(root.querySelectorAll<HTMLElement>(".footnote-item")).find((item) => item.id === target?.getAttribute("href")?.slice(1));
          if (body) {
            const content = document.createElement("span");
            content.className = "immersiveInlineFootnoteBody footnotes";
            content.hidden = true;
            const list = document.createElement("ol");
            list.className = "footnotes-list";
            body.setAttribute("value", String(Array.from(root.querySelectorAll(".footnote-item")).indexOf(body) + 1));
            list.append(body);
            const collapse = document.createElement("button");
            collapse.type = "button";
            collapse.className = "immersiveNodeEdit";
            collapse.textContent = props.locale === "zh" ? "收起脚注" : "Collapse footnote";
            collapse.addEventListener("click", () => { content.hidden = true; });
            content.append(list, collapse);
            this.preview.append(content);
          }
        }
      } else if (node.type.name === "raw_block" && node.attrs.kind === "definitions") {
        // markdown-it uses the last definition for duplicate labels. Render each
        // generated item only at the raw block that owns that definition.
        const owners = new Map<string, number>();
        this.view.state.doc.descendants((candidate, position) => {
          if (candidate.type.name === "raw_block" && candidate.attrs.kind === "definitions") {
            for (const label of footnoteLabels(candidate.attrs.source)) owners.set(label, position);
          }
        });
        const labels = footnoteLabels(node.attrs.source);
        const anchors = extractMarkdownAnchors(documentSource).filter((anchor) => anchor.kind === "footnote" && labels.has(anchor.text.slice(2, -1)) && owners.get(anchor.text.slice(2, -1)) === this.getPos());
        const ids = new Set(anchors.map((anchor) => anchor.id));
        const section = root.querySelector<HTMLElement>(".footnotes");
        section?.querySelectorAll<HTMLElement>(".footnote-item").forEach((item, index) => {
          if (!ids.has(item.id)) item.remove();
          else item.setAttribute("value", String(index + 1));
        });
        this.preview.innerHTML = section?.querySelector(".footnote-item") ? section.outerHTML : "";
      }
      else this.preview.innerHTML = node.isInline && root.firstElementChild?.tagName === "P" ? root.firstElementChild.innerHTML : rendered.html;
      if (!this.preview.textContent?.trim() && !this.preview.querySelector("img, svg, .katex")) {
        const fallback = document.createElement("pre");
        fallback.textContent = node.attrs.source ?? node.textContent;
        this.preview.replaceChildren(fallback);
      }
      this.dom.title = rendered.warnings.join("; ");
    } catch (failure) {
      if (!controller.signal.aborted && !this.disposed) { this.preview.textContent = `${words.failed}: ${failure instanceof Error ? failure.message : String(failure)}`; this.dom.classList.add("immersiveNodeError"); }
    }
    if (!controller.signal.aborted && !this.disposed) this.onRender();
  }
  update(node: ProseMirrorNode) { if (node.type !== this.node.type) return false; if (!node.eq(this.node)) { this.node = node; void this.refresh(); } return true; }
  pause() { this.controller?.abort(); }
  selectNode() { this.dom.classList.add("ProseMirror-selectednode"); }
  deselectNode() { this.dom.classList.remove("ProseMirror-selectednode"); }
  stopEvent(event: Event) { return event.target instanceof Element && Boolean(event.target.closest("button")); }
  ignoreMutation() { return true; }
  destroy() { this.disposed = true; this.controller?.abort(); this.remove(); }
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

class TaskItemView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private checkbox: HTMLInputElement;
  constructor(private node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined, context: () => ImmersiveEditorProps) {
    this.dom = document.createElement("li");
    this.checkbox = document.createElement("input");
    this.checkbox.type = "checkbox";
    this.checkbox.contentEditable = "false";
    this.checkbox.setAttribute("aria-label", "Task / 任务");
    this.checkbox.addEventListener("change", () => {
      if (context().active === false) { this.checkbox.checked = Boolean(this.node.attrs.checked); return; }
      const position = getPos();
      if (position != null) view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...this.node.attrs, checked: this.checkbox.checked }));
    });
    this.contentDOM = document.createElement("div");
    this.dom.append(this.checkbox, this.contentDOM);
    this.update(node);
  }
  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.checkbox.hidden = node.attrs.checked == null;
    this.checkbox.checked = Boolean(node.attrs.checked);
    this.dom.classList.toggle("immersiveTaskItem", node.attrs.checked != null);
    return true;
  }
  stopEvent(event: Event) { return event.target === this.checkbox; }
  ignoreMutation(mutation: { type: string; target: Node }) { return mutation.target === this.checkbox || (mutation.type === "attributes" && mutation.target === this.dom); }
}
