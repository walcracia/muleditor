import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { OpenedTextFile } from "../types";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Reflect.has(window, "__TAURI_INTERNALS__");
}

export async function openTextFileFromDesktop(): Promise<OpenedTextFile | undefined> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Structured documents",
        extensions: ["md", "markdown", "html", "htm", "xml", "xsd", "dtd", "yaml", "yml", "json", "spdx"]
      }
    ]
  });

  if (!selected || Array.isArray(selected)) {
    return undefined;
  }

  return openTextFileAtPathFromDesktop(selected);
}

export async function openTextFileAtPathFromDesktop(path: string): Promise<OpenedTextFile> {
  const content = await invoke<string>("read_text_file", { path });
  return {
    path,
    name: fileNameFromPath(path),
    content
  };
}

export async function openTextFolderFromDesktop(): Promise<OpenedTextFile[]> {
  const selected = await open({
    multiple: false,
    directory: true
  });

  if (!selected || Array.isArray(selected)) {
    return [];
  }

  return invoke<OpenedTextFile[]>("read_text_folder", { path: selected });
}

export async function openStartupFilesFromDesktop(): Promise<OpenedTextFile[]> {
  return invoke<OpenedTextFile[]>("read_startup_files");
}

export async function openDroppedPathsFromDesktop(paths: string[]): Promise<OpenedTextFile[]> {
  return invoke<OpenedTextFile[]>("read_dropped_paths", { paths });
}

export async function listenDroppedPathsFromDesktop(options: {
  onActiveChange: (active: boolean) => void;
  onDrop: (paths: string[]) => void | Promise<void>;
}): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent(async (event) => {
    if (event.payload.type === "enter" || event.payload.type === "over") {
      options.onActiveChange(true);
      return;
    }

    if (event.payload.type === "leave") {
      options.onActiveChange(false);
      return;
    }

    options.onActiveChange(false);
    await options.onDrop(event.payload.paths);
  });
}

export async function saveTextFileToDesktop(path: string, content: string): Promise<void> {
  await invoke("write_text_file", { path, content });
}

export async function openHtmlPreviewInDesktop(title: string, content: string, sourcePath?: string): Promise<void> {
  await invoke("open_html_preview_window", { title, content, sourcePath });
}

export async function pickSavePath(defaultPath: string): Promise<string | undefined> {
  const selected = await save({
    defaultPath,
    filters: [
      {
        name: "Structured documents",
        extensions: ["md", "html", "xml", "xsd", "dtd", "yaml", "yml", "json", "spdx"]
      }
    ]
  });

  return selected || undefined;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || "untitled.txt";
}
