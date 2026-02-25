import type { GatewayModelId, LanguageModel } from "ai";
import { z } from "zod";
import { gateway, type GatewayOptions } from "../models";

const gatewayOptionsSchema = z.object({
  devtools: z.boolean().optional(),
  config: z
    .object({
      baseURL: z.string(),
      apiKey: z.string(),
    })
    .optional(),
});

export const modelConfigSchema = z.object({
  modelId: z.string().min(1),
  gatewayOptions: gatewayOptionsSchema.optional(),
});

export type OpenHarnessModelConfig = z.infer<typeof modelConfigSchema>;

export function createModelFromConfig(
  modelConfig: OpenHarnessModelConfig | undefined,
): LanguageModel | undefined {
  if (!modelConfig) {
    return undefined;
  }

  return gateway(modelConfig.modelId as GatewayModelId, {
    ...(modelConfig.gatewayOptions as GatewayOptions | undefined),
  });
}
