import "../index.css";

import type { NativeApi, ServerListDirectoryInput, ServerListDirectoryResult } from "@t3tools/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ServerFilesystemPickerDialog } from "./ServerFilesystemPickerDialog";

function getWindowForTest(): Window & typeof globalThis {
  return window as Window & typeof globalThis;
}

async function waitForButton(label: string): Promise<HTMLButtonElement> {
  await vi.waitFor(() => {
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === label,
      ),
    ).toBe(true);
  });

  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label,
  ) as HTMLButtonElement;
}

describe("ServerFilesystemPickerDialog", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    Reflect.deleteProperty(getWindowForTest(), "nativeApi");
  });

  it("navigates directories and confirms the current folder", async () => {
    const listDirectory = vi.fn<(input: ServerListDirectoryInput) => Promise<ServerListDirectoryResult>>(
      async (input) => {
        if (!input.path) {
          return {
            currentPath: "/srv",
            parentPath: "/",
            breadcrumbs: [
              { label: "/", path: "/" },
              { label: "srv", path: "/srv" },
            ],
            shortcuts: [{ kind: "serverCwd", label: "Server cwd", path: "/srv" }],
            entries: [
              {
                name: "repo",
                path: "/srv/repo",
                kind: "directory",
                isHidden: false,
                isSymlink: false,
              },
            ],
            truncated: false,
          };
        }

        return {
          currentPath: "/srv/repo",
          parentPath: "/srv",
          breadcrumbs: [
            { label: "/", path: "/" },
            { label: "srv", path: "/srv" },
            { label: "repo", path: "/srv/repo" },
          ],
          shortcuts: [{ kind: "serverCwd", label: "Server cwd", path: "/srv" }],
          entries: [
            {
              name: "src",
              path: "/srv/repo/src",
              kind: "directory",
              isHidden: false,
              isSymlink: false,
            },
          ],
          truncated: false,
        };
      },
    );
    const onPick = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined);

    Object.defineProperty(getWindowForTest(), "nativeApi", {
      configurable: true,
      value: {
        server: {
          listDirectory,
          getConfig: vi.fn<NativeApi["server"]["getConfig"]>(),
          upsertKeybinding: vi.fn<NativeApi["server"]["upsertKeybinding"]>(),
        },
      } satisfies Partial<NativeApi>,
    });

    const queryClient = new QueryClient();
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <ServerFilesystemPickerDialog
          open
          onOpenChange={() => {}}
          title="Add project"
          selectionMode="directory"
          confirmLabel="Add this project"
          onPick={onPick}
        />
      </QueryClientProvider>,
    );

    try {
      const repoButton = await waitForButton("repo");
      repoButton.click();

      await vi.waitFor(() => {
        expect(listDirectory).toHaveBeenCalledWith(
          expect.objectContaining({
            path: "/srv/repo",
            directoriesOnly: true,
          }),
        );
      });

      const confirmButton = await waitForButton("Add this project");
      confirmButton.click();

      await vi.waitFor(() => {
        expect(onPick).toHaveBeenCalledWith("/srv/repo");
      });
    } finally {
      await screen.unmount();
      queryClient.clear();
    }
  });

  it("submits advanced manual paths", async () => {
    const listDirectory = vi.fn<(input: ServerListDirectoryInput) => Promise<ServerListDirectoryResult>>(
      async () => ({
        currentPath: "/srv",
        parentPath: "/",
        breadcrumbs: [
          { label: "/", path: "/" },
          { label: "srv", path: "/srv" },
        ],
        shortcuts: [{ kind: "serverCwd", label: "Server cwd", path: "/srv" }],
        entries: [],
        truncated: false,
      }),
    );
    const onPick = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined);

    Object.defineProperty(getWindowForTest(), "nativeApi", {
      configurable: true,
      value: {
        server: {
          listDirectory,
          getConfig: vi.fn<NativeApi["server"]["getConfig"]>(),
          upsertKeybinding: vi.fn<NativeApi["server"]["upsertKeybinding"]>(),
        },
      } satisfies Partial<NativeApi>,
    });

    const queryClient = new QueryClient();
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <ServerFilesystemPickerDialog
          open
          onOpenChange={() => {}}
          title="Add project"
          selectionMode="directory"
          allowManualPathFallback
          onPick={onPick}
        />
      </QueryClientProvider>,
    );

    try {
      const advancedButton = await waitForButton("Advanced path entry");
      advancedButton.click();

      await page.getByLabelText("Server path").fill("~/repo");
      const usePathButton = await waitForButton("Use path");
      usePathButton.click();

      await vi.waitFor(() => {
        expect(onPick).toHaveBeenCalledWith("~/repo");
      });
    } finally {
      await screen.unmount();
      queryClient.clear();
    }
  });
});
