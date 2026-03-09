import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";

export const serverQueryKeys = {
  all: ["server"] as const,
  config: () => ["server", "config"] as const,
  listDirectory: (
    path: string | null,
    query: string,
    includeHidden: boolean,
    directoriesOnly: boolean,
    limit: number,
  ) =>
    ["server", "list-directory", path, query, includeHidden, directoriesOnly, limit] as const,
};

export function serverConfigQueryOptions() {
  return queryOptions({
    queryKey: serverQueryKeys.config(),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.getConfig();
    },
    staleTime: Infinity,
  });
}

const DEFAULT_LIST_DIRECTORY_LIMIT = 200;
const DEFAULT_LIST_DIRECTORY_STALE_TIME = 15_000;

export function serverListDirectoryQueryOptions(input: {
  path?: string | null;
  query?: string;
  includeHidden?: boolean;
  directoriesOnly?: boolean;
  limit?: number;
  staleTime?: number;
  enabled?: boolean;
}) {
  const pathValue = input.path ?? null;
  const queryValue = input.query ?? "";
  const includeHidden = input.includeHidden ?? false;
  const directoriesOnly = input.directoriesOnly ?? false;
  const limit = input.limit ?? DEFAULT_LIST_DIRECTORY_LIMIT;

  return queryOptions({
    queryKey: serverQueryKeys.listDirectory(
      pathValue,
      queryValue,
      includeHidden,
      directoriesOnly,
      limit,
    ),
    queryFn: async () => {
      const api = ensureNativeApi();
      return api.server.listDirectory({
        path: pathValue,
        query: queryValue,
        includeHidden,
        directoriesOnly,
        limit,
      });
    },
    enabled: input.enabled ?? true,
    staleTime: input.staleTime ?? DEFAULT_LIST_DIRECTORY_STALE_TIME,
  });
}
