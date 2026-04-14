"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ModelCombobox } from "@/components/model-combobox";
import { RepoSelectorCompact } from "@/components/repo-selector-compact";
import { BranchSelector } from "@/components/branch-selector";
import { useModelOptions } from "@/hooks/use-model-options";
import {
  formatAutomationDateTime,
  getNextCronOccurrence,
  summarizeCronSchedule,
} from "@/lib/automations/cron";
import type { AutomationUpsertInput } from "@/lib/automations/types";

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *", cron: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *", cron: "0 */6 * * *" },
  { label: "Daily at 9:00 AM", value: "0 9 * * *", cron: "0 9 * * *" },
  {
    label: "Weekdays at 9:00 AM",
    value: "0 9 * * 1-5",
    cron: "0 9 * * 1-5",
  },
  {
    label: "Weekly on Monday at 9:00 AM",
    value: "0 9 * * 1",
    cron: "0 9 * * 1",
  },
  { label: "Manual only", value: "manual-only", cron: "" },
] as const;

type AutomationFormProps = {
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

function resolveInitialPreset(cron: string): string {
  if (!cron) return "manual-only";
  const match = CRON_PRESETS.find((p) => p.cron === cron);
  return match ? match.value : "custom";
}

export function AutomationForm({
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
  const { modelOptions, loading: modelsLoading } = useModelOptions();
  const modelItems = useMemo(
    () => [{ id: "", label: "Default (from preferences)" }, ...modelOptions],
    [modelOptions],
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cronPreset, setCronPreset] = useState(() =>
    resolveInitialPreset(initialValue ? initialCron.cron : "0 9 * * 1-5"),
  );

  const schedulePreview = useMemo(() => {
    if (!cron.trim()) {
      return { summary: "Manual only", nextRun: "Not scheduled" };
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

  function handlePresetChange(value: string) {
    setCronPreset(value);
    if (value === "custom") return;
    const preset = CRON_PRESETS.find((p) => p.value === value);
    setCron(preset ? preset.cron : "");
  }

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
    <form className="space-y-8" onSubmit={handleSubmit}>
      {/* ── Basic Info ── */}
      <div className="space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Basic Info
        </h3>
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
        <div className="space-y-2">
          <Label>Model</Label>
          <ModelCombobox
            value={modelId}
            items={modelItems}
            placeholder="Default (from preferences)"
            searchPlaceholder="Search models..."
            emptyText="No models found."
            disabled={modelsLoading}
            onChange={setModelId}
          />
        </div>
      </div>

      {/* ── Repository ── */}
      <div className="space-y-4 border-t border-border/50 pt-8">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Repository
        </h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Repository</Label>
            <RepoSelectorCompact
              selectedOwner={repoOwner}
              selectedRepo={repoName}
              onSelect={(owner, repo) => {
                setRepoOwner(owner);
                setRepoName(repo);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Branch</Label>
            <BranchSelector
              owner={repoOwner}
              repo={repoName}
              value={baseBranch}
              onChange={setBaseBranch}
              disabled={!repoOwner || !repoName}
            />
          </div>
        </div>
      </div>

      {/* ── Schedule ── */}
      <div className="space-y-4 border-t border-border/50 pt-8">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Schedule
        </h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select value={cronPreset} onValueChange={handlePresetChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a schedule" />
              </SelectTrigger>
              <SelectContent>
                {CRON_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {cronPreset === "custom" ? (
            <div className="space-y-2">
              <Label htmlFor="automation-cron">Cron expression</Label>
              <Input
                id="automation-cron"
                value={cron}
                onChange={(event) => setCron(event.target.value)}
                placeholder="0 9 * * 1-5"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Standard 5-field cron: minute hour day-of-month month
                day-of-week
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="automation-timezone">Timezone</Label>
            <Input
              id="automation-timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="Europe/Berlin"
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <p className="font-medium text-foreground">Next run</p>
            <p className="text-muted-foreground">{schedulePreview.nextRun}</p>
            <p className="text-xs text-muted-foreground">
              {schedulePreview.summary}
            </p>
          </div>
        </div>
      </div>

      {/* ── Options ── */}
      <div className="space-y-4 border-t border-border/50 pt-8">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Options
        </h3>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Enabled</p>
            <p className="text-xs text-muted-foreground">
              Keep the recurring scheduler active.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              Create draft PR
            </p>
            <p className="text-xs text-muted-foreground">
              Open a draft PR after a natural finish.
            </p>
          </div>
          <Switch checked={createDraftPr} onCheckedChange={setCreateDraftPr} />
        </div>
      </div>

      {/* ── Submit ── */}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex justify-end">
        <Button disabled={saving} type="submit">
          {saving ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
