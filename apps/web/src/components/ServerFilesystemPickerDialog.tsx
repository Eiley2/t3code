"use client";

import { ChevronRightIcon, FileIcon, FolderIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { serverListDirectoryQueryOptions } from "~/lib/serverReactQuery";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Switch } from "~/components/ui/switch";

type SelectionMode = "directory" | "file";

interface ServerFilesystemPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  selectionMode: SelectionMode;
  initialPath?: string | null;
  confirmLabel?: string;
  allowManualPathFallback?: boolean;
  onPick: (path: string) => Promise<void> | void;
}

export function ServerFilesystemPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  selectionMode,
  initialPath = null,
  confirmLabel,
  allowManualPathFallback = false,
  onPick,
}: ServerFilesystemPickerDialogProps) {
  const manualPathInputId = useId();
  const [currentPath, setCurrentPath] = useState<string | null>(initialPath);
  const [manualPath, setManualPath] = useState("");
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSuccessfulPath, setLastSuccessfulPath] = useState<string | null>(initialPath);

  useEffect(() => {
    if (!open) return;
    setCurrentPath(initialPath);
    setLastSuccessfulPath(initialPath);
    setSelectedFilePath(null);
    setManualPath("");
    setQuery("");
    setShowHidden(false);
    setSubmissionError(null);
  }, [initialPath, open]);

  const listingQuery = useQuery(
    serverListDirectoryQueryOptions({
      path: currentPath,
      query,
      includeHidden: showHidden,
      directoriesOnly: selectionMode === "directory",
      enabled: open,
    }),
  );

  useEffect(() => {
    if (!listingQuery.data) return;
    setLastSuccessfulPath(listingQuery.data.currentPath);
    if (selectionMode === "directory") {
      setSelectedFilePath(null);
    } else if (
      selectedFilePath &&
      !listingQuery.data.entries.some((entry) => entry.path === selectedFilePath && entry.kind === "file")
    ) {
      setSelectedFilePath(null);
    }
  }, [listingQuery.data, selectedFilePath, selectionMode]);

  const activePath =
    selectionMode === "directory" ? (listingQuery.data?.currentPath ?? null) : selectedFilePath;
  const resolvedConfirmLabel =
    confirmLabel ?? (selectionMode === "directory" ? "Select this folder" : "Select file");
  const emptyLabel = useMemo(() => {
    if (listingQuery.isLoading) {
      return "Loading directory...";
    }
    if (query.trim().length > 0) {
      return "No entries match this filter.";
    }
    return selectionMode === "directory"
      ? "No directories found in this location."
      : "No files found in this location.";
  }, [listingQuery.isLoading, query, selectionMode]);

  const navigateToPath = (nextPath: string) => {
    setSubmissionError(null);
    setSelectedFilePath(null);
    setCurrentPath(nextPath);
  };

  const handleConfirm = async (pathToPick: string | null) => {
    if (!pathToPick || isSubmitting) return;
    setSubmissionError(null);
    setIsSubmitting(true);
    try {
      await onPick(pathToPick);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Unable to use that path.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEntryClick = (entry: NonNullable<typeof listingQuery.data>["entries"][number]) => {
    if (entry.kind === "directory") {
      navigateToPath(entry.path);
      return;
    }
    if (selectionMode === "file") {
      setSubmissionError(null);
      setSelectedFilePath(entry.path);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {listingQuery.data?.shortcuts.map((shortcut) => (
                <Button
                  key={`${shortcut.kind}:${shortcut.path}`}
                  size="xs"
                  variant="outline"
                  onClick={() => navigateToPath(shortcut.path)}
                >
                  {shortcut.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-secondary/50 px-2 py-1.5 text-xs">
              {listingQuery.data?.breadcrumbs.map((breadcrumb, index) => (
                <div key={breadcrumb.path} className="flex items-center gap-1">
                  {index > 0 ? <ChevronRightIcon className="size-3.5 text-muted-foreground/70" /> : null}
                  <button
                    type="button"
                    className="rounded px-1 py-0.5 text-left text-foreground/80 hover:bg-accent hover:text-foreground"
                    onClick={() => navigateToPath(breadcrumb.path)}
                  >
                    {breadcrumb.label}
                  </button>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <Input
                type="search"
                placeholder="Filter current directory"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={isSubmitting}
              />
              <label className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm sm:min-w-40">
                <span>Show hidden</span>
                <Switch
                  checked={showHidden}
                  onCheckedChange={(checked) => setShowHidden(Boolean(checked))}
                  aria-label="Show hidden"
                  disabled={isSubmitting}
                />
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="truncate">
                Current path: <code>{listingQuery.data?.currentPath ?? currentPath ?? "Loading..."}</code>
              </span>
              {selectionMode === "directory" && listingQuery.data ? (
                <span>This folder will be selected.</span>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-xl border border-border/70">
              <ScrollArea className="h-72">
                {listingQuery.isError ? (
                  <div className="flex h-72 flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-sm text-destructive">
                      {listingQuery.error instanceof Error
                        ? listingQuery.error.message
                        : "Unable to load this directory."}
                    </p>
                    <div className="flex gap-2">
                      {lastSuccessfulPath ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigateToPath(lastSuccessfulPath)}
                        >
                          Go back
                        </Button>
                      ) : null}
                      <Button size="sm" onClick={() => void listingQuery.refetch()}>
                        Retry
                      </Button>
                    </div>
                  </div>
                ) : listingQuery.isLoading && !listingQuery.data ? (
                  <div className="flex h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircleIcon className="size-4 animate-spin" />
                    Loading directory...
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {listingQuery.data?.entries.length ? (
                      listingQuery.data.entries.map((entry) => {
                        const isSelected = selectionMode === "file" && selectedFilePath === entry.path;
                        return (
                          <button
                            key={entry.path}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/60",
                              isSelected && "bg-accent text-accent-foreground",
                            )}
                            onClick={() => handleEntryClick(entry)}
                          >
                            {entry.kind === "directory" ? (
                              <FolderIcon className="size-4 shrink-0 text-amber-500" />
                            ) : (
                              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                            {entry.isSymlink ? (
                              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                symlink
                              </span>
                            ) : null}
                            {entry.kind === "directory" ? (
                              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/70" />
                            ) : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="flex h-72 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        {emptyLabel}
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>

            {listingQuery.data?.truncated ? (
              <p className="text-xs text-muted-foreground">
                Showing the first {listingQuery.data.entries.length} entries. Refine the filter to narrow
                this directory.
              </p>
            ) : null}
          </div>

          {allowManualPathFallback ? (
            <Collapsible className="rounded-xl border border-border/70">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
                <span>Advanced path entry</span>
                <ChevronRightIcon className="size-4 transition-transform data-[panel-open]:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-3 border-t border-border/60 px-4 py-4">
                  <label htmlFor={manualPathInputId} className="grid gap-1.5">
                    <span className="text-xs font-medium text-foreground">Server path</span>
                    <Input
                      id={manualPathInputId}
                      value={manualPath}
                      onChange={(event) => setManualPath(event.target.value)}
                      placeholder="~/repo or /srv/project"
                      spellCheck={false}
                      disabled={isSubmitting}
                    />
                  </label>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleConfirm(manualPath.trim() || null)}
                      disabled={manualPath.trim().length === 0 || isSubmitting}
                    >
                      Use path
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}

          {submissionError ? <p className="text-sm text-destructive">{submissionError}</p> : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleConfirm(activePath)}
            disabled={!activePath || isSubmitting || listingQuery.isLoading}
          >
            {isSubmitting ? "Working..." : resolvedConfirmLabel}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
