"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  summarizeCronSchedule,
} from "@/lib/automations/cron";
import type { AutomationUpsertInput } from "@/lib/automations/types";

type AutomationFormProps = {
  title: string;
  description: string;
  initialValue?: Partial<AutomationUpsertInput>;
  submitLabel: string;
  onSubmit: (input: AutomationUpsertInput) => Promise<void>;
};

function toInitialCron(value?: Partial<AutomationUpsertInput>) {
  const cronTrigger = value?.triggers?.find(
    (trigger) => trigger.type === "cron",
  );
  return {
    cron: cronTrigger?.type === "cron" ? cronTrigger.cron : "",
    timezone:
      cronTrigger?.type === "cron"
        ? cronTrigger.timezone
        : Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function AutomationForm({
  title,
  description,
  initialValue,
  submitLabel,
  onSubmit,
}: AutomationFormProps) {
  const initialCron = toInitialCron(initialValue);
  const [name, setName] = useState(initialValue?.name ?? "");
  const [instructions, setInstructions] = useState(
    initialValue?.instructions ?? "",
  );
  const [repoOwner, setRepoOwner] = useState(initialValue?.repoOwner ?? "");
  const [repoName, setRepoName] = useState(initialValue?.repoName ?? "");
  const [baseBranch, setBaseBranch] = useState(
    initialValue?.baseBranch ?? "main",
  );
  const [modelId, setModelId] = useState(initialValue?.modelId ?? "");
  const [cron, setCron] = useState(
    initialValue ? initialCron.cron : "0 9 * * 1-5",
  );
  const [timezone, setTimezone] = useState(initialCron.timezone);
  const [enabled, setEnabled] = useState(initialValue?.enabled ?? true);
  const [createDraftPr, setCreateDraftPr] = useState(
    initialValue?.tools?.some(
      (tool) => tool.toolType === "open_pull_request",
    ) ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schedulePreview = useMemo(() => {
    if (!cron.trim()) {
      return {
        summary: "Manual only",
        nextRun: "Not scheduled",
      };
    }

    try {
      const summary = summarizeCronSchedule({ cron, timezone });
      const nextRunAt = getNextCronOccurrence({ cron, timezone });
      const nextRun = formatAutomationDateTime(nextRunAt, timezone);
      return { summary, nextRun };
    } catch (previewError) {
      return {
        summary:
          previewError instanceof Error
            ? previewError.message
            : "Invalid cron expression",
        nextRun: "Not scheduled",
      };
    }
  }, [cron, timezone]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await onSubmit({
        name: name.trim(),
        instructions: instructions.trim(),
        repoOwner: repoOwner.trim(),
        repoName: repoName.trim(),
        baseBranch: baseBranch.trim(),
        modelId: modelId.trim() ? modelId.trim() : undefined,
        enabled,
        executionEnvironment: "vercel",
        visibility: "private",
        triggers: cron.trim()
          ? [{ type: "cron", cron: cron.trim(), timezone: timezone.trim() }]
          : [{ type: "manual" }],
        tools: createDraftPr
          ? [{ toolType: "open_pull_request", draft: true }]
          : [],
        connections: [],
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to save automation",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="automation-name">Name</Label>
              <Input
                id="automation-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Weekly dependency refresh"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="automation-model">Model</Label>
              <Input
                id="automation-model"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                placeholder="anthropic/claude-haiku-4.5"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="automation-instructions">Instructions</Label>
            <Textarea
              id="automation-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Review the repo, update dependencies, run checks, and prepare a draft PR."
              rows={6}
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="automation-repo-owner">Repo owner</Label>
              <Input
                id="automation-repo-owner"
                value={repoOwner}
                onChange={(event) => setRepoOwner(event.target.value)}
                placeholder="vercel"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="automation-repo-name">Repo name</Label>
              <Input
                id="automation-repo-name"
                value={repoName}
                onChange={(event) => setRepoName(event.target.value)}
                placeholder="open-agents"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="automation-base-branch">Base branch</Label>
              <Input
                id="automation-base-branch"
                value={baseBranch}
                onChange={(event) => setBaseBranch(event.target.value)}
                placeholder="main"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="automation-cron">Cron schedule</Label>
              <Input
                id="automation-cron"
                value={cron}
                onChange={(event) => setCron(event.target.value)}
                placeholder="0 9 * * 1-5"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for a manual-only automation.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="automation-timezone">Timezone</Label>
              <Input
                id="automation-timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="Europe/Berlin"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Schedule preview</p>
            <p>{schedulePreview.summary}</p>
            <p>{schedulePreview.nextRun}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Enabled
                </span>
                <span className="block text-xs text-muted-foreground">
                  Keep the recurring scheduler active.
                </span>
              </span>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Create draft PR
                </span>
                <span className="block text-xs text-muted-foreground">
                  Open a draft PR after a natural finish.
                </span>
              </span>
              <Switch
                checked={createDraftPr}
                onCheckedChange={setCreateDraftPr}
              />
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex justify-end">
            <Button disabled={saving} type="submit">
              {saving ? "Saving..." : submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
