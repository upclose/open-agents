"use client";

import {
  AlertCircle,
  CheckCircle2,
  Circle,
  GitPullRequest,
  Loader2,
  MessageCircleQuestion,
  Plus,
  Search,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { UserAvatarDropdown } from "@/components/user-avatar-dropdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCliTokens } from "@/hooks/use-cli-tokens";
import { useInbox } from "@/hooks/use-inbox";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type {
  InboxActionType,
  InboxEventType,
  InboxItem,
} from "@/lib/inbox/types";
import { cn } from "@/lib/utils";

type InboxFilter =
  | "all"
  | "action_required"
  | "review_ready"
  | "no_output"
  | "updates";

interface InboxPageProps {
  lastRepo: { owner: string; repo: string } | null;
}

function formatTimeAgo(dateIso: string): string {
  const timestamp = new Date(dateIso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(dateIso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function truncateLine(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

function isQuickReviewEvent(eventType: InboxEventType): boolean {
  return (
    eventType === "review_ready" || eventType === "run_completed_no_output"
  );
}

function parseRepoTag(input: string): { owner: string; repo: string } | null {
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    return null;
  }

  const githubUrlMatch = trimmedInput.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)$/i,
  );

  const candidate = githubUrlMatch
    ? `${githubUrlMatch[1]}/${githubUrlMatch[2]}`
    : trimmedInput;

  const [owner, repo] = candidate.split("/");

  if (!owner || !repo || candidate.split("/").length !== 2) {
    return null;
  }

  const validPart = /^[A-Za-z0-9_.-]+$/;
  if (!validPart.test(owner) || !validPart.test(repo)) {
    return null;
  }

  return { owner, repo };
}

function deriveSessionTitle(task: string): string {
  const normalized = task.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New task";
  }

  return normalized.length > 72
    ? `${normalized.slice(0, 71).trimEnd()}…`
    : normalized;
}

function getEventIcon(eventType: InboxEventType) {
  switch (eventType) {
    case "question_asked":
      return <MessageCircleQuestion className="h-4 w-4 text-amber-500" />;
    case "approval_requested":
      return <ShieldAlert className="h-4 w-4 text-amber-500" />;
    case "run_failed":
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case "review_ready":
      return <GitPullRequest className="h-4 w-4 text-emerald-500" />;
    case "run_completed_no_output":
      return <TriangleAlert className="h-4 w-4 text-yellow-500" />;
    case "running_update":
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }
}

function getSessionLabel(item: InboxItem): string {
  const parts = [
    item.session.repoOwner,
    item.session.repoName,
    item.session.branch,
  ].filter((value): value is string => Boolean(value && value.length > 0));

  if (parts.length === 0) {
    return item.session.title;
  }

  return parts.join("/");
}

function getFilterCount(
  filter: InboxFilter,
  counts: {
    actionRequired: number;
    reviewReady: number;
    noOutput: number;
    updates: number;
    total: number;
  } | null,
): number {
  if (!counts) return 0;

  switch (filter) {
    case "all":
      return counts.total;
    case "action_required":
      return counts.actionRequired;
    case "review_ready":
      return counts.reviewReady;
    case "no_output":
      return counts.noOutput;
    case "updates":
      return counts.updates;
  }
}

function filterButtonLabel(filter: InboxFilter): string {
  switch (filter) {
    case "all":
      return "All";
    case "action_required":
      return "Action Required";
    case "review_ready":
      return "Review Ready";
    case "no_output":
      return "No Output";
    case "updates":
      return "Running";
  }
}

export function InboxPage({ lastRepo }: InboxPageProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<InboxFilter>("all");
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [quickTask, setQuickTask] = useState("");
  const [quickRepoTag, setQuickRepoTag] = useState(
    lastRepo ? `${lastRepo.owner}/${lastRepo.repo}` : "",
  );
  const [quickBranch, setQuickBranch] = useState("");
  const [useAutoBranch, setUseAutoBranch] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [selectedReviewItem, setSelectedReviewItem] =
    useState<InboxItem | null>(null);
  const includeUpdates = activeFilter === "updates";

  const { preferences } = useUserPreferences();
  const { data, loading, error, refresh, runAction } = useInbox({
    q: query,
    includeUpdates,
  });

  const groups = useMemo(() => {
    if (!data) {
      return {
        actionRequired: [] as InboxItem[],
        reviewReady: [] as InboxItem[],
        noOutput: [] as InboxItem[],
        updates: [] as InboxItem[],
      };
    }

    const removeDismissed = (items: InboxItem[]) =>
      items.filter((item) => !dismissedIds.has(item.id));

    return {
      actionRequired: removeDismissed(data.groups.actionRequired),
      reviewReady: removeDismissed(data.groups.reviewReady),
      noOutput: removeDismissed(data.groups.noOutput),
      updates: removeDismissed(data.groups.updates),
    };
  }, [data, dismissedIds]);

  const visibleSections = useMemo(() => {
    switch (activeFilter) {
      case "all":
        return [
          {
            key: "actionRequired",
            title: "Action Required",
            items: groups.actionRequired,
          },
          {
            key: "reviewReady",
            title: "Review Ready",
            items: groups.reviewReady,
          },
          { key: "noOutput", title: "No Output", items: groups.noOutput },
        ];
      case "action_required":
        return [
          {
            key: "actionRequired",
            title: "Action Required",
            items: groups.actionRequired,
          },
        ];
      case "review_ready":
        return [
          {
            key: "reviewReady",
            title: "Review Ready",
            items: groups.reviewReady,
          },
        ];
      case "no_output":
        return [
          { key: "noOutput", title: "No Output", items: groups.noOutput },
        ];
      case "updates":
        return [{ key: "updates", title: "Running", items: groups.updates }];
    }
  }, [activeFilter, groups]);

  const totalVisibleItems =
    groups.actionRequired.length +
    groups.reviewReady.length +
    groups.noOutput.length +
    groups.updates.length;

  const hasAnyVisibleItems = totalVisibleItems > 0;

  const countOverrides = useMemo(() => {
    if (!data) return null;

    return {
      actionRequired: groups.actionRequired.length,
      reviewReady: groups.reviewReady.length,
      noOutput: groups.noOutput.length,
      updates: groups.updates.length,
      total:
        groups.actionRequired.length +
        groups.reviewReady.length +
        groups.noOutput.length +
        groups.updates.length,
    };
  }, [data, groups]);

  const handleDispatchTask = async () => {
    const taskText = quickTask.trim();
    if (!taskText) {
      setCreateError("Add a task before dispatching.");
      return;
    }

    const parsedRepo = parseRepoTag(quickRepoTag);
    const hasRepoInput = quickRepoTag.trim().length > 0;

    if (hasRepoInput && !parsedRepo) {
      setCreateError("Repo tag must look like owner/repo.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    const sandboxType = preferences?.defaultSandboxType ?? "hybrid";
    const isNewBranch = parsedRepo ? useAutoBranch : false;
    const branch =
      parsedRepo && !useAutoBranch && quickBranch.trim().length > 0
        ? quickBranch.trim()
        : undefined;
    const cloneUrl = parsedRepo
      ? `https://github.com/${parsedRepo.owner}/${parsedRepo.repo}`
      : undefined;

    try {
      const createResponse = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: deriveSessionTitle(taskText),
          repoOwner: parsedRepo?.owner,
          repoName: parsedRepo?.repo,
          branch,
          cloneUrl,
          isNewBranch,
          sandboxType,
        }),
      });

      const createPayload = (await createResponse.json()) as {
        session?: { id: string; branch: string | null };
        chat?: { id: string };
        error?: string;
      };

      if (!createResponse.ok || !createPayload.session || !createPayload.chat) {
        throw new Error(createPayload.error ?? "Failed to create task session");
      }

      const sandboxResponse = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: createPayload.session.id,
          repoUrl: cloneUrl,
          branch: createPayload.session.branch ?? branch,
          isNewBranch,
          sandboxType,
        }),
      });

      const sandboxPayload = (await sandboxResponse.json()) as {
        error?: string;
      };

      if (!sandboxResponse.ok) {
        throw new Error(sandboxPayload.error ?? "Failed to prepare sandbox");
      }

      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: createPayload.session.id,
          chatId: createPayload.chat.id,
          messages: [
            {
              id: crypto.randomUUID(),
              role: "user",
              parts: [{ type: "text", text: taskText }],
            },
          ],
        }),
      });

      if (!chatResponse.ok) {
        const chatPayload = (await chatResponse.json()) as { error?: string };
        throw new Error(chatPayload.error ?? "Failed to start task");
      }

      setQuickTask("");
      setQuickBranch("");
      setIsTaskDialogOpen(false);
      await refresh();
      setTimeout(() => {
        void refresh();
      }, 1500);
    } catch (dispatchError) {
      setCreateError(
        dispatchError instanceof Error
          ? dispatchError.message
          : "Failed to dispatch task",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleAction = async (item: InboxItem, actionType: InboxActionType) => {
    try {
      if (actionType === "mark_done") {
        await runAction({ itemId: item.id, action: "mark_done" });
        setDismissedIds((previous) => new Set([...previous, item.id]));
        return;
      }

      const response = await runAction({
        itemId: item.id,
        action: "open_session",
        payload: {
          sessionUrl: item.links.sessionUrl,
        },
      });

      router.push(response.redirectUrl ?? item.links.sessionUrl);
    } catch (actionError) {
      console.error("Inbox action failed:", actionError);
      if (actionType === "open_session") {
        router.push(item.links.sessionUrl);
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold">Open Harness</p>
            <p className="text-sm text-muted-foreground">
              Inbox-only triage for concurrent sessions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog
              open={isTaskDialogOpen}
              onOpenChange={(isOpen) => {
                setIsTaskDialogOpen(isOpen);
                if (isOpen) {
                  setCreateError(null);
                }
              }}
            >
              <Button onClick={() => setIsTaskDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                New Task
              </Button>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Dispatch a new task</DialogTitle>
                  <DialogDescription>
                    Add the task, optionally tag a repo, and let it run while
                    you stay in Inbox.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="quick-task-input"
                      className="text-sm font-medium text-foreground"
                    >
                      Task
                    </label>
                    <Textarea
                      id="quick-task-input"
                      value={quickTask}
                      onChange={(event) => setQuickTask(event.target.value)}
                      placeholder="Implement X, then run lint and summarize the diff"
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="quick-task-repo"
                        className="text-sm font-medium text-foreground"
                      >
                        Repo tag (optional)
                      </label>
                      {lastRepo ? (
                        <button
                          type="button"
                          onClick={() =>
                            setQuickRepoTag(
                              `${lastRepo.owner}/${lastRepo.repo}`,
                            )
                          }
                          className="text-xs text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground"
                        >
                          Use last repo
                        </button>
                      ) : null}
                    </div>
                    <Input
                      id="quick-task-repo"
                      value={quickRepoTag}
                      onChange={(event) => setQuickRepoTag(event.target.value)}
                      placeholder="owner/repo"
                    />
                  </div>

                  {quickRepoTag.trim().length > 0 ? (
                    <div className="space-y-3 rounded-md border border-border/70 p-3">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={useAutoBranch}
                          onChange={(event) =>
                            setUseAutoBranch(event.target.checked)
                          }
                        />
                        Auto-generate branch
                      </label>

                      {!useAutoBranch ? (
                        <div className="space-y-2">
                          <label
                            htmlFor="quick-task-branch"
                            className="text-sm font-medium text-foreground"
                          >
                            Branch
                          </label>
                          <Input
                            id="quick-task-branch"
                            value={quickBranch}
                            onChange={(event) =>
                              setQuickBranch(event.target.value)
                            }
                            placeholder="feature/my-task"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {createError ? (
                    <p className="text-sm text-destructive">{createError}</p>
                  ) : null}

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsTaskDialogOpen(false)}
                      disabled={isCreating}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleDispatchTask()}
                      disabled={isCreating}
                    >
                      {isCreating ? "Dispatching…" : "Dispatch task"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <UserAvatarDropdown />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder="Search by title, repo, or branch"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                "all",
                "action_required",
                "review_ready",
                "no_output",
                "updates",
              ] as InboxFilter[]
            ).map((filter) => {
              const isActive = activeFilter === filter;
              const count = getFilterCount(filter, countOverrides);

              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "border-foreground/30 bg-muted text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>{filterButtonLabel(filter)}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6">
        <CliConnectBanner />

        {error ? (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Failed to load inbox: {error.message}
          </div>
        ) : null}

        {loading && !data ? (
          <InboxLoadingState />
        ) : hasAnyVisibleItems ? (
          <div className="space-y-6">
            {visibleSections.map((section) => (
              <section key={section.key} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.title}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {section.items.length}
                  </span>
                </div>

                {section.items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
                    Nothing here right now.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {section.items.map((item) => {
                      const primaryAction =
                        item.actions.find((action) => action.primary) ??
                        item.actions[0];

                      return (
                        <article
                          key={item.id}
                          className="rounded-lg border border-border/70 bg-card/60 px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {getEventIcon(item.eventType)}
                                <p className="truncate font-medium">
                                  {item.title}
                                </p>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {getSessionLabel(item)}
                              </p>
                              <p className="mt-2 text-sm text-muted-foreground">
                                {item.preview}
                              </p>
                              {item.context.request ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground/80">
                                    Asked:
                                  </span>{" "}
                                  {truncateLine(item.context.request, 140)}
                                </p>
                              ) : null}
                              {item.context.outcome ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground/80">
                                    Latest:
                                  </span>{" "}
                                  {truncateLine(item.context.outcome, 180)}
                                </p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {item.context.generatedByModel ? (
                                  <span className="rounded-md bg-muted px-2 py-0.5">
                                    Quick summary
                                  </span>
                                ) : null}
                                {item.badges.hasStreaming ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Running
                                  </span>
                                ) : null}
                                {item.badges.hasUnread ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
                                    <Circle className="h-2.5 w-2.5 fill-current" />
                                    Unread
                                  </span>
                                ) : null}
                                {(item.badges.linesAdded ?? 0) > 0 ? (
                                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                                    +{item.badges.linesAdded}
                                  </span>
                                ) : null}
                                {(item.badges.linesRemoved ?? 0) > 0 ? (
                                  <span className="font-mono text-rose-600 dark:text-rose-400">
                                    -{item.badges.linesRemoved}
                                  </span>
                                ) : null}
                                {item.badges.prStatus ? (
                                  <span className="rounded-md bg-muted px-2 py-0.5">
                                    PR {item.badges.prStatus}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatTimeAgo(item.updatedAt)}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {primaryAction ? (
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (
                                    primaryAction.type === "open_session" &&
                                    isQuickReviewEvent(item.eventType)
                                  ) {
                                    setSelectedReviewItem(item);
                                    return;
                                  }

                                  void handleAction(item, primaryAction.type);
                                }}
                              >
                                {primaryAction.label}
                              </Button>
                            ) : null}
                            {item.actions
                              .filter((action) => !action.primary)
                              .map((action) => (
                                <Button
                                  key={action.type}
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    void handleAction(item, action.type)
                                  }
                                >
                                  {action.label}
                                </Button>
                              ))}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(item.links.sessionUrl)}
                            >
                              Open full session
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <InboxEmptyState />
        )}
      </main>

      <Dialog
        open={selectedReviewItem !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSelectedReviewItem(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          {selectedReviewItem ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selectedReviewItem.title} ·{" "}
                  {getSessionLabel(selectedReviewItem)}
                </DialogTitle>
                <DialogDescription>
                  {selectedReviewItem.preview}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    User asked
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {selectedReviewItem.context.request ??
                      "No user prompt captured."}
                  </p>
                </div>

                <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Latest assistant output
                  </p>
                  <p className="max-h-[300px] overflow-y-auto whitespace-pre-wrap text-sm text-foreground">
                    {selectedReviewItem.context.outcome ??
                      "No assistant text output captured yet."}
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedReviewItem(null);
                      void handleAction(selectedReviewItem, "mark_done");
                    }}
                  >
                    Mark done
                  </Button>
                  <Button
                    onClick={() => {
                      router.push(selectedReviewItem.links.sessionUrl);
                      setSelectedReviewItem(null);
                    }}
                  >
                    Open full session
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InboxLoadingState() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`inbox-loading-${index}`}
          className="h-28 animate-pulse rounded-lg border border-border/70 bg-muted/30"
        />
      ))}
    </div>
  );
}

function InboxEmptyState() {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-border/70 px-6 text-center">
      <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-base font-medium">No action needed</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        All current sessions are either parked or waiting without any actions on
        you.
      </p>
    </div>
  );
}

function CliConnectBanner() {
  const { tokens, loading } = useCliTokens();

  if (loading || tokens.length > 0) {
    return null;
  }

  return (
    <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-border/60 bg-muted/70 px-4 py-1.5 text-sm text-muted-foreground">
      <span className="text-foreground">
        Run sessions locally with the CLI.
      </span>
      <Link
        href="/settings/tokens"
        className="text-foreground underline decoration-foreground/40 underline-offset-4 transition hover:decoration-foreground"
      >
        Set up CLI
      </Link>
    </div>
  );
}
