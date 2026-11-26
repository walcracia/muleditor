import type { Page } from "@playwright/test";

interface OpenedFile {
  path: string;
  name: string;
  content: string;
}

interface DesktopFixtures {
  files: Record<string, string>;
  startupFiles?: OpenedFile[];
  dialogPaths?: string[];
  savePaths?: string[];
}

/** Test-only IPC simulation following @tauri-apps/api/mocks, not a native file-system test. */
export async function mockDesktopFiles(page: Page, fixtures: DesktopFixtures) {
  const fileKey = (path: string) => path.replace(/\\/g, "/").toLowerCase();
  const files = new Map(Object.entries(fixtures.files).map(([path, content]) => [fileKey(path), content]));
  const state = {
    startupFiles: fixtures.startupFiles ?? [],
    dialogPaths: [...(fixtures.dialogPaths ?? [])],
    savePaths: [...(fixtures.savePaths ?? [])],
    reads: [] as string[],
    writes: [] as Array<{ path: string; content: string }>,
    setFile(path: string, content: string) { files.set(fileKey(path), content); }
  };
  await page.exposeFunction("testDesktopInvoke", (command: string, args: Record<string, unknown> = {}) => {
    if (command === "read_startup_files") return state.startupFiles;
    if (command === "plugin:dialog|open") return state.dialogPaths.shift() ?? null;
    if (command === "plugin:dialog|save") return state.savePaths.shift() ?? null;
    if (command === "plugin:event|listen") return args.handler;
    if (command === "plugin:event|unlisten") return null;
    if (command === "read_text_file") {
      const path = String(args.path);
      state.reads.push(path);
      const content = files.get(fileKey(path));
      if (content === undefined) throw new Error("Fixture file is missing or unavailable.");
      return content;
    }
    if (command === "write_text_file") {
      const path = String(args.path);
      const content = String(args.content);
      state.writes.push({ path, content });
      files.set(fileKey(path), content);
      return null;
    }
    throw new Error(`Unexpected desktop IPC command: ${command}`);
  });
  await page.addInitScript(() => {
    const target = window as unknown as {
      testDesktopInvoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
      __TAURI_INTERNALS__: Record<string, unknown>;
      __TAURI_EVENT_PLUGIN_INTERNALS__: Record<string, unknown>;
    };
    let callbackId = 0;
    const callbacks = new Map<number, (value: unknown) => void>();
    target.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
      invoke: (command: string, args?: Record<string, unknown>) => target.testDesktopInvoke(command, args),
      transformCallback(callback: (value: unknown) => void, once = false) {
        const id = ++callbackId;
        callbacks.set(id, (value) => { if (once) callbacks.delete(id); callback(value); });
        return id;
      },
      unregisterCallback: (id: number) => callbacks.delete(id),
      runCallback: (id: number, value: unknown) => callbacks.get(id)?.(value)
    };
    target.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_event: string, id: number) => callbacks.delete(id)
    };
  });
  return state;
}
