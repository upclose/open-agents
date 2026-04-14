import { z } from "zod";

export const automationExecutionEnvironmentSchema = z.enum(["vercel"]);
export type AutomationExecutionEnvironment = z.infer<
  typeof automationExecutionEnvironmentSchema
>;

export const automationVisibilitySchema = z.enum(["private"]);
export type AutomationVisibility = z.infer<typeof automationVisibilitySchema>;

export const automationTriggerTypeSchema = z.enum(["cron", "manual"]);
export type AutomationTriggerType = z.infer<typeof automationTriggerTypeSchema>;

export const automationRunTriggerSchema = z.enum(["cron", "manual"]);
export type AutomationRunTrigger = z.infer<typeof automationRunTriggerSchema>;

export const automationToolTypeSchema = z.enum(["open_pull_request"]);
export type AutomationToolType = z.infer<typeof automationToolTypeSchema>;

export const automationRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "needs_attention",
  "cancelled",
]);
export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>;

export const cronTriggerConfigSchema = z.object({
  cron: z.string().min(1),
  timezone: z.string().min(1),
});
export type CronTriggerConfig = z.infer<typeof cronTriggerConfigSchema>;

export const automationTriggerConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cron"),
    cron: z.string().min(1),
    timezone: z.string().min(1),
  }),
  z.object({
    type: z.literal("manual"),
  }),
]);
export type AutomationTriggerConfig = z.infer<
  typeof automationTriggerConfigSchema
>;

export const openPullRequestToolConfigSchema = z.object({
  draft: z.boolean().default(true),
});
export type OpenPullRequestToolConfig = z.infer<
  typeof openPullRequestToolConfigSchema
>;

export const automationToolConfigSchema = z.discriminatedUnion("toolType", [
  z.object({
    toolType: z.literal("open_pull_request"),
    draft: z.boolean().default(true),
  }),
]);
export type AutomationToolConfig = z.infer<typeof automationToolConfigSchema>;

export const automationConnectionConfigSchema = z.object({
  provider: z.string().min(1),
  connectionRef: z.string().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type AutomationConnectionConfig = z.infer<
  typeof automationConnectionConfigSchema
>;

export const automationUpsertInputSchema = z.object({
  name: z.string().min(1).max(120),
  instructions: z.string().min(1),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  cloneUrl: z.string().url().optional(),
  baseBranch: z.string().min(1),
  modelId: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
  executionEnvironment: automationExecutionEnvironmentSchema.default("vercel"),
  visibility: automationVisibilitySchema.default("private"),
  triggers: z
    .array(automationTriggerConfigSchema)
    .min(1)
    .default([{ type: "manual" }]),
  tools: z.array(automationToolConfigSchema).default([]),
  connections: z.array(automationConnectionConfigSchema).default([]),
});
export type AutomationUpsertInput = z.infer<typeof automationUpsertInputSchema>;

export const automationRunNowInputSchema = z.object({
  trigger: automationRunTriggerSchema.default("manual"),
});
export type AutomationRunNowInput = z.infer<typeof automationRunNowInputSchema>;

export function getAutomationToolEnabled(
  tools: Array<{
    toolType: AutomationToolType;
    enabled: boolean;
    config?: Record<string, unknown> | null;
  }>,
  toolType: AutomationToolType,
): boolean {
  return tools.some((tool) => tool.toolType === toolType && tool.enabled);
}
