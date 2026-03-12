import { discoverSkills, gateway } from "@open-harness/agent";
import { connectSandbox, type SandboxState } from "@open-harness/sandbox";
import type { GatewayModelId, LanguageModel } from "ai";
import type { WebAgentUIMessage } from "@/app/types";
import { getChatById, getSessionById } from "@/lib/db/sessions";
import { getUserPreferences } from "@/lib/db/user-preferences";
import { getRepoToken } from "@/lib/github/get-repo-token";
import { getUserGitHubToken } from "@/lib/github/user-token";
import { resolveModelSelection } from "@/lib/model-variants";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { DEFAULT_SANDBOX_PORTS } from "@/lib/sandbox/config";
import { isSandboxActive } from "@/lib/sandbox/utils";
import { getCachedSkills, setCachedSkills } from "@/lib/skills-cache";
import type {
  ChatCompactionContextPayload,
  RunAgentWorkflowOptions,
} from "./run-agent-types";

const DEFAULT_CONTEXT_LIMIT = 200_000;

type DiscoveredSkills = Awaited<ReturnType<typeof discoverSkills>>;

export interface StepContext {
  model: LanguageModel;
  mainModelId: string;
  sandbox: Awaited<ReturnType<typeof connectSandbox>>;
  subagentModel?: LanguageModel;
  skills?: DiscoveredSkills;
  compactionContext: {
    contextLimit: number;
    lastInputTokens?: number;
  };
}

export async function resolveStepContext(
  options: RunAgentWorkflowOptions,
  messages: WebAgentUIMessage[],
): Promise<StepContext> {
  const [sessionRecord, chat, preferences] = await Promise.all([
    getSessionById(options.sessionId),
    getChatById(options.chatId),
    getUserPreferences(options.userId).catch((error) => {
      console.error("Failed to load user preferences:", error);
      return null;
    }),
  ]);

  if (!sessionRecord) {
    throw new Error(`Session ${options.sessionId} not found`);
  }
  if (!chat || chat.sessionId !== options.sessionId) {
    throw new Error(`Chat ${options.chatId} not found`);
  }
  if (!isSandboxActive(sessionRecord.sandboxState)) {
    throw new Error(`Sandbox is not active for session ${options.sessionId}`);
  }

  const githubToken = await resolveGitHubToken(options.userId, sessionRecord);
  const sandbox = await connectSandbox(sessionRecord.sandboxState, {
    env: githubToken ? { GITHUB_TOKEN: githubToken } : undefined,
    ports: DEFAULT_SANDBOX_PORTS,
  });

  await ensureAuthenticatedRemote({
    sandbox,
    sessionRecord,
    githubToken,
  });

  const skills = await resolveSkills(options.sessionId, sessionRecord, sandbox);
  const modelVariants = preferences?.modelVariants ?? [];
  const selectedModelId = chat.modelId ?? DEFAULT_MODEL_ID;
  const mainSelection = resolveModelSelection(selectedModelId, modelVariants);
  const mainModelId = mainSelection.isMissingVariant
    ? DEFAULT_MODEL_ID
    : mainSelection.resolvedModelId;

  let model: LanguageModel;
  try {
    model = gateway(mainModelId as GatewayModelId, {
      providerOptionsOverrides: mainSelection.isMissingVariant
        ? undefined
        : mainSelection.providerOptionsByProvider,
    });
  } catch (error) {
    console.error(
      `Invalid model ID "${mainModelId}", falling back to default:`,
      error,
    );
    model = gateway(DEFAULT_MODEL_ID as GatewayModelId);
  }

  let subagentModel: LanguageModel | undefined;
  if (preferences?.defaultSubagentModelId) {
    const subagentSelection = resolveModelSelection(
      preferences.defaultSubagentModelId,
      modelVariants,
    );
    const subagentModelId = subagentSelection.isMissingVariant
      ? DEFAULT_MODEL_ID
      : subagentSelection.resolvedModelId;

    try {
      subagentModel = gateway(subagentModelId as GatewayModelId, {
        providerOptionsOverrides: subagentSelection.isMissingVariant
          ? undefined
          : subagentSelection.providerOptionsByProvider,
      });
    } catch (error) {
      console.error("Failed to resolve subagent model preference:", error);
    }
  }

  return {
    model,
    mainModelId,
    sandbox,
    subagentModel,
    skills,
    compactionContext: buildCompactionContext(messages, options.context),
  };
}

export function getLatestAssistantMessage(messages: WebAgentUIMessage[]) {
  const latestMessage = messages[messages.length - 1];
  return latestMessage?.role === "assistant" ? latestMessage : undefined;
}

