import { getRun } from "workflow/api";
import {
  requireAuthenticatedUser,
  requireOwnedChatById,
} from "@/app/api/chat/_lib/chat-context";
import type { WebAgentUIMessage } from "@/app/types";
import {
  finalizeAutomationRun,
  getLatestAutomationRunBySessionId,
} from "@/lib/db/automations";
import {
  compareAndSetChatActiveStreamId,
  createChatMessageIfNotExists,
  updateChatAssistantActivity,
} from "@/lib/db/sessions";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { chatId } = await context.params;

  const chatContext = await requireOwnedChatById({
    userId: authResult.userId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const { chat, sessionRecord } = chatContext;

  if (!chat.activeStreamId) {
    return Response.json({ success: true });
  }

  // Persist the latest client-side assistant message snapshot before
  // cancelling so mid-step output is not lost on abrupt stop.
  try {
    const body: unknown = await request.json().catch(() => null);
    if (isStopRequestWithMessage(body)) {
      await persistAssistantSnapshot(chatId, body.assistantMessage);
    }
  } catch {
    // Best-effort — don't block cancellation if persistence fails.
  }

  try {
    const run = getRun(chat.activeStreamId);
    await run.cancel();
  } catch (error) {
    console.error(
      `[workflow] Failed to cancel workflow run for chat ${chatId}:`,
      error,
    );
    return Response.json(
      { error: "Failed to cancel workflow run" },
      { status: 500 },
    );
  }

  // Clear activeStreamId immediately so a follow-up prompt does not
  // reconnect to the cancelled (but not yet terminal) workflow.
  // Uses CAS to avoid clobbering a newer workflow that raced in.
  await compareAndSetChatActiveStreamId(
    chatId,
    chat.activeStreamId,
    null,
  ).catch((err: unknown) => {
    console.error(
      `[workflow] Failed to clear activeStreamId for chat ${chatId}:`,
      err,
    );
  });

  await markAutomationRunCancelledIfNeeded({
    sessionId: sessionRecord.id,
    automationId: sessionRecord.automationId,
    runSource: sessionRecord.runSource,
    chatId,
  }).catch((error: unknown) => {
    console.error(
      `[workflow] Failed to finalize automation run after cancel for chat ${chatId}:`,
      error,
    );
  });

  return Response.json({ success: true });
}

async function persistAssistantSnapshot(
  chatId: string,
  message: WebAgentUIMessage,
): Promise<void> {
  // Insert-only: if the workflow already persisted a fuller message, this
  // is a no-op. Avoids overwriting server-side content with a stale
  // (throttled) client snapshot.
  const created = await createChatMessageIfNotExists({
    id: message.id,
    chatId,
    role: "assistant",
    parts: message,
  });
  if (created) {
    await updateChatAssistantActivity(chatId, new Date());
  }
}

function isStopRequestWithMessage(
  value: unknown,
): value is { assistantMessage: WebAgentUIMessage } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("assistantMessage" in value) || !value.assistantMessage) {
    return false;
  }
  const msg = value.assistantMessage;
  return (
    typeof msg === "object" &&
    msg !== null &&
    "id" in msg &&
    typeof msg.id === "string" &&
    "role" in msg &&
    msg.role === "assistant" &&
    "parts" in msg &&
    Array.isArray(msg.parts)
  );
}

async function markAutomationRunCancelledIfNeeded(params: {
  sessionId: string;
  automationId: string | null;
  runSource: string | null;
  chatId: string;
}) {
  if (params.runSource !== "automation" || !params.automationId) {
    return;
  }

  const run = await getLatestAutomationRunBySessionId(params.sessionId);
  if (!run) {
    return;
  }

  if (run.chatId && run.chatId !== params.chatId) {
    return;
  }

  if (run.status !== "queued" && run.status !== "running") {
    return;
  }

  await finalizeAutomationRun({
    runId: run.id,
    automationId: params.automationId,
    status: "cancelled",
    resultSummary: run.resultSummary ?? "Cancelled",
    workflowRunId: run.workflowRunId ?? null,
    prNumber: run.prNumber ?? null,
    prUrl: run.prUrl ?? null,
    compareUrl: run.compareUrl ?? null,
    error: null,
    needsAttentionReason: null,
  });
}
