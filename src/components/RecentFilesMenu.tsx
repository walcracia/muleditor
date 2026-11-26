import { useEffect, useRef } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { FileInput, X } from "lucide-react";
import type { Locale } from "../lib/i18n";
import { text } from "../lib/i18n";
import type { RecentFile } from "../lib/recentFiles";

interface RecentFilesMenuProps {
  locale: Locale;
  files: RecentFile[];
  available: boolean;
  storageFailed?: boolean;
  openingPath?: string;
  error?: { path: string; message: string };
  triggerRef: RefObject<HTMLButtonElement>;
  onOpen: (file: RecentFile) => Promise<boolean> | boolean;
  onRemove: (path: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function RecentFilesMenu(props: RecentFilesMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const mounted = useRef(false);
  current.current = props;
  const files = props.available ? props.files : [];
  const busy = Boolean(props.openingPath);

  function close(returnFocus = true) {
    current.current.onClose();
    if (returnFocus) current.current.triggerRef.current?.focus();
  }

  useEffect(() => {
    mounted.current = true;
    const focusFrame = window.requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
      (first ?? menuRef.current)?.focus();
    });
    const outsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !current.current.triggerRef.current?.contains(target)) close();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    document.addEventListener("pointerdown", outsidePointer);
    document.addEventListener("keydown", escape);
    return () => {
      mounted.current = false;
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", outsidePointer);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
    event.preventDefault();
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (index + 1) % items.length : index > 0 ? index - 1 : items.length - 1;
    items[next]?.focus();
  }

  async function openFile(file: RecentFile) {
    if (await props.onOpen(file) && mounted.current) close();
  }

  function preserveMenuFocus(change: () => void) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    change();
    window.requestAnimationFrame(() => {
      if (!mounted.current) return;
      const remaining = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
      (remaining?.[Math.max(0, Math.min(index, remaining.length - 1))] ?? menuRef.current)?.focus();
    });
  }

  return (
    <div ref={menuRef} id="recentFilesMenu" className="recentFilesMenu" role="menu" tabIndex={-1}
      aria-label={text(props.locale, "history.title")} onKeyDown={handleKeyDown}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && !event.currentTarget.contains(next) && next !== props.triggerRef.current) close(false);
      }}>
      <div className="recentFilesHeader" role="presentation">{text(props.locale, "history.title")}</div>
      {props.available && props.storageFailed ? <p className="recentFilesEmpty" role="status">{text(props.locale, "history.storageFailed")}</p> : null}
      {files.length ? (
        <div className="recentFilesList" role="presentation">
          {files.map((file, index) => {
            const isOpening = props.openingPath === file.path;
            const error = props.error?.path === file.path ? props.error.message : undefined;
            return (
              <div className="recentFileRow" role="presentation" key={file.path}>
                <button className="recentFileOpen" type="button" role="menuitem" tabIndex={-1} disabled={busy}
                  title={file.path} aria-label={text(props.locale, "history.open", { name: file.name, path: file.path })}
                  aria-describedby={error ? `recentFileError-${index}` : undefined} aria-busy={isOpening}
                  onClick={() => { void openFile(file); }}>
                  <FileInput size={16} aria-hidden="true" />
                  <span className="recentFileDescription">
                    <span className="recentFileName">{file.name}</span>
                    <span className="recentFilePath">{file.path}</span>
                  </span>
                  {isOpening ? <span className="recentFileOpening" role="status">{text(props.locale, "history.opening")}</span> : null}
                </button>
                <button className="recentFileRemove" type="button" role="menuitem" tabIndex={-1} disabled={busy}
                  aria-label={text(props.locale, "history.remove", { name: file.name, path: file.path })}
                  title={text(props.locale, "history.remove", { name: file.name, path: file.path })}
                  onClick={() => preserveMenuFocus(() => props.onRemove(file.path))}>
                  <X size={14} aria-hidden="true" />
                </button>
                {error ? <div id={`recentFileError-${index}`} className="recentFileError" role="alert">
                  <span>{error}</span>
                  <span>{text(props.locale, "history.recovery")}</span>
                </div> : null}
              </div>
            );
          })}
        </div>
      ) : <p className="recentFilesEmpty">{text(props.locale, props.available ? "history.empty" : "history.browserHint")}</p>}
      {props.available ? <div className="recentFilesFooter" role="presentation">
        <button type="button" role="menuitem" tabIndex={-1} disabled={!files.length || busy}
          onClick={() => preserveMenuFocus(props.onClear)}>{text(props.locale, "history.clear")}</button>
      </div> : null}
    </div>
  );
}
