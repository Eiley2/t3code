import { describe, expect, it } from "vitest";

import { serverListDirectoryQueryOptions, serverQueryKeys } from "./serverReactQuery";

describe("serverReactQuery", () => {
  it("scopes list-directory keys by path and filters", () => {
    expect(serverQueryKeys.listDirectory("/repo", "src", true, true, 50)).toEqual([
      "server",
      "list-directory",
      "/repo",
      "src",
      true,
      true,
      50,
    ]);
  });

  it("builds list-directory query options with defaults", () => {
    const options = serverListDirectoryQueryOptions({
      path: null,
      directoriesOnly: true,
    });

    expect(options.queryKey).toEqual(
      serverQueryKeys.listDirectory(null, "", false, true, 200),
    );
  });
});
