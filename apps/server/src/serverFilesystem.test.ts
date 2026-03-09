import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listServerDirectory, resetServerFilesystemCachesForTest } from "./serverFilesystem";

describe("serverFilesystem", () => {
  const tempDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  function writeFile(root: string, relativePath: string, contents = ""): string {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents, "utf8");
    return absolutePath;
  }

  function makeDir(root: string, relativePath: string): string {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(absolutePath, { recursive: true });
    return absolutePath;
  }

  beforeEach(() => {
    resetServerFilesystemCachesForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to the server cwd when path is null", async () => {
    const workspace = makeTempDir("t3-server-filesystem-");
    makeDir(workspace, "src");

    const result = await listServerDirectory(
      { path: null, directoriesOnly: true },
      { serverCwd: workspace },
    );

    expect(result.currentPath).toBe(workspace);
    expect(result.entries.map((entry) => entry.name)).toEqual(["src"]);
  });

  it("expands home-relative paths", async () => {
    const fakeHome = makeTempDir("t3-server-filesystem-home-");
    makeDir(fakeHome, "repo");
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const result = await listServerDirectory(
      { path: "~/repo", directoriesOnly: true },
      { serverCwd: "/unused" },
    );

    expect(result.currentPath).toBe(path.join(fakeHome, "repo"));
  });

  it("fails when the path does not exist", async () => {
    await expect(
      listServerDirectory({ path: "/definitely/missing/path" }, { serverCwd: "/unused" }),
    ).rejects.toThrow("Directory does not exist");
  });

  it("fails when the path is a file", async () => {
    const workspace = makeTempDir("t3-server-filesystem-");
    const filePath = writeFile(workspace, "README.md", "# test\n");

    await expect(
      listServerDirectory({ path: filePath }, { serverCwd: workspace }),
    ).rejects.toThrow(`Path is not a directory: ${filePath}`);
  });

  it("hides dotfiles and dotdirectories by default", async () => {
    const workspace = makeTempDir("t3-server-filesystem-");
    writeFile(workspace, ".env", "SECRET=yes\n");
    makeDir(workspace, ".git");
    writeFile(workspace, "README.md", "# test\n");

    const result = await listServerDirectory({ path: workspace }, { serverCwd: workspace });

    expect(result.entries.map((entry) => entry.name)).toEqual(["README.md"]);
  });

  it("shows hidden entries when includeHidden is true", async () => {
    const workspace = makeTempDir("t3-server-filesystem-");
    makeDir(workspace, ".git");
    writeFile(workspace, ".env", "SECRET=yes\n");

    const result = await listServerDirectory(
      { path: workspace, includeHidden: true },
      { serverCwd: workspace },
    );

    expect(result.entries.map((entry) => entry.name)).toEqual([".git", ".env"]);
  });

  it("filters out files when directoriesOnly is true", async () => {
    const workspace = makeTempDir("t3-server-filesystem-");
    makeDir(workspace, "docs");
    writeFile(workspace, "README.md", "# test\n");

    const result = await listServerDirectory(
      { path: workspace, directoriesOnly: true },
      { serverCwd: workspace },
    );

    expect(result.entries).toEqual([
      expect.objectContaining({
        name: "docs",
        kind: "directory",
      }),
    ]);
  });

  it("sorts directories before files", async () => {
    const workspace = makeTempDir("t3-server-filesystem-");
    makeDir(workspace, "zeta");
    makeDir(workspace, "alpha");
    writeFile(workspace, "zzz.ts");
    writeFile(workspace, "aaa.ts");

    const result = await listServerDirectory(
      { path: workspace, includeHidden: true },
      { serverCwd: workspace },
    );

    expect(result.entries.map((entry) => `${entry.kind}:${entry.name}`)).toEqual([
      "directory:alpha",
      "directory:zeta",
      "file:aaa.ts",
      "file:zzz.ts",
    ]);
  });

  it("returns parentPath and breadcrumbs", async () => {
    const workspace = makeTempDir("t3-server-filesystem-");
    const nested = makeDir(workspace, path.join("apps", "web"));

    const result = await listServerDirectory({ path: nested }, { serverCwd: workspace });

    expect(result.parentPath).toBe(path.join(workspace, "apps"));
    expect(result.breadcrumbs.at(-1)).toEqual({
      label: "web",
      path: nested,
    });
  });

  it("includes server cwd, home, and root shortcuts", async () => {
    const workspace = makeTempDir("t3-server-filesystem-");
    const fakeHome = makeTempDir("t3-server-filesystem-home-");
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);

    const result = await listServerDirectory({ path: workspace }, { serverCwd: workspace });

    expect(result.shortcuts).toEqual(
      expect.arrayContaining([
        { kind: "serverCwd", label: "Server cwd", path: workspace },
        { kind: "home", label: "Home", path: fakeHome },
        expect.objectContaining({ kind: "root" }),
      ]),
    );
  });

  it("treats directory symlinks as directories and omits broken symlinks", async () => {
    const workspace = makeTempDir("t3-server-filesystem-");
    const linkedDir = makeDir(workspace, "actual-dir");
    fs.symlinkSync(linkedDir, path.join(workspace, "dir-link"), "dir");
    fs.symlinkSync(path.join(workspace, "missing-target"), path.join(workspace, "broken-link"));

    const result = await listServerDirectory(
      { path: workspace, includeHidden: true },
      { serverCwd: workspace },
    );

    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "dir-link",
          kind: "directory",
          isSymlink: true,
        }),
      ]),
    );
    expect(result.entries.some((entry) => entry.name === "broken-link")).toBe(false);
  });

  it("marks truncated when more entries exist than the requested limit", async () => {
    const workspace = makeTempDir("t3-server-filesystem-");
    makeDir(workspace, "alpha");
    makeDir(workspace, "beta");
    makeDir(workspace, "gamma");

    const result = await listServerDirectory(
      { path: workspace, directoriesOnly: true, limit: 2 },
      { serverCwd: workspace },
    );

    expect(result.entries).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});
