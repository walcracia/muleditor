export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

export const RECENT_FILES_LIMIT = 20;
export const RECENT_FILES_STORAGE_KEY = "muleditor.recentFiles.v1";

/** Compare Windows paths without changing the original path used to reopen. */
export function recentFileKey(path: string): string {
  const slashed = path.replace(/\\/g, "/")
    .replace(/^\/\/\?\/UNC\//i, "//")
    .replace(/^\/\/\?\/(?=[a-z]:\/)/i, "");
  if (/^[a-z]:\//i.test(slashed)) return slashed.replace(/\/+/g, "/").toLowerCase();
  if (slashed.startsWith("//")) return `//${slashed.slice(2).replace(/\/+/g, "/")}`.toLowerCase();
  return path;
}

function isAbsoluteFilePath(path: unknown): path is string {
  if (typeof path !== "string" || !path || /[\u0000-\u001f\u007f]/.test(path)) return false;
  const key = recentFileKey(path);
  if (key.endsWith("/")) return false;
  if (/^[a-z]:\//.test(key)) return !/^[a-z]:\/fakepath(?:\/|$)/.test(key);
  if (key.startsWith("//")) {
    const parts = key.slice(2).split("/");
    return parts.length >= 3 && parts.slice(0, 2).every((part) => part !== "" && ![".", "..", "?"].includes(part));
  }
  return path.startsWith("/") && path.length > 1;
}

function cleanEntries(value: unknown): RecentFile[] {
  if (!Array.isArray(value)) return [];
  const result: RecentFile[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { path, name, openedAt } = entry as Partial<RecentFile>;
    if (!isAbsoluteFilePath(path) || typeof name !== "string" || !name || /[\\/\u0000-\u001f\u007f]/.test(name) ||
      !Number.isSafeInteger(openedAt) || Number(openedAt) < 0) continue;
    const key = recentFileKey(path);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ path, name, openedAt: Number(openedAt) });
    if (result.length === RECENT_FILES_LIMIT) break;
  }
  return result;
}

export function loadRecentFiles(): RecentFile[] {
  try {
    return cleanEntries(JSON.parse(globalThis.localStorage.getItem(RECENT_FILES_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

/** Return false when persistence is blocked; callers can keep the list in memory. */
export function saveRecentFiles(entries: readonly RecentFile[]): boolean {
  try {
    globalThis.localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(cleanEntries(entries)));
    return true;
  } catch {
    return false;
  }
}

export function addRecentFiles(
  current: readonly RecentFile[],
  files: readonly { path?: string; name: string }[],
  now = Date.now()
): RecentFile[] {
  const openedAt = Number.isSafeInteger(now) && now >= 0 ? now : Date.now();
  const incoming = files.map(({ path, name }) => ({ path, name, openedAt })).reverse();
  return cleanEntries([...incoming, ...current]);
}

export function removeRecentFile(current: readonly RecentFile[], path: string): RecentFile[] {
  const key = recentFileKey(path);
  return cleanEntries(current).filter((entry) => recentFileKey(entry.path) !== key);
}
