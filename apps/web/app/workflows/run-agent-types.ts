import type { SandboxState } from "@open-harness/sandbox";
import type { FinishReason, LanguageModelUsage, ModelMessage } from "ai";
import type { WebAgentUIMessage } from "@/app/types";

export interface ChatCompactionContextPayload {
  contextLimit?: number;
  lastInputTokens?: number;
}

export interface RunAgentWorkflowOptions {
  sessionId: string;
  chatId: string;
  userId: string;
  context?: ChatCompactionContextPayload;
}

export interface RunAgentWorkflowResult {
  wasAborted: boolean;
  completedNaturally: boolean;
  stillOwnsRun: boolean;
}

export interface RunAgentStepResult {
  responseMessages: ModelMessage[];
  finishReason: FinishReason;
  assistantMessage?: WebAgentUIMessage;
  stepWasAborted: boolean;
  usage?: LanguageModelUsage;
  mainModelId: string;
  latestSandboxState?: SandboxState;
}
