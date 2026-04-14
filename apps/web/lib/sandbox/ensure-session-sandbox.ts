import "server-only";

import { connectSandbox, type SandboxState } from "@open-harness/sandbox";
import type { SessionRecord } from "@/app/api/sessions/_lib/session-context";
import { getGitHubAccount } from "@/lib/db/accounts";
import { updateSession } from "@/lib/db/sessions";
import { getUserGitHubToken } from "@/lib/github/user-token";
import {
  DEFAULT_SANDBOX_BASE_SNAPSHOT_ID,
  DEFAULT_SANDBOX_PORTS,
  DEFAULT_SANDBOX_TIMEOUT_MS,
} from "./config";
import {
  buildActiveLifecycleUpdate,
  getNextLifecycleVersion,
} from "./lifecycle";
import { kickSandboxLifecycleWorkflow } from "./lifecycle-kick";
import {
  getVercelCliSandboxSetup,
  syncVercelCliAuthToSandbox,
} from "./vercel-cli-auth";
import { installGlobalSkills } from "@/lib/skills/global-skill-installer";
import { getSessionSandboxName } from "./utils";

type ConnectedSandbox = Awaited<ReturnType<typeof connectSandbox>>;

async function syncVercelCliAuthForSandbox(params: {
  userId: string;
  sessionRecord: SessionRecord;
  sandbox: ConnectedSandbox;
}) {
  const setup = await getVercelCliSandboxSetup({
    userId: params.userId,
    sessionRecord: params.sessionRecord,
  });

  await syncVercelCliAuthToSandbox({
    sandbox: params.sandbox,
    setup,
  });
}

async function installSessionGlobalSkills(params: {
  sessionRecord: SessionRecord;
  sandbox: ConnectedSandbox;
}) {
  const globalSkillRefs = params.sessionRecord.globalSkillRefs ?? [];
  if (globalSkillRefs.length === 0) {
    return;
  }

  await installGlobalSkills({
    sandbox: params.sandbox,
    globalSkillRefs,
  });
}

export async function ensureSessionSandbox(params: {
  userId: string;
  sessionRecord: SessionRecord;
  repoUrl?: string;
  sourceBranch?: string;
  newBranch?: string;
}) {
  const startTime = Date.now();
  const sessionId = params.sessionRecord.id;
  const sandboxName = getSessionSandboxName(sessionId);
  const githubToken = await getUserGitHubToken(params.userId);
  const githubAccount = await getGitHubAccount(params.userId);
  const githubNoreplyEmail =
    githubAccount?.externalUserId && githubAccount.username
      ? `${githubAccount.externalUserId}+${githubAccount.username}@users.noreply.github.com`
      : undefined;

  const gitUser = {
    name:
      githubAccount?.username ??
      params.sessionRecord.repoOwner ??
      params.sessionRecord.userId,
    email:
      githubNoreplyEmail ??
      `${githubAccount?.username ?? params.sessionRecord.userId}@users.noreply.github.com`,
  };

  const source = params.repoUrl
    ? {
        repo: params.repoUrl,
        ...(params.sourceBranch ? { branch: params.sourceBranch } : {}),
        ...(params.newBranch ? { newBranch: params.newBranch } : {}),
      }
    : undefined;

  const sandbox = await connectSandbox({
    state: {
      type: "vercel",
      sandboxName,
      source,
    },
    options: {
      githubToken: githubToken ?? undefined,
      gitUser,
      timeout: DEFAULT_SANDBOX_TIMEOUT_MS,
      ports: DEFAULT_SANDBOX_PORTS,
      baseSnapshotId: DEFAULT_SANDBOX_BASE_SNAPSHOT_ID,
      persistent: true,
      resume: true,
      createIfMissing: true,
    },
  });

  const nextState = sandbox.getState?.() as SandboxState | undefined;
  if (nextState) {
    await updateSession(sessionId, {
      sandboxState: nextState,
      snapshotUrl: null,
      snapshotCreatedAt: null,
      lifecycleVersion: getNextLifecycleVersion(
        params.sessionRecord.lifecycleVersion,
      ),
      ...buildActiveLifecycleUpdate(nextState),
    });
  }

  try {
    await syncVercelCliAuthForSandbox({
      userId: params.userId,
      sessionRecord: params.sessionRecord,
      sandbox,
    });
  } catch (error) {
    console.error(
      `Failed to prepare Vercel CLI auth for session ${params.sessionRecord.id}:`,
      error,
    );
  }

  try {
    await installSessionGlobalSkills({
      sessionRecord: params.sessionRecord,
      sandbox,
    });
  } catch (error) {
    console.error(
      `Failed to install global skills for session ${params.sessionRecord.id}:`,
      error,
    );
  }

  kickSandboxLifecycleWorkflow({
    sessionId,
    reason: "sandbox-created",
  });

  return {
    sandbox,
    readyMs: Date.now() - startTime,
    timeout: DEFAULT_SANDBOX_TIMEOUT_MS,
  };
}
