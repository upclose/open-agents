import "server-only";

import { assistantFileLinkPrompt } from "@/lib/assistant-file-links";
import { compareAndSetChatActiveStreamId } from "@/lib/db/sessions";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { getAllVariants } from "@/lib/model-variants";
import { createChatRuntime } from "@/app/api/chat/_lib/runtime";
import { resolveChatModelSelection } from "@/app/api/chat/_lib/model-selection";
import { runAgentWorkflow } from "@/app/workflows/chat";
import { start } from "workflow/api";
import type { WebAgentUIMessage } from "@/app/types";
import type {
  ChatRecord,
  SessionRecord,
} from "@/app/api/sessions/_lib/session-context";

function buildCustomInstructions(params?: { unattended?: boolean }): string {
  if (!params?.unattended) {
    return assistantFileLinkPrompt;
  }

  return [
    assistantFileLinkPrompt,
    "This run was started by an automation while the user is away.",
    "Do not ask the user follow-up questions or wait for interactive approval.",
    "If human input is required, explain what needs attention clearly and stop after summarizing it.",
  ].join("\n\n");
}

export async function startSessionChatWorkflow(params: {
  userId: string;
  sessionRecord: SessionRecord;
  chat: ChatRecord;
  messages: WebAgentUIMessage[];
  automationRun?: {
    automationRunId: string;
    unattended: boolean;
    enabledToolTypes: string[];
    createPullRequestDraft?: boolean;
  };
}) {
  const runtimePromise = createChatRuntime({
    userId: params.userId,
    sessionId: params.sessionRecord.id,
    sessionRecord: params.sessionRecord,
  });
  const preferencesPromise = getUserPreferences(params.userId).catch(
    (error) => {
      console.error("Failed to load user preferences:", error);
      return null;
    },
  );

  const [{ sandbox, skills }, preferences] = await Promise.all([
    runtimePromise,
    preferencesPromise,
  ]);

  const modelVariants = getAllVariants(preferences?.modelVariants ?? []);
  const mainModelSelection = resolveChatModelSelection({
    selectedModelId: params.chat.modelId,
    modelVariants,
    missingVariantLabel: "Selected model variant",
  });
  const subagentModelSelection = preferences?.defaultSubagentModelId
    ? resolveChatModelSelection({
        selectedModelId: preferences.defaultSubagentModelId,
        modelVariants,
        missingVariantLabel: "Subagent model variant",
      })
    : undefined;

  const shouldAutoCommitPush =
    params.sessionRecord.autoCommitPushOverride ??
    preferences?.autoCommitPush ??
    false;
  const shouldAutoCreatePr =
    shouldAutoCommitPush &&
    (params.sessionRecord.autoCreatePrOverride ??
      preferences?.autoCreatePr ??
      false);

  const run = await start(runAgentWorkflow, [
    {
      messages: params.messages,
      chatId: params.chat.id,
      sessionId: params.sessionRecord.id,
      userId: params.userId,
      modelId: mainModelSelection.id,
      maxSteps: 500,
      agentOptions: {
        sandbox: {
          state: params.sessionRecord.sandboxState!,
          workingDirectory: sandbox.workingDirectory,
          currentBranch: sandbox.currentBranch,
          environmentDetails: sandbox.environmentDetails,
        },
        model: mainModelSelection,
        ...(subagentModelSelection
          ? { subagentModel: subagentModelSelection }
          : {}),
        ...(skills.length > 0 ? { skills } : {}),
        customInstructions: buildCustomInstructions({
          unattended: params.automationRun?.unattended,
        }),
        ...(params.automationRun
          ? {
              automation: {
                unattended: params.automationRun.unattended,
                enabledToolTypes: params.automationRun.enabledToolTypes,
              },
            }
          : {}),
      },
      ...(shouldAutoCommitPush &&
        params.sessionRecord.repoOwner &&
        params.sessionRecord.repoName && {
          autoCommitEnabled: true,
          autoCreatePrEnabled: shouldAutoCreatePr,
          sessionTitle: params.sessionRecord.title,
          repoOwner: params.sessionRecord.repoOwner,
          repoName: params.sessionRecord.repoName,
        }),
      ...(params.automationRun
        ? {
            automationId: params.sessionRecord.automationId ?? undefined,
            automationRunId: params.automationRun.automationRunId,
            automationUnattended: params.automationRun.unattended,
            automationEnabledToolTypes: params.automationRun.enabledToolTypes,
            autoCreatePrDraft: params.automationRun.createPullRequestDraft,
          }
        : {}),
    },
  ]);

  const claimed = await compareAndSetChatActiveStreamId(
    params.chat.id,
    null,
    run.runId,
  );

  if (!claimed) {
    try {
      const { getRun } = await import("workflow/api");
      getRun(run.runId).cancel();
    } catch {
      // Best effort cleanup only.
    }

    throw new Error("Another workflow is already running for this chat");
  }

  return {
    runId: run.runId,
    run,
  };
}