export function getResponseMessageId(
  messages: WebAgentUIMessage[],
  workflowRunId: string,
) {
  const latestAssistantMessage = getLatestAssistantMessage(messages);
  return latestAssistantMessage?.id ?? workflowRunId;
}

export function withLatestAssistantMessage(
  messages: WebAgentUIMessage[],
  latestAssistantMessage: WebAgentUIMessage | undefined,
) {
  if (!latestAssistantMessage) {
    return messages;
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === "assistant") {
    return [...messages.slice(0, -1), latestAssistantMessage];
  }

  return [...messages, latestAssistantMessage];
}

export function getSandboxState(
  sandbox: Awaited<ReturnType<typeof connectSandbox>>,
): SandboxState | undefined {
  const sandboxState = sandbox.getState?.();
  return isSandboxState(sandboxState) ? sandboxState : undefined;
}

function buildCompactionContext(
  messages: WebAgentUIMessage[],
  requestedCompactionContext: ChatCompactionContextPayload | undefined,
) {
  const requestedContextLimit = toPositiveInteger(
    requestedCompactionContext?.contextLimit,
  );
  const requestedLastInputTokens = toPositiveInputTokens(
    requestedCompactionContext?.lastInputTokens,
  );
  const inferredLastInputTokens = extractLastInputTokensFromMessages(messages);

  return {
    contextLimit: requestedContextLimit ?? DEFAULT_CONTEXT_LIMIT,
    lastInputTokens: requestedLastInputTokens ?? inferredLastInputTokens,
  };
}

async function resolveGitHubToken(
  userId: string,
  sessionRecord: NonNullable<Awaited<ReturnType<typeof getSessionById>>>,
) {
  if (sessionRecord.repoOwner) {
    try {
      const tokenResult = await getRepoToken(userId, sessionRecord.repoOwner);
      return tokenResult.token;
    } catch {
      return getUserGitHubToken(userId);
    }
  }

  return getUserGitHubToken(userId);
}

async function ensureAuthenticatedRemote({
  sandbox,
  sessionRecord,
  githubToken,
}: {
  sandbox: Awaited<ReturnType<typeof connectSandbox>>;
  sessionRecord: NonNullable<Awaited<ReturnType<typeof getSessionById>>>;
  githubToken: string | null;
}) {
  if (!githubToken || !sessionRecord.repoOwner || !sessionRecord.repoName) {
    return;
  }

  const authUrl = `https://x-access-token:${githubToken}@github.com/${sessionRecord.repoOwner}/${sessionRecord.repoName}.git`;
  const remoteResult = await sandbox.exec(
    `git remote set-url origin "${authUrl}"`,
    sandbox.workingDirectory,
    5000,
  );

  if (!remoteResult.success) {
    console.warn(
      `Failed to refresh git remote auth for session ${sessionRecord.id}: ${remoteResult.stderr ?? remoteResult.stdout}`,
    );
  }
}

async function resolveSkills(
  sessionId: string,
  sessionRecord: NonNullable<Awaited<ReturnType<typeof getSessionById>>>,
  sandbox: Awaited<ReturnType<typeof connectSandbox>>,
) {
  const cachedSkills = await getCachedSkills(
    sessionId,
    sessionRecord.sandboxState,
  );
  if (cachedSkills !== null) {
    return cachedSkills;
  }

  const skillDirs = [".claude", ".agents"].map(
    (folder) => `${sandbox.workingDirectory}/${folder}/skills`,
  );
  const skills = await discoverSkills(sandbox, skillDirs);
  await setCachedSkills(sessionId, sessionRecord.sandboxState, skills);
  return skills;
}

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function toPositiveInputTokens(value: unknown): number | undefined {
  const normalized = toPositiveInteger(value);
  return normalized && normalized > 0 ? normalized : undefined;
}

function extractLastInputTokensFromMessages(messages: WebAgentUIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") {
      continue;
    }

    const metadata = (message as { metadata?: unknown }).metadata;
    if (!metadata || typeof metadata !== "object") {
      continue;
    }

    const lastStepUsage = (metadata as { lastStepUsage?: unknown })
      .lastStepUsage;
    if (!lastStepUsage || typeof lastStepUsage !== "object") {
      continue;
    }

    const inputTokens = (lastStepUsage as { inputTokens?: unknown })
      .inputTokens;
    const normalizedTokens = toPositiveInputTokens(inputTokens);
    if (normalizedTokens) {
      return normalizedTokens;
    }
  }

  return undefined;
}

function isSandboxState(value: unknown): value is SandboxState {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("type" in value) || typeof value.type !== "string") {
    return false;
  }

  return value.type === "just-bash" || value.type === "vercel";
}
