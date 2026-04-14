import type { AutomationRecord } from "@/lib/db/automations";
import { getNextCronOccurrence, summarizeCronSchedule } from "./cron";
import type {
  AutomationToolConfig,
  AutomationTriggerConfig,
  AutomationUpsertInput,
} from "./types";

export function getFirstCronTrigger(
  triggers: AutomationTriggerConfig[],
): Extract<AutomationTriggerConfig, { type: "cron" }> | null {
  for (const trigger of triggers) {
    if (trigger.type === "cron") {
      return trigger;
    }
  }

  return null;
}

export function getAutomationNextRunAt(
  triggers: AutomationTriggerConfig[],
  after = new Date(),
): Date | null {
  const cronTrigger = getFirstCronTrigger(triggers);
  if (!cronTrigger) {
    return null;
  }

  return getNextCronOccurrence({
    cron: cronTrigger.cron,
    timezone: cronTrigger.timezone,
    after,
  });
}

export function getAutomationScheduleSummary(
  triggers: AutomationTriggerConfig[],
): string {
  const cronTrigger = getFirstCronTrigger(triggers);
  if (!cronTrigger) {
    return "Manual only";
  }

  return summarizeCronSchedule({
    cron: cronTrigger.cron,
    timezone: cronTrigger.timezone,
  });
}

export function hasOpenPullRequestTool(
  tools: Array<{ enabled: boolean; config: AutomationToolConfig }>,
): boolean {
  return tools.some(
    (tool) => tool.enabled && tool.config.toolType === "open_pull_request",
  );
}

export function buildAutomationSessionTitle(
  automationName: string,
  triggeredAt: Date,
): string {
  const timestamp = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(triggeredAt);

  return `${automationName} - ${timestamp}`;
}

export function getOpenPullRequestToolConfig(
  tools: Array<{ enabled: boolean; config: AutomationToolConfig }>,
): Extract<AutomationToolConfig, { toolType: "open_pull_request" }> | null {
  for (const tool of tools) {
    if (tool.enabled && tool.config.toolType === "open_pull_request") {
      return tool.config;
    }
  }

  return null;
}

export function automationInputToSummary(input: AutomationUpsertInput) {
  return {
    name: input.name,
    instructions: input.instructions,
    repoOwner: input.repoOwner,
    repoName: input.repoName,
    cloneUrl:
      input.cloneUrl ??
      `https://github.com/${input.repoOwner}/${input.repoName}`,
    baseBranch: input.baseBranch,
    modelId: input.modelId ?? "anthropic/claude-haiku-4.5",
    executionEnvironment: input.executionEnvironment,
    visibility: input.visibility,
    enabled: input.enabled,
    scheduleSummary: getAutomationScheduleSummary(input.triggers),
    nextRunAt: getAutomationNextRunAt(input.triggers),
  };
}

export function automationRecordToSchedule(automation: AutomationRecord) {
  return {
    scheduleSummary: getAutomationScheduleSummary(
      automation.triggers.map((trigger) => trigger.config),
    ),
    nextRunAt: automation.nextRunAt,
  };
}
