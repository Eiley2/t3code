import { Schema } from "effect";
import { IsoDateTime, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";
import { KeybindingRule, ResolvedKeybindingsConfig } from "./keybindings";
import { EditorId } from "./editor";
import { ProviderKind } from "./orchestration";

const KeybindingsMalformedConfigIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.malformed-config"),
  message: TrimmedNonEmptyString,
});

const KeybindingsInvalidEntryIssue = Schema.Struct({
  kind: Schema.Literal("keybindings.invalid-entry"),
  message: TrimmedNonEmptyString,
  index: Schema.Number,
});

export const ServerConfigIssue = Schema.Union([
  KeybindingsMalformedConfigIssue,
  KeybindingsInvalidEntryIssue,
]);
export type ServerConfigIssue = typeof ServerConfigIssue.Type;

const ServerConfigIssues = Schema.Array(ServerConfigIssue);

export const ServerProviderStatusState = Schema.Literals(["ready", "warning", "error"]);
export type ServerProviderStatusState = typeof ServerProviderStatusState.Type;

export const ServerProviderAuthStatus = Schema.Literals([
  "authenticated",
  "unauthenticated",
  "unknown",
]);
export type ServerProviderAuthStatus = typeof ServerProviderAuthStatus.Type;

export const ServerProviderStatus = Schema.Struct({
  provider: ProviderKind,
  status: ServerProviderStatusState,
  available: Schema.Boolean,
  authStatus: ServerProviderAuthStatus,
  checkedAt: IsoDateTime,
  message: Schema.optional(TrimmedNonEmptyString),
});
export type ServerProviderStatus = typeof ServerProviderStatus.Type;

const ServerProviderStatuses = Schema.Array(ServerProviderStatus);

const SERVER_LIST_DIRECTORY_MAX_LIMIT = 1_000;

export const ServerListDirectoryInput = Schema.Struct({
  path: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  query: Schema.optional(Schema.String.check(Schema.isMaxLength(256))),
  includeHidden: Schema.optional(Schema.Boolean),
  directoriesOnly: Schema.optional(Schema.Boolean),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(SERVER_LIST_DIRECTORY_MAX_LIMIT))),
});
export type ServerListDirectoryInput = typeof ServerListDirectoryInput.Type;

const ServerFilesystemEntryKind = Schema.Literals(["directory", "file"]);

export const ServerFilesystemEntry = Schema.Struct({
  name: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
  kind: ServerFilesystemEntryKind,
  isHidden: Schema.Boolean,
  isSymlink: Schema.Boolean,
});
export type ServerFilesystemEntry = typeof ServerFilesystemEntry.Type;

export const ServerFilesystemBreadcrumb = Schema.Struct({
  label: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
});
export type ServerFilesystemBreadcrumb = typeof ServerFilesystemBreadcrumb.Type;

export const ServerFilesystemShortcutKind = Schema.Literals(["serverCwd", "home", "root"]);
export type ServerFilesystemShortcutKind = typeof ServerFilesystemShortcutKind.Type;

export const ServerFilesystemShortcut = Schema.Struct({
  kind: ServerFilesystemShortcutKind,
  label: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString,
});
export type ServerFilesystemShortcut = typeof ServerFilesystemShortcut.Type;

export const ServerListDirectoryResult = Schema.Struct({
  currentPath: TrimmedNonEmptyString,
  parentPath: Schema.NullOr(TrimmedNonEmptyString),
  breadcrumbs: Schema.Array(ServerFilesystemBreadcrumb),
  shortcuts: Schema.Array(ServerFilesystemShortcut),
  entries: Schema.Array(ServerFilesystemEntry),
  truncated: Schema.Boolean,
});
export type ServerListDirectoryResult = typeof ServerListDirectoryResult.Type;

export const ServerConfig = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  keybindingsConfigPath: TrimmedNonEmptyString,
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
  providers: ServerProviderStatuses,
  availableEditors: Schema.Array(EditorId),
});
export type ServerConfig = typeof ServerConfig.Type;

export const ServerUpsertKeybindingInput = KeybindingRule;
export type ServerUpsertKeybindingInput = typeof ServerUpsertKeybindingInput.Type;

export const ServerUpsertKeybindingResult = Schema.Struct({
  keybindings: ResolvedKeybindingsConfig,
  issues: ServerConfigIssues,
});
export type ServerUpsertKeybindingResult = typeof ServerUpsertKeybindingResult.Type;

export const ServerConfigUpdatedPayload = Schema.Struct({
  issues: ServerConfigIssues,
  providers: ServerProviderStatuses,
});
export type ServerConfigUpdatedPayload = typeof ServerConfigUpdatedPayload.Type;
