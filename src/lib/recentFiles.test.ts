// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  addRecentFiles, loadRecentFiles, recentFileKey, removeRecentFile, saveRecentFiles,
  RECENT_FILES_LIMIT, RECENT_FILES_STORAGE_KEY
} from "./recentFiles";

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("moves reopened files to the front, deduplicates Windows identity and bounds the list", () => {
  const files = Array.from({ length: 25 }, (_, index) => ({ path: `C:\\docs\\file-${index}.md`, name: `file-${index}.md` }));
  const recent = addRecentFiles([], files, 100);
  expect(recent).toHaveLength(RECENT_FILES_LIMIT);
  expect(recent.map((entry) => entry.name)).toEqual(files.slice(-20).reverse().map((entry) => entry.name));
  const moved = addRecentFiles(recent, [{ path: "c:/DOCS/file-10.md", name: "file-10.md" }], 200);
  expect(moved).toHaveLength(RECENT_FILES_LIMIT);
  expect(moved[0]).toEqual({ path: "c:/DOCS/file-10.md", name: "file-10.md", openedAt: 200 });
  expect(moved.filter((entry) => recentFileKey(entry.path) === "c:/docs/file-10.md")).toHaveLength(1);
  expect(recent[0].name).toBe("file-24.md");
});

it("normalizes Windows extended and UNC paths while preserving POSIX case and spelling", () => {
  expect(recentFileKey("\\\\?\\C:\\Docs\\中文.md")).toBe(recentFileKey("c:/docs/中文.md"));
  expect(recentFileKey("\\\\?\\UNC\\Server\\Share\\File.md")).toBe(recentFileKey("\\\\server\\share\\file.md"));
  expect(recentFileKey("/home/User/File.md")).not.toBe(recentFileKey("/home/User/file.md"));
  expect(recentFileKey("/home/User/a\\b.md")).toBe("/home/User/a\\b.md");
  const original = "\\\\?\\UNC\\Server\\Share\\File.md";
  expect(addRecentFiles([], [{ path: original, name: "File.md" }], 1)[0].path).toBe(original);
});

it("records only absolute file paths and excludes browser fake paths and relative names", () => {
  const paths = [
    undefined, "file.md", "./file.md", "C:file.md", "C:\\fakepath\\file.md", "https://example.com/file.md",
    "file:///C:/docs/file.md", "C:\\", "\\\\server\\share", "\\\\.\\Device\\file", "C:\\docs\\bad\u0000.md",
    "C:\\docs\\good.md", "\\\\server\\share\\good.md", "/home/user/good.md"
  ];
  expect(addRecentFiles([], paths.map((path) => ({ path, name: "good.md" })), 50).map((entry) => entry.path))
    .toEqual(paths.slice(-3).reverse());
});

it("persists metadata only, reloads MRU order and never stores document content", () => {
  const entries = addRecentFiles([], [{ path: "C:\\docs\\first.md", name: "first.md" }], 200);
  const movedBackwardsInTime = addRecentFiles(entries, [{ path: "C:\\docs\\second.md", name: "second.md" }], 100);
  const privateEntry = { ...movedBackwardsInTime[0], content: "private document", dirty: true };
  expect(saveRecentFiles([privateEntry, movedBackwardsInTime[1]])).toBe(true);
  const stored = localStorage.getItem(RECENT_FILES_STORAGE_KEY)!;
  expect(stored).not.toContain("private document");
  expect(stored).not.toContain("dirty");
  expect(Object.keys(JSON.parse(stored)[0])).toEqual(["path", "name", "openedAt"]);
  expect(loadRecentFiles()).toEqual(movedBackwardsInTime);
});

it("rejects corrupt records, invalid timestamps and non-array storage without throwing", () => {
  for (const stored of ["not json", "null", "{}", '"text"']) {
    localStorage.setItem(RECENT_FILES_STORAGE_KEY, stored);
    expect(loadRecentFiles()).toEqual([]);
  }
  const valid = { path: "C:\\docs\\valid.md", name: "valid.md", openedAt: 123 };
  const invalid = [null, "file", {}, { ...valid, openedAt: -1 }, { ...valid, openedAt: 1.5 },
    { ...valid, openedAt: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, openedAt: "123" },
    { ...valid, name: "" }, { ...valid, name: "folder/file.md" }, { ...valid, path: "relative.md" }];
  localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify([...invalid, valid, { ...valid, path: "c:/DOCS/valid.md" }]));
  expect(loadRecentFiles()).toEqual([valid]);
  expect(saveRecentFiles([{ ...valid, openedAt: Infinity }])).toBe(true);
  expect(loadRecentFiles()).toEqual([]);
});

it("keeps history operations usable when local storage is unavailable or throws", () => {
  const entry = { path: "C:\\docs\\valid.md", name: "valid.md", openedAt: 1 };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  expect(loadRecentFiles()).toEqual([]);
  expect(saveRecentFiles([entry])).toBe(false);
  expect(addRecentFiles([], [entry], 2)).toEqual([{ ...entry, openedAt: 2 }]);
  vi.restoreAllMocks();
  vi.stubGlobal("localStorage", undefined);
  expect(loadRecentFiles()).toEqual([]);
  expect(saveRecentFiles([entry])).toBe(false);
});

it("removes only the requested path and can persist an empty history", () => {
  const current = addRecentFiles([], [
    { path: "C:\\docs\\same.md", name: "same.md" }, { path: "D:\\docs\\same.md", name: "same.md" }
  ], 10);
  const removed = removeRecentFile(current, "c:/DOCS/same.md");
  expect(removed.map((entry) => entry.path)).toEqual(["D:\\docs\\same.md"]);
  expect(current).toHaveLength(2);
  expect(saveRecentFiles([])).toBe(true);
  expect(loadRecentFiles()).toEqual([]);
});
