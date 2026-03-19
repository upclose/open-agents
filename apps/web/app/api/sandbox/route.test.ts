import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DEFAULT_SANDBOX_TIMEOUT_MS } from "@/lib/sandbox/config";

mock.module("server-only", () => ({}));

interface TestSessionRecord {
  id: string;
  userId: string;
  lifecycleVersion: number;
  sandboxState: { type: "vercel" };
  snapshotUrl?: string | null;
  vercelProjectId?: string | null;
  vercelProjectName?: string | null;
  vercelTeamId?: string | null;
  vercelTeamSlug?: string | null;
}

interface KickCall {
  sessionId: string;
  reason: string;
}

interface ConnectConfig {
  state: {
    type: "vercel";
    sandboxId?: string;
  };
  options?: {
    gitUser?: {
      email?: string;
    };
  };
}

const kickCalls: KickCall[] = [];
const updateCalls: Array<{
  sessionId: string;
  patch: Record<string, unknown>;
}> = [];
const connectConfigs: ConnectConfig[] = [];
const writeFileCalls: Array<{ path: string; content: string }> = [];

let sessionRecord: TestSessionRecord;
let vercelToken: string | null;
let envSyncError: Error | null;
let developmentEnvVars: Array<{ key: string; value: string }>;

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => ({
    user: {
      id: "user-1",
      username: "nico",
      name: "Nico",
      email: "nico@example.com",
    },
  }),
}));

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => ({ ok: true, userId: "user-1" }),
  requireOwnedSession: async () => ({ ok: true, sessionRecord }),
}));

mock.module("@/lib/db/accounts", () => ({
  getGitHubAccount: async () => ({
    externalUserId: "12345",
    username: "nico-gh",
    accessToken: "token",
    refreshToken: null,
    expiresAt: null,
  }),
}));

mock.module("@/lib/github/user-token", () => ({
  getUserGitHubToken: async () => null,
}));

mock.module("@/lib/vercel/token", () => ({
  getUserVercelToken: async () => vercelToken,
}));

mock.module("@/lib/vercel/projects", () => ({
  getProjectDevelopmentEnvironmentVariables: async () => {
    if (envSyncError) {
      throw envSyncError;
    }

    return developmentEnvVars;
  },
  createDotEnvLocalFileContent: (
    envVars: Array<{ key: string; value: string }>,
  ) => envVars.map((envVar) => `${envVar.key}=${envVar.value}`).join("\n"),
}));

mock.module("@/lib/db/sessions", () => ({
  getSessionById: async () => sessionRecord,
  updateSession: async (sessionId: string, patch: Record<string, unknown>) => {
    updateCalls.push({ sessionId, patch });
    return {
      ...sessionRecord,
      ...patch,
    };
  },
}));

mock.module("@/lib/sandbox/lifecycle-kick", () => ({
  kickSandboxLifecycleWorkflow: (input: KickCall) => {
    kickCalls.push(input);
  },
}));

mock.module("@open-harness/sandbox", () => ({
  connectSandbox: async (config: ConnectConfig) => {
    connectConfigs.push(config);

    return {
      currentBranch: "main",
      workingDirectory: "/vercel/sandbox",
      writeFile: async (path: string, content: string) => {
        writeFileCalls.push({ path, content });
      },
      getState: () => ({
        type: "vercel" as const,
        sandboxId: config.state.sandboxId ?? "sbx-vercel-1",
        expiresAt: Date.now() + 120_000,
      }),
      stop: async () => {},
    };
  },
}));

const routeModulePromise = import("./route");

describe("/api/sandbox lifecycle kicks", () => {
  beforeEach(() => {
    kickCalls.length = 0;
    updateCalls.length = 0;
    connectConfigs.length = 0;
    writeFileCalls.length = 0;
    vercelToken = "vca_test_token";
    envSyncError = null;
    developmentEnvVars = [{ key: "HELLO", value: "world" }];
    sessionRecord = {
      id: "session-1",
      userId: "user-1",
      lifecycleVersion: 3,
      sandboxState: { type: "vercel" },
      snapshotUrl: null,
      vercelProjectId: null,
      vercelProjectName: null,
      vercelTeamId: null,
      vercelTeamSlug: null,
    };
  });

  test("reconnect branch uses vercel sandbox and kicks lifecycle immediately", async () => {
    const { POST } = await routeModulePromise;

    const request = new Request("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        sandboxId: "sbx-existing-1",
      }),
    });

    const response = await POST(request);

    expect(response.ok).toBe(true);
    expect(kickCalls).toEqual([
      {
        sessionId: "session-1",
        reason: "sandbox-created",
      },
    ]);
    expect(connectConfigs[0]?.state).toEqual({
      type: "vercel",
      sandboxId: "sbx-existing-1",
    });
    expect(writeFileCalls).toHaveLength(0);
  });

  test("new vercel sandbox kicks lifecycle immediately", async () => {
    const { POST } = await routeModulePromise;

    const request = new Request("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        sandboxType: "vercel",
      }),
    });

    const response = await POST(request);

    expect(response.ok).toBe(true);
    expect(kickCalls).toEqual([
      {
        sessionId: "session-1",
        reason: "sandbox-created",
      },
    ]);
    expect(updateCalls.length).toBeGreaterThan(0);
    expect(connectConfigs[0]?.options?.gitUser?.email).toBe(
      "12345+nico-gh@users.noreply.github.com",
    );

    const payload = (await response.json()) as {
      timeout: number;
      mode: string;
    };
    expect(payload.timeout).toBe(DEFAULT_SANDBOX_TIMEOUT_MS);
    expect(payload.mode).toBe("vercel");
  });

  test("rejects unsupported sandbox types", async () => {
    const { POST } = await routeModulePromise;

    const request = new Request("http://localhost/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "session-1",
        sandboxType: "invalid",
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid sandbox type");
    expect(connectConfigs).toHaveLength(0);
    expect(kickCalls).toHaveLength(0);
  });

  test("writes linked Vercel development env vars to .env.local on first sandbox creation", async () => {
    sessionRecord.vercelProjectId = "prj_123";
    sessionRecord.vercelProjectName = "next-web";
    sessionRecord.vercelTeamId = "team_123";
    sessionRecord.vercelTeamSlug = "acme";

    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request("http://localhost/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          sandboxType: "vercel",
        }),
      }),
    );

    expect(response.ok).toBe(true);
    expect(writeFileCalls).toEqual([
      {
        path: "/vercel/sandbox/.env.local",
        content: "HELLO=world",
      },
    ]);
  });

  test("does not block sandbox creation when env sync fails", async () => {
    sessionRecord.vercelProjectId = "prj_123";
    sessionRecord.vercelProjectName = "next-web";
    envSyncError = new Error("boom");

    const { POST } = await routeModulePromise;
    const response = await POST(
      new Request("http://localhost/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "session-1",
          sandboxType: "vercel",
        }),
      }),
    );

    expect(response.ok).toBe(true);
    expect(writeFileCalls).toHaveLength(0);
    expect(kickCalls).toHaveLength(1);
  });
});
