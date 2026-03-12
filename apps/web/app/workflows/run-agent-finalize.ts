import {
  collectTaskToolUsageEvents,
  sumLanguageModelUsage,
} from "@open-harness/agent";
import type { SandboxState } from "@open-harness/sandbox";
import type { LanguageModelUsage, UIMessageChunk } from "ai";
import type { WebAgentUIMessage } from "@/app/types";
import {
  compareAndSetChatActiveStreamId,
  getSessionById,
  updateChatAssistantActivity,
  updateSession,
  upsertChatMessageScoped,
} from "@/lib/db/sessions";
import { recordUsage } from "@/lib/db/usage";
import { buildActiveLifecycleUpdate } from "@/lib/sandbox/lifecycle";
import type { RunAgentWorkflowOptions } from "./run-agent-types";

const cachedInputTokensFor = (usage: LanguageModelUsage) =>
  usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? 0;

type Writable = WritableStream<UIMessageChunk>;

export async function finalizeRun({
  options,
  workflowRunId,
  latestAssistantMessage,
  latestSandboxState,
  totalUsage,
  mainModelId,
  wasAborted,
}: {
  options: RunAgentWorkflowOptions;
  workflowRunId: string;
  latestAssistantMessage: WebAgentUIMessage | undefined;
  latestSandboxState: SandboxState | undefined;
  totalUsage: LanguageModelUsage | undefined;
  mainModelId: string;
  wasAborted: boolean;
}) {
  "use step";

  const stillOwnsRun = await clearOwnedWorkflowRunId(
    options.chatId,
    workflowRunId,
  );
  if (!stillOwnsRun) {
    return false;
  }

  const activityAt = new Date();
  const sessionRecord = await getSessionById(options.sessionId);

  if (latestAssistantMessage && !wasAborted) {
    try {
      const upsertResult = await upsertChatMessageScoped({
        id: latestAssistantMessage.id,
        chatId: options.chatId,
        role: "assistant",
        parts: latestAssistantMessage,
      });

      if (upsertResult.status === "conflict") {
        console.warn(
          `Skipped assistant workflow upsert due to ID scope conflict: ${latestAssistantMessage.id}`,
        );
      } else if (upsertResult.status === "inserted") {
        await updateChatAssistantActivity(options.chatId, activityAt);
      }
    } catch (error) {
      console.error("Failed to save assistant message:", error);
    }
  }

  if (sessionRecord) {
    try {
      const sandboxState = latestSandboxState ?? sessionRecord.sandboxState;
      await updateSession(options.sessionId, {
        sandboxState,
        ...buildActiveLifecycleUpdate(sandboxState, {
          activityAt,
        }),
      });
    } catch (error) {
      console.error("Failed to persist sandbox state:", error);
      try {
        await updateSession(options.sessionId, {
          ...buildActiveLifecycleUpdate(sessionRecord.sandboxState, {
            activityAt,
          }),
        });
      } catch (activityError) {
        console.error("Failed to persist lifecycle activity:", activityError);
      }
    }
  }

  if (totalUsage && latestAssistantMessage) {
    void recordUsage(options.userId, {
      source: "web",
      agentType: "main",
      model: mainModelId,
      messages: [latestAssistantMessage],
      usage: {
        inputTokens: totalUsage.inputTokens ?? 0,
        cachedInputTokens: cachedInputTokensFor(totalUsage),
        outputTokens: totalUsage.outputTokens ?? 0,
      },
    }).catch((error) => console.error("Failed to record usage:", error));
  }

  if (!latestAssistantMessage) {
    return true;
  }

  const subagentUsageEvents = collectTaskToolUsageEvents(
    latestAssistantMessage,
  );
  if (subagentUsageEvents.length === 0) {
    return true;
  }

  const subagentUsageByModel = new Map<string, LanguageModelUsage>();
  for (const event of subagentUsageEvents) {
    const eventModelId = event.modelId ?? mainModelId;
    const existing = subagentUsageByModel.get(eventModelId);
    const combined = sumLanguageModelUsage(existing, event.usage);
    if (combined) {
      subagentUsageByModel.set(eventModelId, combined);
    }
  }

  for (const [eventModelId, usage] of subagentUsageByModel) {
    void recordUsage(options.userId, {
      source: "web",
      agentType: "subagent",
      model: eventModelId,
      messages: [],
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        cachedInputTokens: cachedInputTokensFor(usage),
        outputTokens: usage.outputTokens ?? 0,
      },
    }).catch((error) => console.error("Failed to record usage:", error));
  }

  return true;
}

export async function sendStart(writable: Writable, messageId: string) {
  "use step";

  const writer = writable.getWriter();
  try {
    await writer.write({ type: "start", messageId });
  } finally {
    writer.releaseLock();
  }
}

export async function sendFinish(writable: Writable) {
  "use step";

  const writer = writable.getWriter();
  try {
    await writer.write({ type: "finish", finishReason: "stop" });
  } finally {
    writer.releaseLock();
  }
}

export async function closeStream(writable: Writable) {
  "use step";

  await writable.close();
}

export function startStopMonitor(
  runId: string,
  abortController: AbortController,
) {
  let shouldStop = false;

  const done = (async () => {
    const { getRun } = await import("workflow/api");
    const run = getRun(runId);

    while (!shouldStop && !abortController.signal.aborted) {
      let runStatus:
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled";

      try {
        runStatus = await run.status;
      } catch {
        await delay(150);
        continue;
      }

      if (runStatus === "cancelled") {
        abortController.abort();
        return;
      }

      await delay(150);
    }
  })();

  return {
    stop() {
      shouldStop = true;
    },
    done,
  };
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

async function clearOwnedWorkflowRunId(chatId: string, workflowRunId: string) {
  try {
    return await compareAndSetChatActiveStreamId(chatId, workflowRunId, null);
  } catch (error) {
    console.error("Failed to finalize active workflow run id:", error);
    return false;
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
