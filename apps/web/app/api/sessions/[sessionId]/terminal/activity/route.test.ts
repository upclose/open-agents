import { beforeEach, describe, expect, mock, test } from "bun:test";

type AuthResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      response: Response;
    };

type OwnedSessionResult =
  | {
      ok: true;
      sessionRecord: { sandboxState: { type: string } | null };
    }
  | {
      ok: false;
      response: Response;
    };

let authResult: AuthResult = { ok: true, userId: "user-1" };
let ownedSessionResult: OwnedSessionResult = {
  ok: true,
  sessionRecord: { sandboxState: { type: "vercel" } },
};
const updateCalls: Array<{
  sessionId: string;
  patch: Record<string, unknown>;
}> = [];
const lifecycleUpdates: Array<{ sandboxState: { type: string } | null }> = [];

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => authResult,
  requireOwnedSessionWithSandboxGuard: async () => ownedSessionResult,
}));

mock.module("@/lib/db/sessions", () => ({
  updateSession: async (sessionId: string, patch: Record<string, unknown>) => {
    updateCalls.push({ sessionId, patch });
    return null;
  },
}));

mock.module("@/lib/sandbox/lifecycle", () => ({
  buildActiveLifecycleUpdate: (sandboxState: { type: string } | null) => {
    lifecycleUpdates.push({ sandboxState });
    return {
      lifecycleState: "active",
      lastActivityAt: "now",
      hibernateAfter: "later",
    };
  },
}));

const routeModulePromise = import("./route");

function createContext(sessionId = "session-1") {
  return {
    params: Promise.resolve({ sessionId }),
  };
}

describe("/api/sessions/[sessionId]/terminal/activity", () => {
  beforeEach(() => {
    authResult = { ok: true, userId: "user-1" };
    ownedSessionResult = {
      ok: true,
      sessionRecord: { sandboxState: { type: "vercel" } },
    };
    updateCalls.length = 0;
    lifecycleUpdates.length = 0;
  });

  test("returns the auth error response from the guard", async () => {
    authResult = {
      ok: false,
      response: Response.json({ error: "Not authenticated" }, { status: 401 }),
    };
    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("http://localhost/api/sessions/session-1/terminal/activity", {
        method: "POST",
      }),
      createContext(),
    );

    expect(response.status).toBe(401);
    expect(updateCalls).toHaveLength(0);
  });

  test("returns the ownership or sandbox guard response", async () => {
    ownedSessionResult = {
      ok: false,
      response: Response.json(
        { error: "Sandbox not initialized" },
        { status: 400 },
      ),
    };
    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("http://localhost/api/sessions/session-1/terminal/activity", {
        method: "POST",
      }),
      createContext(),
    );

    expect(response.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  test("refreshes the sandbox lifecycle activity for the session", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("http://localhost/api/sessions/session-1/terminal/activity", {
        method: "POST",
      }),
      createContext(),
    );
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(lifecycleUpdates).toEqual([{ sandboxState: { type: "vercel" } }]);
    expect(updateCalls).toEqual([
      {
        sessionId: "session-1",
        patch: {
          lifecycleState: "active",
          lastActivityAt: "now",
          hibernateAfter: "later",
        },
      },
    ]);
  });
});
