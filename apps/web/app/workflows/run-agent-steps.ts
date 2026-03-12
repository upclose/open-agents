import {
  convertToModelMessages,
  type LanguageModelUsage,
  type ModelMessage,
  type UIMessageChunk,
} from "ai";
import type { WebAgentUIMessage } from "@/app/types";
import type {
  RunAgentStepResult,
  RunAgentWorkflowOptions,
} from "./run-agent-types";

type Writable = WritableStream<UIMessageChunk>;

const ABORTED_MAIN_MODEL_ID = "anthropic/claude-haiku-4.5";

export async function toModelMessages(messages: WebAgentUIMessage[]) {
  "use step";

  const { webAgent } = await import("@/app/config");

  return convertToModelMessages(messages, {
    ignoreIncompleteToolCalls: true,
    tools: webAgent.tools,
  });
}

export async function runAgentStep(
  messages: ModelMessage[],
  originalMessages: WebAgentUIMessage[],
  latestAssistantMessage: WebAgentUIMessage | undefined,
  writable: Writable,
  options: RunAgentWorkflowOptions,
  workflowRunId: string,
  responseMessageId: string,
): Promise<RunAgentStepResult> {
  "use step";

  const abortController = new AbortController();
  const stopMonitor = startStopMonitor(workflowRunId, abortController);

  try {
    const [{ webAgent }, contextModule] = await Promise.all([
      import("@/app/config"),
      import("./run-agent-context"),
    ]);

    const context = await contextModule.resolveStepContext(
      options,
      originalMessages,
    );

    const result = await webAgent.stream({
      messages,
      options: {
        sandbox: context.sandbox,
        model: context.model,
        subagentModel: context.subagentModel,
        context: context.compactionContext,
        approval: {
          type: "interactive",
          autoApprove: "all",
          sessionRules: [],
        },
        type: "durable",
        ...(context.skills && context.skills.length > 0
          ? { skills: context.skills }
          : {}),
      },
      abortSignal: abortController.signal,
    });

    const streamOriginalMessages = contextModule.withLatestAssistantMessage(
      originalMessages,
      latestAssistantMessage,
    );
    let assistantMessage: WebAgentUIMessage | undefined;
    let lastStepUsage: LanguageModelUsage | undefined;
    let stepUsage: LanguageModelUsage | undefined;

    const stream = result.toUIMessageStream<WebAgentUIMessage>({
      sendStart: false,
      sendFinish: false,
      originalMessages: streamOriginalMessages,
      generateMessageId: () => responseMessageId,
      messageMetadata: ({ part }) => {
        if (part.type === "finish-step") {
          lastStepUsage = part.usage;
          return { lastStepUsage, totalMessageUsage: undefined };
        }

        if (part.type === "finish") {
          stepUsage = part.totalUsage;
          return { lastStepUsage, totalMessageUsage: part.totalUsage };
        }

        return undefined;
      },
      onFinish: ({ responseMessage }) => {
        assistantMessage = responseMessage;
      },
    });

    const reader = stream.getReader();
    const writer = writable.getWriter();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        await writer.write(value);
      }
    } finally {
      reader.releaseLock();
      writer.releaseLock();
    }

    const [response, finishReason, resultUsage] = await Promise.all([
      result.response,
      result.finishReason,
      result.usage,
    ]);

    return {
      responseMessages: response.messages,
      finishReason,
      assistantMessage,
      stepWasAborted: false,
      usage: stepUsage ?? resultUsage,
      mainModelId: context.mainModelId,
      latestSandboxState: contextModule.getSandboxState(context.sandbox),
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        responseMessages: [],
        finishReason: "stop",
        assistantMessage: undefined,
        stepWasAborted: true,
        mainModelId: ABORTED_MAIN_MODEL_ID,
      };
    }

    throw error;
  } finally {
    stopMonitor.stop();
    await stopMonitor.done;
  }
}

export async function finalizeRun(args: {
  options: RunAgentWorkflowOptions;
  workflowRunId: string;
  latestAssistantMessage: WebAgentUIMessage | undefined;
  latestSandboxState: RunAgentStepResult["latestSandboxState"];
  totalUsage: LanguageModelUsage | undefined;
  mainModelId: string;
  wasAborted: boolean;
}) {
  "use step";

  const { finalizeRun: finalizeRunImpl } = await import("./run-agent-finalize");
  return finalizeRunImpl(args);
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

function startStopMonitor(runId: string, abortController: AbortController) {
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

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
