import { type LanguageModelUsage, type UIMessageChunk } from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";
import type { WebAgentUIMessage } from "@/app/types";
import { shouldContinueWorkflowAfterStep } from "@/lib/chat/should-auto-submit";
import {
  closeStream,
  finalizeRun,
  runAgentStep,
  sendFinish,
  sendStart,
  toModelMessages,
} from "./run-agent-steps";
import type {
  RunAgentStepResult,
  RunAgentWorkflowOptions,
  RunAgentWorkflowResult,
} from "./run-agent-types";

export type { RunAgentWorkflowResult } from "./run-agent-types";

const MAX_AGENT_ITERATIONS = 200;

export async function runAgent(
  messages: WebAgentUIMessage[],
  options: RunAgentWorkflowOptions,
  maxIterations = MAX_AGENT_ITERATIONS,
): Promise<RunAgentWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();
  const responseMessageId = getResponseMessageId(messages, workflowRunId);

  let modelMessages = await toModelMessages(messages);
  let latestAssistantMessage = getLatestAssistantMessage(messages);
  let totalUsage: LanguageModelUsage | undefined;
  let latestSandboxState: RunAgentStepResult["latestSandboxState"];
  let mainModelId = "anthropic/claude-haiku-4.5";
  let wasAborted = false;
  let completedNaturally = false;

  await sendStart(writable, responseMessageId);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const stepResult = await runAgentStep(
      modelMessages,
      messages,
      latestAssistantMessage,
      writable,
      options,
      workflowRunId,
      responseMessageId,
    );

    latestAssistantMessage =
      stepResult.assistantMessage ?? latestAssistantMessage;
    totalUsage = sumLanguageModelUsage(totalUsage, stepResult.usage);
    latestSandboxState = stepResult.latestSandboxState ?? latestSandboxState;
    mainModelId = stepResult.mainModelId;
    wasAborted = wasAborted || stepResult.stepWasAborted;
    modelMessages = [...modelMessages, ...stepResult.responseMessages];

    if (
      !shouldContinueWorkflowAfterStep(
        stepResult.finishReason,
        stepResult.assistantMessage,
      )
    ) {
      completedNaturally =
        !stepResult.stepWasAborted && stepResult.finishReason !== "tool-calls";
      break;
    }
  }

  const stillOwnsRun = await finalizeRun({
    options,
    workflowRunId,
    latestAssistantMessage,
    latestSandboxState,
    totalUsage,
    mainModelId,
    wasAborted,
  });

  await sendFinish(writable);
  await closeStream(writable);

  return {
    wasAborted,
    completedNaturally,
    stillOwnsRun,
  };
}

function getLatestAssistantMessage(messages: WebAgentUIMessage[]) {
  const latestMessage = messages[messages.length - 1];
  return latestMessage?.role === "assistant" ? latestMessage : undefined;
}

function getResponseMessageId(
  messages: WebAgentUIMessage[],
  workflowRunId: string,
) {
  const latestAssistantMessage = getLatestAssistantMessage(messages);
  return latestAssistantMessage?.id ?? workflowRunId;
}

function addTokenCounts(
  tokenCount1: number | undefined,
  tokenCount2: number | undefined,
): number | undefined {
  if (tokenCount1 == null && tokenCount2 == null) {
    return undefined;
  }

  return (tokenCount1 ?? 0) + (tokenCount2 ?? 0);
}

function addLanguageModelUsage(
  usage1: LanguageModelUsage,
  usage2: LanguageModelUsage,
): LanguageModelUsage {
  return {
    inputTokens: addTokenCounts(usage1.inputTokens, usage2.inputTokens),
    inputTokenDetails: {
      noCacheTokens: addTokenCounts(
        usage1.inputTokenDetails?.noCacheTokens,
        usage2.inputTokenDetails?.noCacheTokens,
      ),
      cacheReadTokens: addTokenCounts(
        usage1.inputTokenDetails?.cacheReadTokens,
        usage2.inputTokenDetails?.cacheReadTokens,
      ),
      cacheWriteTokens: addTokenCounts(
        usage1.inputTokenDetails?.cacheWriteTokens,
        usage2.inputTokenDetails?.cacheWriteTokens,
      ),
    },
    outputTokens: addTokenCounts(usage1.outputTokens, usage2.outputTokens),
    outputTokenDetails: {
      textTokens: addTokenCounts(
        usage1.outputTokenDetails?.textTokens,
        usage2.outputTokenDetails?.textTokens,
      ),
      reasoningTokens: addTokenCounts(
        usage1.outputTokenDetails?.reasoningTokens,
        usage2.outputTokenDetails?.reasoningTokens,
      ),
    },
    totalTokens: addTokenCounts(usage1.totalTokens, usage2.totalTokens),
    reasoningTokens: addTokenCounts(
      usage1.reasoningTokens,
      usage2.reasoningTokens,
    ),
    cachedInputTokens: addTokenCounts(
      usage1.cachedInputTokens,
      usage2.cachedInputTokens,
    ),
  };
}

function sumLanguageModelUsage(
  usage1: LanguageModelUsage | undefined,
  usage2: LanguageModelUsage | undefined,
): LanguageModelUsage | undefined {
  if (!usage1) {
    return usage2;
  }
  if (!usage2) {
    return usage1;
  }

  return addLanguageModelUsage(usage1, usage2);
}
