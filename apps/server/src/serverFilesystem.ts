import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  ServerFilesystemBreadcrumb,
  ServerFilesystemEntry,
  ServerFilesystemShortcut,
  ServerListDirectoryInput,
  ServerListDirectoryResult,
} from "@t3tools/contracts";

const DEFAULT_DIRECTORY_LIMIT = 200;
const MAX_DIRECTORY_LIMIT = 1_000;
const WINDOWS_ROOT_CACHE_TTL_MS = 15_000;

let cachedWindowsRoots: { scannedAt: number; roots: string[] } | null = null;

function expandHomePath(input: string): string {
  if (input === "~") {
    return os.homedir();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}

function resolveRequestedPath(
  requestedPath: ServerListDirectoryInput["path"],
  serverCwd: string,
): string {
  const basePath = requestedPath?.trim() ? requestedPath : serverCwd;
  return path.resolve(expandHomePath(basePath));
}

function resolveParentPath(currentPath: string): string | null {
  const parentPath = path.dirname(currentPath);
  return parentPath === currentPath ? null : parentPath;
}

function rootLabelFor(rootPath: string): string {
  if (process.platform !== "win32") {
    return rootPath;
  }
  return rootPath.replace(/[\\/]+$/, "");
}

function buildBreadcrumbs(currentPath: string): ServerFilesystemBreadcrumb[] {
  const resolvedPath = path.resolve(currentPath);
  const parsed = path.parse(resolvedPath);
  const segments = resolvedPath.slice(parsed.root.length).split(path.sep).filter(Boolean);

  const breadcrumbs: ServerFilesystemBreadcrumb[] = [
    {
      label: rootLabelFor(parsed.root),
      path: parsed.root,
    },
  ];

  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    breadcrumbs.push({
      label: segment,
      path: current,
    });
  }

  return breadcrumbs;
}

async function resolveWindowsRoots(): Promise<string[]> {
  if (process.platform !== "win32") {
    return [path.parse(path.resolve("/")).root];
  }

  if (
    cachedWindowsRoots &&
    Date.now() - cachedWindowsRoots.scannedAt < WINDOWS_ROOT_CACHE_TTL_MS
  ) {
    return cachedWindowsRoots.roots;
  }

  const driveChecks = Array.from({ length: 26 }, (_, index) =>
    String.fromCharCode(65 + index),
  ).map(async (driveLetter) => {
    const driveRoot = `${driveLetter}:\\`;
    try {
      const stat = await fs.stat(driveRoot);
      return stat.isDirectory() ? driveRoot : null;
    } catch {
      return null;
    }
  });

  const roots = (await Promise.all(driveChecks)).filter((entry): entry is string => entry !== null);
  cachedWindowsRoots = { scannedAt: Date.now(), roots };
  return roots;
}

async function resolveRootShortcuts(): Promise<ServerFilesystemShortcut[]> {
  const roots = await resolveWindowsRoots();
  return roots.map((rootPath) => ({
    kind: "root" as const,
    label: rootLabelFor(rootPath),
    path: rootPath,
  }));
}

async function toFilesystemEntry(
  directoryPath: string,
  dirent: Dirent,
): Promise<ServerFilesystemEntry | null> {
  const entryPath = path.join(directoryPath, dirent.name);
  const isSymlink = dirent.isSymbolicLink();

  if (isSymlink) {
    try {
      const stat = await fs.stat(entryPath);
      if (stat.isDirectory()) {
        return {
          name: dirent.name,
          path: entryPath,
          kind: "directory",
          isHidden: isHiddenName(dirent.name),
          isSymlink: true,
        };
      }
      if (stat.isFile()) {
        return {
          name: dirent.name,
          path: entryPath,
          kind: "file",
          isHidden: isHiddenName(dirent.name),
          isSymlink: true,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  if (dirent.isDirectory()) {
    return {
      name: dirent.name,
      path: entryPath,
      kind: "directory",
      isHidden: isHiddenName(dirent.name),
      isSymlink: false,
    };
  }

  if (dirent.isFile()) {
    return {
      name: dirent.name,
      path: entryPath,
      kind: "file",
      isHidden: isHiddenName(dirent.name),
      isSymlink: false,
    };
  }

  return null;
}

function compareEntries(left: ServerFilesystemEntry, right: ServerFilesystemEntry): number {
  if (left.kind !== right.kind) {
    return left.kind === "directory" ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}

export function resetServerFilesystemCachesForTest(): void {
  cachedWindowsRoots = null;
}

export async function listServerDirectory(
  input: ServerListDirectoryInput,
  options: {
    serverCwd: string;
  },
): Promise<ServerListDirectoryResult> {
  const currentPath = resolveRequestedPath(input.path ?? null, options.serverCwd);
  const query = input.query?.trim().toLowerCase() ?? "";
  const includeHidden = input.includeHidden ?? false;
  const directoriesOnly = input.directoriesOnly ?? false;
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_DIRECTORY_LIMIT, 1), MAX_DIRECTORY_LIMIT);

  let currentStat;
  try {
    currentStat = await fs.stat(currentPath);
  } catch (error) {
    throw new Error(`Directory does not exist: ${currentPath}`, { cause: error });
  }

  if (!currentStat.isDirectory()) {
    throw new Error(`Path is not a directory: ${currentPath}`);
  }

  let dirents;
  try {
    dirents = await fs.readdir(currentPath, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Unable to read directory: ${currentPath}`, { cause: error });
  }

  const entries = (
    await Promise.all(dirents.map((dirent) => toFilesystemEntry(currentPath, dirent)))
  ).filter((entry): entry is ServerFilesystemEntry => entry !== null);

  const filtered = entries
    .filter((entry) => includeHidden || !entry.isHidden)
    .filter((entry) => !directoriesOnly || entry.kind === "directory")
    .filter((entry) => query.length === 0 || entry.name.toLowerCase().includes(query))
    .toSorted(compareEntries);

  const shortcuts: ServerFilesystemShortcut[] = [
    {
      kind: "serverCwd",
      label: "Server cwd",
      path: path.resolve(options.serverCwd),
    },
    {
      kind: "home",
      label: "Home",
      path: os.homedir(),
    },
    ...(await resolveRootShortcuts()),
  ];

  return {
    currentPath,
    parentPath: resolveParentPath(currentPath),
    breadcrumbs: buildBreadcrumbs(currentPath),
    shortcuts,
    entries: filtered.slice(0, limit),
    truncated: filtered.length > limit,
  };
}
