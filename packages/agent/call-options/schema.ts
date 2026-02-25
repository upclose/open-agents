import { z } from "zod";
import { modelConfigSchema } from "./model-config";
import type { OpenHarnessSandboxConfig } from "./sandbox-config";
import type { SkillMetadata } from "../skills/types";
import { approvalRuleSchema } from "../types";

const approvalConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("interactive"),
    autoApprove: z.enum(["off", "edits", "all"]).default("off"),
    sessionRules: z.array(approvalRuleSchema).default([]),
  }),
  z.object({ type: z.literal("background") }),
  z.object({ type: z.literal("delegated") }),
]);

export const callOptionsSchema = z.object({
  sandboxConfig: z.custom<OpenHarnessSandboxConfig>(),
  approval: approvalConfigSchema,
  modelConfig: modelConfigSchema.optional(),
  subagentModelConfig: modelConfigSchema.optional(),
  customInstructions: z.string().optional(),
  skills: z.custom<SkillMetadata[]>().optional(),
});

export type OpenHarnessAgentCallOptions = z.infer<typeof callOptionsSchema>;
