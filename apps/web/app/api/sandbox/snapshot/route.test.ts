import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DEFAULT_SANDBOX_TIMEOUT_MS } from "@/lib/sandbox/config";

mock.module("server-only", () => ({}));

type ConnectCall = {
  state: {
    type: "vercel";
    sandboxName?: string;
    snapshotId?: string;
  };
  options?: {
    ports?: number[];
    resume?: boolean;
    timeout?: number;
  };
};

const connectCalls: ConnectCall[] = [];
const updateCalls: Array<{
  sessionId: string;
  patch: Record<string, unknown>;
}> = [];
const kickCalls: Array<{ sessionId: string; reason: string }> = [];

let connectMode: "existing" | "legacy_conflict_retry";
let sessionRecord: {
  id: string;
  userId: string;
  snapshotUrl: string | null;
  snapshotCreatedAt: Date | null;
  lifecycleVersion: number;
  sandboxState: {
    type: "vercel";
    sandboxName?: string;
  } | null;
};

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => ({ ok: true, userId: "user-1" }),
  requireOwnedSession: async () => ({ ok: true, sessionRecord }),
  requireOwnedSessionWithSandboxGuard: async () => ({
    ok: true,
    sessionRecord,
  }),
}));

mock.module("@/lib/db/sessions", () => ({
  updateSession: async (sessionId: string, patch: Record<string, unknown>) => {
    updateCalls.push({ sessionId, patch });
    sessionRecord = {
      ...sessionRecord,
      ...patch,
    } as typeof sessionRecord;
    return sessionRecord;
  },
}));

mock.module("@/lib/sandbox/lifecycle", () => ({
  buildActiveLifecycleUpdate: (state: { expiresAt?: number }) => ({
    lifecycleState: "active",
    lifecycleError: null,
    sandboxExpiresAt:
      typeof state.expiresAt === "number" ? new Date(state.expiresAt) : null,
  }),
  buildHibernatedLifecycleUpdate: () => ({
    lifecycleState: "hibernated",
    sandboxExpiresAt: null,
    hibernateAfter: null,
    lifecycleRunId: null,
    lifecycleError: null,
  }),
  getNextLifecycleVersion: (currentVersion: number | null | undefined) =>
    (currentVersion ?? 0) + 1,
}));

mock.module("@/lib/sandbox/lifecycle-kick", () => ({
  kickSandboxLifecycleWorkflow: (input: {
    sessionId: string;
    reason: string;
  }) => {
    kickCalls.push(input);
  },
}));

mock.module("@open-harness/sandbox", () => ({
  connectSandbox: async (
    state: ConnectCall["state"],
    options?: ConnectCall["options"],
  ) => {
    connectCalls.push({ state, options });

    if (connectMode === "existing") {
      return {
        name: "session_session-1",
        getState: () => ({
          type: "vercel" as const,
          sandboxName: "session_session-1",
          expiresAt: Date.now() + 120_000,
        }),
      };
    }

    if (connectCalls.length === 1) {
      throw new Error("sandbox not found");
    }

    if (connectCalls.length === 2) {
      throw new Error("sandbox already exists (status code 409)");
    }

    return {
      name: "session_session-1",
      getState: () => ({
        type: "vercel" as const,
        sandboxName: "session_session-1",
        expiresAt: Date.now() + 120_000,
      }),
    };
  },
}));

const routeModulePromise = import("./route");

describe("/api/sandbox/snapshot legacy restore retries", () => {
  beforeEach(() => {
    connectCalls.length = 0;
    updateCalls.length = 0;
    kickCalls.length = 0;
    connectMode = "existing";
    sessionRecord = {
      id: "session-1",
      userId: "user-1",
      snapshotUrl: "snap-1",
      snapshotCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
      lifecycleVersion: 3,
      sandboxState: {
        type: "vercel",
      },
    };
  });

  test("reuses an existing named sandbox before recreating from a legacy snapshot", async () => {
    const { PUT } = await routeModulePromise;

    const response = await PUT(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );
    const payload = (await response.json()) as {
      success: boolean;
      restoredFrom: string | null;
      sandboxName?: string;
    };

    expect(response.ok).toBe(true);
    expect(payload.success).toBe(true);
    expect(payload.restoredFrom).toBe("session_session-1");
    expect(payload.sandboxName).toBe("session_session-1");

    expect(connectCalls).toEqual([
      {
        state: {
          type: "vercel",
          sandboxName: "session_session-1",
        },
        options: {
          ports: [3000, 5173, 4321, 8000],
          resume: true,
        },
      },
    ]);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.patch.snapshotUrl).toBeNull();
    expect(updateCalls[0]?.patch.sandboxState).toEqual({
      type: "vercel",
      sandboxName: "session_session-1",
      expiresAt: expect.any(Number),
    });
    expect(kickCalls).toEqual([
      { sessionId: "session-1", reason: "snapshot-restored" },
    ]);
  });

  test("reconnects to the named sandbox when legacy migration creation hits a name conflict", async () => {
    const { PUT } = await routeModulePromise;
    connectMode = "legacy_conflict_retry";

    const response = await PUT(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );
    const payload = (await response.json()) as {
      success: boolean;
      restoredFrom: string | null;
      sandboxName?: string;
    };

    expect(response.ok).toBe(true);
    expect(payload.success).toBe(true);
    expect(payload.restoredFrom).toBe("session_session-1");
    expect(payload.sandboxName).toBe("session_session-1");

    expect(connectCalls).toEqual([
      {
        state: {
          type: "vercel",
          sandboxName: "session_session-1",
        },
        options: {
          ports: [3000, 5173, 4321, 8000],
          resume: true,
        },
      },
      {
        state: {
          type: "vercel",
          sandboxName: "session_session-1",
          snapshotId: "snap-1",
        },
        options: {
          timeout: DEFAULT_SANDBOX_TIMEOUT_MS,
          ports: [3000, 5173, 4321, 8000],
        },
      },
      {
        state: {
          type: "vercel",
          sandboxName: "session_session-1",
        },
        options: {
          ports: [3000, 5173, 4321, 8000],
          resume: true,
        },
      },
    ]);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.patch.snapshotUrl).toBeNull();
    expect(updateCalls[0]?.patch.sandboxState).toEqual({
      type: "vercel",
      sandboxName: "session_session-1",
      expiresAt: expect.any(Number),
    });
    expect(kickCalls).toEqual([
      { sessionId: "session-1", reason: "snapshot-restored" },
    ]);
  });
});
