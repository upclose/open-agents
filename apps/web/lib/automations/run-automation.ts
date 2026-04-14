import "server-only";

import { nanoid } from "nanoid";
import type { SessionRecord } from "@/app/api/sessions/_lib/session-context";
import { generateBranchName } from "@/app/api/generate-pr/_lib/generate-pr-helpers";
import { startSessionChatWorkflow } from "@/lib/chat/start-session-chat-workflow";
import {
  createAutomationRun,
  finalizeAutomationRun,
  markAutomationRunStarted,
  updateAutomationRun,
  type AutomationRecord,
} from "@/lib/db/automations";
import {
  createChatMessageIfNotExists,
  createSessionWithInitialChat,
  touchChat,
  updateSession,
} from "@/lib/db/sessions";
import { ensureSessionSandbox } from "@/lib/sandbox/ensure-session-sandbox";
import {
  buildAutomationSessionTitle,
  getOpenPullRequestToolConfig,
} from "./definitions";
import {
  automationShouldOpenPullRequest,
  getEnabledAutomationToolTypes,
} from "./tool-policy";
import type { AutomationRunTrigger } from "./types";

export async function runAutomation(params: {
  automation: AutomationRecord;
  userId: string;
  username: string;
  name?: string | null;
  trigger: AutomationRunTrigger;
}) {
  const triggeredAt = new Date();
  const createPrTool = getOpenPullRequestToolConfig(params.automation.tools);
  const createPrOnCompletion = automationShouldOpenPullRequest(
    params.automation,
  );
  const branch = generateBranchName(params.username, params.name);
  const run = await createAutomationRun({
    automationId: params.automation.id,
    userId: params.userId,
    trigger: params.trigger,
  });
  let createdSessionId: string | null = null;

  try {
    const created = await createSessionWithInitialChat({
      session: {
        id: nanoid(),
        userId: params.userId,
        title: buildAutomationSessionTitle(params.automation.name, triggeredAt),
        automationId: params.automation.id,
        runSource: "automation",
        status: "running",
        repoOwner: params.automation.repoOwner,
        repoName: params.automation.repoName,
        branch,
        cloneUrl:
          params.automation.cloneUrl ??
          `https://github.com/${params.automation.repoOwner}/${params.automation.repoName}`,
        isNewBranch: true,
        autoCommitPushOverride: createPrOnCompletion,
        autoCreatePrOverride: createPrOnCompletion,
        globalSkillRefs: params.automation.globalSkillRefs,
        sandboxState: { type: "vercel" },
        lifecycleState: "provisioning",
        lifecycleVersion: 0,
      },
      initialChat: {
        id: nanoid(),
        title: "Automation run",
        modelId: params.automation.modelId,
      },
    });
    createdSessionId = created.session.id;

    await markAutomationRunStarted({
      runId: run.id,
      sessionId: created.session.id,
      chatId: created.chat.id,
    });

    const sessionRecord = created.session as SessionRecord;
    const userMessage = {
      id: nanoid(),
      role: "user" as const,
      parts: [
        {
          type: "text" as const,
          text: params.automation.instructions,
        },
      ],
    };

    await createChatMessageIfNotExists({
      id: userMessage.id,
      chatId: created.chat.id,
      role: "user",
      parts: userMessage,
    });
    await touchChat(created.chat.id, triggeredAt);

    const ensured = await ensureSessionSandbox({
      userId: params.userId,
      sessionRecord,
      repoUrl:
        params.automation.cloneUrl ??
        `https://github.com/${params.automation.repoOwner}/${params.automation.repoName}`,
      sourceBranch: params.automation.baseBranch,
      newBranch: branch,
    });

    const sessionWithSandbox = {
      ...sessionRecord,
      sandboxState: ensured.sandbox.getState?.() ?? sessionRecord.sandboxState,
    } as SessionRecord;

    const { runId } = await startSessionChatWorkflow({
      userId: params.userId,
      sessionRecord: sessionWithSandbox,
      chat: created.chat,
      messages: [userMessage],
      automationRun: {
        automationRunId: run.id,
        unattended: true,
        enabledToolTypes: getEnabledAutomationToolTypes(params.automation),
        createPullRequestDraft: createPrTool?.draft ?? false,
      },
    });

    await updateAutomationRun(run.id, {
      workflowRunId: runId,
    });

    return {
      runId: run.id,
      workflowRunId: runId,
      session: created.session,
      chat: created.chat,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to execute automation";
    if (createdSessionId) {
      await updateSession(createdSessionId, { status: "failed" });
    }
    await finalizeAutomationRun({
      runId: run.id,
      automationId: params.automation.id,
      status: "failed",
      resultSummary: message,
      error: message,
    });

    throw error;
  }
}
