"use client";

import {
  ExternalLink,
  GitPullRequest,
  Loader2,
  Play,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AutomationForm } from "./automation-form";
import {
  useAutomationDetail,
  useAutomations,
  type AutomationRecord,
  type AutomationRunRecord,
} from "@/hooks/use-automations";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatAutomationDateTime,
  getNextCronOccurrence,
} from "@/lib/automations/cron";
import type { AutomationUpsertInput } from "@/lib/automations/types";

function getCronConfig(automation: AutomationRecord) {
  const cronTrigger = automation.triggers.find(
    (trigger) => trigger.type === "cron" && trigger.config.type === "cron",
  );

  return cronTrigger?.config.type === "cron" ? cronTrigger.config : null;
}

function toFormValue(
  automation: AutomationRecord,
): Partial<AutomationUpsertInput> {
  return {
    name: automation.name,
    instructions: automation.instructions,
    repoOwner: automation.repoOwner,
    repoName: automation.repoName,
    cloneUrl: automation.cloneUrl ?? undefined,
    baseBranch: automation.baseBranch,
    modelId: automation.modelId,
    enabled: automation.enabled,
    triggers: automation.triggers.map((trigger) => trigger.config),
    tools: automation.tools.map((tool) => tool.config),
    connections: automation.connections.map((connection) => ({
      provider: connection.provider,
      connectionRef: connection.connectionRef,
      config: connection.config,
    })),
  };
}

function formatRunTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not available";
}

function getRunStatusTone(status: string) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
    case "running":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700";
    case "needs_attention":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700";
    case "failed":
    case "cancelled":
      return "border-red-500/30 bg-red-500/10 text-red-700";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

function RunHistoryCard({ run }: { run: AutomationRunRecord }) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            {run.triggeredAt
              ? `Run started ${new Date(run.triggeredAt).toLocaleString()}`
              : "Automation run"}
          </CardTitle>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${getRunStatusTone(
              run.status,
            )}`}
          >
            {run.status.replaceAll("_", " ")}
          </span>
        </div>
        <CardDescription>
          Finished: {formatRunTime(run.finishedAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {run.resultSummary ??
            run.needsAttentionReason ??
            "No summary captured for this run yet."}
        </p>

        {run.needsAttentionReason ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800">
            {run.needsAttentionReason}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {run.sessionId ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/sessions/${run.sessionId}`}>Open session</Link>
            </Button>
          ) : null}
          {run.prUrl ? (
            <Button asChild size="sm" variant="outline">
              <a href={run.prUrl} rel="noreferrer" target="_blank">
                <GitPullRequest className="h-4 w-4" />
                Open PR
              </a>
            </Button>
          ) : null}
          {run.compareUrl ? (
            <Button asChild size="sm" variant="outline">
              <a href={run.compareUrl} rel="noreferrer" target="_blank">
                <ExternalLink className="h-4 w-4" />
                Open compare
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function AutomationDetailPageClient(props: { automationId: string }) {
  const router = useRouter();
  const { automation, runs, error, isLoading, mutate } = useAutomationDetail(
    props.automationId,
  );
  const { updateAutomation, deleteAutomation, runNow } = useAutomations();
  const [isRunningNow, setIsRunningNow] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const cronConfig = useMemo(
    () => (automation ? getCronConfig(automation) : null),
    [automation],
  );
  const nextPreview = useMemo(() => {
    if (!cronConfig) {
      return "Not scheduled";
    }

    try {
      return formatAutomationDateTime(
        automation?.nextRunAt
          ? new Date(automation.nextRunAt)
          : getNextCronOccurrence({
              cron: cronConfig.cron,
              timezone: cronConfig.timezone,
            }),
        cronConfig.timezone,
      );
    } catch {
      return "Not scheduled";
    }
  }, [automation?.nextRunAt, cronConfig]);

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading automation...
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Automation not found</CardTitle>
            <CardDescription>
              {error instanceof Error
                ? error.message
                : "This automation could not be loaded."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/automations">Back to automations</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground">
              {automation.name}
            </h1>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                automation.enabled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                  : "border-border bg-muted/30 text-muted-foreground"
              }`}
            >
              {automation.enabled ? "Enabled" : "Paused"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {automation.repoOwner}/{automation.repoName} on{" "}
            {automation.baseBranch}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/automations">Back</Link>
          </Button>
          <Button
            disabled={isRunningNow}
            onClick={async () => {
              setIsRunningNow(true);
              try {
                const result = await runNow(automation.id);
                await mutate();
                router.push(
                  `/sessions/${result.session.id}/chats/${result.chat.id}`,
                );
              } finally {
                setIsRunningNow(false);
              }
            }}
          >
            {isRunningNow ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run now
          </Button>
          <Button
            disabled={isDeleting}
            variant="destructive"
            onClick={async () => {
              const confirmed = window.confirm(
                `Delete automation "${automation.name}"? Existing sessions will remain, but future runs will stop.`,
              );
              if (!confirmed) {
                return;
              }

              setIsDeleting(true);
              try {
                await deleteAutomation(automation.id);
                router.push("/automations");
              } finally {
                setIsDeleting(false);
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule</CardTitle>
            <CardDescription>{automation.scheduleSummary}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Next run: {nextPreview}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest result</CardTitle>
            <CardDescription>
              {automation.lastRunAt
                ? new Date(automation.lastRunAt).toLocaleString()
                : "No runs yet"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {automation.lastRunSummary ??
              automation.lastRunStatus ??
              "Waiting for first run"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enabled tools</CardTitle>
            <CardDescription>
              Server-owned actions available in unattended mode
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {automation.enabledToolTypes.length > 0 ? (
              automation.enabledToolTypes.map((toolType) => (
                <span
                  key={toolType}
                  className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {toolType.replaceAll("_", " ")}
                </span>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                No external tools enabled
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      <AutomationForm
        key={automation.id}
        title="Edit Automation"
        description="Update the repo, instructions, schedule, or unattended PR behavior."
        initialValue={toFormValue(automation)}
        submitLabel="Save changes"
        onSubmit={async (input) => {
          await updateAutomation(automation.id, input);
          await mutate();
        }}
      />

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Run history</h2>
          <p className="text-sm text-muted-foreground">
            Each automation run creates a normal session that you can resume
            manually.
          </p>
        </div>

        {runs.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No runs yet</CardTitle>
              <CardDescription>
                Use Run now or wait for the next scheduled execution.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4">
            {runs.map((run) => (
              <RunHistoryCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
